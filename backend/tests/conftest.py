import boto3
import pytest
from fastapi.testclient import TestClient
from moto import mock_aws

from s3_browser.config import Settings
from s3_browser.main import create_app

CREDS = {"endpoint": "", "access_key": "test", "secret_key": "test", "region": "us-east-1"}


@pytest.fixture(autouse=True)
def aws(monkeypatch):
    for var in ("AWS_PROFILE", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_ENDPOINT_URL"):
        monkeypatch.delenv(var, raising=False)
    with mock_aws():
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket="photos")
        s3.create_bucket(Bucket="empty")
        objects = {
            "readme.txt": 10,
            "2024/": 0,  # folder marker
            "2024/jan/a.jpg": 100,
            "2024/jan/b.jpg": 200,
            "2024/feb/c.jpg": 300,
            "2025/d.jpg": 400,
        }
        for key, size in objects.items():
            s3.put_object(Bucket="photos", Key=key, Body=b"x" * size)
        yield s3


@pytest.fixture
def settings() -> Settings:
    return Settings()


@pytest.fixture
def client(settings) -> TestClient:
    return TestClient(create_app(settings))


@pytest.fixture
def connected(client) -> TestClient:
    response = client.post("/api/session", json=CREDS)
    assert response.status_code == 200, response.text
    return client
