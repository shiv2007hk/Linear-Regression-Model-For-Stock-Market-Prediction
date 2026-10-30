from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Any


class RuntimeState:
    def __init__(self) -> None:
        self._lock = Lock()
        self.last_fetch_error: dict[str, Any] | None = None
        self.last_success: dict[str, Any] | None = None

    def record_error(self, ticker: str, message: str) -> None:
        with self._lock:
            self.last_fetch_error = {
                "ticker": ticker,
                "message": message,
                "ts": datetime.now(timezone.utc).isoformat(),
            }

    def record_success(self, ticker: str, source: str) -> None:
        with self._lock:
            self.last_success = {
                "ticker": ticker,
                "source": source,
                "ts": datetime.now(timezone.utc).isoformat(),
            }


runtime_state = RuntimeState()
