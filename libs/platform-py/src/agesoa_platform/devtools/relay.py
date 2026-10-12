"""Local stand-in for Pub/Sub push: create topics + pull subscriptions in the emulator from events/catalog.json,
then forward each message to the consuming service's POST /events/{type} as a push envelope.

The emulator runs inside agesoa-devenv and cannot reach services running on Windows, so the relay runs on
Windows next to them. Usage (from the repo root, with PUBSUB_EMULATOR_HOST set):

    uv run agesoa-dev-relay                 # setup + forward until Ctrl+C
    uv run agesoa-dev-relay --setup-only    # only create topics/subscriptions
"""

from __future__ import annotations

import argparse
import base64
import logging
import os
import signal
import sys
import time

import httpx
from agesoa_contracts import SERVICES, catalog

DEFAULT_PORTS = {"ingestion": 8001, "case-audit": 8002, "trust": 8003, "delivery": 8004, "transparency": 8005}
log = logging.getLogger("relay")


def service_url(service: str) -> str:
    env = "API_URL_" + service.upper().replace("-", "_")
    return os.environ.get(env, f"http://localhost:{DEFAULT_PORTS[service]}")


def subscription_id(consumer: str, event_type: str) -> str:
    return f"relay--{consumer}--{event_type}"


def setup(project: str) -> list[tuple[str, str, str]]:
    from google.api_core.exceptions import AlreadyExists
    from google.cloud import pubsub_v1

    publisher, subscriber = pubsub_v1.PublisherClient(), pubsub_v1.SubscriberClient()
    routes = []
    for event_type, spec in catalog().items():
        topic = publisher.topic_path(project, event_type)
        try:
            publisher.create_topic(name=topic)
        except AlreadyExists:
            pass
        for consumer in spec.consumers:
            sub = subscriber.subscription_path(project, subscription_id(consumer, event_type))
            try:
                subscriber.create_subscription(name=sub, topic=topic, ack_deadline_seconds=30)
            except AlreadyExists:
                pass
            routes.append((sub, consumer, event_type))
    log.info("emulator ready: %d topics, %d subscriptions", len(catalog()), len(routes))
    return routes


def forward(routes: list[tuple[str, str, str]], interval: float) -> None:
    from google.cloud import pubsub_v1

    subscriber = pubsub_v1.SubscriberClient()
    running = True

    def stop(*_: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, stop)
    with httpx.Client(timeout=30) as http:
        while running:
            for sub, consumer, event_type in routes:
                response = subscriber.pull(
                    subscription=sub, max_messages=20, return_immediately=True, timeout=10
                )
                ack = []
                for received in response.received_messages:
                    msg = received.message
                    envelope = {
                        "message": {
                            "data": base64.b64encode(msg.data).decode("ascii"),
                            "attributes": dict(msg.attributes),
                            "messageId": msg.message_id,
                        },
                        "subscription": sub,
                    }
                    url = f"{service_url(consumer)}/events/{event_type}"
                    try:
                        result = http.post(url, json=envelope)
                    except httpx.HTTPError as exc:
                        log.warning("%s unreachable (%s); will retry", url, exc)
                        continue
                    log.info("%s -> %s: %s", event_type, consumer, result.status_code)
                    if result.is_success:
                        ack.append(received.ack_id)
                if ack:
                    subscriber.acknowledge(subscription=sub, ack_ids=ack)
            time.sleep(interval)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--project", default=os.environ.get("GOOGLE_CLOUD_PROJECT_EMULATOR", "agesoa-local"))
    parser.add_argument("--setup-only", action="store_true")
    parser.add_argument("--interval", type=float, default=0.5)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    if not os.environ.get("PUBSUB_EMULATOR_HOST"):
        print(
            "PUBSUB_EMULATOR_HOST is not set (see agesoa-devenv/outputs/local-endpoints.env)", file=sys.stderr
        )
        return 2
    assert set(DEFAULT_PORTS) == set(SERVICES)
    routes = setup(args.project)
    if not args.setup_only:
        forward(routes, args.interval)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
