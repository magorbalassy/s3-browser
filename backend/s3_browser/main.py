"""FastAPI application: the JSON API under /api plus the built Angular app."""

import logging
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, FastAPI, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings
from .models import (
    BucketList,
    ConnectRequest,
    ErrorResponse,
    Health,
    ObjectPage,
    SessionInfo,
    SizeProgress,
)
from .s3 import MAX_PAGE_SIZE, S3Browser, S3Error, translate
from .sessions import COOKIE_NAME, Session, SessionStore

log = logging.getLogger("s3_browser")

ERROR_RESPONSES: dict[int | str, dict] = {
    status: {"model": ErrorResponse} for status in (400, 401, 403, 404, 422, 502, 504)
}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    store = SessionStore(settings.session_ttl)

    app = FastAPI(
        title="S3 Browser",
        version="0.2.0",
        docs_url="/api/docs",
        redoc_url=None,
        openapi_url="/api/openapi.json",
        # operationId = function name, so generated clients get readable method names.
        generate_unique_id_function=lambda route: route.name,
    )
    app.state.settings = settings
    app.state.sessions = store

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
        code = {401: "not_connected", 404: "not_found"}.get(exc.status_code, "http_error")
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

    # ----- dependencies -----

    def current_session(
        session_id: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
    ) -> Session:
        session = store.get(session_id)
        if session is None:
            raise StarletteHTTPException(401, "Not connected to an S3 endpoint.")
        return session

    SessionDep = Annotated[Session, Depends(current_session)]

    # ----- routes -----

    api = APIRouter(prefix="/api", responses=ERROR_RESPONSES)

    @api.get("/health", response_model=Health, tags=["meta"])
    def health() -> Health:
        return Health(status="ok")

    @api.post("/session", response_model=SessionInfo, tags=["session"])
    def connect(
        body: ConnectRequest,
        response: Response,
        session_id: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
    ) -> SessionInfo:
        """Connect to an S3 endpoint. On success the credentials are kept server side."""
        if settings.allowed_endpoints and body.endpoint not in settings.allowed_endpoints:
            raise S3Error("endpoint_not_allowed", "This endpoint is not allowed.", 403)
        browser = S3Browser(
            body.endpoint,
            body.access_key,
            body.secret_key.get_secret_value(),
            body.region,
            verify_tls=body.verify_tls,
            ca_cert=body.ca_cert,
        )
        try:
            buckets = browser.list_buckets()  # also verifies the credentials
        except Exception:
            browser.close()
            raise
        store.remove(session_id)
        session = store.create(browser)
        response.set_cookie(
            COOKIE_NAME,
            session.id,
            max_age=settings.session_ttl,
            httponly=True,
            samesite="strict",
            secure=settings.cookie_secure,
            path="/api",
        )
        log.info(
            "Connected to %s (%d buckets%s)",
            body.endpoint or "AWS S3",
            len(buckets),
            "" if body.verify_tls else ", TLS verification off",
        )
        return _session_info(browser, buckets)

    @api.get("/session", response_model=SessionInfo, tags=["session"])
    def get_session(session: SessionDep) -> SessionInfo:
        return _session_info(session.browser, session.browser.list_buckets())

    @api.delete("/session", status_code=204, tags=["session"])
    def disconnect(
        response: Response,
        session_id: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
    ) -> None:
        store.remove(session_id)
        response.delete_cookie(COOKIE_NAME, path="/api")

    @api.get("/buckets", response_model=BucketList, tags=["browse"])
    def list_buckets(session: SessionDep) -> BucketList:
        return BucketList(buckets=session.browser.list_buckets())

    @api.get("/buckets/{bucket}/objects", response_model=ObjectPage, tags=["browse"])
    def list_objects(
        bucket: str,
        session: SessionDep,
        prefix: str = "",
        token: str | None = None,
        limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 200,
    ) -> ObjectPage:
        """Direct children (folders and files) of `prefix`, one page at a time."""
        folders, files, next_token = session.browser.list_page(bucket, prefix, token, limit)
        return ObjectPage(
            bucket=bucket, prefix=prefix, folders=folders, files=files, next_token=next_token
        )

    @api.get(
        "/buckets/{bucket}/size",
        tags=["browse"],
        response_class=StreamingResponse,
        responses={200: {"model": SizeProgress, "content": {"text/event-stream": {}}}},
    )
    def folder_size(bucket: str, session: SessionDep, prefix: str = "") -> StreamingResponse:
        """Stream the running size of everything under `prefix` as Server-Sent Events."""
        browser = session.browser

        def events() -> Iterator[str]:
            total_bytes = total_objects = 0
            try:
                for total_bytes, total_objects in browser.iter_size(bucket, prefix):
                    yield _sse(SizeProgress(bytes=total_bytes, objects=total_objects, done=False))
                yield _sse(SizeProgress(bytes=total_bytes, objects=total_objects, done=True))
            except Exception as exc:  # noqa: BLE001 - reported to the client as an event
                err = translate(exc, browser.endpoint)
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

    @api.get(
        "/buckets/{bucket}/download",
        tags=["browse"],
        status_code=307,
        response_class=RedirectResponse,
    )
    def download(bucket: str, key: str, session: SessionDep) -> RedirectResponse:
        """Redirect to a short-lived presigned URL (the browser must reach the S3 endpoint)."""
        return RedirectResponse(session.browser.download_url(bucket, key), status_code=307)

    @api.api_route(
        "/{path:path}", methods=["GET", "POST", "PUT", "DELETE"], include_in_schema=False
    )
    def api_not_found(path: str) -> None:
        raise StarletteHTTPException(404, f"Unknown API route: /api/{path}")

    app.include_router(api)

    if settings.static_dir and settings.static_dir.is_dir():
        _mount_spa(app, settings.static_dir.resolve())

    return app


def _session_info(browser: S3Browser, buckets: list[str]) -> SessionInfo:
    return SessionInfo(
        endpoint=browser.endpoint,
        region=browser.region,
        verify_tls=browser.verify_tls,
        custom_ca=bool(browser.ca_cert),
        buckets=buckets,
    )


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


app = create_app()
