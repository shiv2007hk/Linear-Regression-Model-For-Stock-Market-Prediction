from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="STOCKSENSE_", extra="ignore")

    app_name: str = "StockSense AI"
    default_ticker: str = "RELIANCE.NS"
    default_period: str = "2y"
    database_url: str = f"sqlite:///{(DATA_DIR / 'stocksense.db').as_posix()}"
    cache_ttl_seconds: int = 600
    info_cache_ttl_seconds: int = 86400
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    request_timeout_seconds: int = 25
    # Optional free API keys. Every feature works without them.
    alpha_vantage_api_key: str = ""
    finnhub_api_key: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
