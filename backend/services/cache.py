from __future__ import annotations

import threading
import time
from typing import Any


class TTLCache:
    """Small thread-safe TTL cache used for market data and quote metadata."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str, ttl: float | None = None) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            stored_at, value = entry
            if ttl is not None and time.time() - stored_at > ttl:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self._store[key] = (time.time(), value)

    def invalidate(self, prefix: str | None = None) -> None:
        with self._lock:
            if prefix is None:
                self._store.clear()
                return
            for key in [k for k in self._store if k.startswith(prefix)]:
                self._store.pop(key, None)

    def age(self, key: str) -> float | None:
        with self._lock:
            entry = self._store.get(key)
            return None if not entry else time.time() - entry[0]


cache = TTLCache()
