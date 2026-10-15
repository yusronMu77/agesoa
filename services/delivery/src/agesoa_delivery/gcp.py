"""Google API access with the service's own credentials (Cloud Run runtime service account)."""

from __future__ import annotations

import asyncio


def _token() -> str:
    import google.auth
    import google.auth.transport.requests

    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    credentials.refresh(google.auth.transport.requests.Request())
    return credentials.token


async def auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {await asyncio.to_thread(_token)}"}
