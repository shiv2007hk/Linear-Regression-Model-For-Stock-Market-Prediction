from functools import lru_cache
import os
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

    # AI Copilot. The feature is disabled until a DeepSeek key is supplied —
    # nothing here carries a default credential and the app runs fine without one.
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"
    deepseek_timeout_seconds: int = 45
    deepseek_max_output_tokens: int = 1500
    deepseek_temperature: float = 0.2
    chat_rate_limit_requests: int = 30
    chat_rate_limit_window_seconds: int = 60
    chat_max_history_messages: int = 20
    chat_max_message_chars: int = 6000
    chat_max_tool_rounds: int = 4

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def effective_deepseek_api_key(self) -> str:
        """Read the Copilot key from STOCKSENSE_DEEPSEEK_API_KEY or plain DEEPSEEK_API_KEY.

        Empty is a normal, supported state: it means the Copilot is switched off.
        Evaluated on every access (never cached) so a process can pick up the plain
        DEEPSEEK_API_KEY without a restart.
        """
        return (self.deepseek_api_key or os.environ.get("DEEPSEEK_API_KEY") or "").strip()


@lru_cache
def get_settings() -> Settings:
    return Settings()
