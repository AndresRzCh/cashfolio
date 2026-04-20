import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import (  # noqa: E501
    accounts,
    asset_types,
    assets,
    auth,
    firefly,
    fx_rates,
    health,
    holdings,
    trades,
    transfers,
    users,
)
from app.core.config import settings
from app.core.db import create_db_and_tables
from app.models.fx_rate_cache import FxRateCache as _FxRateCache  # noqa: F401
from app.services.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    create_db_and_tables()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(
    title="CashFolio API",
    version="0.1.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

app.include_router(health.router, prefix="/api/v1")
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["accounts"])
app.include_router(asset_types.router, prefix="/api/v1/asset-types", tags=["asset-types"])
app.include_router(assets.router, prefix="/api/v1/assets", tags=["assets"])
app.include_router(transfers.router, prefix="/api/v1/transfers", tags=["transfers"])
app.include_router(trades.router, prefix="/api/v1/trades", tags=["trades"])
app.include_router(holdings.router, prefix="/api/v1/holdings", tags=["holdings"])
app.include_router(firefly.router, prefix="/api/v1/firefly", tags=["firefly"])
app.include_router(fx_rates.router, prefix="/api/v1/fx-rates", tags=["fx-rates"])
