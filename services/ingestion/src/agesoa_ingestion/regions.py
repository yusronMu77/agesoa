"""Approximate location -> district (kecamatan) with PostGIS. Coordinates are used for the lookup only and are
never stored or logged; reports keep the district code + name.

Boundaries come from a GeoJSON FeatureCollection whose features carry `district_code`, `district_name`,
`regency_code`, `regency_name`. The fictional Kabupaten Sukamaju of the demo scenarios ships in `regions/` and is
loaded at startup only when demo_mode is on; real boundaries are loaded with the CLI:

    uv run python -m agesoa_ingestion.regions path/to/districts.geojson
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

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
    """Insert or replace districts by code. Returns the number of districts written."""
    features = read_features(document)
    for feature in features:
        p = feature["properties"]
        await session.execute(
            text(
                "insert into districts (code, name, regency_code, regency_name, synthetic, geom) values"
                " (:code, :name, :regency_code, :regency_name, :synthetic,"
                "  public.ST_Multi(public.ST_SetSRID(public.ST_GeomFromGeoJSON(:geom), 4326)))"
                " on conflict (code) do update set name = excluded.name, regency_code = excluded.regency_code,"
                " regency_name = excluded.regency_name, synthetic = excluded.synthetic, geom = excluded.geom,"
                " loaded_at = now()"
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
    return len(features)


def load_file(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


async def _cli(path: Path, synthetic: bool) -> int:
    from agesoa_platform.db import Database

    from agesoa_ingestion.settings import get_settings

    db = Database(get_settings())
    try:
        async with db.transaction() as session:
            return await load(session, load_file(path), synthetic=synthetic)
    finally:
        await db.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Load district boundaries (GeoJSON) into the ingestion database"
    )
    parser.add_argument("geojson", type=Path)
    parser.add_argument("--synthetic", action="store_true", help="fictional boundaries (demo data)")
    args = parser.parse_args()
    print(f"loaded {asyncio.run(_cli(args.geojson, args.synthetic))} districts from {args.geojson}")


if __name__ == "__main__":
    main()
