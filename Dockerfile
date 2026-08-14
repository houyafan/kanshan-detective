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


FROM debian:bookworm-slim AS zhihu-cli-installer

ARG TARGETARCH
ARG ZHIHU_CLI_VERSION=0.3.0

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    case "${TARGETARCH}" in \
        amd64) cli_sha256="d7e89a2d5df20ab367d944c2a1f7694b6272705c18ebc8d7388129a7933e0e80" ;; \
        arm64) cli_sha256="42296df3bc7f4678e050c6fb6e627f4ad87c6f3755e9f6b248a0813bea3dd2c7" ;; \
        *) echo "Unsupported architecture: ${TARGETARCH}" >&2; exit 1 ;; \
    esac; \
    archive="/tmp/zhihu-cli.tar.gz"; \
    curl --fail --silent --show-error --location \
        "https://developer-cdn.zhihu.com/zhihu-cli/releases/stable/cli/${ZHIHU_CLI_VERSION}/zhihu-cli-${ZHIHU_CLI_VERSION}-linux-${TARGETARCH}.tar.gz" \
        --output "${archive}"; \
    echo "${cli_sha256}  ${archive}" | sha256sum --check --strict; \
    tar --extract --gzip --file "${archive}" --directory /tmp; \
    install -m 0755 /tmp/zhihu-cli /usr/local/bin/zhihu-cli


FROM python:3.11-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates sqlite3 tini \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    KANSHAN_DATA_DIR=/app/runtime-data \
    ZHIHU_CLI_PATH=/usr/local/bin/zhihu-cli \
    PORT=8000

WORKDIR /app

COPY requirements.txt ./requirements.txt
RUN pip install -r requirements.txt

COPY server ./server
COPY data ./data
COPY --from=web-builder /app/dist ./dist
COPY --from=zhihu-cli-installer /usr/local/bin/zhihu-cli /usr/local/bin/zhihu-cli

RUN mkdir -p /app/runtime-data
VOLUME ["/app/runtime-data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "uvicorn server.app:app --host 0.0.0.0 --port ${PORT}"]
