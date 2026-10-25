# syntax=docker/dockerfile:1

# ---- 1. Build the Angular app ----
FROM node:22-alpine AS frontend
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ---- 2. Install the backend into a virtualenv ----
FROM python:3.13-slim AS backend
COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/s3_browser ./s3_browser
RUN uv sync --frozen --no-dev --no-editable

# ---- 3. Runtime: one uvicorn process serving the API and the app ----
FROM python:3.13-slim
LABEL org.opencontainers.image.title="s3-browser" \
      org.opencontainers.image.description="Browse S3-compatible storage and calculate folder sizes" \
      org.opencontainers.image.source="https://github.com/magorbalassy/s3-browser"

RUN useradd --system --uid 10001 --no-create-home app
WORKDIR /app
COPY --from=backend /app/.venv /app/.venv
COPY --from=frontend /src/dist/s3-browser/browser /app/static

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    STATIC_DIR=/app/static \
    PORT=8080

USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD ["python", "-c", "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health', timeout=3)"]

# Single worker on purpose: sessions are kept in memory.
CMD ["s3-browser", "serve"]
