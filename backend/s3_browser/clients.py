"""Cache of ready-to-use S3 clients, one per saved source.

Creating a client (and its CA bundle) per request would be wasteful; clients are built on
first use and dropped when their source changes or is deleted.
"""

import threading

from .s3 import S3Browser
from .sources import SourceRepo


class ClientCache:
    def __init__(self, repo: SourceRepo):
        self._repo = repo
        self._clients: dict[str, S3Browser] = {}
        self._lock = threading.Lock()

    def get(self, source_id: str) -> S3Browser:
        with self._lock:
            client = self._clients.get(source_id)
        if client is not None:
            return client
        creds = self._repo.credentials(source_id)  # raises source_not_found
        client = S3Browser(
            creds.endpoint,
            creds.access_key,
            creds.secret_key,
            creds.region,
            verify_tls=creds.verify_tls,
            ca_cert=creds.ca_cert,
        )
        with self._lock:
            # Another request may have built one meanwhile; keep the first.
            existing = self._clients.setdefault(source_id, client)
        if existing is not client:
            client.close()
        return existing

    def invalidate(self, source_id: str) -> None:
        with self._lock:
            client = self._clients.pop(source_id, None)
        if client is not None:
            client.close()

    def close(self) -> None:
        with self._lock:
            clients, self._clients = list(self._clients.values()), {}
        for client in clients:
            client.close()
