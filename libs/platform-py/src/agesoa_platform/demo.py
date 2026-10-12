"""`demo_mode` gate: demo-only code paths (fictional data, scripted interviews, seeded validators) sit behind it."""

from __future__ import annotations

from fastapi import HTTPException, Request, status


def demo_mode_enabled(request: Request) -> bool:
    return bool(request.app.state.settings.demo_mode)


def require_demo_mode(request: Request) -> None:
    """FastAPI dependency: the route does not exist (404) unless demo_mode is on."""
    if not demo_mode_enabled(request):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not Found")
