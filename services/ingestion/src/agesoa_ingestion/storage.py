"""Evidence media storage: a private GCS bucket in the cloud, a local folder in `local`/`test`.

Files reach storage only through the ingestion API, after the privacy guard; clients never upload directly.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Protocol


class MediaStore(Protocol):
    async def put(self, path: str, data: bytes, media_type: str) -> None: ...

    async def get(self, path: str) -> bytes: ...


class LocalMediaStore:
    def __init__(self, root: Path):
        self.root = root

    def _file(self, path: str) -> Path:
        file = (self.root / path).resolve()
        if not file.is_relative_to(self.root.resolve()):
            raise ValueError(f"object path escapes the media folder: {path!r}")
        return file

    async def put(self, path: str, data: bytes, media_type: str) -> None:
        file = self._file(path)
        file.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(file.write_bytes, data)

    async def get(self, path: str) -> bytes:
        return await asyncio.to_thread(self._file(path).read_bytes)


class GcsMediaStore:
    def __init__(self, bucket: str):
        from google.cloud import storage  # imported lazily: local runs never need GCP credentials

        self.bucket = storage.Client().bucket(bucket)

    async def put(self, path: str, data: bytes, media_type: str) -> None:
        blob = self.bucket.blob(path)
        # if_generation_match=0: evidence objects are written once and never replaced.
        await asyncio.to_thread(blob.upload_from_string, data, content_type=media_type, if_generation_match=0)

    async def get(self, path: str) -> bytes:
        return await asyncio.to_thread(self.bucket.blob(path).download_as_bytes)


def media_store(bucket: str | None, local_dir: Path) -> MediaStore:
    return GcsMediaStore(bucket) if bucket else LocalMediaStore(local_dir)
