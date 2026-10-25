"""Command line interface: query an endpoint directly, or run the web server."""

from typing import Annotated

import typer

from .s3 import S3Browser, S3Error

app = typer.Typer(help="Browse S3-compatible storage.", no_args_is_help=True)

Endpoint = Annotated[str, typer.Option("--endpoint", "-e", envvar="ENDPOINT", help="Empty = AWS")]
AccessKey = Annotated[str, typer.Option("--access-key", "-k", envvar="ACCESS_KEY")]
SecretKey = Annotated[str, typer.Option("--secret-key", "-s", envvar="SECRET_KEY", hidden=True)]
Region = Annotated[str, typer.Option("--region", "-r", envvar="REGION")]
Bucket = Annotated[str, typer.Option("--bucket", "-b", envvar="BUCKET_NAME")]
Prefix = Annotated[str, typer.Option("--prefix", "-p", envvar="FOLDER_PATH", help="'' = bucket")]


def human(size: float) -> str:
    for unit in ("B", "KiB", "MiB", "GiB", "TiB"):
        if size < 1024 or unit == "TiB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.2f} {unit}"
        size /= 1024
    raise AssertionError("unreachable")


def _fail(err: S3Error) -> None:
    typer.secho(f"Error ({err.code}): {err.message}", fg=typer.colors.RED, err=True)
    raise typer.Exit(1)


@app.command()
def buckets(
    access_key: AccessKey,
    secret_key: SecretKey,
    endpoint: Endpoint = "",
    region: Region = "us-east-1",
) -> None:
    """List buckets."""
    try:
        for name in S3Browser(endpoint, access_key, secret_key, region).list_buckets():
            typer.echo(name)
    except S3Error as err:
        _fail(err)


@app.command()
def ls(
    access_key: AccessKey,
    secret_key: SecretKey,
    bucket: Bucket,
    endpoint: Endpoint = "",
    region: Region = "us-east-1",
    prefix: Prefix = "",
) -> None:
    """List the folders and files directly under a prefix."""
    browser = S3Browser(endpoint, access_key, secret_key, region)
    token: str | None = None
    try:
        while True:
            folders, files, token = browser.list_page(bucket, prefix.lstrip("/"), token)
            for folder in folders:
                typer.echo(f"{'DIR':>12}  {folder.prefix}")
            for file in files:
                typer.echo(f"{human(file.size):>12}  {file.key}")
            if not token:
                break
    except S3Error as err:
        _fail(err)


@app.command()
def size(
    access_key: AccessKey,
    secret_key: SecretKey,
    bucket: Bucket,
    endpoint: Endpoint = "",
    region: Region = "us-east-1",
    prefix: Prefix = "",
    raw: Annotated[bool, typer.Option(help="Print bytes only.")] = False,
) -> None:
    """Total size of everything under a prefix (the whole bucket by default)."""
    try:
        total, count = S3Browser(endpoint, access_key, secret_key, region).size(
            bucket, prefix.lstrip("/")
        )
    except S3Error as err:
        _fail(err)
    typer.echo(total if raw else f"{human(total)} ({total} bytes) in {count} objects")


@app.command()
def serve(
    host: str = "0.0.0.0",
    port: Annotated[int, typer.Option(envvar="PORT")] = 8080,
    reload: bool = False,
) -> None:
    """Run the web UI and API (single worker: sessions are kept in memory)."""
    import uvicorn

    uvicorn.run(
        "s3_browser.main:app", host=host, port=port, reload=reload, workers=1, proxy_headers=True
    )


@app.command()
def openapi() -> None:
    """Print the API's OpenAPI schema (used to generate the frontend's types)."""
    import json

    from .config import Settings
    from .main import create_app

    typer.echo(json.dumps(create_app(Settings()).openapi(), indent=2))
