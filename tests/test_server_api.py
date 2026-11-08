"""Integration tests of the site API. They run on a separate database that is dropped afterwards.

Run from the Site1 directory: python -m unittest discover tests
"""
from __future__ import annotations

import json
import logging
import os
import sys
import threading
import time
import unittest
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path

SITE_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SITE_ROOT))
TEST_DATABASE = "DiplomaStoreApiTest"
os.environ["SQL_SERVER_CONNECTION_STRING"] = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=(localdb)\\MSSQLLocalDB;"
    f"DATABASE={TEST_DATABASE};"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

import server  # noqa: E402


PASSWORD = "CorrectHorse1"


def drop_test_database() -> None:
    server.POOL.close_all()
    config = server.load_config()
    connection = server.POOL.open(
        server.replace_connection_database(config["sql_server_connection_string"], "master"),
        timeout=5,
        autocommit=True,
    )
    try:
        connection.cursor().execute(
            f"""
            IF DB_ID(N'{TEST_DATABASE}') IS NOT NULL
            BEGIN
                ALTER DATABASE [{TEST_DATABASE}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
                DROP DATABASE [{TEST_DATABASE}];
            END
            """
        )
    finally:
        connection.close()


class ApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        logging.disable(logging.CRITICAL)
        drop_test_database()
        server.ensure_schema()
        handler = partial(server.DiplomaRequestHandler, directory=str(SITE_ROOT))
        handler.func.log_message = lambda *args: None
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        cls.base_url = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls) -> None:
        cls.httpd.shutdown()
        cls.httpd.server_close()
        drop_test_database()
        logging.disable(logging.NOTSET)

    def setUp(self) -> None:
        with server.db_cursor() as cursor:
            cursor.execute("DELETE FROM dbo.auth_throttle;")
            cursor.execute("DELETE FROM dbo.users;")

    def request(self, method: str, path: str, body: dict | None = None, token: str | None = None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = urllib.request.Request(f"{self.base_url}{path}", data=data, method=method)
        request.add_header("Content-Type", "application/json")
        if token:
            request.add_header("Authorization", f"Bearer {token}")
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read()), response.headers
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read()), error.headers

    def register(self, email: str = "user@example.com") -> str:
        status, payload, _ = self.request(
            "POST",
            "/api/register",
            {"name": "Test User", "email": email, "password": PASSWORD},
        )
        self.assertEqual(status, 200, payload)
        return payload["token"]


class CatalogTests(ApiTestCase):
    def test_catalog_comes_from_database_seed(self) -> None:
        server.CATALOG.clear()
        status, payload, _ = self.request("GET", "/api/products")

        self.assertEqual(status, 200)
        self.assertEqual(len(payload["products"]), 170)
        self.assertEqual(payload["products"]["smart-wifi-lamp"]["pl"]["name"], "Lampa Smart WiFi")

    def test_schema_scripts_can_run_again(self) -> None:
        server.ensure_schema()
        with server.db_cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS total FROM dbo.products;")
            self.assertEqual(cursor.fetchone().total, 170)

    def test_catalog_is_cached_between_requests(self) -> None:
        server.CATALOG.clear()
        self.request("GET", "/api/products")
        with server.db_cursor() as cursor:
            cursor.execute("UPDATE dbo.products SET name_pl = N'Zmieniona' WHERE id = 'smart-wifi-lamp';")
        try:
            _, payload, _ = self.request("GET", "/api/products")
            self.assertEqual(payload["products"]["smart-wifi-lamp"]["pl"]["name"], "Lampa Smart WiFi")
        finally:
            server.ensure_schema()


class AuthSessionTests(ApiTestCase):
    def test_session_is_stored_only_as_hash(self) -> None:
        token = self.register()
        with server.db_cursor() as cursor:
            cursor.execute("SELECT token_hash FROM dbo.auth_sessions;")
            hashes = [row.token_hash for row in cursor.fetchall()]

        self.assertEqual(hashes, [server.hash_value(token)])

    def test_session_survives_restart(self) -> None:
        token = self.register()
        server.POOL.close_all()
        server.CATALOG.clear()

        status, payload, _ = self.request("GET", "/api/account", token=token)

        self.assertEqual(status, 200)
        self.assertEqual(payload["user"]["email"], "user@example.com")

    def test_logout_deletes_session_on_server(self) -> None:
        token = self.register()

        self.assertEqual(self.request("POST", "/api/logout", token=token)[0], 200)
        self.assertEqual(self.request("GET", "/api/account", token=token)[0], 401)
        with server.db_cursor() as cursor:
            cursor.execute("SELECT COUNT(*) AS total FROM dbo.auth_sessions;")
            self.assertEqual(cursor.fetchone().total, 0)

    def test_expired_session_is_rejected(self) -> None:
        token = self.register()
        with server.db_cursor() as cursor:
            cursor.execute("UPDATE dbo.auth_sessions SET expires_at = DATEADD(MINUTE, -1, SYSUTCDATETIME());")

        self.assertEqual(self.request("GET", "/api/account", token=token)[0], 401)


class LoginProtectionTests(ApiTestCase):
    def test_unknown_email_and_wrong_password_look_the_same(self) -> None:
        self.register()

        unknown = self.request("POST", "/api/login", {"email": "nobody@example.com", "password": "Wrong1234"})
        wrong = self.request("POST", "/api/login", {"email": "user@example.com", "password": "Wrong1234"})

        self.assertEqual(unknown[0], 401)
        self.assertEqual(wrong[0], 401)
        self.assertEqual(unknown[1], wrong[1])

    def test_unknown_email_takes_as_long_as_wrong_password(self) -> None:
        self.register()

        def measure(email: str) -> float:
            started = time.perf_counter()
            self.request("POST", "/api/login", {"email": email, "password": "Wrong1234"})
            return time.perf_counter() - started

        unknown = measure("nobody@example.com")
        wrong = measure("user@example.com")

        self.assertLess(abs(unknown - wrong), max(unknown, wrong) * 0.7)

    def test_account_is_locked_after_repeated_failures(self) -> None:
        self.register()
        attempt = {"email": "user@example.com", "password": "Wrong1234"}

        for _ in range(5):
            self.assertEqual(self.request("POST", "/api/login", attempt)[0], 401)

        status, _, headers = self.request("POST", "/api/login", attempt)
        self.assertEqual(status, 429)
        self.assertGreater(int(headers["Retry-After"]), 0)

        correct = {"email": "user@example.com", "password": PASSWORD}
        self.assertEqual(self.request("POST", "/api/login", correct)[0], 429)

    def test_unknown_email_is_locked_the_same_way(self) -> None:
        attempt = {"email": "nobody@example.com", "password": "Wrong1234"}

        for _ in range(5):
            self.assertEqual(self.request("POST", "/api/login", attempt)[0], 401)

        self.assertEqual(self.request("POST", "/api/login", attempt)[0], 429)

    def test_lock_survives_restart_and_ends_after_window(self) -> None:
        attempt = {"email": "user@example.com", "password": "Wrong1234"}
        self.register()
        for _ in range(5):
            self.request("POST", "/api/login", attempt)

        server.POOL.close_all()
        self.assertEqual(self.request("POST", "/api/login", attempt)[0], 429)

        with server.db_cursor() as cursor:
            cursor.execute(
                """
                UPDATE dbo.auth_throttle
                SET locked_until = DATEADD(SECOND, -1, SYSUTCDATETIME()),
                    window_expires_at = DATEADD(SECOND, -1, SYSUTCDATETIME());
                """
            )
        self.assertEqual(
            self.request("POST", "/api/login", {"email": "user@example.com", "password": PASSWORD})[0],
            200,
        )

    def test_successful_login_resets_counter(self) -> None:
        self.register()
        wrong = {"email": "user@example.com", "password": "Wrong1234"}
        correct = {"email": "user@example.com", "password": PASSWORD}

        for _ in range(4):
            self.request("POST", "/api/login", wrong)
        self.assertEqual(self.request("POST", "/api/login", correct)[0], 200)
        for _ in range(4):
            self.assertEqual(self.request("POST", "/api/login", wrong)[0], 401)

    def test_registration_is_rate_limited(self) -> None:
        for index in range(10):
            self.register(f"user{index}@example.com")

        status, _, _ = self.request(
            "POST",
            "/api/register",
            {"name": "Test User", "email": "next@example.com", "password": PASSWORD},
        )
        self.assertEqual(status, 429)


class ErrorHandlingTests(ApiTestCase):
    def test_internal_error_text_is_not_returned(self) -> None:
        secret = "connection string with SERVER=secret-host"
        original = server.CATALOG.get
        server.CATALOG.get = lambda: (_ for _ in ()).throw(RuntimeError(secret))
        try:
            status, payload, _ = self.request("GET", "/api/products")
        finally:
            server.CATALOG.get = original

        self.assertEqual(status, 500)
        self.assertEqual(payload, {"error": server.INTERNAL_ERROR_MESSAGE})

    def test_invalid_json_is_a_client_error(self) -> None:
        request = urllib.request.Request(f"{self.base_url}/api/login", data=b"{not json", method="POST")
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(request)

        self.assertEqual(caught.exception.code, 400)
        self.assertEqual(json.loads(caught.exception.read()), {"error": "Invalid request body."})


class ShopFlowTests(ApiTestCase):
    def test_cart_library_and_purchase(self) -> None:
        token = self.register()
        product = {"productId": "smart-wifi-lamp", "quantity": 2}

        self.assertEqual(self.request("POST", "/api/cart", product, token)[1]["items"][0]["quantity"], 2)
        updated = self.request("PUT", "/api/cart", {"productId": "smart-wifi-lamp", "quantity": 3}, token)
        self.assertEqual(updated[1]["items"][0]["quantity"], 3)
        self.assertEqual(self.request("PUT", "/api/cart", {"productId": "missing", "quantity": 3}, token)[0], 404)
        self.assertEqual(self.request("POST", "/api/cart", {"productId": "missing"}, token)[0], 404)
        self.assertEqual(self.request("POST", "/api/cart", {"productId": "smart-wifi-lamp", "quantity": 0}, token)[0], 400)

        purchase = self.request("POST", "/api/purchase", product, token)
        self.assertEqual(purchase[1]["totalPrice"], 80.0)
        self.assertEqual(self.request("GET", "/api/cart", token=token)[1]["items"], [])
        self.assertEqual(len(self.request("GET", "/api/library", token=token)[1]["items"]), 1)
        self.assertEqual(self.request("GET", "/api/purchases", token=token)[1]["items"][0]["quantity"], 2)

        removed = self.request("DELETE", "/api/library", {"productId": "smart-wifi-lamp"}, token)
        self.assertEqual(removed[1]["items"], [])

    def test_checkout_buys_the_whole_cart(self) -> None:
        token = self.register()
        self.request("POST", "/api/cart", {"productId": "smart-wifi-lamp", "quantity": 2}, token)
        self.request("POST", "/api/cart", {"productId": "led-lamp-10w", "quantity": 1}, token)

        status, payload, _ = self.request("POST", "/api/checkout", {}, token)

        self.assertEqual(status, 200)
        self.assertEqual(payload["quantity"], 3)
        self.assertEqual(payload["totalPrice"], 95.0)
        self.assertEqual(self.request("GET", "/api/cart", token=token)[1]["items"], [])
        self.assertEqual(len(self.request("GET", "/api/purchases", token=token)[1]["items"]), 2)
        self.assertEqual(len(self.request("GET", "/api/library", token=token)[1]["items"]), 2)

    def test_checkout_of_an_empty_cart_is_refused(self) -> None:
        token = self.register()

        self.assertEqual(self.request("POST", "/api/checkout", {}, token)[0], 400)
        self.assertEqual(self.request("POST", "/api/checkout", {})[0], 401)

    def test_protected_routes_require_session(self) -> None:
        for path in ("/api/account", "/api/library", "/api/cart", "/api/purchases"):
            self.assertEqual(self.request("GET", path)[0], 401)
        self.assertEqual(self.request("POST", "/api/cart", {"productId": "smart-wifi-lamp"})[0], 401)


class LocalDbUsageTests(unittest.TestCase):
    def test_sqllocaldb_runs_only_when_connection_fails(self) -> None:
        pool = server.ConnectionPool()
        calls: list[str] = []
        original_candidates = server.connection_string_candidates
        original_connect = server.pyodbc.connect

        def fake_candidates(connection_string: str) -> list[str]:
            calls.append("sqllocaldb")
            return ["resolved"]

        server.connection_string_candidates = fake_candidates
        server.pyodbc.connect = lambda *args, **kwargs: object()
        try:
            for _ in range(5):
                pool.open("source", timeout=1)
        finally:
            server.connection_string_candidates = original_candidates
            server.pyodbc.connect = original_connect

        self.assertEqual(calls, ["sqllocaldb"])


if __name__ == "__main__":
    unittest.main()
