from botocore.exceptions import ClientError, EndpointConnectionError

from s3_browser.s3 import S3Browser, translate
from s3_browser.sessions import SessionStore


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


def test_session_store_expiry(monkeypatch):
    import s3_browser.sessions as sessions

    # Far beyond any real uptime, so the test fails if code bypasses the fake clock.
    now = [10.0**9]
    monkeypatch.setattr(sessions.time, "monotonic", lambda: now[0])
    store = SessionStore(ttl=60)
    session = store.create(S3Browser("", "test", "test"))
    assert store.get(session.id) is session
    now[0] += 59
    assert store.get(session.id) is session  # access refreshes the idle timer
    now[0] += 61
    assert store.get(session.id) is None
    assert len(store) == 0


def test_repr_hides_secrets():
    browser = S3Browser("", "AKIA", "super-secret", ca_cert="")
    assert "super-secret" not in repr(browser)
    assert "AKIA" in repr(browser)
