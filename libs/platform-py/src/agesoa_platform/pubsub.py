"""Pub/Sub publisher: one topic per event type (topic id = catalog name), structured CloudEvent as message data.

PUBSUB_EMULATOR_HOST is honoured by the client library (local devenv emulator).
"""

from __future__ import annotations

import asyncio
import json
import os
from functools import cache
from typing import Any

from agesoa_contracts import event_spec


def topic_id(event_type: str) -> str:
    return event_spec(event_type).type


def message_attributes(event: dict[str, Any]) -> dict[str, str]:
    """CloudEvents binary-mode style attributes, so subscriptions can filter and BigQuery keeps them."""
    attrs = {
        "ce-specversion": event["specversion"],
        "ce-id": event["id"],
        "ce-source": event["source"],
        "ce-type": event["type"],
        "ce-time": event["time"],
        "ce-dataschema": event["dataschema"],
    }
    if event.get("subject"):
        attrs["ce-subject"] = event["subject"]
    if event.get("traceparent"):
        attrs["traceparent"] = event["traceparent"]
    return attrs


class PubSubPublisher:
    def __init__(self, project_id: str, emulator_host: str | None = None):
        self.project_id = project_id
        if emulator_host:
            # The client library switches to an insecure channel without credentials when this is set.
            os.environ["PUBSUB_EMULATOR_HOST"] = emulator_host

    @staticmethod
    @cache
    def _client():
        from google.cloud import pubsub_v1

        return pubsub_v1.PublisherClient()

    async def publish(self, event: dict[str, Any]) -> str:
        client = self._client()
        topic = client.topic_path(self.project_id, topic_id(event["type"]))
        data = json.dumps(event, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        future = client.publish(topic, data, **message_attributes(event))
        return await asyncio.wait_for(asyncio.wrap_future(future), timeout=30)
