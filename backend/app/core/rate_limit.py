from __future__ import annotations

import time
from collections import defaultdict
from functools import wraps
from typing import Callable

from fastapi import HTTPException, Request, status

from app.core.config import settings

_buckets: dict[str, list[float]] = defaultdict(list)


def rate_limit(max_requests: int, window_seconds: int) -> Callable:
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            if settings.APP_ENV == "test":
                return await func(*args, **kwargs)

            request: Request | None = None
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break
            if request is None:
                for v in kwargs.values():
                    if isinstance(v, Request):
                        request = v
                        break
            if request is None:
                return await func(*args, **kwargs)

            client_ip = request.client.host if request.client else "unknown"
            key = f"{func.__module__}.{func.__qualname__}:{client_ip}"
            now = time.monotonic()
            cutoff = now - window_seconds

            timestamps = _buckets[key]
            _buckets[key] = [t for t in timestamps if t > cutoff]

            if len(_buckets[key]) >= max_requests:
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Demasiadas solicitudes. Intenta de nuevo más tarde.",
                )

            _buckets[key].append(now)
            return await func(*args, **kwargs)
        return wrapper
    return decorator
