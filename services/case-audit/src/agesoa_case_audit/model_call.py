"""Bounded model calls: each attempt gets a time limit, and a timeout or a quota/server error is tried once more.

Vertex AI under load answers 429 or holds a request for minutes, and the genai client neither times out nor retries on
its own. About a quarter of the calls hang for more than 20 s while the next one answers in a few seconds, so a short
limit with a second attempt beats one long wait. Anything else (bad output, a bug) is not repeated.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from google.genai import errors

log = logging.getLogger(__name__)
TRANSIENT_CODES = frozenset({429, 500, 502, 503, 504})
RETRY_DELAY_SECONDS = 1.0


def transient(exc: BaseException) -> bool:
    return isinstance(exc, TimeoutError) or (isinstance(exc, errors.APIError) and exc.code in TRANSIENT_CODES)


async def attempts[T](
    call: Callable[[], Awaitable[T]],
    *,
    timeout: float,  # noqa: ASYNC109 (the limit of one attempt, enforced with asyncio.timeout below)
    tries: int,
    what: str,
) -> T:
    """`call()` with `timeout` seconds per attempt, at most `tries` attempts; the last failure is raised."""
    for attempt in range(1, max(1, tries) + 1):
        try:
            async with asyncio.timeout(timeout):
                return await call()
        except Exception as exc:
            if attempt >= tries or not transient(exc):
                raise
            log.warning(
                "%s model call failed, trying again",
                what,
                extra={"detail": {"attempt": attempt, "error": repr(exc)[:200]}},
            )
            await asyncio.sleep(RETRY_DELAY_SECONDS)
    raise AssertionError("unreachable")  # the last attempt returns or raises
