"""Canonical JSON and SHA-256 helpers (evidence hashes, hash-chained log). Technical only: what goes into a chain
entry is decided by the owning service."""

from __future__ import annotations

import hashlib
import json
from typing import Any

GENESIS_HASH = "0" * 64


def canonical_json(value: Any) -> bytes:
    """Deterministic JSON: sorted keys, no insignificant whitespace, UTF-8, no NaN/Infinity."""
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def chain_hash(prev_hash: str, entry: Any) -> str:
    """hash_n = SHA-256(prev_hash_hex + "." + canonical_json(entry_n))."""
    if len(prev_hash) != 64:
        raise ValueError("prev_hash must be a 64-character hex SHA-256")
    return sha256_hex(prev_hash.encode("ascii") + b"." + canonical_json(entry))
