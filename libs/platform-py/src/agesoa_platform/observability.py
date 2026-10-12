"""Structured JSON logs (Cloud Logging fields, trace correlation) and OpenTelemetry tracing (Cloud Trace)."""

from __future__ import annotations

import json
import logging
import sys
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from opentelemetry import trace
from opentelemetry.instrumentation.asgi import OpenTelemetryMiddleware
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.sdk.trace.sampling import ParentBasedTraceIdRatio
from opentelemetry.util.http import parse_excluded_urls

from agesoa_platform.settings import ServiceSettings

_EXTRA_KEYS = ("event_id", "event_type", "message_id", "error", "path", "status", "service_name", "detail")


class CloudLoggingFormatter(logging.Formatter):
    def __init__(self, service: str, project: str):
        super().__init__()
        self.service = service
        self.project = project

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "logger": record.name,
            "service": self.service,
        }
        for key in _EXTRA_KEYS:
            if hasattr(record, key):
                entry[key] = getattr(record, key)
        ctx = trace.get_current_span().get_span_context()
        if ctx.is_valid:
            entry["logging.googleapis.com/trace"] = f"projects/{self.project}/traces/{ctx.trace_id:032x}"
            entry["logging.googleapis.com/spanId"] = f"{ctx.span_id:016x}"
            entry["logging.googleapis.com/trace_sampled"] = bool(ctx.trace_flags.sampled)
        if record.exc_info:
            entry["stack_trace"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


def setup_logging(settings: ServiceSettings) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(CloudLoggingFormatter(settings.service_name, settings.google_cloud_project))
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(settings.log_level.upper())
    for noisy in ("uvicorn.access",):
        logging.getLogger(noisy).setLevel(logging.WARNING)


_provider: TracerProvider | None = None


def setup_tracing(settings: ServiceSettings) -> None:
    """Export spans to Cloud Trace outside local/test. ADK also emits OpenTelemetry spans into this provider."""
    global _provider
    if _provider is not None:
        return
    _provider = TracerProvider(
        resource=Resource.create(
            {"service.name": settings.service_name, "service.version": settings.release}
        ),
        sampler=ParentBasedTraceIdRatio(settings.trace_sample_ratio),
    )
    if not settings.is_local:
        from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter

        _provider.add_span_processor(
            BatchSpanProcessor(CloudTraceSpanExporter(project_id=settings.google_cloud_project))
        )
    trace.set_tracer_provider(_provider)


def shutdown_tracing() -> None:
    if _provider is not None:
        _provider.force_flush()


def instrument_app(app: FastAPI, excluded_urls: str = "healthz,readyz") -> None:
    """Server span per request (OpenTelemetry ASGI middleware), renamed by `name_server_span`.

    Used instead of FastAPIInstrumentor, whose route lookup crashes (500) on routers included with
    `include_router` when the method does not match (405 expected).
    """
    app.add_middleware(
        OpenTelemetryMiddleware,
        excluded_urls=parse_excluded_urls(excluded_urls),
        default_span_details=_initial_span_details,
    )


def _initial_span_details(scope: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    # The route template is not known before routing; name_server_span renames the span afterwards.
    return str(scope.get("method", "HTTP")), {}


def name_server_span(request: Request) -> None:
    """App-level dependency: names the server span `METHOD /route/{template}` (low cardinality)."""
    template = getattr(request.scope.get("route"), "path_format", None)
    span = trace.get_current_span()
    if template and span.is_recording():
        span.update_name(f"{request.method} {template}")
        span.set_attribute("http.route", template)
