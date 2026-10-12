from agesoa_ingestion.tables import metadata
from agesoa_platform.messaging_tables import metadata as messaging_metadata
from agesoa_platform.migrations import run_migrations

run_migrations([messaging_metadata, metadata])
