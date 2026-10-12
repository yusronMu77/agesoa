"""Demo-only API: synthetic scenarios from the domain packs. Every route is 404 unless demo_mode is on.

The answer key of a scenario is never served (it is the eval ground truth). Seeding a scenario as reports
arrives with the report pipeline (CP1).
"""

from typing import Any

from agesoa_platform.demo import require_demo_mode
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from agesoa_ingestion.api import Label

router = APIRouter(prefix="/v1/demo", tags=["demo"], dependencies=[Depends(require_demo_mode)])
NOT_IN_DEMO_MODE = {404: {"description": "Not found (also returned for every route when demo_mode is off)"}}


class Region(BaseModel):
    regency_code: None
    regency_name: str
    district_code: None
    district_name: str


class ScenarioSummary(BaseModel):
    id: str
    pack: str
    title: Label
    region: Region
    reports: int
    signals: int
    synthetic: bool


@router.get("/scenarios", summary="Synthetic scenarios (demo_mode only)", responses=NOT_IN_DEMO_MODE)
async def list_scenarios(request: Request) -> list[ScenarioSummary]:
    return [ScenarioSummary(**s.summary()) for s in request.app.state.scenarios.values()]


@router.get(
    "/scenarios/{scenario_id}",
    summary="One synthetic scenario without its answer key (demo_mode only)",
    responses=NOT_IN_DEMO_MODE,
)
async def get_scenario(scenario_id: str, request: Request) -> dict[str, Any]:
    scenario = request.app.state.scenarios.get(scenario_id)
    if scenario is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"unknown scenario {scenario_id!r}")
    return scenario.public_view()
