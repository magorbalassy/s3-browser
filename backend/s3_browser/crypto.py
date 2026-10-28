"""Encryption of the secret keys stored in the database."""

import base64
import hashlib
import logging
import os
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken

log = logging.getLogger("s3_browser")


class SecretBox:
    """Fernet (AES + HMAC) encryption with a key from SECRET_KEY or a generated key file."""

    def __init__(self, data_dir: Path, secret_key: str | None = None):
        if secret_key:
            # Any passphrase works: derive a proper 32-byte Fernet key from it.
            key = base64.urlsafe_b64encode(hashlib.sha256(secret_key.encode()).digest())
        else:
            key = self._key_file(data_dir)
        self._fernet = Fernet(key)

    @staticmethod
    def _key_file(data_dir: Path) -> bytes:
        path = data_dir / "secret.key"
        if path.exists():
            return path.read_bytes().strip()
        key = Fernet.generate_key()
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as handle:
            handle.write(key)
        log.warning("Generated a new encryption key in %s; keep it with the database", path)
        return key

    def encrypt(self, value: str) -> bytes:
        return self._fernet.encrypt(value.encode())

    def decrypt(self, token: bytes) -> str:
        try:
            return self._fernet.decrypt(token).decode()
        except InvalidToken as exc:
            raise ValueError(
                "Cannot decrypt a stored secret key: SECRET_KEY (or data/secret.key) changed"
            ) from exc
