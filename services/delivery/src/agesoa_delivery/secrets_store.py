"""Webhook secrets: Secret Manager outside local (one secret per subscription, `agesoa-webhook-<id>`), a table in
the devenv and tests. The secret is shown once to the institution and never returned by the API again."""

from __future__ import annotations

import base64
from typing import Protocol

import httpx
from agesoa_platform.db import Database
from fastapi import FastAPI
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert

from agesoa_delivery.gcp import auth_headers
from agesoa_delivery.tables import local_secrets

PREFIX = "agesoa-webhook-"


class SecretStore(Protocol):
    async def put(self, name: str, value: str) -> str:
        """Store `value` under `name` (a new version if it exists); returns the reference to keep."""
        ...

    async def get(self, ref: str) -> str: ...


class LocalSecretStore:
    def __init__(self, app: FastAPI):
        self.app = app

    @property
    def db(self) -> Database:
        return self.app.state.db

    async def put(self, name: str, value: str) -> str:
        ref = PREFIX + name
        async with self.db.transaction() as session:
            stmt = insert(local_secrets).values(ref=ref, value=value)
            await session.execute(stmt.on_conflict_do_update(index_elements=["ref"], set_={"value": value}))
        return ref

    async def get(self, ref: str) -> str:
        async with self.db.sessions() as session:
            value = (
                await session.execute(select(local_secrets.c.value).where(local_secrets.c.ref == ref))
            ).scalar()
        if value is None:
            raise KeyError(ref)
        return value


class SecretManagerStore:
    BASE = "https://secretmanager.googleapis.com/v1"

    def __init__(self, project: str, region: str, client: httpx.AsyncClient | None = None):
        self.project = project
        self.region = region
        self.client = client or httpx.AsyncClient(timeout=10)

    async def put(self, name: str, value: str) -> str:
        ref = PREFIX + name
        headers = await auth_headers()
        created = await self.client.post(
            f"{self.BASE}/projects/{self.project}/secrets",
            params={"secretId": ref},
            json={
                "replication": {"userManaged": {"replicas": [{"location": self.region}]}},
                "labels": {"app": "agesoa", "kind": "webhook"},
            },
            headers=headers,
        )
        if created.status_code not in (200, 409):  # 409: exists, add a version
            created.raise_for_status()
        added = await self.client.post(
            f"{self.BASE}/projects/{self.project}/secrets/{ref}:addVersion",
            json={"payload": {"data": base64.b64encode(value.encode()).decode()}},
            headers=headers,
        )
        added.raise_for_status()
        return ref

    async def get(self, ref: str) -> str:
        response = await self.client.get(
            f"{self.BASE}/projects/{self.project}/secrets/{ref}/versions/latest:access",
            headers=await auth_headers(),
        )
        response.raise_for_status()
        return base64.b64decode(response.json()["payload"]["data"]).decode()
