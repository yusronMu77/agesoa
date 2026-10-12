"""Write services/trust/openapi.json from the code: uv run python -m agesoa_trust.export_openapi"""

from pathlib import Path

from agesoa_platform.app import export_openapi

from agesoa_trust.main import build_app
from agesoa_trust.settings import Settings

OPENAPI_FILE = Path(__file__).resolve().parents[2] / "openapi.json"


def offline_app():
    return build_app(Settings(database_url="postgresql+asyncpg://export@localhost/export"))


if __name__ == "__main__":
    export_openapi(offline_app(), OPENAPI_FILE)
    print(f"wrote {OPENAPI_FILE}")
