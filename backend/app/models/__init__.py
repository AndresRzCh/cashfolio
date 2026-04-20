# Import all models here so that SQLModel metadata is fully populated
# when alembic/env.py imports this module for autogenerate.
from app.models.account import Account  # noqa: F401
from app.models.asset import Asset, CustomPrice, PriceCache  # noqa: F401
from app.models.asset_type import AssetType  # noqa: F401
from app.models.fx_rate_cache import FxRateCache  # noqa: F401
from app.models.trade import Trade  # noqa: F401
from app.models.transfer import Transfer  # noqa: F401
from app.models.user import User  # noqa: F401

__all__ = [
    "User",
    "Account",
    "AssetType",
    "Asset",
    "CustomPrice",
    "PriceCache",
    "FxRateCache",
    "Transfer",
    "Trade",
]
