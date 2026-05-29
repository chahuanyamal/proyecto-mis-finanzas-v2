from __future__ import annotations

import hashlib
import json
import time
from functools import wraps
from typing import Any, Callable

_store: dict[str, tuple[float, Any]] = {}


def _make_key(func_name: str, args: tuple, kwargs: dict) -> str:
    serializable = []
    for a in args:
        if hasattr(a, "id") and hasattr(a, "email"):
            serializable.append(str(a.id))
        elif hasattr(a, "query"):
            continue
        else:
            try:
                json.dumps(a)
                serializable.append(a)
            except (TypeError, ValueError):
                serializable.append(str(a))
    for k, v in sorted(kwargs.items()):
        try:
            json.dumps(v)
            serializable.append(f"{k}={v}")
        except (TypeError, ValueError):
            serializable.append(f"{k}={v!s}")
    raw = f"{func_name}:{json.dumps(serializable, sort_keys=True)}"
    return hashlib.sha256(raw.encode()).hexdigest()


def cached(ttl_seconds: int) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = _make_key(func.__qualname__, args, kwargs)
            now = time.monotonic()
            if key in _store:
                expires_at, value = _store[key]
                if now < expires_at:
                    return value
            result = await func(*args, **kwargs)
            _store[key] = (now + ttl_seconds, result)
            return result
        return wrapper
    return decorator


def invalidate_cache() -> None:
    _store.clear()
