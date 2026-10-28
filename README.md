# S3 Browser

A small web UI for browsing S3-compatible storage (AWS S3, MinIO, Ceph, Garage, …) and calculating
folder sizes on demand. It ships as one container: a FastAPI backend serving the API and the
Angular app.

- Save several S3 sources (endpoints with their keys) and switch between them from the top bar.
  Sources are stored server side in SQLite, with secret keys encrypted.
- Browse buckets and folders. URLs mirror the S3 path (`/s/<source>/<bucket>/<folder>/…`), so deep
  links and the back button work.
- Folder sizes are calculated on request and streamed live while the objects are counted.
- Sort, filter, copy keys, download files (short-lived presigned URLs). Large folders load page by
  page.
- Custom CA certificates or skipped TLS verification per source, for private S3 endpoints.
- Light / dark / system theme, works on mobile.

## Run it

```bash
docker run -d --name s3-browser -p 8080:8080 -v s3-browser-data:/data magorbalassy/s3-browser:latest
```

Open http://localhost:8080 and add your first source: a name, the endpoint URL (leave it empty for
AWS S3), access key and secret key. **Test connection** checks the settings without saving; saving
tests them too (with an option to save anyway if the endpoint is down right now). Add more sources
any time from **Sources** (the gear icon), and switch between them with the source picker.

The `/data` volume holds the database (`s3-browser.db`) and, unless you set `SECRET_KEY`, the
generated encryption key (`secret.key`). Back them up together: without the key, the stored secret
keys cannot be decrypted (you would have to re-enter them).

There is no login: everyone who can open the UI can use and edit all saved sources. Keep it on a
trusted network or behind an authenticating reverse proxy.

### HTTPS endpoints with private certificates

The source form has a **TLS / certificates** section (used for every endpoint except plain
`http://`; an endpoint without a scheme is treated as `https://`):

- **Custom CA certificate**: paste the PEM or load the file (`.pem` / `.crt`) of the CA that signed
  the endpoint's certificate (self-signed or internal CA). It is trusted in addition to the public
  CAs, for that source only.
- **Skip certificate verification**: still encrypted, but the server's identity is not checked.
  The badge next to the source picker turns red for such sources.

Downloads go from the browser straight to the S3 endpoint, so for downloads the browser itself must
trust that certificate.

### Configuration

| Variable            | Default            | Description                                                                                                         |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `PORT`              | `8080`             | Port to listen on                                                                                                   |
| `DATA_DIR`          | `/data` (`./data`) | Where the SQLite database and the generated key are stored (`./data` when run outside the container)                |
| `SECRET_KEY`        | _(generated)_      | Passphrase that encrypts stored secret keys. If unset, a random key is created in `DATA_DIR`. Don't change it later |
| `ALLOWED_ENDPOINTS` | _(any)_            | Comma-separated list of endpoint URLs sources may use (an empty item allows AWS S3). Recommended when exposed       |
| `LOG_LEVEL`         | `INFO`             | Python log level                                                                                                    |

Notes:

- Without `ALLOWED_ENDPOINTS`, anyone who can open the UI can make the server connect to any URL.
  Set it, or keep the UI on a trusted network.
- Downloads redirect the browser to the S3 endpoint itself, so that endpoint must be reachable from
  the browser, not just from the container.

## Command line

The backend doubles as a CLI (credentials can also come from `ENDPOINT`, `ACCESS_KEY`,
`SECRET_KEY`, `BUCKET_NAME`, `FOLDER_PATH`; TLS options are `--ca-cert FILE` and `--insecure`):

```bash
docker run --rm magorbalassy/s3-browser s3-browser size \
  -e http://minio:9000 -k ACCESS -s SECRET -b photos -p 2024/
docker run --rm magorbalassy/s3-browser s3-browser --help   # buckets, ls, size, serve, openapi
```

## Development

Requirements: [uv](https://docs.astral.sh/uv/) and Node.js 22.

```bash
# backend: API on http://localhost:8000 (docs at /api/docs)
cd backend
uv sync
uv run uvicorn s3_browser.main:app --reload --port 8000
uv run pytest            # tests (against moto, no real S3 needed)
uv run ruff check . && uv run ruff format .

# frontend: http://localhost:4200, proxies /api to :8000
cd frontend
npm install
npm start
npm run test:ci
```

When you change the API (`backend/s3_browser/models.py` or routes), regenerate the typed client
with `npm run gen:api` in `frontend/` and commit the result; CI checks that it is up to date.

Build the image locally:

```bash
docker build -t s3-browser .
```

## Project layout

```
backend/    FastAPI app + CLI (s3_browser/), tests/ (pytest + moto)
frontend/   Angular 22 + Material 3 app, see frontend/README.md
Dockerfile  multi-stage: build Angular, install backend, slim non-root runtime
.github/    CI: lint + test both parts, build and push the image to Docker Hub
```

## CI

On every push and pull request, GitHub Actions lints and tests the backend and frontend, then builds
the image. Pushes to `main` publish `magorbalassy/s3-browser:latest` and `:sha-<commit>`; tags like
`v1.2.3` also publish `:1.2.3` and `:1.2`. Required repository secrets: `DOCKER_USERNAME`,
`DOCKER_PASSWORD` (a Docker Hub access token).
