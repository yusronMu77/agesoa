"""Public read model in Firestore, projected from the events transparency consumes.

Postgres is the source: every consumed public event is stored in `read_model_events` inside the inbox
transaction. A projector then rebuilds each affected Firestore document from *all* stored events of that
document, so a projection is idempotent, independent of delivery order and can be rebuilt at any time.

Only allow-listed fields reach Firestore (the public side): no reporter reference, report contents,
validator or organization references, notes or attachments. Clients only read these collections (see
infra/firestore/firestore.rules); only this service writes them.

Collections: public_cases/{case_id}, public_findings/{finding_id}, public_signals/{signal_id},
public_regions/{district_code}, public_log/{seq}, public_stats/summary.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol

from agesoa_platform.db import Database
from agesoa_platform.events import isoformat, utc_now
from sqlalchemy import event as sa_event
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import distinct_on, insert
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_transparency.tables import chain_head, decision_log, read_model_events, read_model_state

log = logging.getLogger(__name__)

COLLECTIONS = {
    "case": "public_cases",
    "finding": "public_findings",
    "signal": "public_signals",
    "region": "public_regions",
    "log": "public_log",
    "stats": "public_stats",
}


@dataclass(frozen=True)
class Source:
    doc_kind: str  # case | finding | signal | report (reports are only counted)
    id_field: str
    time_field: str | None  # None: the CloudEvent `time`


SOURCES: dict[str, Source] = {
    "kasus.diperbarui": Source("case", "case_id", "updated_at"),
    "laporan_audit.dibuat": Source("case", "case_id", "created_at"),
    "tindak_lanjut.diperbarui": Source("case", "case_id", "updated_at"),
    "hak_jawab.diterima": Source("case", "case_id", "received_at"),
    "temuan.siap_validasi": Source("finding", "finding_id", None),
    "validasi.selesai": Source("finding", "finding_id", "completed_at"),
    "sinyal.diterima": Source("signal", "signal_id", None),
    "laporan.diterima": Source("report", "report_id", "received_at"),
    "wilayah.diperbarui": Source("region", "district_code", "updated_at"),
}


def catalog_name(ce_type: str) -> str:
    return ce_type.removeprefix("agesoa.")


# --- Pure projections: stored rows -> public documents ------------------------------------------------


@dataclass(frozen=True)
class Row:
    id: int
    event_type: str
    data: dict[str, Any]
    occurred_at: datetime


def public_region(region: dict[str, Any] | None) -> dict[str, Any] | None:
    if region is None:
        return None
    keys = ("regency_code", "regency_name", "district_code", "district_name")
    return {k: region.get(k) for k in keys}


def _latest(rows: Iterable[Row], event_type: str) -> Row | None:
    matching = [r for r in rows if r.event_type == event_type]
    return max(matching, key=lambda r: (r.occurred_at, r.id), default=None)


def build_case(case_id: str, rows: list[Row]) -> dict[str, Any]:
    update_row = _latest(rows, "kasus.diperbarui")
    report_row = _latest(rows, "laporan_audit.dibuat")
    doc: dict[str, Any] = {
        "case_id": case_id,
        "synthetic": any(r.data.get("synthetic") for r in rows),
        "domain": None,
        "category": None,
        "status": None,
        "evidence_status": None,
        "max_finding_status": None,
        "region": None,
        "report_count": 0,
        "signal_count": 0,
        "updated_at": None,
    }
    if update_row:
        d = update_row.data
        doc |= {
            "domain": d["domain"],
            "category": d["category"],
            "status": d["status"],
            "evidence_status": d["evidence_status"],
            "max_finding_status": d["max_finding_status"],
            "region": public_region(d["region"]),
            "report_count": len(d["report_ids"]),
            "signal_count": len(d["signal_ids"]),
            "updated_at": d["updated_at"],
        }
    doc["audit_report"] = (
        {
            "audit_report_id": report_row.data["audit_report_id"],
            "summary": report_row.data["summary"],
            "root_causes": [
                {
                    "statement": c["statement"],
                    "status": c["status"],
                    "evidence_count": len(c["evidence_refs"]),
                }
                for c in report_row.data["root_causes"]
            ],
            "recommendations": list(report_row.data["recommendations"]),
            "created_at": report_row.data["created_at"],
        }
        if report_row
        else None
    )
    latest_follow_up: dict[str, Row] = {}
    for r in rows:
        if r.event_type == "tindak_lanjut.diperbarui":
            org = r.data["organization_id"]
            if org not in latest_follow_up or (r.occurred_at, r.id) > (
                latest_follow_up[org].occurred_at,
                latest_follow_up[org].id,
            ):
                latest_follow_up[org] = r
    doc["follow_ups"] = [
        {
            "organization_id": org,
            "status": r.data["status"],
            "note": r.data["note"],
            "updated_at": r.data["updated_at"],
        }
        for org, r in sorted(latest_follow_up.items())
    ]
    doc["replies"] = [
        {
            "reply_id": r.data["reply_id"],
            "organization_id": r.data["organization_id"],
            "body": r.data["body"],
            "received_at": r.data["received_at"],
        }
        for r in sorted(
            (r for r in rows if r.event_type == "hak_jawab.diterima"), key=lambda r: (r.occurred_at, r.id)
        )
    ]
    return doc


def build_finding(finding_id: str, rows: list[Row]) -> dict[str, Any]:
    ready = _latest(rows, "temuan.siap_validasi")
    done = _latest(rows, "validasi.selesai")
    doc: dict[str, Any] = {
        "finding_id": finding_id,
        "synthetic": any(r.data.get("synthetic") for r in rows),
        "case_id": (ready or done).data["case_id"] if (ready or done) else None,
        "domain": None,
        "statement": None,
        "status": None,
        "evidence_count": 0,
        "region": None,
    }
    if ready:
        d = ready.data
        doc |= {
            "domain": d["domain"],
            "statement": d["statement"],
            "status": d["status"],
            "evidence_count": len(d["evidence_refs"]),
            "region": public_region(d["region"]),
        }
    # Validators appear only as role label, regency, tier + decision: no validator or organization reference,
    # no name, no notes.
    doc["validation"] = (
        {
            "outcome": done.data["outcome"],
            "completed_at": done.data["completed_at"],
            "decisions": [
                {
                    "tier": x["tier"],
                    "decision": x["decision"],
                    "role_label": x.get("role_label"),
                    "regency_name": x.get("regency_name"),
                }
                for x in done.data["decisions"]
            ],
        }
        if done
        else None
    )
    return doc


def build_signal(signal_id: str, rows: list[Row]) -> dict[str, Any]:
    d = max(rows, key=lambda r: (r.occurred_at, r.id)).data
    return {
        "signal_id": signal_id,
        "synthetic": bool(d["synthetic"]),
        "domain": d["domain"],
        "category": d["category"],
        "occurred_on": d["occurred_on"],
        "region": public_region(d["region"]),
        "summary": d["summary"],
        "sources": [
            {
                "url": s["url"],
                "publisher": s["publisher"],
                "kind": s["kind"],
                "published_at": s["published_at"],
            }
            for s in d["sources"]
        ],
    }


def build_region(district_code: str, rows: list[Row]) -> dict[str, Any]:
    """District boundary for the public map. Firestore has no nested arrays, so the GeoJSON geometry is a string."""
    d = max(rows, key=lambda r: (r.occurred_at, r.id)).data
    return {
        "district_code": district_code,
        "district_name": d["district_name"],
        "regency_code": d["regency_code"],
        "regency_name": d["regency_name"],
        "geometry": json.dumps(d["geometry"], separators=(",", ":")),
        "synthetic": bool(d["synthetic"]),
        "updated_at": d["updated_at"],
    }


def build_log_entry(row: Any) -> dict[str, Any]:
    decision = row.entry["decision"]
    actor = decision["actor"]
    return {
        "seq": row.seq,
        "event_id": row.event_id,
        "decision_id": row.decision_id,
        "action": decision["action"],
        "actor": {"kind": actor["kind"], "name": actor["name"], "service": actor["service"]},
        "subject": {"kind": decision["subject"]["kind"], "id": decision["subject"]["id"]},
        "reason": decision["reason"],
        "status_label": decision.get("status_label"),
        "evidence_refs": list(decision["evidence_refs"]),
        "synthetic": bool(decision["synthetic"]),
        "prev_hash": row.prev_hash,
        "hash": row.hash,
        "recorded_at": isoformat(row.recorded_at),
    }


BUILDERS = {"case": build_case, "finding": build_finding, "signal": build_signal, "region": build_region}


# --- Storage -------------------------------------------------------------------------------------------


class DocumentStore(Protocol):
    async def set(self, collection: str, doc_id: str, data: dict[str, Any]) -> None: ...
    async def clear(self, collection: str) -> int: ...


class FirestoreStore:
    def __init__(self, project: str):
        self.project = project
        self._client: Any = None

    @property
    def client(self) -> Any:
        # Created on first write, so starting the service never needs Google credentials.
        if self._client is None:
            from google.cloud import firestore

            self._client = firestore.AsyncClient(project=self.project)
        return self._client

    async def set(self, collection: str, doc_id: str, data: dict[str, Any]) -> None:
        await self.client.collection(collection).document(doc_id).set(data)

    async def clear(self, collection: str) -> int:
        deleted = 0
        async for ref in self.client.collection(collection).list_documents():
            await ref.delete()
            deleted += 1
        return deleted


class MemoryStore:
    """In-process store for tests."""

    def __init__(self) -> None:
        self.docs: dict[str, dict[str, dict[str, Any]]] = {}

    async def set(self, collection: str, doc_id: str, data: dict[str, Any]) -> None:
        self.docs.setdefault(collection, {})[doc_id] = data

    async def clear(self, collection: str) -> int:
        return len(self.docs.pop(collection, {}))


# --- Ingest (inside the inbox transaction) -------------------------------------------------------------

_active: Projector | None = None


async def store_event(session: AsyncSession, event: dict[str, Any]) -> None:
    """Keep a consumed public event as projection source; the projector runs after the commit."""
    name = catalog_name(event["type"])
    source = SOURCES[name]
    data = event["data"]
    occurred = data[source.time_field] if source.time_field else event["time"]
    await session.execute(
        insert(read_model_events)
        .values(
            event_id=event["id"],
            event_type=name,
            doc_kind=source.doc_kind,
            doc_id=data[source.id_field],
            data=data,
            occurred_at=datetime.fromisoformat(occurred.replace("Z", "+00:00")),
        )
        .on_conflict_do_nothing(index_elements=[read_model_events.c.event_id])
    )
    project_after_commit(session)


def project_after_commit(session: AsyncSession) -> None:
    """Best effort: start a projection once this transaction commits. Missed runs are caught up by the
    /internal/read-model/sync endpoint (Cloud Scheduler) because rows stay pending until projected."""
    projector = _active
    if projector is None:
        return
    loop = asyncio.get_running_loop()

    def kick(_session: Any) -> None:
        loop.call_soon_threadsafe(projector.schedule)

    sa_event.listen(session.sync_session, "after_commit", kick, once=True)


# --- Projector -----------------------------------------------------------------------------------------


class Projector:
    def __init__(self, db: Database, store: DocumentStore, batch: int = 200):
        self.db = db
        self.store = store
        self.batch = batch
        self._lock = asyncio.Lock()
        self._tasks: set[asyncio.Task[Any]] = set()

    def activate(self) -> None:
        global _active
        _active = self

    def schedule(self) -> None:
        task = asyncio.get_running_loop().create_task(self._sync_quietly())
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _sync_quietly(self) -> None:
        try:
            await self.sync()
        except Exception:  # left pending; the next sync (scheduler or event) retries
            log.exception("read model projection failed")

    async def wait_idle(self) -> None:
        while self._tasks:
            await asyncio.gather(*list(self._tasks), return_exceptions=True)

    async def sync(self) -> dict[str, int]:
        """Project everything still pending. Firestore is written before the Postgres commit: a failed write
        rolls back and the rows stay pending."""
        documents = log_entries = 0
        async with self._lock:
            while True:
                docs, entries = await self._sync_batch()
                documents, log_entries = documents + docs, log_entries + entries
                if docs == 0 and entries == 0:
                    break
            if documents or log_entries:
                await self._write_stats()
        if documents or log_entries:
            log.info(
                "read model projected", extra={"detail": {"documents": documents, "log_entries": log_entries}}
            )
        return {"documents": documents, "log_entries": log_entries}

    async def rebuild(self) -> dict[str, int]:
        """Drop every public document and project again from Postgres."""
        async with self._lock:
            cleared = 0
            for collection in COLLECTIONS.values():
                cleared += await self.store.clear(collection)
            async with self.db.transaction() as session:
                await session.execute(update(read_model_events).values(projected_at=None))
                await self._set_log_seq(session, 0)
        result = await self.sync()
        await self._write_stats()
        return {"cleared": cleared, **result}

    async def _sync_batch(self) -> tuple[int, int]:
        async with self.db.transaction() as session:
            pending = (
                await session.execute(
                    select(read_model_events.c.id, read_model_events.c.doc_kind, read_model_events.c.doc_id)
                    .where(read_model_events.c.projected_at.is_(None))
                    .order_by(read_model_events.c.id)
                    .limit(self.batch)
                    .with_for_update(skip_locked=True)
                )
            ).all()
            targets = sorted({(p.doc_kind, p.doc_id) for p in pending if p.doc_kind in BUILDERS})
            for kind, doc_id in targets:
                rows = await self._rows(session, kind, doc_id)
                await self.store.set(COLLECTIONS[kind], doc_id, BUILDERS[kind](doc_id, rows))
            if pending:
                await session.execute(
                    update(read_model_events)
                    .where(read_model_events.c.id.in_([p.id for p in pending]))
                    .values(projected_at=func.now())
                )

            last = await self._log_seq(session)
            entries = (
                await session.execute(
                    select(decision_log)
                    .where(decision_log.c.seq > last)
                    .order_by(decision_log.c.seq)
                    .limit(self.batch)
                )
            ).all()
            for row in entries:
                await self.store.set(COLLECTIONS["log"], str(row.seq), build_log_entry(row))
            if entries:
                await self._set_log_seq(session, entries[-1].seq)
        return len(pending), len(entries)

    async def _rows(self, session: AsyncSession, kind: str, doc_id: str) -> list[Row]:
        result = await session.execute(
            select(
                read_model_events.c.id,
                read_model_events.c.event_type,
                read_model_events.c.data,
                read_model_events.c.occurred_at,
            ).where(read_model_events.c.doc_kind == kind, read_model_events.c.doc_id == doc_id)
        )
        return [Row(r.id, r.event_type, r.data, r.occurred_at) for r in result]

    async def _log_seq(self, session: AsyncSession) -> int:
        value = await session.scalar(
            select(read_model_state.c.value).where(read_model_state.c.key == "log_seq").with_for_update()
        )
        return int(value or 0)

    async def _set_log_seq(self, session: AsyncSession, seq: int) -> None:
        await session.execute(
            insert(read_model_state)
            .values(key="log_seq", value=seq)
            .on_conflict_do_update(index_elements=[read_model_state.c.key], set_={"value": seq})
        )

    async def _write_stats(self) -> None:
        async with self.db.sessions() as session:
            stats = await compute_stats(session)
        await self.store.set(COLLECTIONS["stats"], "summary", stats)


async def compute_stats(session: AsyncSession) -> dict[str, Any]:
    def latest_status(event_type: str, field: str) -> Any:
        latest = (
            select(read_model_events.c.data[field].astext.label("value"))
            .where(read_model_events.c.event_type == event_type)
            .ext(distinct_on(read_model_events.c.doc_id))
            .order_by(
                read_model_events.c.doc_id,
                read_model_events.c.occurred_at.desc(),
                read_model_events.c.id.desc(),
            )
            .subquery()
        )
        return select(latest.c.value, func.count()).group_by(latest.c.value)

    cases = dict((await session.execute(latest_status("kasus.diperbarui", "status"))).all())
    findings = dict((await session.execute(latest_status("temuan.siap_validasi", "status"))).all())
    outcomes = dict((await session.execute(latest_status("validasi.selesai", "outcome"))).all())

    def distinct_docs(kind: str) -> Any:
        return select(func.count(read_model_events.c.doc_id.distinct())).where(
            read_model_events.c.doc_kind == kind
        )

    head = (await session.execute(select(chain_head.c.seq, chain_head.c.hash))).one()
    return {
        "cases_by_status": cases,
        "findings_by_status": findings,
        "validations_by_outcome": outcomes,
        "reports_received": int(await session.scalar(distinct_docs("report")) or 0),
        "signals_received": int(await session.scalar(distinct_docs("signal")) or 0),
        "log_length": head.seq,
        "log_head_hash": head.hash,
        "updated_at": isoformat(utc_now()),
    }
