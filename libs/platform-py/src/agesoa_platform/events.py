"""Build CloudEvents that match packages/contracts. Invalid events are rejected before they reach the outbox."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from agesoa_contracts import event_spec, validate_event
from opentelemetry import trace


def utc_now() -> datetime:
    return datetime.now(UTC)


def isoformat(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")


def new_event(event_type: str, *, source: str, subject: str, data: dict[str, Any]) -> dict[str, Any]:
    """Return a validated structured CloudEvent. `event_type` is the catalog name, e.g. "keputusan.dicatat"."""
    spec = event_spec(event_type)
    if spec.producer not in ("*", source):
        raise ValueError(
            f"service {source!r} is not the producer of {spec.type!r} (producer: {spec.producer})"
        )
    event: dict[str, Any] = {
        "specversion": "1.0",
        "id": str(uuid.uuid4()),
        "source": f"//agesoa/{source}",
        "type": spec.ce_type,
        "subject": subject,
        "time": isoformat(utc_now()),
        "datacontenttype": "application/json",
        "dataschema": spec.dataschema,
        "data": data,
    }
    traceparent = current_traceparent()
    if traceparent:
        event["traceparent"] = traceparent
    validate_event(event)
    return event


def current_traceparent() -> str | None:
    ctx = trace.get_current_span().get_span_context()
    if not ctx.is_valid:
        return None
    return f"00-{ctx.trace_id:032x}-{ctx.span_id:016x}-{int(ctx.trace_flags):02x}"
