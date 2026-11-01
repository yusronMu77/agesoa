import asyncio
from typing import Any

import pytest
from agesoa_ingestion.intake import IntakeAgent, RulesModel
from pydantic import Field


class FlakyModel(RulesModel):
    """Rule-based answer after the listed steps: an exception is raised, "hang" never answers, a number of seconds
    answers that late (slow but healthy). `calls` counts the calls started, `answered` those that were not cancelled."""

    steps: list[Any] = Field(default_factory=list)
    calls: int = 0
    answered: list[int] = Field(default_factory=list)

    async def generate_content_async(self, llm_request, stream=False):
        self.calls += 1
        number = self.calls
        step = self.steps.pop(0) if self.steps else None
        if step == "hang":
            await asyncio.sleep(60)
        if isinstance(step, int | float):
            await asyncio.sleep(step)
        if isinstance(step, Exception):
            raise step
        self.answered.append(number)
        async for response in super().generate_content_async(llm_request, stream):
            yield response


@pytest.fixture
def flaky_intake():
    """`make(pack, *steps, deadline=1, hedge_after=0.2, max_calls=3)` -> (agent, model): an Intake whose model
    misbehaves as listed, one step per call."""

    def make(pack, *steps, deadline=1.0, hedge_after=0.2, max_calls=3) -> tuple[IntakeAgent, FlakyModel]:
        model = FlakyModel(pack=pack, steps=list(steps))
        agent = IntakeAgent(pack, model, deadline=deadline, hedge_after=hedge_after, max_calls=max_calls)
        return agent, model

    return make
