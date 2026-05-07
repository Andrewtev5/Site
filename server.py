from __future__ import annotations

import hashlib
import json
import os
import secrets
import uuid
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

try:
    import psycopg2
    import psycopg2.extras
except ImportError:  # pragma: no cover - local demo dependency hint
    psycopg2 = None


SITE_ROOT = Path(__file__).resolve().parent
CONFIG_PATH = SITE_ROOT / "config.json"
ENV_PATH = SITE_ROOT / ".env"
PASSWORD_ITERATIONS = 120_000
SESSIONS: dict[str, str] = {}

DEFAULT_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "postgres",
    "password": "",
    "database": "diploma_store",
    "connect_timeout": 2,
}


PRODUCTS_SQL = """
SELECT COALESCE(
    json_object_agg(
        id,
        json_build_object(
            'image', image,
            'price', concat(trim(trailing '.' from trim(trailing '0' from to_char(price, 'FM999999990.00'))), ' ', currency),
            'en', json_build_object(
                'name', name_en,
                'tag', tag_en,
                'description', description_en,
                'meta', meta_en,
                'imageAlt', image_alt_en
            ),
            'pl', json_build_object(
                'name', name_pl,
                'tag', tag_pl,
                'description', description_pl,
                'meta', meta_pl,
                'imageAlt', image_alt_pl
            )
        )
    ),
    '{}'::json
) AS products
FROM (
    SELECT *
    FROM products
    ORDER BY id
) AS ordered_products;
""".strip()


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    iterations INTEGER NOT NULL DEFAULT 120000,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_library (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    purchased_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS user_cart (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, product_id)
);
""".strip()


def load_dotenv() -> None:
    if not ENV_PATH.exists():
        return

    for raw_line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_config() -> dict:
    load_dotenv()
    config = dict(DEFAULT_CONFIG)

    if CONFIG_PATH.exists():
        config.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))

    env_map = {
        "PGHOST": "host",
        "PGPORT": "port",
        "PGUSER": "user",
        "PGPASSWORD": "password",
        "PGDATABASE": "database",
    }

    for env_key, config_key in env_map.items():
        if os.getenv(env_key):
            config[config_key] = os.getenv(env_key)

    config["port"] = int(config["port"])
    return config


def connect():
    if psycopg2 is None:
        raise RuntimeError("Install psycopg2-binary: python -m pip install psycopg2-binary")

    return psycopg2.connect(**load_config())


def ensure_schema() -> None:
    with connect() as connection:
        with connection.cursor() as cursor:
            cursor.execute(SCHEMA_SQL)


def read_json(handler: SimpleHTTPRequestHandler) -> dict:
    length = int(handler.headers.get("Content-Length", "0"))
    if length == 0:
        return {}

    payload = handler.rfile.read(length).decode("utf-8")
    return json.loads(payload)


def hash_password(password: str, salt: str | None = None, iterations: int = PASSWORD_ITERATIONS) -> tuple[str, str, int]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations)
    return digest.hex(), salt, iterations


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_bearer_token(headers) -> str | None:
    value = headers.get("Authorization", "")
    if value.startswith("Bearer "):
        return value.removeprefix("Bearer ").strip()
    return None


def get_session_email(headers) -> str | None:
    token = get_bearer_token(headers)
    return SESSIONS.get(token or "")


def product_row_to_public(item: dict) -> dict:
    return {
        "id": item["product_id"],
        "savedAt": item.get("saved_at").isoformat() if item.get("saved_at") else current_timestamp(),
        "purchasedAt": item.get("purchased_at").isoformat() if item.get("purchased_at") else None,
        "quantity": item.get("quantity", 1),
    }


class DiplomaRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/health":
            self.serve_json({"status": "ok"})
            return

        if path == "/api/products":
            self.serve_products()
            return

        if path == "/api/library":
            self.serve_library()
            return

        if path == "/api/cart":
            self.serve_cart()
            return

        super().do_GET()

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/register":
            self.handle_register()
            return

        if path == "/api/login":
            self.handle_login()
            return

        if path == "/api/library":
            self.handle_library_add()
            return

        if path == "/api/cart":
            self.handle_cart_add()
            return

        if path == "/api/purchase":
            self.handle_purchase()
            return

        self.serve_json({"error": "Not found"}, status=404)

    def do_DELETE(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/library":
            self.handle_library_remove()
            return

        if path == "/api/cart":
            self.handle_cart_remove()
            return

        self.serve_json({"error": "Not found"}, status=404)

    def serve_products(self) -> None:
        try:
            with connect() as connection:
                with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute(PRODUCTS_SQL)
                    row = cursor.fetchone()

            self.serve_json(
                {
                    "source": "postgresql",
                    "database": load_config()["database"],
                    "products": row["products"] if row else {},
                }
            )
        except Exception as error:
            self.serve_json({"source": "error", "message": str(error), "products": {}}, status=500)

    def handle_register(self) -> None:
        try:
            payload = read_json(self)
            name = str(payload.get("name", "")).strip()
            email = str(payload.get("email", "")).strip().lower()
            password = str(payload.get("password", ""))

            if len(name) < 2 or "@" not in email or len(password) < 8:
                self.serve_json({"error": "Invalid registration payload."}, status=400)
                return

            password_hash, salt, iterations = hash_password(password)
            user_id = uuid.uuid4()

            with connect() as connection:
                with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute(
                        """
                        INSERT INTO users (id, name, email, password_hash, salt, iterations)
                        VALUES (%s, %s, %s, %s, %s, %s)
                        RETURNING id, name, email, created_at;
                        """,
                        (str(user_id), name, email, password_hash, salt, iterations),
                    )
                    user = dict(cursor.fetchone())

            token = secrets.token_urlsafe(32)
            SESSIONS[token] = email
            self.serve_json({"token": token, "user": self.public_user(user)})
        except psycopg2.errors.UniqueViolation:
            self.serve_json({"error": "Account already exists."}, status=409)
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def handle_login(self) -> None:
        try:
            payload = read_json(self)
            email = str(payload.get("email", "")).strip().lower()
            password = str(payload.get("password", ""))

            with connect() as connection:
                with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute("SELECT * FROM users WHERE email = %s;", (email,))
                    user = cursor.fetchone()

            if not user:
                self.serve_json({"error": "Account not found."}, status=404)
                return

            password_hash, _, _ = hash_password(password, user["salt"], user["iterations"])
            if not secrets.compare_digest(password_hash, user["password_hash"]):
                self.serve_json({"error": "Incorrect password."}, status=401)
                return

            token = secrets.token_urlsafe(32)
            SESSIONS[token] = email
            self.serve_json({"token": token, "user": self.public_user(dict(user))})
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def serve_library(self) -> None:
        email = get_session_email(self.headers)
        if not email:
            self.serve_json({"items": []}, status=401)
            return

        try:
            with connect() as connection:
                with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute(
                        """
                        SELECT l.product_id, l.saved_at, l.purchased_at
                        FROM user_library l
                        JOIN users u ON u.id = l.user_id
                        WHERE u.email = %s
                        ORDER BY l.saved_at DESC;
                        """,
                        (email,),
                    )
                    items = [product_row_to_public(dict(row)) for row in cursor.fetchall()]

            self.serve_json({"items": items})
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def handle_library_add(self) -> None:
        email = get_session_email(self.headers)
        if not email:
            self.serve_json({"error": "Unauthorized"}, status=401)
            return

        try:
            payload = read_json(self)
            product_id = str(payload.get("productId", "")).strip()
            purchased = bool(payload.get("purchased", False))

            with connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO user_library (user_id, product_id, purchased_at)
                        SELECT id, %s, CASE WHEN %s THEN now() ELSE NULL END
                        FROM users
                        WHERE email = %s
                        ON CONFLICT (user_id, product_id)
                        DO UPDATE SET purchased_at = COALESCE(user_library.purchased_at, EXCLUDED.purchased_at);
                        """,
                        (product_id, purchased, email),
                    )

            self.serve_library()
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def handle_library_remove(self) -> None:
        email = get_session_email(self.headers)
        if not email:
            self.serve_json({"error": "Unauthorized"}, status=401)
            return

        try:
            product_id = str(read_json(self).get("productId", "")).strip()
            with connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        DELETE FROM user_library
                        WHERE product_id = %s
                        AND user_id = (SELECT id FROM users WHERE email = %s);
                        """,
                        (product_id, email),
                    )

            self.serve_library()
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def serve_cart(self) -> None:
        email = get_session_email(self.headers)
        if not email:
            self.serve_json({"items": []}, status=401)
            return

        try:
            with connect() as connection:
                with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
                    cursor.execute(
                        """
                        SELECT c.product_id, c.quantity, c.added_at AS saved_at
                        FROM user_cart c
                        JOIN users u ON u.id = c.user_id
                        WHERE u.email = %s
                        ORDER BY c.added_at DESC;
                        """,
                        (email,),
                    )
                    items = [product_row_to_public(dict(row)) for row in cursor.fetchall()]

            self.serve_json({"items": items})
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def handle_cart_add(self) -> None:
        email = get_session_email(self.headers)
        if not email:
            self.serve_json({"error": "Unauthorized"}, status=401)
            return

        try:
            payload = read_json(self)
            product_id = str(payload.get("productId", "")).strip()
            quantity = max(1, int(payload.get("quantity", 1)))

            with connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO user_cart (user_id, product_id, quantity)
                        SELECT id, %s, %s FROM users WHERE email = %s
                        ON CONFLICT (user_id, product_id)
                        DO UPDATE SET quantity = user_cart.quantity + EXCLUDED.quantity;
                        """,
                        (product_id, quantity, email),
                    )

            self.serve_cart()
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def handle_cart_remove(self) -> None:
        email = get_session_email(self.headers)
        if not email:
            self.serve_json({"error": "Unauthorized"}, status=401)
            return

        try:
            product_id = str(read_json(self).get("productId", "")).strip()
            with connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        DELETE FROM user_cart
                        WHERE product_id = %s
                        AND user_id = (SELECT id FROM users WHERE email = %s);
                        """,
                        (product_id, email),
                    )

            self.serve_cart()
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def handle_purchase(self) -> None:
        email = get_session_email(self.headers)
        if not email:
            self.serve_json({"error": "Unauthorized"}, status=401)
            return

        try:
            product_id = str(read_json(self).get("productId", "")).strip()
            with connect() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        INSERT INTO user_library (user_id, product_id, purchased_at)
                        SELECT id, %s, now() FROM users WHERE email = %s
                        ON CONFLICT (user_id, product_id)
                        DO UPDATE SET purchased_at = COALESCE(user_library.purchased_at, now());

                        DELETE FROM user_cart
                        WHERE product_id = %s
                        AND user_id = (SELECT id FROM users WHERE email = %s);
                        """,
                        (product_id, email, product_id, email),
                    )

            self.serve_json({"ok": True})
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def public_user(self, user: dict) -> dict:
        return {
            "id": str(user["id"]),
            "name": user["name"],
            "email": user["email"],
            "createdAt": user["created_at"].isoformat() if user.get("created_at") else current_timestamp(),
        }

    def serve_json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    port = int(os.getenv("PORT", "8000"))

    try:
        ensure_schema()
        print("Database schema: ready")
    except Exception as error:
        print(f"Database schema: skipped ({error})")

    handler = partial(DiplomaRequestHandler, directory=str(SITE_ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"Site: http://127.0.0.1:{port}")
    print(f"API:  http://127.0.0.1:{port}/api/products")
    server.serve_forever()


if __name__ == "__main__":
    main()
