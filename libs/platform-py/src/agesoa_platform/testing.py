"""Test helpers: an isolated Postgres schema per test (TEST_DATABASE_URL) and Pub/Sub push envelopes."""

from __future__ import annotations

import asyncio
import base64
import json
import os
import uuid
from collections.abc import AsyncIterator, Sequence
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from sqlalchemy import MetaData, text
from sqlalchemy.ext.asyncio import create_async_engine

from agesoa_platform.messaging_tables import metadata as messaging_metadata

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")


def _alembic_upgrade(alembic_ini: Path, schema: str) -> None:
    from alembic import command
    from alembic.config import Config

    config = Config(str(alembic_ini))
    config.set_main_option("sqlalchemy.url", TEST_DATABASE_URL.replace("%", "%%"))
    previous = os.environ.get("DB_SEARCH_PATH")
    os.environ["DB_SEARCH_PATH"] = schema
    try:
        command.upgrade(config, "head")
    finally:
        if previous is None:
            os.environ.pop("DB_SEARCH_PATH", None)
        else:
            os.environ["DB_SEARCH_PATH"] = previous


@asynccontextmanager
async def isolated_schema(
    metadatas: Sequence[MetaData] = (), *, alembic_ini: Path | None = None
) -> AsyncIterator[str]:
    """Throwaway schema, yielded by name. With `alembic_ini` the service's real migrations build it; otherwise the
    outbox/inbox tables plus `metadatas` are created directly."""
    assert TEST_DATABASE_URL, "TEST_DATABASE_URL is not set"
    schema = f"pytest_{uuid.uuid4().hex[:10]}"
    engine = create_async_engine(TEST_DATABASE_URL, connect_args={"server_settings": {"search_path": schema}})
    async with engine.begin() as conn:
        await conn.execute(text(f'create schema "{schema}"'))
        if alembic_ini is None:
            for md in (messaging_metadata, *metadatas):
                await conn.run_sync(md.create_all)
    if alembic_ini is not None:
        await asyncio.to_thread(_alembic_upgrade, alembic_ini, schema)
    try:
        yield schema
    finally:
        async with engine.begin() as conn:
            await conn.execute(text(f'drop schema "{schema}" cascade'))
        await engine.dispose()


def push_envelope(
    event: dict[str, Any], subscription: str = "projects/test/subscriptions/test"
) -> dict[str, Any]:
    data = base64.b64encode(json.dumps(event).encode("utf-8")).decode("ascii")
    return {
        "message": {"data": data, "attributes": {"ce-type": event.get("type", "")}, "messageId": "1"},
        "subscription": subscription,
    }


class RecordingPublisher:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def publish(self, event: dict[str, Any]) -> str:
        self.sent.append(event)
        return str(len(self.sent))
