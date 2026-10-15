"""Demo sign-in accounts (#23): with demo_mode and a password, trust creates the demo validator, organization admin
and operator accounts with their role claims in Identity Platform outside local (mocked here), not only in the
Firebase Auth emulator."""

from pathlib import Path

import pytest
from agesoa_platform.testing import TEST_DATABASE_URL, isolated_schema
from agesoa_trust.main import build_app
from agesoa_trust.settings import Settings
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")
ALEMBIC_INI = Path(__file__).resolve().parents[1] / "alembic.ini"


class RecordingIdentity:
    def __init__(self):
        self.accounts = {}

    async def ensure_account(self, uid, email, password, roles):
        self.accounts[uid] = (email, password, roles)


def demo_settings(schema, **overrides):
    return Settings(
        _env_file=None,
        database_url=TEST_DATABASE_URL,
        db_search_path=schema,
        environment="demo",
        oidc_audience="agesoa-demo-trust",
        google_cloud_project="agesoa-demo",
        demo_mode=True,
        **overrides,
    )


async def test_demo_accounts_are_created_in_identity_platform_outside_local():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        app = build_app(demo_settings(schema, demo_validator_password="pw-placeholder"))
        assert app.state.identity is not None  # Identity Platform, through the service's own credentials
        app.state.identity = identity = RecordingIdentity()
        with TestClient(app):
            pass
    assert identity.accounts["demo-operator-1"] == (
        "operator@demo.agesoa.local",
        "pw-placeholder",
        {"operator"},
    )
    assert identity.accounts["demo-org-admin-1"][2] == {"org_admin"}
    assert sum(roles == {"validator"} for _, _, roles in identity.accounts.values()) == 3


async def test_no_demo_accounts_without_a_password():
    async with isolated_schema(alembic_ini=ALEMBIC_INI) as schema:
        app = build_app(demo_settings(schema))
        app.state.identity = identity = RecordingIdentity()
        with TestClient(app):
            pass
    assert identity.accounts == {}
