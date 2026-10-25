"""API request and response models. The frontend's TypeScript types are generated from these."""

from datetime import datetime

from pydantic import BaseModel, Field, SecretStr, field_validator


class ConnectRequest(BaseModel):
    endpoint: str = Field(
        default="",
        description="S3 endpoint URL, e.g. http://minio:9000. Empty means AWS S3.",
        max_length=2048,
    )
    access_key: str = Field(min_length=1, max_length=256)
    secret_key: SecretStr = Field(min_length=1, max_length=256)
    region: str = Field(default="us-east-1", min_length=1, max_length=64)

    @field_validator("endpoint")
    @classmethod
    def check_endpoint(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        if value and not value.startswith(("http://", "https://")):
            raise ValueError("endpoint must start with http:// or https://")
        return value


class SessionInfo(BaseModel):
    endpoint: str
    region: str
    buckets: list[str]


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
