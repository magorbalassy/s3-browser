from botocore.exceptions import ClientError, EndpointConnectionError

from s3_browser.s3 import S3Browser, translate
from s3_browser.sources import slugify


def _client_error(code: str) -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": "boom"}}, "ListBuckets")


def test_translate_client_errors():
    assert translate(_client_error("InvalidAccessKeyId")).status == 401
    assert translate(_client_error("SignatureDoesNotMatch")).code == "invalid_credentials"
    assert translate(_client_error("AccessDenied")).status == 403
    assert translate(_client_error("NoSuchBucket")).code == "bucket_not_found"
    other = translate(_client_error("SlowDown"), "http://minio:9000")
    assert (other.code, other.status) == ("s3_error", 502)
    assert "http://minio:9000" in other.message


def test_translate_connection_errors():
    err = translate(EndpointConnectionError(endpoint_url="http://x"))
    assert (err.code, err.status) == ("endpoint_unreachable", 502)
    assert translate(RuntimeError("x")).code == "internal_error"


def test_size():
    browser = S3Browser("", "test", "test")
    assert browser.size("photos") == (1010, 6)
    assert browser.size("photos", "2024/jan/") == (300, 2)
    assert browser.size("empty") == (0, 0)


def test_slugify():
    assert slugify("Prod MinIO (EU)") == "prod-minio-eu"
    assert slugify("!!!") == "source"
    assert len(slugify("x" * 100)) == 40


def test_repr_hides_secrets():
    browser = S3Browser("", "AKIA", "super-secret", ca_cert="")
    assert "super-secret" not in repr(browser)
    assert "AKIA" in repr(browser)
