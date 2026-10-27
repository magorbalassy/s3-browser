"""TLS options against a real local HTTPS server whose certificate comes from a private CA."""

import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest
import trustme

from s3_browser.s3 import S3Browser

from .conftest import CREDS

LIST_BUCKETS = b"""<?xml version="1.0" encoding="UTF-8"?>
<ListAllMyBucketsResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Owner><ID>me</ID></Owner>
  <Buckets><Bucket><Name>secure</Name><CreationDate>2025-01-01T00:00:00.000Z</CreationDate></Bucket></Buckets>
</ListAllMyBucketsResult>"""


class FakeS3(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 - http.server API
        self.send_response(200)
        self.send_header("Content-Type", "application/xml")
        self.send_header("Content-Length", str(len(LIST_BUCKETS)))
        self.end_headers()
        self.wfile.write(LIST_BUCKETS)

    def log_message(self, *args):
        pass


@pytest.fixture(scope="module")
def ca() -> trustme.CA:
    return trustme.CA()


@pytest.fixture(scope="module")
def https_endpoint(ca):
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeS3)
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ca.issue_cert("127.0.0.1").configure_cert(context)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"https://127.0.0.1:{server.server_address[1]}"
    server.shutdown()


def _connect(client, endpoint, **extra):
    return client.post("/api/session", json={**CREDS, "endpoint": endpoint, **extra})


def test_untrusted_certificate_is_rejected(client, https_endpoint):
    response = _connect(client, https_endpoint)
    assert response.status_code == 502
    assert response.json()["code"] == "tls_error"


def test_custom_ca_is_trusted(client, https_endpoint, ca):
    pem = ca.cert_pem.bytes().decode()
    response = _connect(client, https_endpoint, ca_cert=pem)
    assert response.status_code == 200, response.text
    assert response.json()["buckets"] == ["secure"]
    assert response.json()["custom_ca"] is True
    assert response.json()["verify_tls"] is True


def test_verification_can_be_skipped(client, https_endpoint):
    response = _connect(client, https_endpoint, verify_tls=False)
    assert response.status_code == 200, response.text
    assert response.json()["verify_tls"] is False


def test_invalid_ca_cert_is_a_validation_error(client):
    response = _connect(client, "https://127.0.0.1:1", ca_cert="not a certificate")
    assert response.status_code == 422
    assert "ca_cert" in response.json()["message"]
    broken = "-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----"
    assert _connect(client, "https://127.0.0.1:1", ca_cert=broken).status_code == 422


def test_ca_bundle_keeps_public_cas_and_is_removed_on_close(ca, https_endpoint):
    pem = ca.cert_pem.bytes().decode()
    browser = S3Browser(https_endpoint, "k", "s", ca_cert=pem)
    bundle = browser._ca_bundle
    assert bundle is not None and bundle.exists()
    content = bundle.read_text()
    assert pem.strip() in content
    assert content.count("BEGIN CERTIFICATE") > 100  # public CAs are still there
    browser.close()
    assert not bundle.exists()


def test_session_cleanup_removes_ca_bundle(client, https_endpoint, ca):
    _connect(client, https_endpoint, ca_cert=ca.cert_pem.bytes().decode())
    session = next(iter(client.app.state.sessions._sessions.values()))
    bundle = session.browser._ca_bundle
    assert bundle.exists()
    client.delete("/api/session")
    assert not bundle.exists()
