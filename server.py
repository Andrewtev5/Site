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
    import pyodbc
except ImportError:  # pragma: no cover - local demo dependency hint
    pyodbc = None


SITE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = SITE_ROOT.parent
CONFIG_PATH = SITE_ROOT / "config.json"
ENV_PATHS = (SITE_ROOT / ".env", PROJECT_ROOT / "Bot" / ".env")
PASSWORD_ITERATIONS = 120_000
SESSIONS: dict[str, str] = {}

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
}


SCHEMA_SQL = [
    """
    IF OBJECT_ID('dbo.users', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.users (
            id UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_users PRIMARY KEY DEFAULT NEWID(),
            name NVARCHAR(255) NOT NULL,
            email NVARCHAR(320) NOT NULL,
            password_hash NVARCHAR(128) NOT NULL,
            salt NVARCHAR(64) NOT NULL,
            iterations INT NOT NULL CONSTRAINT DF_users_iterations DEFAULT 120000,
            created_at DATETIME2 NOT NULL CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME()
        );
    END
    """,
    """
    IF NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'UX_users_email'
          AND object_id = OBJECT_ID('dbo.users')
    )
    BEGIN
        CREATE UNIQUE INDEX UX_users_email ON dbo.users(email);
    END
    """,
    """
    IF OBJECT_ID('dbo.user_library', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.user_library (
            user_id UNIQUEIDENTIFIER NOT NULL,
            product_id NVARCHAR(100) NOT NULL,
            saved_at DATETIME2 NOT NULL CONSTRAINT DF_user_library_saved_at DEFAULT SYSUTCDATETIME(),
            purchased_at DATETIME2 NULL,
            CONSTRAINT PK_user_library PRIMARY KEY (user_id, product_id),
            CONSTRAINT FK_user_library_users FOREIGN KEY (user_id)
                REFERENCES dbo.users(id) ON DELETE CASCADE
        );
    END
    """,
    """
    IF OBJECT_ID('dbo.user_cart', 'U') IS NULL
    BEGIN
        CREATE TABLE dbo.user_cart (
            user_id UNIQUEIDENTIFIER NOT NULL,
            product_id NVARCHAR(100) NOT NULL,
            quantity INT NOT NULL CONSTRAINT DF_user_cart_quantity DEFAULT 1,
            added_at DATETIME2 NOT NULL CONSTRAINT DF_user_cart_added_at DEFAULT SYSUTCDATETIME(),
            CONSTRAINT PK_user_cart PRIMARY KEY (user_id, product_id),
            CONSTRAINT CK_user_cart_quantity CHECK (quantity > 0),
            CONSTRAINT FK_user_cart_users FOREIGN KEY (user_id)
                REFERENCES dbo.users(id) ON DELETE CASCADE
        );
    END
    """,
]


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


def load_config() -> dict:
    load_dotenv()
    config = dict(DEFAULT_CONFIG)

    if CONFIG_PATH.exists():
        config.update(json.loads(CONFIG_PATH.read_text(encoding="utf-8")))

    if os.getenv("SQL_SERVER_CONNECTION_STRING"):
        config["sql_server_connection_string"] = os.getenv("SQL_SERVER_CONNECTION_STRING")

    return config


def connect():
    if pyodbc is None:
        raise RuntimeError("Install pyodbc and Microsoft ODBC Driver for SQL Server.")

    config = load_config()
    timeout = int(config.get("connect_timeout", 3))
    last_error = None

    for connection_string in connection_string_candidates(config["sql_server_connection_string"]):
        try:
            return pyodbc.connect(connection_string, timeout=timeout)
        except pyodbc.Error as error:
            last_error = error

    raise last_error


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
    timeout = int(config.get("connect_timeout", 3))
    connection = pyodbc.connect(master_connection_string, timeout=timeout, autocommit=True)
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
    candidates = [connection_string]

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


def ensure_schema() -> None:
    ensure_database_exists()
    connection = connect()
    try:
        cursor = connection.cursor()
        for statement in SCHEMA_SQL:
            cursor.execute(statement)
        connection.commit()
    finally:
        connection.close()


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


def to_iso(value) -> str:
    if isinstance(value, datetime):
        return value.replace(tzinfo=timezone.utc).isoformat()
    return current_timestamp()


def get_bearer_token(headers) -> str | None:
    value = headers.get("Authorization", "")
    if value.startswith("Bearer "):
        return value.removeprefix("Bearer ").strip()
    return None


def get_session_email(headers) -> str | None:
    token = get_bearer_token(headers)
    return SESSIONS.get(token or "")


def rows_to_dicts(cursor) -> list[dict]:
    columns = [column[0] for column in cursor.description or []]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def fetchone_dict(cursor) -> dict | None:
    columns = [column[0] for column in cursor.description or []]
    row = cursor.fetchone()
    return dict(zip(columns, row)) if row else None


def table_columns(cursor, table_name: str) -> set[str]:
    cursor.execute(
        """
        SELECT LOWER(COLUMN_NAME) AS column_name
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo'
          AND TABLE_NAME = ?
        """,
        table_name,
    )
    return {str(row.column_name).lower() for row in cursor.fetchall()}


def products_table_exists(cursor) -> bool:
    cursor.execute("SELECT OBJECT_ID('dbo.products', 'U') AS object_id;")
    row = cursor.fetchone()
    return bool(row and row.object_id)


def get_user_by_email(cursor, email: str) -> dict | None:
    cursor.execute(
        """
        SELECT id, name, email, password_hash, salt, iterations, created_at
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


def product_exists(cursor, product_id: str) -> bool:
    if not product_id:
        return False

    if not products_table_exists(cursor):
        return True

    cursor.execute("SELECT 1 FROM dbo.products WHERE id = ?;", product_id)
    return cursor.fetchone() is not None


def build_product_payload(row: dict, columns: set[str]) -> tuple[str, dict]:
    product_id = str(row["id"])
    price = f"{float(row.get('price') or 0):.0f} {row.get('currency') or 'PLN'}"

    if {"name_pl", "name_en", "tag_pl", "tag_en", "description_pl", "description_en", "image"}.issubset(columns):
        image = row.get("image") or row.get("image_url") or "images/lamp1.jpg"
        name_en = row.get("name_en") or row.get("name_pl") or product_id
        name_pl = row.get("name_pl") or row.get("name_en") or product_id
        tag_en = row.get("tag_en") or row.get("tag_pl") or "Lamp"
        tag_pl = row.get("tag_pl") or row.get("tag_en") or "Lampa"
        description_en = row.get("description_en") or row.get("description_pl") or ""
        description_pl = row.get("description_pl") or row.get("description_en") or ""
    else:
        image = row.get("image_url") or row.get("image") or "images/lamp1.jpg"
        name_en = row.get("name") or product_id
        name_pl = row.get("name") or product_id
        tag_en = row.get("category") or "Lamp"
        tag_pl = row.get("category") or "Lampa"
        description_en = row.get("description") or ""
        description_pl = row.get("description") or ""

    return product_id, {
        "image": image,
        "price": price,
        "en": {
            "name": name_en,
            "tag": tag_en,
            "description": description_en,
            "meta": [tag_en],
            "imageAlt": name_en,
        },
        "pl": {
            "name": name_pl,
            "tag": tag_pl,
            "description": description_pl,
            "meta": [tag_pl],
            "imageAlt": name_pl,
        },
    }


class DiplomaRequestHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/api/health":
            self.serve_json({"status": "ok", "database": "mssql"})
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
            connection = connect()
            try:
                cursor = connection.cursor()
                if not products_table_exists(cursor):
                    self.serve_json({"source": "mssql", "products": {}}, status=404)
                    return

                columns = table_columns(cursor, "products")
                wanted_columns = [
                    "id",
                    "price",
                    "currency",
                    "image",
                    "image_url",
                    "name",
                    "category",
                    "description",
                    "name_en",
                    "name_pl",
                    "tag_en",
                    "tag_pl",
                    "description_en",
                    "description_pl",
                ]
                selected_columns = [column for column in wanted_columns if column in columns]
                cursor.execute(f"SELECT {', '.join(selected_columns)} FROM dbo.products ORDER BY id;")
                products = dict(build_product_payload(row, columns) for row in rows_to_dicts(cursor))
            finally:
                connection.close()

            if not products:
                self.serve_json({"source": "mssql", "products": {}}, status=404)
                return

            self.serve_json({"source": "mssql", "products": products})
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
            user_id = str(uuid.uuid4())
            connection = connect()

            try:
                cursor = connection.cursor()
                if get_user_by_email(cursor, email):
                    self.serve_json({"error": "Account already exists."}, status=409)
                    return

                cursor.execute(
                    """
                    INSERT INTO dbo.users (id, name, email, password_hash, salt, iterations)
                    VALUES (?, ?, ?, ?, ?, ?);
                    """,
                    user_id,
                    name,
                    email,
                    password_hash,
                    salt,
                    iterations,
                )
                connection.commit()
                user = get_user_by_email(cursor, email)
            finally:
                connection.close()

            token = secrets.token_urlsafe(32)
            SESSIONS[token] = email
            self.serve_json({"token": token, "user": self.public_user(user)})
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def handle_login(self) -> None:
        try:
            payload = read_json(self)
            email = str(payload.get("email", "")).strip().lower()
            password = str(payload.get("password", ""))

            connection = connect()
            try:
                cursor = connection.cursor()
                user = get_user_by_email(cursor, email)
            finally:
                connection.close()

            if not user:
                self.serve_json({"error": "Account not found."}, status=404)
                return

            password_hash, _, _ = hash_password(password, user["salt"], int(user["iterations"]))
            if not secrets.compare_digest(password_hash, user["password_hash"]):
                self.serve_json({"error": "Incorrect password."}, status=401)
                return

            token = secrets.token_urlsafe(32)
            SESSIONS[token] = email
            self.serve_json({"token": token, "user": self.public_user(user)})
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def serve_library(self) -> None:
        email = get_session_email(self.headers)
        if not email:
            self.serve_json({"items": []}, status=401)
            return

        try:
            connection = connect()
            try:
                cursor = connection.cursor()
                cursor.execute(
                    """
                    SELECT l.product_id, l.saved_at, l.purchased_at
                    FROM dbo.user_library l
                    JOIN dbo.users u ON u.id = l.user_id
                    WHERE u.email = ?
                    ORDER BY l.saved_at DESC;
                    """,
                    email,
                )
                items = [product_row_to_public(row) for row in rows_to_dicts(cursor)]
            finally:
                connection.close()

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
            purchased_at = datetime.now(timezone.utc).replace(tzinfo=None) if purchased else None
            connection = connect()

            try:
                cursor = connection.cursor()
                user = get_user_by_email(cursor, email)
                if not user:
                    self.serve_json({"error": "Account not found."}, status=404)
                    return

                if not product_exists(cursor, product_id):
                    self.serve_json({"error": "Product not found."}, status=404)
                    return

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
                connection.commit()
            finally:
                connection.close()

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
            connection = connect()
            try:
                cursor = connection.cursor()
                cursor.execute(
                    """
                    DELETE l
                    FROM dbo.user_library l
                    JOIN dbo.users u ON u.id = l.user_id
                    WHERE l.product_id = ?
                      AND u.email = ?;
                    """,
                    product_id,
                    email,
                )
                connection.commit()
            finally:
                connection.close()

            self.serve_library()
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def serve_cart(self) -> None:
        email = get_session_email(self.headers)
        if not email:
            self.serve_json({"items": []}, status=401)
            return

        try:
            connection = connect()
            try:
                cursor = connection.cursor()
                cursor.execute(
                    """
                    SELECT c.product_id, c.quantity, c.added_at AS saved_at
                    FROM dbo.user_cart c
                    JOIN dbo.users u ON u.id = c.user_id
                    WHERE u.email = ?
                    ORDER BY c.added_at DESC;
                    """,
                    email,
                )
                items = [product_row_to_public(row) for row in rows_to_dicts(cursor)]
            finally:
                connection.close()

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
            connection = connect()

            try:
                cursor = connection.cursor()
                user = get_user_by_email(cursor, email)
                if not user:
                    self.serve_json({"error": "Account not found."}, status=404)
                    return

                if not product_exists(cursor, product_id):
                    self.serve_json({"error": "Product not found."}, status=404)
                    return

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
                connection.commit()
            finally:
                connection.close()

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
            connection = connect()
            try:
                cursor = connection.cursor()
                cursor.execute(
                    """
                    DELETE c
                    FROM dbo.user_cart c
                    JOIN dbo.users u ON u.id = c.user_id
                    WHERE c.product_id = ?
                      AND u.email = ?;
                    """,
                    product_id,
                    email,
                )
                connection.commit()
            finally:
                connection.close()

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
            purchased_at = datetime.now(timezone.utc).replace(tzinfo=None)
            connection = connect()

            try:
                cursor = connection.cursor()
                user = get_user_by_email(cursor, email)
                if not user:
                    self.serve_json({"error": "Account not found."}, status=404)
                    return

                if not product_exists(cursor, product_id):
                    self.serve_json({"error": "Product not found."}, status=404)
                    return

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
                connection.commit()
            finally:
                connection.close()

            self.serve_json({"ok": True})
        except Exception as error:
            self.serve_json({"error": str(error)}, status=500)

    def public_user(self, user: dict) -> dict:
        return {
            "name": user["name"],
            "email": user["email"],
            "createdAt": to_iso(user.get("created_at")),
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
