"""FastAPI application: the JSON API under /api plus the built Angular app."""

import logging
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, FastAPI, Query, Request
from fastapi import Path as PathParam
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .clients import ClientCache
from .config import Settings
from .crypto import SecretBox
from .models import (
    BucketList,
    ConnectionTest,
    ErrorResponse,
    Health,
    ObjectPage,
    SizeProgress,
    Source,
    SourceIn,
    SourceList,
)
from .s3 import MAX_PAGE_SIZE, S3Browser, S3Error, translate
from .sources import SourceRepo

log = logging.getLogger("s3_browser")

ERROR_RESPONSES: dict[int | str, dict] = {
    status: {"model": ErrorResponse} for status in (400, 403, 404, 409, 422, 500, 502, 504)
}

SourceId = Annotated[str, PathParam(pattern=r"^[a-z0-9-]{1,64}$", description="Source id")]


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    repo = SourceRepo(
        settings.data_dir / "s3-browser.db", SecretBox(settings.data_dir, settings.secret_key)
    )
    clients = ClientCache(repo)

    app = FastAPI(
        title="S3 Browser",
        version="0.3.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        # operationId = function name, so generated clients get readable method names.
        generate_unique_id_function=lambda route: route.name,
    )
    app.state.settings = settings
    app.state.sources = repo
    app.state.clients = clients

    # ----- errors: one JSON shape ({code, message}) for every failure -----

    @app.exception_handler(S3Error)
    async def s3_error_handler(_: Request, exc: S3Error) -> JSONResponse:
        return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", [])[1:])
        message = first.get("msg", "Invalid request.")
        return JSONResponse(
            {"code": "validation_error", "message": f"{field}: {message}" if field else message},
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = {404: "not_found"}.get(exc.status_code, "http_error")
        return JSONResponse(
            {"code": code, "message": str(exc.detail)},
            status_code=exc.status_code,
            headers=getattr(exc, "headers", None),
        )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    # ----- helpers -----

    def check_allowed(endpoint: str) -> None:
        if settings.allowed_endpoints and endpoint not in settings.allowed_endpoints:
            raise S3Error("endpoint_not_allowed", "This endpoint is not allowed.", 403)

    def probe(data: SourceIn, source_id: str | None = None) -> list[str]:
        """List buckets with these settings; the stored secret is used if none is given."""
        check_allowed(data.endpoint)
        if data.secret_key is not None:
            secret = data.secret_key.get_secret_value()
        elif source_id is not None:
            secret = repo.credentials(source_id).secret_key
        else:
            raise S3Error("validation_error", "secret_key: Field required", 422)
        browser = S3Browser(
            data.endpoint,
            data.access_key,
            secret,
            data.region,
            verify_tls=data.verify_tls,
            ca_cert=data.ca_cert,
        )
        try:
            return browser.list_buckets()
        finally:
            browser.close()

    def client(source_id: SourceId) -> S3Browser:
        return clients.get(source_id)

    ClientDep = Annotated[S3Browser, Depends(client)]

    # ----- routes -----

    api = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @api.get("/health", response_model=Health, tags=["meta"])
    def health() -> Health:
        return Health(status="ok")

    @api.get("/sources", response_model=SourceList, tags=["sources"])
    def list_sources() -> SourceList:
        return SourceList(sources=repo.list())

    @api.post("/sources", response_model=Source, status_code=201, tags=["sources"])
    def create_source(body: SourceIn, test: bool = True) -> Source:
        """Save a new source. By default the connection is tested first."""
        if body.secret_key is None:
            raise S3Error("validation_error", "secret_key: Field required", 422)
        if test:
            probe(body)
        else:
            check_allowed(body.endpoint)
        source = repo.create(body)
        log.info("Added source %s (%s)", source.id, source.endpoint or "AWS S3")
        return source

    @api.post("/sources/test", response_model=ConnectionTest, tags=["sources"])
    def test_source(body: SourceIn, source_id: str | None = None) -> ConnectionTest:
        """Try these settings without saving. With `source_id`, a missing secret is reused."""
        try:
            return ConnectionTest(ok=True, buckets=probe(body, source_id))
        except S3Error as err:
            return ConnectionTest(ok=False, error=ErrorResponse(code=err.code, message=err.message))

    @api.get("/sources/{source_id}", response_model=Source, tags=["sources"])
    def get_source(source_id: SourceId) -> Source:
        return repo.get(source_id)

    @api.put("/sources/{source_id}", response_model=Source, tags=["sources"])
    def update_source(source_id: SourceId, body: SourceIn, test: bool = True) -> Source:
        """Change a source; leave `secret_key` out to keep the stored one."""
        repo.get(source_id)  # 404 before testing anything
        if test:
            probe(body, source_id)
        else:
            check_allowed(body.endpoint)
        source = repo.update(source_id, body)
        clients.invalidate(source_id)
        return source

    @api.delete("/sources/{source_id}", status_code=204, tags=["sources"])
    def delete_source(source_id: SourceId) -> None:
        repo.delete(source_id)
        clients.invalidate(source_id)
        log.info("Deleted source %s", source_id)

    browse = APIRouter(prefix="/sources/{source_id}", tags=["browse"])

    @browse.get("/buckets", response_model=BucketList)
    def list_buckets(s3: ClientDep) -> BucketList:
        return BucketList(buckets=s3.list_buckets())

    @browse.get("/buckets/{bucket}/objects", response_model=ObjectPage)
    def list_objects(
        bucket: str,
        s3: ClientDep,
        prefix: str = "",
        token: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 200,
    ) -> ObjectPage:
        """Direct children (folders and files) of `prefix`, one page at a time."""
        folders, files, next_token = s3.list_page(bucket, prefix, token, limit)
        return ObjectPage(
            bucket=bucket, prefix=prefix, folders=folders, files=files, next_token=next_token
        )

    @browse.get(
        "/buckets/{bucket}/size",
        response_class=StreamingResponse,
        responses={200: {"model": SizeProgress, "content": {"text/event-stream": {}}}},
    )
    def folder_size(bucket: str, s3: ClientDep, prefix: str = "") -> StreamingResponse:
        """Stream the running size of everything under `prefix` as Server-Sent Events."""

        def events() -> Iterator[str]:
            total_bytes = total_objects = 0
            try:
                for total_bytes, total_objects in s3.iter_size(bucket, prefix):
                    yield _sse(SizeProgress(bytes=total_bytes, objects=total_objects, done=False))
                yield _sse(SizeProgress(bytes=total_bytes, objects=total_objects, done=True))
            except Exception as exc:  # noqa: BLE001 - reported to the client as an event
                err = translate(exc, s3.endpoint)
                yield _sse(
                    SizeProgress(
                        bytes=total_bytes,
                        objects=total_objects,
                        done=True,
                        error=ErrorResponse(code=err.code, message=err.message),
                    )
                )

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )

    @browse.get("/buckets/{bucket}/download", status_code=307, response_class=RedirectResponse)
    def download(bucket: str, key: str, s3: ClientDep) -> RedirectResponse:
        """Redirect to a short-lived presigned URL (the browser must reach the S3 endpoint)."""
        return RedirectResponse(s3.download_url(bucket, key), status_code=307)

    api.include_router(browse)

    @api.api_route(
        "/{path:path}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False
    )
    def api_not_found(path: str) -> None:
        raise StarletteHTTPException(404, f"Unknown API route: /api/{path}")

    app.include_router(api)

    if settings.static_dir and settings.static_dir.is_dir():
        _mount_spa(app, settings.static_dir.resolve())

    return app


def _sse(event: SizeProgress) -> str:
    return f"data: {event.model_dump_json()}\n\n"


def _mount_spa(app: FastAPI, root: Path) -> None:
    """Serve the Angular build; unknown paths fall back to index.html for client routing."""
    index = root / "index.html"

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def spa(path: str) -> FileResponse:
        candidate = (root / path).resolve()
        if path and candidate.is_file() and candidate.is_relative_to(root):
            # Hashed bundles (main-AB12CD34.js) never change; everything else is revalidated.
            hashed = _HASHED.search(candidate.name) is not None
            cache = "public, max-age=31536000, immutable" if hashed else "no-cache"
            return FileResponse(candidate, headers={"Cache-Control": cache})
        return FileResponse(index, headers={"Cache-Control": "no-cache"})


_HASHED = re.compile(r"-[A-Za-z0-9]{8}\.(js|css|woff2?|svg|png|jpg|webp)$")


_app: FastAPI | None = None


def __getattr__(name: str) -> FastAPI:
    """`s3_browser.main:app`, created on first use (so importing has no side effects)."""
    global _app
    if name == "app":
        if _app is None:
            _app = create_app()
        return _app
    raise AttributeError(name)
