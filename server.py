from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
import subprocess
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from functools import lru_cache, partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

try:
    import pyodbc
except ImportError:  # pragma: no cover - local demo dependency hint
    pyodbc = None


logger = logging.getLogger("lamp_store.site")

SITE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = SITE_ROOT.parent
CONFIG_PATH = SITE_ROOT / "config.json"
SCHEMA_PATHS = (
    PROJECT_ROOT / "DataBace" / "02_init_schema.sql",
    PROJECT_ROOT / "DataBace" / "03_seed_products.sql",
)
ENV_PATHS = (SITE_ROOT / ".env", PROJECT_ROOT / "Bot" / ".env")
PASSWORD_ITERATIONS = 120_000
# Hashed for an unknown email, so a login takes the same time whether the account exists or not.
DUMMY_PASSWORD_SALT = secrets.token_hex(16)

SESSION_TTL_SECONDS = 24 * 60 * 60
CATALOG_CACHE_SECONDS = 60
IDLE_CONNECTION_CHECK_SECONDS = 30
MAX_IDLE_CONNECTIONS = 8
REQUEST_CONNECT_ATTEMPTS = 2

# (scope, allowed failures, window in seconds). Counters live in the database, so a restart does not reset them.
# "account_ip" stops guessing one password, "ip" stops trying many accounts, "account" stops a distributed attack.
LOGIN_THROTTLE_RULES = (
    ("account_ip", 5, 15 * 60),
    ("ip", 20, 15 * 60),
    ("account", 50, 15 * 60),
)
REGISTER_THROTTLE_RULE = ("register_ip", 10, 60 * 60)
THROTTLE_MESSAGE = "Too many attempts. Try again later."
INVALID_CREDENTIALS_MESSAGE = "Invalid email or password."
INTERNAL_ERROR_MESSAGE = "Internal server error."

DEFAULT_SQL_SERVER_CONNECTION_STRING = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=(localdb)\\MSSQLLocalDB;"
    "DATABASE=DiplomaStore;"
    "Trusted_Connection=yes;"
    "TrustServerCertificate=yes;"
)

DEFAULT_CONFIG = {
    "sql_server_connection_string": DEFAULT_SQL_SERVER_CONNECTION_STRING,
    "connect_timeout": 3,
    "connect_attempts": 6,
    "connect_retry_delay": 1.0,
}


class ApiError(Exception):
    """An expected failure whose message is safe to show to the client."""

    def __init__(self, status: int, message: str, retry_after: int | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.retry_after = retry_after


def load_dotenv() -> None:
    for index, env_path in enumerate(ENV_PATHS):
        if not env_path.exists():
            continue

        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            key = key.strip()
            if index > 0 and key != "SQL_SERVER_CONNECTION_STRING":
                continue

            os.environ.setdefault(key, value.strip().strip('"').strip("'"))


@lru_cache(maxsize=1)
def load_config() -> dict:
    load_dotenv()
    config = dict(DEFAULT_CONFIG)

    if CONFIG_PATH.exists():
        config.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))

    if os.getenv("SQL_SERVER_CONNECTION_STRING"):
        config["sql_server_connection_string"] = os.getenv("SQL_SERVER_CONNECTION_STRING")

    return config


class ConnectionPool:
    """Reuses open connections and runs sqllocaldb only when the last working connection string fails."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._idle: list[tuple[object, float]] = []
        self._resolved: dict[str, str] = {}

    def open(
        self,
        connection_string: str,
        timeout: int,
        autocommit: bool = False,
        attempts: int = 1,
        retry_delay: float = 0.0,
    ):
        last_error = None

        for attempt in range(max(1, attempts)):
            resolved = self._resolved.get(connection_string)
            if resolved:
                try:
                    return pyodbc.connect(resolved, timeout=timeout, autocommit=autocommit)
                except pyodbc.Error as error:
                    last_error = error
                    self._resolved.pop(connection_string, None)

            for candidate in connection_string_candidates(connection_string):
                try:
                    connection = pyodbc.connect(candidate, timeout=timeout, autocommit=autocommit)
                    self._resolved[connection_string] = candidate
                    return connection
                except pyodbc.Error as error:
                    last_error = error

            if attempt + 1 < attempts and retry_delay:
                time.sleep(retry_delay)

        raise last_error

    def acquire(self):
        while True:
            with self._lock:
                if not self._idle:
                    break
                connection, idle_since = self._idle.pop()

            if time.monotonic() - idle_since < IDLE_CONNECTION_CHECK_SECONDS or connection_is_alive(connection):
                return connection
            close_quietly(connection)

        return connect(attempts=REQUEST_CONNECT_ATTEMPTS)

    def release(self, connection) -> None:
        with self._lock:
            if len(self._idle) < MAX_IDLE_CONNECTIONS:
                self._idle.append((connection, time.monotonic()))
                return
        close_quietly(connection)

    def close_all(self) -> None:
        with self._lock:
            idle, self._idle = self._idle, []
        for connection, _ in idle:
            close_quietly(connection)


def connection_is_alive(connection) -> bool:
    try:
        connection.cursor().execute("SELECT 1;").fetchall()
        return True
    except pyodbc.Error:
        return False


def close_quietly(connection) -> None:
    try:
        connection.close()
    except pyodbc.Error:
        pass


POOL = ConnectionPool()


def connect(attempts: int | None = None):
    if pyodbc is None:
        raise RuntimeError("Install pyodbc and Microsoft ODBC Driver for SQL Server.")

    config = load_config()
    return POOL.open(
        config["sql_server_connection_string"],
        timeout=int(config.get("connect_timeout", 3)),
        attempts=max(1, int(config.get("connect_attempts", 6))) if attempts is None else attempts,
        retry_delay=max(0.0, float(config.get("connect_retry_delay", 1.0))),
    )


@contextmanager
def db_cursor():
    """Gives a cursor on a pooled connection: commits on success, rolls back on a failure."""
    connection = POOL.acquire()
    try:
        yield connection.cursor()
        connection.commit()
    except ApiError:
        connection.rollback()
        POOL.release(connection)
        raise
    except Exception:
        close_quietly(connection)
        raise
    else:
        POOL.release(connection)


def ensure_database_exists() -> None:
    config = load_config()
    database_name = connection_string_value(config["sql_server_connection_string"], "DATABASE")
    if not database_name:
        database_name = connection_string_value(config["sql_server_connection_string"], "INITIAL CATALOG")
    if not database_name or database_name.lower() == "master":
        return

    master_connection_string = replace_connection_database(config["sql_server_connection_string"], "master")
    safe_name = database_name.replace("]", "]]")
    safe_literal = database_name.replace("'", "''")
    connection = POOL.open(
        master_connection_string,
        timeout=int(config.get("connect_timeout", 3)),
        autocommit=True,
        attempts=max(1, int(config.get("connect_attempts", 6))),
        retry_delay=max(0.0, float(config.get("connect_retry_delay", 1.0))),
    )
    try:
        cursor = connection.cursor()
        cursor.execute(f"IF DB_ID(N'{safe_literal}') IS NULL CREATE DATABASE [{safe_name}];")
    finally:
        connection.close()


def connection_string_value(connection_string: str, key: str) -> str | None:
    prefix = f"{key.upper()}="
    for part in connection_string.split(";"):
        if part.strip().upper().startswith(prefix):
            return part.split("=", 1)[1].strip()
    return None


def replace_connection_database(connection_string: str, database_name: str) -> str:
    parts = []
    replaced = False

    for part in connection_string.split(";"):
        if not part:
            continue

        key = part.split("=", 1)[0].strip().upper() if "=" in part else ""
        if key in {"DATABASE", "INITIAL CATALOG"}:
            parts.append(f"{part.split('=', 1)[0]}={database_name}")
            replaced = True
        else:
            parts.append(part)

    if not replaced:
        parts.append(f"DATABASE={database_name}")

    return ";".join(parts) + ";"


def connection_string_candidates(connection_string: str) -> list[str]:
    candidates = []
    localdb_candidate = localdb_pipe_connection_string(connection_string)
    if localdb_candidate:
        candidates.append(localdb_candidate)
    candidates.append(connection_string)

    replacements = {
        "SERVER=localhost;": ("SERVER=localhost\\SQLEXPRESS;", "SERVER=.\\SQLEXPRESS;"),
        "Server=localhost;": ("Server=localhost\\SQLEXPRESS;", "Server=.\\SQLEXPRESS;"),
    }

    for source, targets in replacements.items():
        if source not in connection_string:
            continue

        for target in targets:
            candidate = connection_string.replace(source, target)
            if candidate not in candidates:
                candidates.append(candidate)

    return candidates


def localdb_pipe_connection_string(connection_string: str) -> str | None:
    server = connection_string_value(connection_string, "SERVER")
    prefix = "(localdb)\\"
    if not server or not server.lower().startswith(prefix):
        return None

    instance = server[len(prefix) :].strip()
    if not instance:
        return None

    try:
        subprocess.run(
            ["sqllocaldb", "start", instance],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
        result = subprocess.run(
            ["sqllocaldb", "info", instance],
            check=True,
            capture_output=True,
            text=True,
            timeout=15,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    pipe_name = ""
    for line in result.stdout.splitlines():
        if line.lower().startswith("instance pipe name:"):
            pipe_name = line.split(":", 1)[1].strip()
            break

    if not pipe_name:
        return None

    candidate = replace_connection_value(connection_string, "SERVER", pipe_name)
    return replace_connection_value(candidate, "ENCRYPT", "no")


def replace_connection_value(connection_string: str, key: str, value: str) -> str:
    parts = []
    replaced = False

    for part in connection_string.split(";"):
        if not part:
            continue
        part_key = part.split("=", 1)[0].strip().upper() if "=" in part else ""
        if part_key == key.upper():
            parts.append(f"{part.split('=', 1)[0]}={value}")
            replaced = True
        else:
            parts.append(part)

    if not replaced:
        parts.append(f"{key}={value}")
    return ";".join(parts) + ";"


def ensure_schema() -> None:
    ensure_database_exists()
    connection = connect()
    try:
        cursor = connection.cursor()
        for schema_path in SCHEMA_PATHS:
            for statement in sql_batches_from_file(schema_path):
                cursor.execute(statement)
        connection.commit()
    finally:
        connection.close()


def sql_batches_from_file(path: Path):
    current_batch: list[str] = []

    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        if raw_line.strip().upper() == "GO":
            statement = "\n".join(current_batch).strip()
            if statement and not statement.upper().startswith("USE "):
                yield statement
            current_batch = []
            continue

        current_batch.append(raw_line)

    statement = "\n".join(current_batch).strip()
    if statement and not statement.upper().startswith("USE "):
        yield statement


def read_json(handler: SimpleHTTPRequestHandler) -> dict:
    try:
        length = int(handler.headers.get("Content-Length", "0"))
        if length == 0:
            return {}

        payload = json.loads(handler.rfile.read(length).decode("utf-8"))
    except ValueError as error:
        raise ApiError(400, "Invalid request body.") from error

    if not isinstance(payload, dict):
        raise ApiError(400, "Invalid request body.")
    return payload


def parse_quantity(value, default: int = 1) -> int:
    try:
        quantity = int(value if value is not None else default)
    except (TypeError, ValueError) as error:
        raise ApiError(400, "Quantity must be a whole number.") from error

    if quantity < 1 or quantity > 999:
        raise ApiError(400, "Quantity must be between 1 and 999.")
    return quantity


def hash_password(password: str, salt: str | None = None, iterations: int = PASSWORD_ITERATIONS) -> tuple[str, str, int]:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), iterations)
    return digest.hex(), salt, iterations


def current_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def to_iso(value) -> str:
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc).isoformat()
    return current_timestamp()


def get_bearer_token(headers) -> str | None:
    value = headers.get("Authorization", "")
    if value.startswith("Bearer "):
        return value.removeprefix("Bearer ").strip() or None
    return None


def hash_value(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def create_auth_session(cursor, user_id) -> str:
    """Stores only a hash of the token, so a database leak does not expose working sessions."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=SESSION_TTL_SECONDS)
    cursor.execute(
        "INSERT INTO dbo.auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?);",
        hash_value(token),
        user_id,
        expires_at,
    )
    return token


def get_session_user(cursor, token: str | None) -> dict | None:
    if not token:
        return None

    cursor.execute(
        """
        SELECT u.id, u.name, u.email, u.created_at, u.phone, u.city, u.street, u.building, u.apartment
        FROM dbo.auth_sessions s
        JOIN dbo.users u ON u.id = s.user_id
        WHERE s.token_hash = ?
          AND s.expires_at > SYSUTCDATETIME();
        """,
        hash_value(token),
    )
    return fetchone_dict(cursor)


def delete_expired_auth_data(cursor) -> None:
    cursor.execute("DELETE FROM dbo.auth_sessions WHERE expires_at <= SYSUTCDATETIME();")
    cursor.execute(
        """
        DELETE FROM dbo.auth_throttle
        WHERE window_expires_at <= SYSUTCDATETIME()
          AND (locked_until IS NULL OR locked_until <= SYSUTCDATETIME());
        """
    )


def throttle_key(scope: str, *parts: str) -> str:
    return hash_value("|".join((scope, *parts)))


def login_throttle_keys(email: str, ip_address: str) -> list[tuple[str, int, int]]:
    values = {"account_ip": (email, ip_address), "ip": (ip_address,), "account": (email,)}
    return [
        (throttle_key(scope, *values[scope]), max_failures, window_seconds)
        for scope, max_failures, window_seconds in LOGIN_THROTTLE_RULES
    ]


def throttle_retry_after(cursor, keys: list[tuple[str, int, int]]) -> int | None:
    placeholders = ", ".join("?" for _ in keys)
    cursor.execute(
        f"""
        SELECT MAX(DATEDIFF(SECOND, SYSUTCDATETIME(), locked_until)) AS retry_after
        FROM dbo.auth_throttle
        WHERE key_hash IN ({placeholders})
          AND locked_until > SYSUTCDATETIME();
        """,
        *[key for key, _, _ in keys],
    )
    row = cursor.fetchone()
    return max(1, int(row.retry_after)) if row and row.retry_after is not None else None


def record_throttle_failure(cursor, keys: list[tuple[str, int, int]]) -> None:
    for key, max_failures, window_seconds in keys:
        cursor.execute(
            """
            MERGE dbo.auth_throttle WITH (HOLDLOCK) AS target
            USING (
                SELECT CAST(? AS CHAR(64)) AS key_hash,
                       CAST(? AS INT) AS max_failures,
                       CAST(? AS INT) AS window_seconds
            ) AS source
            ON target.key_hash = source.key_hash
            WHEN MATCHED THEN
                UPDATE SET
                    failures = CASE
                        WHEN target.window_expires_at > SYSUTCDATETIME() THEN target.failures + 1
                        ELSE 1
                    END,
                    locked_until = CASE
                        WHEN target.window_expires_at <= SYSUTCDATETIME() THEN NULL
                        WHEN target.failures + 1 >= source.max_failures
                            THEN DATEADD(SECOND, source.window_seconds, SYSUTCDATETIME())
                        ELSE target.locked_until
                    END,
                    window_expires_at = CASE
                        WHEN target.window_expires_at > SYSUTCDATETIME() THEN target.window_expires_at
                        ELSE DATEADD(SECOND, source.window_seconds, SYSUTCDATETIME())
                    END
            WHEN NOT MATCHED THEN
                INSERT (key_hash, failures, window_expires_at)
                VALUES (source.key_hash, 1, DATEADD(SECOND, source.window_seconds, SYSUTCDATETIME()));
            """,
            key,
            max_failures,
            window_seconds,
        )


def rows_to_dicts(cursor) -> list[dict]:
    columns = [column[0] for column in cursor.description or []]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def fetchone_dict(cursor) -> dict | None:
    columns = [column[0] for column in cursor.description or []]
    row = cursor.fetchone()
    return dict(zip(columns, row)) if row else None


def get_user_by_email(cursor, email: str) -> dict | None:
    cursor.execute(
        """
        SELECT id, name, email, password_hash, salt, iterations, created_at,
               phone, city, street, building, apartment
        FROM dbo.users
        WHERE email = ?
        """,
        email,
    )
    return fetchone_dict(cursor)


def product_row_to_public(item: dict) -> dict:
    return {
        "id": item["product_id"],
        "savedAt": to_iso(item.get("saved_at")),
        "purchasedAt": to_iso(item["purchased_at"]) if item.get("purchased_at") else None,
        "quantity": item.get("quantity", 1),
    }


def purchase_row_to_public(item: dict) -> dict:
    return {
        "purchaseId": str(item["purchase_id"]),
        "id": item["product_id"],
        "quantity": int(item["quantity"]),
        "unitPrice": float(item["unit_price"]),
        "totalPrice": float(item["total_price"]),
        "currency": item.get("currency") or "PLN",
        "purchasedAt": to_iso(item["purchased_at"]),
    }


def public_user(user: dict) -> dict:
    return {
        "name": user["name"],
        "email": user["email"],
        "phone": user.get("phone") or "",
        "city": user.get("city") or "",
        "street": user.get("street") or "",
        "building": user.get("building") or "",
        "apartment": user.get("apartment") or "",
        "createdAt": to_iso(user.get("created_at")),
    }


def product_exists(cursor, product_id: str) -> bool:
    if not product_id:
        return False

    cursor.execute("SELECT 1 FROM dbo.products WHERE id = ?;", product_id)
    return cursor.fetchone() is not None


def build_product_payload(row: dict) -> tuple[str, dict]:
    product_id = str(row["id"])
    return product_id, {
        "image": row["image"],
        "price": f"{float(row['price']):.0f} {row['currency']}",
        "en": {
            "name": row["name_en"],
            "tag": row["tag_en"],
            "description": row["description_en"],
            "meta": parse_product_meta(row["meta_en"], row["tag_en"]),
            "imageAlt": row["image_alt_en"],
        },
        "pl": {
            "name": row["name_pl"],
            "tag": row["tag_pl"],
            "description": row["description_pl"],
            "meta": parse_product_meta(row["meta_pl"], row["tag_pl"]),
            "imageAlt": row["image_alt_pl"],
        },
    }


def parse_product_meta(value: object, fallback: str) -> list[str]:
    try:
        parsed = json.loads(str(value or "[]"))
    except (TypeError, ValueError, json.JSONDecodeError):
        return [fallback]

    if not isinstance(parsed, list):
        return [fallback]
    tags = [str(tag).strip() for tag in parsed if str(tag).strip()]
    return tags or [fallback]


class CatalogCache:
    """Every page asks for the whole catalog, but it changes only when the seed script runs."""

    def __init__(self, ttl_seconds: int = CATALOG_CACHE_SECONDS) -> None:
        self._ttl_seconds = ttl_seconds
        self._lock = threading.Lock()
        self._products: dict[str, dict] | None = None
        self._expires_at = 0.0

    def get(self) -> dict[str, dict]:
        with self._lock:
            if self._products is not None and time.monotonic() < self._expires_at:
                return self._products

            try:
                with db_cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT id, image, price, currency,
                               name_en, tag_en, description_en, meta_en, image_alt_en,
                               name_pl, tag_pl, description_pl, meta_pl, image_alt_pl
                        FROM dbo.products
                        ORDER BY id;
                        """
                    )
                    self._products = dict(build_product_payload(row) for row in rows_to_dicts(cursor))
            except Exception:
                if self._products is None:
                    raise
                logger.exception("Catalog refresh failed; serving the previous copy.")

            self._expires_at = time.monotonic() + self._ttl_seconds
            return self._products

    def clear(self) -> None:
        with self._lock:
            self._products = None
            self._expires_at = 0.0


CATALOG = CatalogCache()


class DiplomaRequestHandler(SimpleHTTPRequestHandler):
    API_ROUTES = {
        ("GET", "/api/health"): "serve_health",
        ("GET", "/api/products"): "serve_products",
        ("GET", "/api/library"): "serve_library",
        ("GET", "/api/cart"): "serve_cart",
        ("GET", "/api/account"): "serve_account",
        ("GET", "/api/purchases"): "serve_purchases",
        ("POST", "/api/register"): "handle_register",
        ("POST", "/api/login"): "handle_login",
        ("POST", "/api/logout"): "handle_logout",
        ("POST", "/api/library"): "handle_library_add",
        ("POST", "/api/cart"): "handle_cart_add",
        ("POST", "/api/purchase"): "handle_purchase",
        ("POST", "/api/checkout"): "handle_checkout",
        ("PUT", "/api/cart"): "handle_cart_update",
        ("DELETE", "/api/library"): "handle_library_remove",
        ("DELETE", "/api/cart"): "handle_cart_remove",
    }

    def end_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        super().end_headers()

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.end_headers()

    def do_GET(self) -> None:
        if not self.dispatch_api("GET"):
            super().do_GET()

    def do_POST(self) -> None:
        if not self.dispatch_api("POST"):
            self.serve_json({"error": "Not found"}, status=404)

    def do_PUT(self) -> None:
        if not self.dispatch_api("PUT"):
            self.serve_json({"error": "Not found"}, status=404)

    def do_DELETE(self) -> None:
        if not self.dispatch_api("DELETE"):
            self.serve_json({"error": "Not found"}, status=404)

    def dispatch_api(self, method: str) -> bool:
        path = urlparse(self.path).path
        handler_name = self.API_ROUTES.get((method, path))
        if handler_name is None:
            return False

        try:
            getattr(self, handler_name)()
        except ApiError as error:
            headers = {"Retry-After": str(error.retry_after)} if error.retry_after else None
            self.serve_json({"error": error.message}, status=error.status, headers=headers)
        except Exception:
            # Details stay in the server log: the client must not see SQL, paths or driver messages.
            logger.exception("Request failed: %s %s", method, path)
            self.serve_json({"error": INTERNAL_ERROR_MESSAGE}, status=500)
        return True

    def require_user(self, cursor) -> dict:
        user = get_session_user(cursor, get_bearer_token(self.headers))
        if user is None:
            raise ApiError(401, "Unauthorized")
        return user

    def client_ip(self) -> str:
        return str(self.client_address[0])

    def serve_health(self) -> None:
        self.serve_json({"status": "ok", "database": "mssql"})

    def serve_products(self) -> None:
        products = CATALOG.get()
        if not products:
            self.serve_json({"source": "mssql", "products": {}}, status=404)
            return

        self.serve_json({"source": "mssql", "products": products})

    def handle_register(self) -> None:
        payload = read_json(self)
        name = str(payload.get("name", "")).strip()
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))
        phone = str(payload.get("phone", "")).strip()
        city = str(payload.get("city", "")).strip()
        street = str(payload.get("street", "")).strip()
        building = str(payload.get("building", "")).strip()
        apartment = str(payload.get("apartment", "")).strip()

        if len(name) < 2 or "@" not in email or len(password) < 8:
            raise ApiError(400, "Invalid registration payload.")

        scope, max_attempts, window_seconds = REGISTER_THROTTLE_RULE
        throttle_keys = [(throttle_key(scope, self.client_ip()), max_attempts, window_seconds)]

        with db_cursor() as cursor:
            retry_after = throttle_retry_after(cursor, throttle_keys)
            if retry_after:
                raise ApiError(429, THROTTLE_MESSAGE, retry_after)
            record_throttle_failure(cursor, throttle_keys)

        password_hash, salt, iterations = hash_password(password)
        user_id = str(uuid.uuid4())

        try:
            with db_cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO dbo.users (
                        id, name, email, password_hash, salt, iterations,
                        phone, city, street, building, apartment
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    user_id,
                    name,
                    email,
                    password_hash,
                    salt,
                    iterations,
                    phone,
                    city,
                    street,
                    building,
                    apartment,
                )
                user = get_user_by_email(cursor, email)
                token = create_auth_session(cursor, user_id)
        except pyodbc.IntegrityError as error:
            raise ApiError(409, "Account already exists.") from error

        self.serve_json({"token": token, "user": public_user(user)})

    def handle_login(self) -> None:
        payload = read_json(self)
        email = str(payload.get("email", "")).strip().lower()
        password = str(payload.get("password", ""))
        throttle_keys = login_throttle_keys(email, self.client_ip())

        with db_cursor() as cursor:
            retry_after = throttle_retry_after(cursor, throttle_keys)
            if retry_after:
                raise ApiError(429, THROTTLE_MESSAGE, retry_after)
            user = get_user_by_email(cursor, email)

        # Hashed outside the transaction, so the slow PBKDF2 does not hold a database connection.
        if user:
            password_hash, _, _ = hash_password(password, user["salt"], int(user["iterations"]))
            password_matches = secrets.compare_digest(password_hash, user["password_hash"])
        else:
            hash_password(password, DUMMY_PASSWORD_SALT)
            password_matches = False

        if not password_matches:
            with db_cursor() as cursor:
                record_throttle_failure(cursor, throttle_keys)
            raise ApiError(401, INVALID_CREDENTIALS_MESSAGE)

        with db_cursor() as cursor:
            account_ip_key = throttle_keys[0][0]
            cursor.execute("DELETE FROM dbo.auth_throttle WHERE key_hash = ?;", account_ip_key)
            delete_expired_auth_data(cursor)
            token = create_auth_session(cursor, user["id"])

        self.serve_json({"token": token, "user": public_user(user)})

    def handle_logout(self) -> None:
        token = get_bearer_token(self.headers)
        if token:
            with db_cursor() as cursor:
                cursor.execute("DELETE FROM dbo.auth_sessions WHERE token_hash = ?;", hash_value(token))

        self.serve_json({"ok": True})

    def serve_account(self) -> None:
        with db_cursor() as cursor:
            user = self.require_user(cursor)

        self.serve_json({"user": public_user(user)})

    def serve_purchases(self) -> None:
        with db_cursor() as cursor:
            user = self.require_user(cursor)
            cursor.execute(
                """
                SELECT id AS purchase_id,
                       product_id,
                       quantity,
                       unit_price,
                       unit_price * quantity AS total_price,
                       currency,
                       purchased_at
                FROM dbo.purchase_history
                WHERE user_id = ?
                ORDER BY purchased_at DESC;
                """,
                user["id"],
            )
            items = [purchase_row_to_public(row) for row in rows_to_dicts(cursor)]

        self.serve_json({"items": items})

    def serve_library(self) -> None:
        with db_cursor() as cursor:
            user = self.require_user(cursor)
            cursor.execute(
                """
                SELECT product_id, saved_at, purchased_at
                FROM dbo.user_library
                WHERE user_id = ?
                ORDER BY saved_at DESC;
                """,
                user["id"],
            )
            items = [product_row_to_public(row) for row in rows_to_dicts(cursor)]

        self.serve_json({"items": items})

    def handle_library_add(self) -> None:
        payload = read_json(self)
        product_id = str(payload.get("productId", "")).strip()
        purchased = bool(payload.get("purchased", False))
        purchased_at = datetime.now(timezone.utc).replace(tzinfo=None) if purchased else None

        with db_cursor() as cursor:
            user = self.require_user(cursor)
            if not product_exists(cursor, product_id):
                raise ApiError(404, "Product not found.")

            cursor.execute(
                """
                MERGE dbo.user_library WITH (HOLDLOCK) AS target
                USING (SELECT ? AS user_id, ? AS product_id, ? AS purchased_at) AS source
                ON target.user_id = source.user_id AND target.product_id = source.product_id
                WHEN MATCHED THEN
                    UPDATE SET purchased_at = COALESCE(target.purchased_at, source.purchased_at)
                WHEN NOT MATCHED THEN
                    INSERT (user_id, product_id, purchased_at)
                    VALUES (source.user_id, source.product_id, source.purchased_at);
                """,
                user["id"],
                product_id,
                purchased_at,
            )

        self.serve_library()

    def handle_library_remove(self) -> None:
        product_id = str(read_json(self).get("productId", "")).strip()

        with db_cursor() as cursor:
            user = self.require_user(cursor)
            cursor.execute(
                "DELETE FROM dbo.user_library WHERE product_id = ? AND user_id = ?;",
                product_id,
                user["id"],
            )

        self.serve_library()

    def serve_cart(self) -> None:
        with db_cursor() as cursor:
            user = self.require_user(cursor)
            cursor.execute(
                """
                SELECT product_id, quantity, added_at AS saved_at
                FROM dbo.user_cart
                WHERE user_id = ?
                ORDER BY added_at DESC;
                """,
                user["id"],
            )
            items = [product_row_to_public(row) for row in rows_to_dicts(cursor)]

        self.serve_json({"items": items})

    def handle_cart_add(self) -> None:
        payload = read_json(self)
        product_id = str(payload.get("productId", "")).strip()
        quantity = parse_quantity(payload.get("quantity"))

        with db_cursor() as cursor:
            user = self.require_user(cursor)
            if not product_exists(cursor, product_id):
                raise ApiError(404, "Product not found.")

            cursor.execute(
                """
                MERGE dbo.user_cart WITH (HOLDLOCK) AS target
                USING (SELECT ? AS user_id, ? AS product_id, ? AS quantity) AS source
                ON target.user_id = source.user_id AND target.product_id = source.product_id
                WHEN MATCHED THEN
                    UPDATE SET quantity = target.quantity + source.quantity
                WHEN NOT MATCHED THEN
                    INSERT (user_id, product_id, quantity)
                    VALUES (source.user_id, source.product_id, source.quantity);
                """,
                user["id"],
                product_id,
                quantity,
            )

        self.serve_cart()

    def handle_cart_update(self) -> None:
        payload = read_json(self)
        product_id = str(payload.get("productId", "")).strip()
        quantity = parse_quantity(payload.get("quantity"))

        with db_cursor() as cursor:
            user = self.require_user(cursor)
            cursor.execute(
                "UPDATE dbo.user_cart SET quantity = ? WHERE product_id = ? AND user_id = ?;",
                quantity,
                product_id,
                user["id"],
            )
            if cursor.rowcount == 0:
                raise ApiError(404, "Cart item not found.")

        self.serve_cart()

    def handle_cart_remove(self) -> None:
        product_id = str(read_json(self).get("productId", "")).strip()

        with db_cursor() as cursor:
            user = self.require_user(cursor)
            cursor.execute(
                "DELETE FROM dbo.user_cart WHERE product_id = ? AND user_id = ?;",
                product_id,
                user["id"],
            )

        self.serve_cart()

    def handle_purchase(self) -> None:
        payload = read_json(self)
        product_id = str(payload.get("productId", "")).strip()
        quantity = parse_quantity(payload.get("quantity"))
        purchased_at = datetime.now(timezone.utc).replace(tzinfo=None)

        with db_cursor() as cursor:
            user = self.require_user(cursor)
            cursor.execute(
                "SELECT price, currency FROM dbo.products WHERE id = ?;",
                product_id,
            )
            product = fetchone_dict(cursor)
            if not product:
                raise ApiError(404, "Product not found.")

            cursor.execute(
                """
                INSERT INTO dbo.purchase_history (
                    user_id, product_id, quantity, unit_price, currency, purchased_at
                )
                VALUES (?, ?, ?, ?, ?, ?);
                """,
                user["id"],
                product_id,
                quantity,
                product["price"],
                product.get("currency") or "PLN",
                purchased_at,
            )

            cursor.execute(
                """
                MERGE dbo.user_library WITH (HOLDLOCK) AS target
                USING (SELECT ? AS user_id, ? AS product_id, ? AS purchased_at) AS source
                ON target.user_id = source.user_id AND target.product_id = source.product_id
                WHEN MATCHED THEN
                    UPDATE SET purchased_at = COALESCE(target.purchased_at, source.purchased_at)
                WHEN NOT MATCHED THEN
                    INSERT (user_id, product_id, purchased_at)
                    VALUES (source.user_id, source.product_id, source.purchased_at);
                """,
                user["id"],
                product_id,
                purchased_at,
            )
            cursor.execute(
                """
                DELETE FROM dbo.user_cart
                WHERE user_id = ?
                  AND product_id = ?;
                """,
                user["id"],
                product_id,
            )

        unit_price = float(product["price"])
        self.serve_json({
            "ok": True,
            "quantity": quantity,
            "unitPrice": unit_price,
            "totalPrice": unit_price * quantity,
            "currency": product.get("currency") or "PLN",
        })

    def handle_checkout(self) -> None:
        """Buys the whole cart in one transaction, so an order is never half placed."""
        purchased_at = datetime.now(timezone.utc).replace(tzinfo=None)

        with db_cursor() as cursor:
            user = self.require_user(cursor)
            cursor.execute(
                """
                SELECT c.product_id, c.quantity, p.price, p.currency
                FROM dbo.user_cart c
                JOIN dbo.products p ON p.id = c.product_id
                WHERE c.user_id = ?;
                """,
                user["id"],
            )
            items = rows_to_dicts(cursor)
            if not items:
                raise ApiError(400, "Cart is empty.")

            for item in items:
                cursor.execute(
                    """
                    INSERT INTO dbo.purchase_history (
                        user_id, product_id, quantity, unit_price, currency, purchased_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    user["id"],
                    item["product_id"],
                    item["quantity"],
                    item["price"],
                    item["currency"],
                    purchased_at,
                )
                cursor.execute(
                    """
                    MERGE dbo.user_library WITH (HOLDLOCK) AS target
                    USING (SELECT ? AS user_id, ? AS product_id, ? AS purchased_at) AS source
                    ON target.user_id = source.user_id AND target.product_id = source.product_id
                    WHEN MATCHED THEN
                        UPDATE SET purchased_at = COALESCE(target.purchased_at, source.purchased_at)
                    WHEN NOT MATCHED THEN
                        INSERT (user_id, product_id, purchased_at)
                        VALUES (source.user_id, source.product_id, source.purchased_at);
                    """,
                    user["id"],
                    item["product_id"],
                    purchased_at,
                )

            cursor.execute("DELETE FROM dbo.user_cart WHERE user_id = ?;", user["id"])

        self.serve_json({
            "ok": True,
            "quantity": sum(int(item["quantity"]) for item in items),
            "totalPrice": sum(float(item["price"]) * int(item["quantity"]) for item in items),
        })

    def serve_json(self, payload: dict, status: int = 200, headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))

    try:
        ensure_schema()
        with db_cursor() as cursor:
            delete_expired_auth_data(cursor)
        CATALOG.get()
        print("Database schema: ready")
    except Exception:
        logger.exception("Database schema: skipped")

    handler = partial(DiplomaRequestHandler, directory=str(SITE_ROOT))
    server = ThreadingHTTPServer((host, port), handler)
    display_host = "127.0.0.1" if host in {"", "0.0.0.0"} else host
    print(f"Site: http://{display_host}:{port}")
    print(f"API:  http://{display_host}:{port}/api/products")
    server.serve_forever()


if __name__ == "__main__":
    main()
