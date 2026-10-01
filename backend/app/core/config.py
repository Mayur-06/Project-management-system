from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    API_V1_PREFIX: str = "/api/v1"
    PROJECT_NAME: str = "Linear Management API"
    ENVIRONMENT: str = "development"

    # Supabase credentials
    SUPABASE_URL: str = "http://localhost:54321"
    SUPABASE_SERVICE_ROLE_KEY: str = "placeholder-service-role-key"
    SUPABASE_ANON_KEY: str = "placeholder-anon-key"
    SUPABASE_JWT_SECRET: str = "placeholder-jwt-secret-at-least-32-chars-long"

    # CORS origins
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        elif isinstance(v, list):
            return v
        return ["http://localhost:3000"]


settings = Settings()
