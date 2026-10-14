"""Approximate location -> district (kecamatan) with PostGIS. Coordinates are used for the lookup only and are
never stored or logged; reports keep the district code + name.

Boundaries come from a GeoJSON FeatureCollection whose features carry `district_code`, `district_name`,
`regency_code`, `regency_name`. The fictional Kabupaten Sukamaju of the demo scenarios ships in `regions/` and is
loaded at startup only when demo_mode is on; real boundaries are loaded with the CLI. Every district that is new or
changed is published as `wilayah.diperbarui` (through the outbox, same transaction) so public read models can draw
the map without reading this database:

    uv run python -m agesoa_ingestion.regions path/to/districts.geojson
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from agesoa_platform.app import flush_outbox
from agesoa_platform.events import isoformat, new_event, utc_now
from agesoa_platform.oidc import require_internal_caller
from agesoa_platform.outbox import add_event
from fastapi import APIRouter, BackgroundTasks, Depends, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from agesoa_ingestion import SERVICE

REGIONS_DIR = Path(__file__).resolve().parents[2] / "regions"
DEMO_REGIONS = REGIONS_DIR / "sukamaju-fictional.geojson"
_PROPS = ("district_code", "district_name", "regency_code", "regency_name")


class District(BaseModel):
    regency_code: str
    regency_name: str
    district_code: str
    district_name: str
    synthetic: bool

    def region(self) -> dict[str, str]:
        """The `region` object of events and reports (codes + names only)."""
        return self.model_dump(exclude={"synthetic"})


_SELECT = "select regency_code, regency_name, code as district_code, name as district_name, synthetic from districts"


async def resolve(session: AsyncSession, lat: float, lon: float) -> District | None:
    row = (
        await session.execute(
            text(
                f"{_SELECT} where public.ST_Covers(geom, public.ST_SetSRID(public.ST_MakePoint(:lon, :lat), 4326))"
                " order by code limit 1"
            ),
            {"lat": lat, "lon": lon},
        )
    ).one_or_none()
    return District(**row._mapping) if row else None


async def get(session: AsyncSession, code: str) -> District | None:
    row = (await session.execute(text(f"{_SELECT} where code = :code"), {"code": code})).one_or_none()
    return District(**row._mapping) if row else None


async def list_all(session: AsyncSession) -> list[District]:
    rows = await session.execute(text(f"{_SELECT} order by regency_name, name"))
    return [District(**r._mapping) for r in rows]


def read_features(document: dict[str, Any]) -> list[dict[str, Any]]:
    if document.get("type") != "FeatureCollection":
        raise ValueError("expected a GeoJSON FeatureCollection")
    features = document["features"]
    for i, feature in enumerate(features):
        missing = [p for p in _PROPS if not feature.get("properties", {}).get(p)]
        if missing:
            raise ValueError(f"feature {i}: missing properties {', '.join(missing)}")
        if feature.get("geometry", {}).get("type") not in ("Polygon", "MultiPolygon"):
            raise ValueError(f"feature {i}: geometry must be a Polygon or MultiPolygon")
    return features


async def load(session: AsyncSession, document: dict[str, Any], *, synthetic: bool) -> int:
    """Insert or replace districts by code; publish the ones that are new or changed. Returns that count."""
    features = read_features(document)
    changed = 0
    for feature in features:
        p = feature["properties"]
        row = (
            await session.execute(
                text(
                    "insert into districts (code, name, regency_code, regency_name, synthetic, geom) values"
                    " (:code, :name, :regency_code, :regency_name, :synthetic,"
                    "  public.ST_Multi(public.ST_SetSRID(public.ST_GeomFromGeoJSON(:geom), 4326)))"
                    " on conflict (code) do update set name = excluded.name, regency_code = excluded.regency_code,"
                    " regency_name = excluded.regency_name, synthetic = excluded.synthetic, geom = excluded.geom,"
                    " loaded_at = now()"
                    " where (districts.name, districts.regency_code, districts.regency_name, districts.synthetic)"
                    "   is distinct from (excluded.name, excluded.regency_code, excluded.regency_name, excluded.synthetic)"
                    "   or not public.ST_Equals(districts.geom, excluded.geom)"
                    " returning code"
                ),
                {
                    "code": p["district_code"],
                    "name": p["district_name"],
                    "regency_code": p["regency_code"],
                    "regency_name": p["regency_name"],
                    "synthetic": synthetic,
                    "geom": json.dumps(feature["geometry"]),
                },
            )
        ).one_or_none()
        if row is not None:  # new or changed: unchanged districts are not written again
            await add_event(session, boundary_event(p, feature["geometry"], synthetic))
            changed += 1
    return changed


def boundary_event(props: dict[str, Any], geometry: dict[str, Any], synthetic: bool) -> dict[str, Any]:
    """`wilayah.diperbarui`: public reference data (codes, names, boundary), never a reporter's position."""
    return new_event(
        "wilayah.diperbarui",
        source=SERVICE,
        subject=props["district_code"],
        data={
            "district_code": props["district_code"],
            "district_name": props["district_name"],
            "regency_code": props["regency_code"],
            "regency_name": props["regency_name"],
            "geometry": geometry,
            "updated_at": isoformat(utc_now()),
            "synthetic": synthetic,
        },
    )


async def publish_all(session: AsyncSession) -> int:
    """Publish every stored district again (e.g. for a read model created after the districts were loaded)."""
    rows = await session.execute(
        text(
            "select regency_code, regency_name, code as district_code, name as district_name, synthetic,"
            " public.ST_AsGeoJSON(geom)::json as geometry from districts order by code"
        )
    )
    count = 0
    for r in rows.mappings():
        await add_event(session, boundary_event(dict(r), r["geometry"], r["synthetic"]))
        count += 1
    return count


# Operator / scheduler only (same OIDC allow-list as /internal/outbox/sweep).
internal_router = APIRouter(
    prefix="/internal/regions", tags=["internal"], dependencies=[Depends(require_internal_caller)]
)


class Published(BaseModel):
    published: int


@internal_router.post("/publish", summary="Publish every district boundary again (wilayah.diperbarui)")
async def publish_districts(request: Request, background: BackgroundTasks) -> Published:
    async with request.app.state.db.transaction() as session:
        count = await publish_all(session)
    background.add_task(flush_outbox, request)
    return Published(published=count)


def load_file(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


async def _cli(path: Path, synthetic: bool) -> int:
    from agesoa_platform.db import Database

    from agesoa_ingestion.settings import get_settings

    db = Database(get_settings())
    try:
        async with db.transaction() as session:
            changed = await load(session, load_file(path), synthetic=synthetic)
        # Publish now (the service's outbox sweep would otherwise pick the events up later).
        from agesoa_platform.outbox import OutboxDispatcher
        from agesoa_platform.pubsub import PubSubPublisher

        settings = get_settings()
        await OutboxDispatcher(
            db, PubSubPublisher(settings.google_cloud_project, settings.pubsub_emulator_host)
        ).dispatch()
        return changed
    finally:
        await db.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load district boundaries (GeoJSON) into the ingestion database"
    )
    parser.add_argument("geojson", type=Path)
    parser.add_argument("--synthetic", action="store_true", help="fictional boundaries (demo data)")
    args = parser.parse_args()
    print(
        f"published {asyncio.run(_cli(args.geojson, args.synthetic))} new or changed districts from {args.geojson}"
    )


if __name__ == "__main__":
    main()
