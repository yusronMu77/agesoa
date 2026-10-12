"""POST /events/{type}: Pub/Sub push endpoint. Verifies the caller (OIDC), the envelope and the contract, then runs
the service's handler exactly once per event id (inbox)."""

from __future__ import annotations

import base64
import binascii
import json
import logging
from typing import Any

from agesoa_contracts import ContractError, catalog, validate_event
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from opentelemetry import context, trace
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

from agesoa_platform.inbox import EventHandler, process_once
from agesoa_platform.oidc import require_push_caller

log = logging.getLogger(__name__)
tracer = trace.get_tracer(__name__)


def consumed_events(service: str) -> list[str]:
    return sorted(t for t, spec in catalog().items() if service in spec.consumers)


def check_handlers(service: str, handlers: dict[str, EventHandler]) -> None:
    """Every event the catalog routes to this service needs a handler, and nothing else may have one."""
    expected = set(consumed_events(service))
    missing, extra = expected - set(handlers), set(handlers) - expected
    if missing or extra:
        raise RuntimeError(
            f"{service}: event handlers do not match events/catalog.json "
            f"(missing: {sorted(missing) or '-'}, not routed here: {sorted(extra) or '-'})"
        )


def decode_push(body: Any) -> dict[str, Any]:
    try:
        message = body["message"]
        return json.loads(base64.b64decode(message["data"], validate=True))
    except (KeyError, TypeError, ValueError, binascii.Error) as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "not a Pub/Sub push envelope with a JSON CloudEvent"
        ) from exc


def event_router(service: str, handlers: dict[str, EventHandler]) -> APIRouter:
    check_handlers(service, handlers)
    router = APIRouter()

    @router.post(
        "/events/{event_type}",
        status_code=status.HTTP_204_NO_CONTENT,
        include_in_schema=False,
        dependencies=[Depends(require_push_caller)],
    )
    async def receive(event_type: str, request: Request) -> Response:
        handler = handlers.get(event_type)
        if handler is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"{service} does not consume {event_type}")
        event = decode_push(await request.json())
        try:
            spec = validate_event(event)
        except ContractError as exc:
            log.error(
                "event rejected by contract", extra={"event_type": event_type, "detail": exc.errors[:5]}
            )
            raise HTTPException(status.HTTP_400_BAD_REQUEST, exc.errors[:5]) from exc
        if spec.type != event_type:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, f"event type {spec.type} delivered to /events/{event_type}"
            )

        parent = TraceContextTextMapPropagator().extract({"traceparent": event.get("traceparent", "")})
        token = context.attach(parent)
        try:
            with tracer.start_as_current_span(
                f"event {spec.type}", attributes={"cloudevents.event_id": event["id"]}
            ):
                first = await process_once(request.app.state.db, event, handler)
        finally:
            context.detach(token)
        log.info(
            "event processed" if first else "duplicate event ignored",
            extra={"event_id": event["id"], "event_type": spec.type},
        )
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router


async def not_handled_yet(session, event: dict[str, Any]) -> None:
    """Placeholder handler: the event is acknowledged and recorded in the inbox, with no effect yet."""
    log.info(
        "event acknowledged without handler", extra={"event_id": event["id"], "event_type": event["type"]}
    )
