import asyncio
from typing import Any

import pytest
from agesoa_ingestion.intake import IntakeAgent, RulesModel
from pydantic import Field


class FlakyModel(RulesModel):
    """Rule-based answer after the listed steps: an exception is raised, "hang" never answers."""

    steps: list[Any] = Field(default_factory=list)
    calls: int = 0

    async def generate_content_async(self, llm_request, stream=False):
        self.calls += 1
        step = self.steps.pop(0) if self.steps else None
        if step == "hang":
            await asyncio.sleep(60)
        if isinstance(step, Exception):
            raise step
        async for response in super().generate_content_async(llm_request, stream):
            yield response


@pytest.fixture
def flaky_intake():
    """`make(pack, *steps, timeout=0.3, attempts=2)` -> (agent, model): an Intake whose model misbehaves as listed."""

    def make(pack, *steps, timeout=0.3, attempts=2) -> tuple[IntakeAgent, FlakyModel]:
        model = FlakyModel(pack=pack, steps=list(steps))
        return IntakeAgent(pack, model, timeout=timeout, attempts=attempts), model

    return make
