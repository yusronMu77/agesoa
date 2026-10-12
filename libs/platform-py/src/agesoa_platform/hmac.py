"""Webhook signatures (packages/contracts/webhook/README.md): v1 = HMAC-SHA256(secret, f"{timestamp}.{raw_body}")."""

from __future__ import annotations

import hashlib
import hmac as _hmac
import time

TOLERANCE_SECONDS = 300
SCHEME = "v1="


def sign_webhook(secret: str | bytes, timestamp: int, body: bytes) -> str:
    key = secret.encode("utf-8") if isinstance(secret, str) else secret
    digest = _hmac.new(key, str(timestamp).encode("ascii") + b"." + body, hashlib.sha256).hexdigest()
    return SCHEME + digest


def verify_webhook(
    secret: str | bytes,
    timestamp_header: str,
    signature_header: str,
    body: bytes,
    *,
    now: float | None = None,
    tolerance: int = TOLERANCE_SECONDS,
) -> bool:
    """True only for a matching signature whose timestamp is within `tolerance` seconds of `now`."""
    try:
        timestamp = int(timestamp_header)
    except (TypeError, ValueError):
        return False
    current = time.time() if now is None else now
    if abs(current - timestamp) > tolerance:
        return False
    expected = sign_webhook(secret, timestamp, body)
    return _hmac.compare_digest(expected, signature_header or "")
