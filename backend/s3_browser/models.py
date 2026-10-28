"""API request and response models. The frontend's TypeScript types are generated from these."""

import ssl
from datetime import datetime

from pydantic import BaseModel, Field, SecretStr, field_validator


def _check_endpoint(value: str) -> str:
    value = value.strip().rstrip("/")
    if value and not value.startswith(("http://", "https://")):
        raise ValueError("endpoint must start with http:// or https://")
    return value


def _check_ca_cert(value: str) -> str:
    value = value.strip()
    if not value:
        return ""
    if "-----BEGIN CERTIFICATE-----" not in value:
        raise ValueError("must be a PEM certificate (-----BEGIN CERTIFICATE-----)")
    try:
        ssl.create_default_context(cadata=value)
    except (ssl.SSLError, ValueError) as exc:
        raise ValueError("is not a valid PEM certificate") from exc
    return value + "\n"


class SourceIn(BaseModel):
    """A source to create or update. Leave `secret_key` out on update to keep the stored one."""

    name: str = Field(min_length=1, max_length=100)
    endpoint: str = Field(
        default="",
        description="S3 endpoint URL, e.g. https://minio:9000. Empty means AWS S3.",
        max_length=2048,
    )
    region: str = Field(default="us-east-1", min_length=1, max_length=64)
    access_key: str = Field(min_length=1, max_length=256)
    secret_key: SecretStr | None = Field(default=None, min_length=1, max_length=256)
    verify_tls: bool = Field(
        default=True,
        description="Verify the endpoint's TLS certificate. Disable only for trusted endpoints.",
    )
    ca_cert: str = Field(
        default="",
        description="Extra CA certificate(s) in PEM format, trusted in addition to public CAs.",
        max_length=65536,
    )

    @field_validator("name")
    @classmethod
    def check_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("name must not be empty")
        return value

    @field_validator("endpoint")
    @classmethod
    def check_endpoint(cls, value: str) -> str:
        return _check_endpoint(value)

    @field_validator("ca_cert")
    @classmethod
    def check_ca_cert(cls, value: str) -> str:
        return _check_ca_cert(value)


class Source(BaseModel):
    """A saved source. The secret key is write-only and never returned."""

    id: str = Field(description="Stable, URL-safe identifier (used in /s/<id>/...).")
    name: str
    endpoint: str
    region: str
    access_key: str
    verify_tls: bool
    ca_cert: str
    created_at: datetime
    updated_at: datetime


class SourceList(BaseModel):
    sources: list[Source]


class ConnectionTest(BaseModel):
    ok: bool
    buckets: list[str] = Field(default_factory=list)
    error: "ErrorResponse | None" = None


class BucketList(BaseModel):
    buckets: list[str]


class S3Folder(BaseModel):
    prefix: str = Field(description="Full prefix, ending with '/'.")
    name: str = Field(description="Last path segment, without the trailing '/'.")


class S3File(BaseModel):
    key: str
    name: str
    size: int
    last_modified: datetime
    storage_class: str | None = None


class ObjectPage(BaseModel):
    bucket: str
    prefix: str
    folders: list[S3Folder]
    files: list[S3File]
    next_token: str | None = Field(
        default=None, description="Pass as `token` to fetch the next page; null on the last page."
    )


class SizeProgress(BaseModel):
    """One Server-Sent Event of a folder-size calculation."""

    bytes: int
    objects: int
    done: bool
    error: "ErrorResponse | None" = None


class ErrorResponse(BaseModel):
    code: str = Field(description="Stable machine-readable error code.")
    message: str


class Health(BaseModel):
    status: str
