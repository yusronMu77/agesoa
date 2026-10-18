"""In-memory state of the fictional agency's system, optionally persisted to one JSON file.

One process only: a lock guards every mutation, so check-and-insert of event ids is atomic.
"""

import json
import os
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

LOG_LIMIT = 500
SETTING_FIELDS = ("webhook_secret", "api_key", "agesoa_api_url", "fail_next")


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


@dataclass
class Config:
    webhook_secret: str | None = None
    api_key: str | None = None
    agesoa_api_url: str | None = None
    fail_next: int = 0

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            webhook_secret=os.environ.get("SIM_WEBHOOK_SECRET") or None,
            api_key=os.environ.get("SIM_API_KEY") or None,
            agesoa_api_url=os.environ.get("SIM_AGESOA_API_URL") or None,
        )


@dataclass
class Store:
    """Env values are the initial config; values changed through the settings are persisted and win."""

    config: Config = field(default_factory=Config)
    path: Path | None = None
    items: list[dict[str, Any]] = field(default_factory=list)
    log: list[dict[str, Any]] = field(default_factory=list)
    _overrides: dict[str, Any] = field(default_factory=dict)
    _processed: dict[str, str] = field(default_factory=dict)
    _next_ticket: int = 1
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def __post_init__(self) -> None:
        if self.path is not None and self.path.exists():
            self._load()

    @classmethod
    def from_env(cls) -> "Store":
        data_file = os.environ.get("SIM_DATA_FILE")
        return cls(config=Config.from_env(), path=Path(data_file) if data_file else None)

    # settings

    def settings_view(self) -> dict[str, Any]:
        """Never exposes the secret or the API key, only whether they are set."""
        with self._lock:
            return {
                "webhook_secret_set": bool(self.config.webhook_secret),
                "api_key_set": bool(self.config.api_key),
                "agesoa_api_url": self.config.agesoa_api_url,
                "fail_next": self.config.fail_next,
            }

    def update_settings(self, changes: dict[str, Any]) -> None:
        """``None`` leaves a field unchanged; an empty string clears it."""
        with self._lock:
            for name in SETTING_FIELDS:
                value = changes.get(name)
                if value is None:
                    continue
                if isinstance(value, str):
                    value = value.strip() or None
                    if name == "agesoa_api_url" and value:
                        value = value.rstrip("/")
                self._overrides[name] = value
                setattr(self.config, name, value)
            self._save()

    def take_forced_failure(self) -> bool:
        with self._lock:
            if self.config.fail_next <= 0:
                return False
            self.config.fail_next -= 1
            self._overrides["fail_next"] = self.config.fail_next
            self._save()
            return True

    # webhook

    def ticket_for(self, event_id: str) -> str | None:
        with self._lock:
            return self._processed.get(event_id)

    def accept(self, event_id: str, event: str, case: dict[str, Any]) -> tuple[str, bool]:
        """Store a report once per event id; returns ``(ticket, duplicate)``."""
        with self._lock:
            if event_id in self._processed:
                return self._processed[event_id], True
            ticket = f"SIM-{self._next_ticket}"
            self._next_ticket += 1
            self._processed[event_id] = ticket
            self.items.append(
                {
                    "ticket": ticket,
                    "event_id": event_id,
                    "event": event,
                    "case": case,
                    "received_at": utc_now_iso(),
                    "status": "new",
                    "note": None,
                }
            )
            self._save()
            return ticket, False

    def record(
        self,
        *,
        event_id: str | None,
        event: str | None,
        result: str,
        reason: str | None = None,
        ticket: str | None = None,
    ) -> None:
        with self._lock:
            self.log.append(
                {
                    "received_at": utc_now_iso(),
                    "event_id": event_id,
                    "event": event,
                    "result": result,
                    "reason": reason,
                    "ticket": ticket,
                }
            )
            del self.log[:-LOG_LIMIT]
            self._save()

    # inbox

    def list_items(self) -> list[dict[str, Any]]:
        """Newest first."""
        with self._lock:
            return [dict(item) for item in reversed(self.items)]

    def list_log(self) -> list[dict[str, Any]]:
        """Newest first."""
        with self._lock:
            return [dict(entry) for entry in reversed(self.log)]

    def get_item(self, ticket: str) -> dict[str, Any] | None:
        with self._lock:
            return next((dict(item) for item in self.items if item["ticket"] == ticket), None)

    def set_status(self, ticket: str, status: str, note: str | None) -> None:
        with self._lock:
            for item in self.items:
                if item["ticket"] == ticket:
                    item["status"] = status
                    item["note"] = note
            self._save()

    # persistence

    def _load(self) -> None:
        assert self.path is not None
        data = json.loads(self.path.read_text(encoding="utf-8"))
        self.items = data.get("items", [])
        self.log = data.get("log", [])
        self._processed = data.get("processed", {})
        self._next_ticket = data.get("next_ticket", len(self.items) + 1)
        self._overrides = {k: v for k, v in data.get("settings", {}).items() if k in SETTING_FIELDS}
        for name, value in self._overrides.items():
            setattr(self.config, name, value)

    def _save(self) -> None:
        if self.path is None:
            return
        data = {
            "items": self.items,
            "log": self.log,
            "processed": self._processed,
            "next_ticket": self._next_ticket,
            "settings": self._overrides,  # demo only: may hold the secret and key, written with mode 0600
        }
        tmp = self.path.with_name(self.path.name + ".tmp")
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, self.path)
