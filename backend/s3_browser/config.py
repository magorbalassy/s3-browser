"""Runtime settings, read from environment variables."""

import os
from dataclasses import dataclass, field
from pathlib import Path


def _list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # Where the SQLite database (and the generated encryption key, if any) live.
    data_dir: Path = Path("data")
    # Encrypts the stored secret keys. If unset, a random key is generated once and saved
    # as <data_dir>/secret.key. Changing it makes existing secrets unreadable.
    secret_key: str | None = None
    # If set, sources may only use these endpoints (exact match, no trailing slash).
    # An empty endpoint ("") in the list allows AWS S3 itself.
    allowed_endpoints: list[str] = field(default_factory=list)
    # Directory holding the built Angular app; not served when missing.
    static_dir: Path | None = None
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> "Settings":
        static = os.environ.get("STATIC_DIR")
        return cls(
            data_dir=Path(os.environ.get("DATA_DIR", "data")),
            secret_key=os.environ.get("SECRET_KEY") or None,
            allowed_endpoints=_list(os.environ.get("ALLOWED_ENDPOINTS")),
            static_dir=Path(static) if static else None,
            log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        )
