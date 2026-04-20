from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    secret_key: str = "dev-secret-change-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 30
    database_url: str = "sqlite:////data/cashfolio.db"
    # Stored as a comma-separated string so pydantic-settings does not
    # attempt JSON-decode; parsed into a list via the property below.
    cors_origins: str = "http://localhost:5173,http://localhost:80"

    @model_validator(mode="after")
    def _require_secret_key(self) -> "Settings":
        if self.secret_key == "dev-secret-change-in-production":
            raise ValueError(
                "SECRET_KEY must be set via environment variable. "
                "Generate one with: openssl rand -hex 32"
            )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]


settings = Settings()
