from __future__ import annotations

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_SECRET_KEYS = {
    "cambiar-en-produccion-secret-key-min-32-chars",
    "reemplazar-con-openssl-rand-hex-32",
}


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

    @model_validator(mode="after")
    def _validate_production_secrets(self) -> "Settings":
        """En producción no se permite arrancar con un SECRET_KEY por defecto
        o demasiado corto."""
        if self.APP_ENV == "production":
            if self.SECRET_KEY in _INSECURE_SECRET_KEYS or len(self.SECRET_KEY) < 32:
                raise ValueError(
                    "SECRET_KEY inseguro en producción: genera uno con "
                    "`openssl rand -hex 32` y configúralo en el entorno."
                )
        return self


settings = Settings()
