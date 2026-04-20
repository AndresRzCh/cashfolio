FROM python:3.12-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1000 cashfolio \
    && useradd --uid 1000 --gid cashfolio --shell /bin/bash --create-home cashfolio

FROM base AS production

WORKDIR /app

COPY pyproject.toml ./
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./

RUN pip install --no-cache-dir . \
    && mkdir -p /data && chown cashfolio:cashfolio /data

USER cashfolio

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
