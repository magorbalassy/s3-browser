"""S3 access, independent of the web layer (shared by the API and the CLI)."""

import os
import tempfile
import warnings
from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path

import boto3
import urllib3
from botocore.config import Config
from botocore.exceptions import (
    BotoCoreError,
    ClientError,
    ConnectTimeoutError,
    EndpointConnectionError,
    ReadTimeoutError,
    SSLError,
)
from botocore.httpsession import get_cert_path

from .models import S3File, S3Folder

MAX_PAGE_SIZE = 1000

# Unverified TLS is an explicit per-connection choice (shown in the UI); don't log a
# warning for every request it makes.
warnings.filterwarnings("ignore", category=urllib3.exceptions.InsecureRequestWarning)


class S3Error(Exception):
    """An S3 failure translated into an API error code and HTTP status."""

    def __init__(self, code: str, message: str, status: int):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


_CLIENT_ERRORS: dict[str, tuple[str, int, str]] = {
    "InvalidAccessKeyId": ("invalid_credentials", 401, "Invalid access key."),
    "SignatureDoesNotMatch": ("invalid_credentials", 401, "Invalid secret key."),
    "InvalidToken": ("invalid_credentials", 401, "Invalid credentials."),
    "AccessDenied": ("access_denied", 403, "Access denied."),
    "AllAccessDisabled": ("access_denied", 403, "Access denied."),
    "NoSuchBucket": ("bucket_not_found", 404, "Bucket not found."),
    "NoSuchKey": ("object_not_found", 404, "Object not found."),
    "InvalidBucketName": ("invalid_bucket", 400, "Invalid bucket name."),
}


def translate(exc: Exception, endpoint: str = "") -> S3Error:
    target = endpoint or "AWS S3"
    if isinstance(exc, S3Error):
        return exc
    if isinstance(exc, SSLError):
        return S3Error(
            "tls_error",
            f"TLS certificate verification failed for {target}. Add its CA certificate, "
            "or skip verification if you trust this endpoint.",
            502,
        )
    if isinstance(exc, EndpointConnectionError | ConnectTimeoutError):
        return S3Error("endpoint_unreachable", f"Could not connect to {target}.", 502)
    if isinstance(exc, ReadTimeoutError):
        return S3Error("endpoint_timeout", f"{target} did not respond in time.", 504)
    if isinstance(exc, ClientError):
        aws_code = exc.response.get("Error", {}).get("Code", "")
        if aws_code in _CLIENT_ERRORS:
            code, status, message = _CLIENT_ERRORS[aws_code]
            return S3Error(code, message, status)
        detail = exc.response.get("Error", {}).get("Message") or aws_code or "Unknown error"
        return S3Error("s3_error", f"{target} returned an error: {detail}", 502)
    if isinstance(exc, ValueError):
        # botocore raises ValueError for malformed endpoint URLs.
        return S3Error("invalid_endpoint", str(exc), 422)
    if isinstance(exc, BotoCoreError):
        return S3Error("s3_error", str(exc), 502)
    return S3Error("internal_error", "Unexpected error.", 500)


def _name(path: str) -> str:
    return path.rstrip("/").rsplit("/", 1)[-1]


@dataclass
class S3Browser:
    endpoint: str
    access_key: str
    secret_key: str
    region: str = "us-east-1"
    verify_tls: bool = True
    ca_cert: str = ""
    _ca_bundle: Path | None = field(default=None, init=False, repr=False)

    def __post_init__(self) -> None:
        # Custom endpoints (MinIO, Ceph, ...) usually need path-style addressing;
        # AWS itself works best with the default (virtual-hosted) style.
        config = Config(
            connect_timeout=5,
            read_timeout=30,
            retries={"max_attempts": 2, "mode": "standard"},
            s3={"addressing_style": "path" if self.endpoint else "auto"},
        )
        try:
            self._client = boto3.client(
                "s3",
                endpoint_url=self.endpoint or None,
                aws_access_key_id=self.access_key,
                aws_secret_access_key=self.secret_key,
                region_name=self.region,
                config=config,
                verify=self._verify(),
            )
        except Exception as exc:
            self.close()
            raise translate(exc, self.endpoint) from exc

    def _verify(self) -> bool | str | None:
        """botocore's `verify`: False, a CA bundle path, or None for the default CAs."""
        if not self.verify_tls:
            return False
        if not self.ca_cert:
            return None
        # botocore only takes a file path, and a custom bundle replaces the default one:
        # write the public CAs plus the custom certificate(s) to a private temp file.
        fd, path = tempfile.mkstemp(prefix="s3b-ca-", suffix=".pem")
        with os.fdopen(fd, "w") as bundle:
            bundle.write(Path(get_cert_path(True)).read_text())
            bundle.write("\n" + self.ca_cert)
        self._ca_bundle = Path(path)
        return path

    def close(self) -> None:
        """Release resources (the temporary CA bundle, if any)."""
        if self._ca_bundle:
            self._ca_bundle.unlink(missing_ok=True)
            self._ca_bundle = None

    def list_buckets(self) -> list[str]:
        try:
            response = self._client.list_buckets()
        except Exception as exc:
            raise translate(exc, self.endpoint) from exc
        return sorted(bucket["Name"] for bucket in response.get("Buckets", []))

    def list_page(
        self, bucket: str, prefix: str = "", token: str | None = None, limit: int = MAX_PAGE_SIZE
    ) -> tuple[list[S3Folder], list[S3File], str | None]:
        """One page of the direct children of `prefix`: sub-folders and files."""
        params = {
            "Bucket": bucket,
            "Prefix": prefix,
            "Delimiter": "/",
            "MaxKeys": max(1, min(limit, MAX_PAGE_SIZE)),
        }
        if token:
            params["ContinuationToken"] = token
        try:
            response = self._client.list_objects_v2(**params)
        except Exception as exc:
            raise translate(exc, self.endpoint) from exc

        folders = [
            S3Folder(prefix=item["Prefix"], name=_name(item["Prefix"]))
            for item in response.get("CommonPrefixes", [])
        ]
        files = [
            S3File(
                key=item["Key"],
                name=_name(item["Key"]),
                size=item["Size"],
                last_modified=item["LastModified"],
                storage_class=item.get("StorageClass"),
            )
            for item in response.get("Contents", [])
            # Some tools create a zero-byte "folder marker" object equal to the prefix itself.
            if item["Key"] != prefix
        ]
        next_token = response.get("NextContinuationToken") if response.get("IsTruncated") else None
        return folders, files, next_token

    def iter_size(self, bucket: str, prefix: str = "") -> Iterator[tuple[int, int]]:
        """Yield the running (bytes, objects) total after each page of up to 1000 objects."""
        total_bytes = 0
        total_objects = 0
        paginator = self._client.get_paginator("list_objects_v2")
        try:
            for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
                for item in page.get("Contents", []):
                    total_bytes += item["Size"]
                    total_objects += 1
                yield total_bytes, total_objects
        except Exception as exc:
            raise translate(exc, self.endpoint) from exc

    def size(self, bucket: str, prefix: str = "") -> tuple[int, int]:
        total = (0, 0)
        for total in self.iter_size(bucket, prefix):  # noqa: B007 - keep the final total
            pass
        return total

    def download_url(self, bucket: str, key: str, expires: int = 300) -> str:
        try:
            return self._client.generate_presigned_url(
                "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=expires
            )
        except Exception as exc:
            raise translate(exc, self.endpoint) from exc
