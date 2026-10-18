"""Webhook signature check with the standard library only (an institution has no AGESOA packages).

Signature header: ``v1=`` + lowercase hex HMAC-SHA256(secret, ``<timestamp>.<raw body>``).
"""

import hashlib
import hmac

PREFIX = "v1="
TOLERANCE_SECONDS = 300


def sign(secret: str, timestamp: str, body: bytes) -> str:
    mac = hmac.new(secret.encode("utf-8"), timestamp.encode("ascii") + b"." + body, hashlib.sha256)
    return PREFIX + mac.hexdigest()


def signature_matches(secret: str, timestamp: str, body: bytes, header: str | None) -> bool:
    """Constant-time comparison of the received header with the expected signature."""
    if not header or not timestamp.isascii():
        return False
    expected = sign(secret, timestamp, body)
    return hmac.compare_digest(expected.encode("ascii"), header.strip().encode("utf-8"))


def parse_timestamp(value: str | None) -> int | None:
    if value is None or not value.isascii() or not value.strip().isdigit():
        return None
    return int(value.strip())


def timestamp_fresh(timestamp: int, now: float, tolerance: int = TOLERANCE_SECONDS) -> bool:
    """Accept clock skew up to ``tolerance`` seconds in either direction (inclusive)."""
    return abs(now - timestamp) <= tolerance
