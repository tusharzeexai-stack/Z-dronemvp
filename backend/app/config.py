from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List


class Settings(BaseSettings):
    # Database
    database_url: str

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # AWS
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str = "us-east-1"

    # Kinesis Video Streams
    kvs_stream_name_prefix: str = "zdrone"

    # App
    cors_origins: str = "http://localhost:5173"
    debug: bool = True
    port: int = 8000

    # Admin seed user
    admin_username: str = "admin"
    admin_password: str = "Zeex@admin"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"  # Silently ignore unknown .env fields


@lru_cache()
def get_settings() -> Settings:
    return Settings()
