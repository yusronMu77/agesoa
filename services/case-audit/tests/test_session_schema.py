"""ADK's session tables keep a schema-version row that ADK insists on; the service puts it back when it is missing."""

import pytest
from agesoa_case_audit.main import restore_session_schema_version
from agesoa_case_audit.settings import Settings
from agesoa_platform.db import Database
from agesoa_platform.testing import TEST_DATABASE_URL, isolated_schema
from google.adk.sessions.migration._schema_check_utils import LATEST_SCHEMA_VERSION, SCHEMA_VERSION_KEY
from sqlalchemy import text

needs_database = pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL not set")


def test_audit_rounds_get_a_larger_pool_than_the_default():
    settings = Settings(database_url="postgresql+asyncpg://u:p@localhost/x")
    assert settings.db_pool_size + settings.db_max_overflow > 4


@needs_database
async def test_a_missing_schema_version_row_is_restored_and_a_new_database_is_left_alone():
    async with isolated_schema() as schema:
        settings = Settings(database_url=TEST_DATABASE_URL, db_search_path=schema, environment="test")
        db = Database(settings)
        try:
            await restore_session_schema_version(db.engine)  # no ADK table yet: nothing to do
            async with db.transaction() as session:
                await session.execute(
                    text("create table adk_internal_metadata (key text primary key, value text)")
                )
            await restore_session_schema_version(db.engine)
            await restore_session_schema_version(db.engine)  # again: still one row
            async with db.sessions() as session:
                rows = (await session.execute(text("select key, value from adk_internal_metadata"))).all()
            assert [tuple(r) for r in rows] == [(SCHEMA_VERSION_KEY, LATEST_SCHEMA_VERSION)]
        finally:
            await db.dispose()
