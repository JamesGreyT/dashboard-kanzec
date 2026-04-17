"""Environment-backed settings for the Kanzec Operations Dashboard API."""
from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="",
        extra="ignore",
    )

    database_url: str = Field(alias="DATABASE_URL")
    jwt_secret: str = Field(alias="KANZEC_JWT_SECRET")

    # Bootstrap admin (read on first deploy; removed from .env after)
    admin_username: str | None = Field(default=None, alias="KANZEC_ADMIN_USERNAME")
    admin_password: str | None = Field(default=None, alias="KANZEC_ADMIN_PASSWORD")

    # Token lifetimes
    access_ttl_seconds: int = Field(default=900, alias="KANZEC_ACCESS_TOKEN_TTL_SECONDS")
    refresh_ttl_seconds: int = Field(default=604800, alias="KANZEC_REFRESH_TOKEN_TTL_SECONDS")

    # CORS + cookie domain
    cookie_domain: str = Field(default="kanzec.ilhom.work", alias="KANZEC_COOKIE_DOMAIN")
    allowed_origins: str = Field(default="https://kanzec.ilhom.work", alias="KANZEC_ALLOWED_ORIGINS")

    tz: str = Field(default="Asia/Tashkent", alias="TZ")

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
