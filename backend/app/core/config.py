from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    APP_ENV: str = "development"
    DEBUG: bool = True
    ALLOWED_ORIGINS: str = "http://localhost:1510"

    DATABASE_URL: str = "postgresql+asyncpg://finanzas:finanzas@postgres:5432/finanzas"
    UPLOAD_DIR: str = "/app/uploads"

    SECRET_KEY: str = "cambiar-en-produccion-secret-key-min-32-chars"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_EXPIRE_DAYS: int = 7
    COOKIE_SECURE: bool = False

    ADMIN_EMAIL: str = "admin@finanzas.local"
    ADMIN_FULL_NAME: str = "Admin"
    ADMIN_PASSWORD: str = "admin123"

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


settings = Settings()
