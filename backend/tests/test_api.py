import json

from fastapi.testclient import TestClient

from s3_browser.config import Settings
from s3_browser.main import create_app
from s3_browser.sessions import COOKIE_NAME

from .conftest import CREDS


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_connect_sets_http_only_cookie_and_lists_buckets(client):
    response = client.post("/api/session", json=CREDS)
    assert response.status_code == 200
    assert response.json() == {
        "endpoint": "",
        "region": "us-east-1",
        "buckets": ["empty", "photos"],
    }
    cookie = response.headers["set-cookie"]
    assert COOKIE_NAME in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    # The secret must never be sent back.
    assert "test" not in json.dumps(response.json())


def test_requests_without_session_are_401(client):
    for path in ("/api/session", "/api/buckets", "/api/buckets/photos/objects"):
        response = client.get(path)
        assert response.status_code == 401
        assert response.json()["code"] == "not_connected"


def test_validation_error_shape(client):
    response = client.post("/api/session", json={**CREDS, "endpoint": "minio:9000"})
    assert response.status_code == 422
    body = response.json()
    assert body["code"] == "validation_error"
    assert "endpoint" in body["message"]


def test_endpoint_allow_list(aws):
    client = TestClient(create_app(Settings(allowed_endpoints=["http://minio:9000"])))
    response = client.post("/api/session", json=CREDS)
    assert response.status_code == 403
    assert response.json()["code"] == "endpoint_not_allowed"


def test_unreachable_endpoint(client):
    response = client.post("/api/session", json={**CREDS, "endpoint": "http://127.0.0.1:1"})
    assert response.status_code == 502
    assert response.json()["code"] == "endpoint_unreachable"


def test_get_and_delete_session(connected):
    assert connected.get("/api/session").json()["buckets"] == ["empty", "photos"]
    assert connected.delete("/api/session").status_code == 204
    assert connected.get("/api/session").status_code == 401


def test_root_listing(connected):
    page = connected.get("/api/buckets/photos/objects").json()
    assert [f["prefix"] for f in page["folders"]] == ["2024/", "2025/"]
    assert [f["name"] for f in page["folders"]] == ["2024", "2025"]
    assert [f["key"] for f in page["files"]] == ["readme.txt"]
    assert page["files"][0]["size"] == 10
    assert page["next_token"] is None


def test_nested_listing_hides_folder_marker(connected):
    page = connected.get("/api/buckets/photos/objects", params={"prefix": "2024/"}).json()
    assert [f["prefix"] for f in page["folders"]] == ["2024/feb/", "2024/jan/"]
    assert page["files"] == []
    page = connected.get("/api/buckets/photos/objects", params={"prefix": "2024/jan/"}).json()
    assert [(f["name"], f["size"]) for f in page["files"]] == [("a.jpg", 100), ("b.jpg", 200)]


def test_paging(connected):
    url = "/api/buckets/photos/objects"
    first = connected.get(url, params={"prefix": "2024/jan/", "limit": 1}).json()
    assert len(first["files"]) == 1 and first["next_token"]
    second = connected.get(
        url, params={"prefix": "2024/jan/", "limit": 1, "token": first["next_token"]}
    ).json()
    assert [f["name"] for f in second["files"]] == ["b.jpg"]
    assert second["next_token"] is None


def test_missing_bucket(connected):
    response = connected.get("/api/buckets/nope/objects")
    assert response.status_code == 404
    assert response.json()["code"] == "bucket_not_found"


def _events(response) -> list[dict]:
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


def test_size_stream(connected):
    response = connected.get("/api/buckets/photos/size", params={"prefix": "2024/"})
    assert response.headers["content-type"].startswith("text/event-stream")
    events = _events(response)
    assert events[-1] == {"bytes": 600, "objects": 4, "done": True, "error": None}


def test_size_stream_reports_errors(connected):
    events = _events(connected.get("/api/buckets/nope/size"))
    assert events[-1]["done"] is True
    assert events[-1]["error"]["code"] == "bucket_not_found"


def test_download_redirects_to_presigned_url(connected):
    response = connected.get(
        "/api/buckets/photos/download", params={"key": "readme.txt"}, follow_redirects=False
    )
    assert response.status_code == 307
    assert "readme.txt" in response.headers["location"]
    assert "Signature" in response.headers["location"]


def test_unknown_api_route_is_json_404(client):
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_spa_fallback(tmp_path, aws):
    (tmp_path / "index.html").write_text("<app-root></app-root>")
    (tmp_path / "main-ABCD1234.js").write_text("console.log(1)")
    client = TestClient(create_app(Settings(static_dir=tmp_path)))
    assert client.get("/b/photos/2024").text == "<app-root></app-root>"
    asset = client.get("/main-ABCD1234.js")
    assert asset.text == "console.log(1)"
    assert "immutable" in asset.headers["cache-control"]
    assert client.get("/../../etc/passwd").text == "<app-root></app-root>"
    assert client.get("/api/nope").status_code == 404
