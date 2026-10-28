"""Saved S3 sources, stored in SQLite. Secret keys are encrypted at rest."""

import re
import sqlite3
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from .crypto import SecretBox
from .models import Source, SourceIn
from .s3 import S3Error

# Each entry upgrades the schema by one version (PRAGMA user_version).
MIGRATIONS: list[str] = [
    """
    CREATE TABLE sources (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
        endpoint    TEXT NOT NULL DEFAULT '',
        region      TEXT NOT NULL DEFAULT 'us-east-1',
        access_key  TEXT NOT NULL,
        secret_key  BLOB NOT NULL,            -- Fernet token
        verify_tls  INTEGER NOT NULL DEFAULT 1,
        ca_cert     TEXT NOT NULL DEFAULT '',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
    );
    """,
]

_COLUMNS = "id, name, endpoint, region, access_key, verify_tls, ca_cert, created_at, updated_at"


@dataclass(frozen=True)
class Credentials:
    endpoint: str
    region: str
    access_key: str
    secret_key: str
    verify_tls: bool
    ca_cert: str


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40].strip("-")
    return slug or "source"


def not_found(source_id: str) -> S3Error:
    return S3Error("source_not_found", f"Source '{source_id}' does not exist.", 404)


class SourceRepo:
    def __init__(self, path: Path, secrets: SecretBox):
        self._path = path
        self._secrets = secrets
        self._write_lock = threading.Lock()
        with self._connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            self._migrate(conn)

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        # One short-lived connection per operation: simple and safe across threads.
        conn = sqlite3.connect(self._path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            with conn:  # commits, or rolls back on error
                yield conn
        finally:
            conn.close()

    @staticmethod
    def _migrate(conn: sqlite3.Connection) -> None:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        for number, script in enumerate(MIGRATIONS[version:], start=version + 1):
            conn.executescript(f"BEGIN; {script} PRAGMA user_version = {number}; COMMIT;")

    @staticmethod
    def _to_model(row: sqlite3.Row) -> Source:
        return Source(**{**dict(row), "verify_tls": bool(row["verify_tls"])})

    def list(self) -> list[Source]:
        with self._connect() as conn:
            rows = conn.execute(f"SELECT {_COLUMNS} FROM sources ORDER BY name").fetchall()
        return [self._to_model(row) for row in rows]

    def get(self, source_id: str) -> Source:
        with self._connect() as conn:
            row = conn.execute(
                f"SELECT {_COLUMNS} FROM sources WHERE id = ?", (source_id,)
            ).fetchone()
        if row is None:
            raise not_found(source_id)
        return self._to_model(row)

    def credentials(self, source_id: str) -> Credentials:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT endpoint, region, access_key, secret_key, verify_tls, ca_cert "
                "FROM sources WHERE id = ?",
                (source_id,),
            ).fetchone()
        if row is None:
            raise not_found(source_id)
        try:
            secret = self._secrets.decrypt(row["secret_key"])
        except ValueError as exc:
            raise S3Error("secret_unreadable", str(exc), 500) from exc
        return Credentials(
            endpoint=row["endpoint"],
            region=row["region"],
            access_key=row["access_key"],
            secret_key=secret,
            verify_tls=bool(row["verify_tls"]),
            ca_cert=row["ca_cert"],
        )

    def create(self, data: SourceIn) -> Source:
        if data.secret_key is None:
            raise S3Error("validation_error", "secret_key: Field required", 422)
        now = _now()
        with self._write_lock, self._connect() as conn:
            source_id = self._unique_id(conn, slugify(data.name))
            try:
                conn.execute(
                    "INSERT INTO sources (id, name, endpoint, region, access_key, secret_key, "
                    "verify_tls, ca_cert, created_at, updated_at) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        source_id,
                        data.name,
                        data.endpoint,
                        data.region,
                        data.access_key,
                        self._secrets.encrypt(data.secret_key.get_secret_value()),
                        int(data.verify_tls),
                        data.ca_cert,
                        now,
                        now,
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise _name_taken(data.name) from exc
        return self.get(source_id)

    def update(self, source_id: str, data: SourceIn) -> Source:
        fields = {
            "name": data.name,
            "endpoint": data.endpoint,
            "region": data.region,
            "access_key": data.access_key,
            "verify_tls": int(data.verify_tls),
            "ca_cert": data.ca_cert,
            "updated_at": _now(),
        }
        if data.secret_key is not None:
            fields["secret_key"] = self._secrets.encrypt(data.secret_key.get_secret_value())
        assignments = ", ".join(f"{column} = ?" for column in fields)
        with self._write_lock, self._connect() as conn:
            try:
                cursor = conn.execute(
                    f"UPDATE sources SET {assignments} WHERE id = ?",
                    (*fields.values(), source_id),
                )
            except sqlite3.IntegrityError as exc:
                raise _name_taken(data.name) from exc
        if cursor.rowcount == 0:
            raise not_found(source_id)
        return self.get(source_id)

    def delete(self, source_id: str) -> None:
        with self._write_lock, self._connect() as conn:
            cursor = conn.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        if cursor.rowcount == 0:
            raise not_found(source_id)

    @staticmethod
    def _unique_id(conn: sqlite3.Connection, base: str) -> str:
        candidate, n = base, 2
        while conn.execute("SELECT 1 FROM sources WHERE id = ?", (candidate,)).fetchone():
            candidate, n = f"{base}-{n}", n + 1
        return candidate


def _name_taken(name: str) -> S3Error:
    return S3Error("source_exists", f"A source named '{name}' already exists.", 409)
