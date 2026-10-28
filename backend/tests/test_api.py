import json
import sqlite3

from fastapi.testclient import TestClient

from s3_browser.config import Settings
from s3_browser.main import create_app

from .conftest import SECRET, SOURCE


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


# ----- sources -----


def test_create_and_list_sources(client):
    response = client.post("/api/sources", json=SOURCE)
    assert response.status_code == 201
    body = response.json()
    assert body["id"] == "moto"
    assert body["name"] == "Moto"
    assert "secret_key" not in body
    assert SECRET not in json.dumps(body)
    listed = client.get("/api/sources").json()["sources"]
    assert [s["id"] for s in listed] == ["moto"]
    assert SECRET not in json.dumps(listed)


def test_secret_is_required_on_create(client):
    response = client.post("/api/sources", json={**SOURCE, "secret_key": None})
    assert response.status_code == 422
    assert "secret_key" in response.json()["message"]


def test_names_are_unique_ignoring_case(client, source):
    response = client.post("/api/sources", json={**SOURCE, "name": "MOTO"})
    assert response.status_code == 409
    assert response.json()["code"] == "source_exists"


def test_ids_are_slugs_and_stay_unique(client, source):
    other = client.post("/api/sources", json={**SOURCE, "name": "Moto!"}).json()
    assert other["id"] == "moto-2"
    weird = client.post("/api/sources", json={**SOURCE, "name": "  Dev   S3 (EU) "}).json()
    assert (weird["id"], weird["name"]) == ("dev-s3-eu", "Dev S3 (EU)")


def test_create_tests_the_connection_first(client):
    bad = {**SOURCE, "endpoint": "http://127.0.0.1:1"}
    response = client.post("/api/sources", json=bad)
    assert response.status_code == 502
    assert response.json()["code"] == "endpoint_unreachable"
    assert client.get("/api/sources").json()["sources"] == []
    # ... unless asked not to
    assert client.post("/api/sources?test=false", json=bad).status_code == 201


def test_endpoint_validation(client):
    response = client.post("/api/sources", json={**SOURCE, "endpoint": "minio:9000"})
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"
    assert "endpoint" in response.json()["message"]


def test_endpoint_allow_list(aws, tmp_path):
    client = TestClient(
        create_app(Settings(data_dir=tmp_path, allowed_endpoints=["http://minio:9000"]))
    )
    for url in ("/api/sources", "/api/sources?test=false", "/api/sources/test"):
        response = client.post(url, json=SOURCE)
        if url.endswith("/test"):
            assert response.json()["error"]["code"] == "endpoint_not_allowed"
        else:
            assert response.status_code == 403


def test_test_endpoint_reports_success_and_failure(client):
    ok = client.post("/api/sources/test", json=SOURCE).json()
    assert ok == {"ok": True, "buckets": ["empty", "photos"], "error": None}
    bad = client.post("/api/sources/test", json={**SOURCE, "endpoint": "http://127.0.0.1:1"})
    assert bad.status_code == 200
    assert bad.json()["ok"] is False
    assert bad.json()["error"]["code"] == "endpoint_unreachable"


def test_test_endpoint_can_reuse_the_stored_secret(client, source):
    without_secret = {**SOURCE, "secret_key": None}
    assert client.post("/api/sources/test", json=without_secret).json()["ok"] is False
    reused = client.post(f"/api/sources/test?source_id={source}", json=without_secret).json()
    assert reused["ok"] is True


def test_update_keeps_id_and_secret(client, source):
    response = client.put(
        f"/api/sources/{source}", json={**SOURCE, "name": "Renamed", "secret_key": None}
    )
    assert response.status_code == 200
    assert (response.json()["id"], response.json()["name"]) == ("moto", "Renamed")
    # The stored secret still works.
    assert client.get(f"/api/sources/{source}/buckets").status_code == 200


def test_update_replaces_the_cached_client(client, source):
    assert client.get(f"/api/sources/{source}/buckets").status_code == 200
    moved = {**SOURCE, "endpoint": "http://127.0.0.1:1"}
    assert client.put(f"/api/sources/{source}?test=false", json=moved).status_code == 200
    assert client.get(f"/api/sources/{source}/buckets").json()["code"] == "endpoint_unreachable"


def test_update_and_delete_unknown_source(client):
    assert client.put("/api/sources/nope", json=SOURCE).json()["code"] == "source_not_found"
    assert client.delete("/api/sources/nope").status_code == 404


def test_delete_source(client, source):
    assert client.delete(f"/api/sources/{source}").status_code == 204
    response = client.get(f"/api/sources/{source}/buckets")
    assert response.status_code == 404
    assert response.json()["code"] == "source_not_found"


def test_invalid_source_id(client):
    assert client.get("/api/sources/Not_Valid!/buckets").status_code == 422


# ----- storage -----


def test_secrets_are_encrypted_at_rest(client, source, settings):
    raw = (settings.data_dir / "s3-browser.db").read_bytes()
    assert SECRET.encode() not in raw
    with sqlite3.connect(settings.data_dir / "s3-browser.db") as conn:
        (stored,) = conn.execute("SELECT secret_key FROM sources").fetchone()
    assert SECRET.encode() not in stored


def test_sources_survive_a_restart(client, source, settings):
    restarted = TestClient(create_app(settings))
    assert [s["id"] for s in restarted.get("/api/sources").json()["sources"]] == ["moto"]
    assert restarted.get(f"/api/sources/{source}/buckets").status_code == 200


def test_generated_key_file_is_private(client, settings):
    key = settings.data_dir / "secret.key"
    assert key.exists()
    assert key.stat().st_mode & 0o777 == 0o600


def test_wrong_secret_key_is_reported(aws, tmp_path):
    first = TestClient(create_app(Settings(data_dir=tmp_path, secret_key="one")))
    assert first.post("/api/sources", json=SOURCE).status_code == 201
    second = TestClient(create_app(Settings(data_dir=tmp_path, secret_key="two")))
    response = second.get("/api/sources/moto/buckets")
    assert response.status_code == 500
    assert response.json()["code"] == "secret_unreadable"


# ----- browsing -----


def test_buckets(client, source):
    assert client.get(f"/api/sources/{source}/buckets").json() == {"buckets": ["empty", "photos"]}


def test_root_listing(client, source):
    page = client.get(f"/api/sources/{source}/buckets/photos/objects").json()
    assert [f["prefix"] for f in page["folders"]] == ["2024/", "2025/"]
    assert [f["name"] for f in page["folders"]] == ["2024", "2025"]
    assert [f["key"] for f in page["files"]] == ["readme.txt"]
    assert page["files"][0]["size"] == 10
    assert page["next_token"] is None


def test_nested_listing_hides_folder_marker(client, source):
    url = f"/api/sources/{source}/buckets/photos/objects"
    page = client.get(url, params={"prefix": "2024/"}).json()
    assert [f["prefix"] for f in page["folders"]] == ["2024/feb/", "2024/jan/"]
    assert page["files"] == []
    page = client.get(url, params={"prefix": "2024/jan/"}).json()
    assert [(f["name"], f["size"]) for f in page["files"]] == [("a.jpg", 100), ("b.jpg", 200)]


def test_paging(client, source):
    url = f"/api/sources/{source}/buckets/photos/objects"
    first = client.get(url, params={"prefix": "2024/jan/", "limit": 1}).json()
    assert len(first["files"]) == 1 and first["next_token"]
    second = client.get(
        url, params={"prefix": "2024/jan/", "limit": 1, "token": first["next_token"]}
    ).json()
    assert [f["name"] for f in second["files"]] == ["b.jpg"]
    assert second["next_token"] is None


def test_missing_bucket(client, source):
    response = client.get(f"/api/sources/{source}/buckets/nope/objects")
    assert response.status_code == 404
    assert response.json()["code"] == "bucket_not_found"


def _events(response) -> list[dict]:
    return [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]


def test_size_stream(client, source):
    response = client.get(f"/api/sources/{source}/buckets/photos/size", params={"prefix": "2024/"})
    assert response.headers["content-type"].startswith("text/event-stream")
    assert _events(response)[-1] == {"bytes": 600, "objects": 4, "done": True, "error": None}


def test_size_stream_reports_errors(client, source):
    events = _events(client.get(f"/api/sources/{source}/buckets/nope/size"))
    assert events[-1]["done"] is True
    assert events[-1]["error"]["code"] == "bucket_not_found"


def test_download_redirects_to_presigned_url(client, source):
    response = client.get(
        f"/api/sources/{source}/buckets/photos/download",
        params={"key": "readme.txt"},
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert "readme.txt" in response.headers["location"]
    assert "Signature" in response.headers["location"]


# ----- misc -----


def test_unknown_api_route_is_json_404(client):
    response = client.get("/api/nope")
    assert response.status_code == 404
    assert response.json()["code"] == "not_found"


def test_spa_fallback(tmp_path, aws):
    static = tmp_path / "static"
    static.mkdir()
    (static / "index.html").write_text("<app-root></app-root>")
    (static / "main-ABCD1234.js").write_text("console.log(1)")
    client = TestClient(create_app(Settings(data_dir=tmp_path / "data", static_dir=static)))
    assert client.get("/s/moto/photos/2024").text == "<app-root></app-root>"
    asset = client.get("/main-ABCD1234.js")
    assert asset.text == "console.log(1)"
    assert "immutable" in asset.headers["cache-control"]
    assert client.get("/../../etc/passwd").text == "<app-root></app-root>"
    assert client.get("/api/nope").status_code == 404
    assert client.head("/s/moto").status_code == 200
