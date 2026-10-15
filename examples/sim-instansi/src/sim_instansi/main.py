"""SIM Badan Gizi Kabupaten Sukamaju (fictional): the institution side of the AGESOA webhook contract.

- ``POST /webhook`` receives signed audit reports (packages/contracts/webhook/README.md).
- The ticket page sends follow-up status and right of reply to the AGESOA institution API.
"""

import json
import time
from collections.abc import Callable
from typing import Annotated, Any
from urllib.parse import quote

import httpx
from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import ValidationError

from sim_instansi import __version__, pages
from sim_instansi.models import FollowUpStatus, SettingsUpdate, WebhookBody
from sim_instansi.signature import parse_timestamp, signature_matches, timestamp_fresh
from sim_instansi.store import Store

API_TIMEOUT_SECONDS = 10.0


def build_app(
    store: Store | None = None,
    *,
    clock: Callable[[], float] = time.time,
    transport: httpx.AsyncBaseTransport | None = None,
) -> FastAPI:
    """``clock`` and ``transport`` are injectable for tests (timestamp window, mocked AGESOA API)."""
    store = store or Store.from_env()
    app = FastAPI(title=pages.TITLE, version=__version__, description=__doc__)
    app.state.store = store

    def reject(status_code: int, reason: str, event_id: str | None, event: str | None) -> JSONResponse:
        store.record(event_id=event_id, event=event, result="rejected", reason=reason)
        return JSONResponse({"detail": reason}, status_code=status_code)

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"service": "sim-instansi", "status": "ok", "version": __version__}

    @app.post("/webhook")
    async def webhook(request: Request) -> JSONResponse:
        raw = await request.body()
        headers = request.headers
        event_id = headers.get("x-agesoa-event-id")
        event = headers.get("x-agesoa-event")
        timestamp = headers.get("x-agesoa-timestamp") or ""
        secret = store.config.webhook_secret

        if not secret:
            return reject(401, "not_configured", event_id, event)
        if not signature_matches(secret, timestamp, raw, headers.get("x-agesoa-signature")):
            return reject(401, "bad_signature", event_id, event)
        parsed_ts = parse_timestamp(timestamp)
        if parsed_ts is None or not timestamp_fresh(parsed_ts, clock()):
            return reject(401, "stale_timestamp", event_id, event)
        if store.take_forced_failure():
            return reject(500, "forced_failure", event_id, event)
        if not event_id or event not in ("audit_report.final", "test_event"):
            return reject(400, "invalid_body", event_id, event)

        # Idempotency first: a retry of an accepted event always gets its original ticket.
        known = store.ticket_for(event_id)
        if known is None:
            try:
                body = WebhookBody.model_validate(json.loads(raw))
            except (ValueError, ValidationError):
                return reject(400, "invalid_body", event_id, event)
            if body.event != event or body.event_id != event_id:
                return reject(400, "invalid_body", event_id, event)
            ticket, duplicate = store.accept(event_id, event, body.case.model_dump())
        else:
            ticket, duplicate = known, True

        store.record(
            event_id=event_id, event=event, result="duplicate" if duplicate else "accepted", ticket=ticket
        )
        return JSONResponse({"internal_ticket": ticket})

    # settings (demo only)

    @app.get("/api/settings")
    def get_settings() -> dict[str, Any]:
        return store.settings_view()

    @app.post("/api/settings")
    def post_settings(update: SettingsUpdate) -> dict[str, Any]:
        store.update_settings(update.model_dump())
        return store.settings_view()

    @app.get("/settings", response_class=HTMLResponse)
    def settings_html(saved: bool = False) -> str:
        return pages.settings_page(store.settings_view(), saved=saved)

    @app.post("/settings")
    def settings_form(
        webhook_secret: Annotated[str, Form()] = "",
        api_key: Annotated[str, Form()] = "",
        agesoa_api_url: Annotated[str, Form()] = "",
        fail_next: Annotated[int, Form(ge=0)] = 0,
    ) -> RedirectResponse:
        # Empty secret fields keep the current value; the URL and the counter are always taken from the form.
        store.update_settings(
            {
                "webhook_secret": webhook_secret or None,
                "api_key": api_key or None,
                "agesoa_api_url": agesoa_api_url,
                "fail_next": fail_next,
            }
        )
        return RedirectResponse("/settings?saved=true", status_code=303)

    # JSON views

    @app.get("/api/inbox")
    def api_inbox() -> dict[str, Any]:
        return {"items": store.list_items()}

    @app.get("/api/webhook-log")
    def api_webhook_log() -> dict[str, Any]:
        return {"entries": store.list_log()}

    # HTML pages (SCR-080 inbox + detail, SCR-081 status and right of reply)

    def item_or_404(ticket: str) -> dict[str, Any]:
        item = store.get_item(ticket)
        if item is None:
            raise HTTPException(status_code=404, detail="ticket not found")
        return item

    @app.get("/", response_class=HTMLResponse)
    def inbox_html() -> str:
        return pages.inbox_page(store.list_items())

    @app.get("/webhook-log", response_class=HTMLResponse)
    def webhook_log_html() -> str:
        return pages.log_page(store.list_log())

    @app.get("/tickets/{ticket}", response_class=HTMLResponse)
    def ticket_html(ticket: str) -> str:
        return pages.ticket_page(item_or_404(ticket))

    async def call_agesoa(action: str, case_id: str, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        base = store.config.agesoa_api_url
        key = store.config.api_key
        if not base or not key:
            return {
                "action": action,
                "ok": False,
                "status_code": None,
                "message": "AGESOA API URL or API key not configured (see Settings).",
            }
        url = f"{base}/api/v1/cases/{quote(case_id, safe='')}/{path}"
        try:
            async with httpx.AsyncClient(transport=transport, timeout=API_TIMEOUT_SECONDS) as client:
                response = await client.post(url, json=payload, headers={"Authorization": f"Bearer {key}"})
        except httpx.HTTPError as exc:
            return {
                "action": action,
                "ok": False,
                "status_code": None,
                "message": f"Request failed: {type(exc).__name__}",
            }
        ok = response.is_success
        message = f"HTTP {response.status_code} {response.reason_phrase}".strip()
        if not ok:
            message += f" – {response.text[:300]}"
        return {"action": action, "ok": ok, "status_code": response.status_code, "message": message}

    @app.post("/tickets/{ticket}/status", response_class=HTMLResponse)
    async def send_status(
        ticket: str, status: Annotated[FollowUpStatus, Form()], note: Annotated[str, Form()] = ""
    ) -> HTMLResponse:
        item = item_or_404(ticket)
        payload = {"status": status, "note": note, "internal_ticket": ticket}
        result = await call_agesoa("Follow-up status", item["case"]["id"], "status", payload)
        if result["ok"]:
            store.set_status(ticket, status, note or None)
            item = item_or_404(ticket)
        return HTMLResponse(pages.ticket_page(item, result))

    @app.post("/tickets/{ticket}/reply", response_class=HTMLResponse)
    async def send_reply(ticket: str, body: Annotated[str, Form(min_length=1)]) -> HTMLResponse:
        item = item_or_404(ticket)
        result = await call_agesoa(
            "Right of reply", item["case"]["id"], "reply", {"body": body, "attachments": []}
        )
        return HTMLResponse(pages.ticket_page(item, result))

    return app


def __getattr__(name: str) -> FastAPI:
    # `uvicorn sim_instansi.main:app` builds the app lazily from the environment.
    if name == "app":
        globals()["app"] = application = build_app()
        return application
    raise AttributeError(name)
