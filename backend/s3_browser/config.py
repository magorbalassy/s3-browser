"""Runtime settings, read from environment variables."""

import os
from dataclasses import dataclass, field
from pathlib import Path


def _bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _list(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # Idle time (seconds) after which a session and its credentials are dropped.
    session_ttl: int = 3600
    # If set, users may only connect to these endpoints (exact match, no trailing slash).
    # An empty endpoint ("") in the list allows AWS S3 itself.
    allowed_endpoints: list[str] = field(default_factory=list)
    # Send the session cookie with the Secure flag (enable when served over HTTPS).
    cookie_secure: bool = False
    # Directory holding the built Angular app; not served when missing.
    static_dir: Path | None = None
    log_level: str = "INFO"

    @classmethod
    def from_env(cls) -> "Settings":
        static = os.environ.get("STATIC_DIR")
        return cls(
            session_ttl=int(os.environ.get("SESSION_TTL", "3600")),
            allowed_endpoints=_list(os.environ.get("ALLOWED_ENDPOINTS")),
            cookie_secure=_bool(os.environ.get("COOKIE_SECURE"), False),
            static_dir=Path(static) if static else None,
            log_level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        )
