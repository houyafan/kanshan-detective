# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS web-builder

WORKDIR /app

RUN npm install --global pnpm@10.15.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN pnpm build


FROM python:3.11-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates sqlite3 tini \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    KANSHAN_DATA_DIR=/app/runtime-data \
    PORT=8000

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY server ./server
COPY data ./data
COPY --from=web-builder /app/dist ./dist

RUN mkdir -p /app/runtime-data
VOLUME ["/app/runtime-data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "uvicorn server.app:app --host 0.0.0.0 --port ${PORT}"]
