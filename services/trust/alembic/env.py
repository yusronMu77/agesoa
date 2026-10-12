from agesoa_platform.messaging_tables import metadata as messaging_metadata
from agesoa_platform.migrations import run_migrations
from agesoa_trust.tables import metadata

run_migrations([messaging_metadata, metadata])
