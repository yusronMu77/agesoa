"""Write services/ingestion/openapi.json from the code: uv run python -m agesoa_ingestion.export_openapi"""

from pathlib import Path

from agesoa_platform.app import export_openapi

from agesoa_ingestion.main import build_app
from agesoa_ingestion.settings import Settings

OPENAPI_FILE = Path(__file__).resolve().parents[2] / "openapi.json"


def offline_app():
    return build_app(Settings(database_url="postgresql+asyncpg://export@localhost/export"))


if __name__ == "__main__":
    export_openapi(offline_app(), OPENAPI_FILE)
    print(f"wrote {OPENAPI_FILE}")
