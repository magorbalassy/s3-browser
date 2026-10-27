"""In-memory, server-side sessions.

The browser only holds a random session id (HttpOnly cookie); the S3 credentials never
leave the server. Sessions live in this process, so run a single worker. A restart logs
everyone out, which is acceptable for this tool.
"""

import secrets
import threading
import time
from dataclasses import dataclass, field

from .s3 import S3Browser

COOKIE_NAME = "s3b_session"


@dataclass
class Session:
    id: str
    browser: S3Browser
    # A lambda, so the clock is looked up at creation time (and can be faked in tests).
    last_seen: float = field(default_factory=lambda: time.monotonic())


class SessionStore:
    def __init__(self, ttl: int):
        self._ttl = ttl
        self._sessions: dict[str, Session] = {}
        self._lock = threading.Lock()

    def create(self, browser: S3Browser) -> Session:
        session = Session(id=secrets.token_urlsafe(32), browser=browser)
        with self._lock:
            self._purge()
            self._sessions[session.id] = session
        return session

    def get(self, session_id: str | None) -> Session | None:
        if not session_id:
            return None
        with self._lock:
            self._purge()
            session = self._sessions.get(session_id)
            if session:
                session.last_seen = time.monotonic()
            return session

    def remove(self, session_id: str | None) -> None:
        if session_id:
            with self._lock:
                session = self._sessions.pop(session_id, None)
                if session:
                    session.browser.close()

    def __len__(self) -> int:
        return len(self._sessions)

    def _purge(self) -> None:
        cutoff = time.monotonic() - self._ttl
        for sid in [sid for sid, s in self._sessions.items() if s.last_seen < cutoff]:
            self._sessions.pop(sid).browser.close()
