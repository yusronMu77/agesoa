"""Reset and seed a demo environment with one command.

    uv run python scripts/demo/reset_demo.py                 # local devenv (dev tokens, no OIDC)
    uv run python scripts/demo/reset_demo.py --yes           # any other environment (asks for --yes)

What it does, in order:

1. Preflight: every service must report `demo_mode: true` on /readyz (a service without it is never touched).
2. `POST /internal/demo/reset` on each service: empties its database (data, outbox, inbox) and seeds its own
   demo data again (validators, demo districts, the first decision-log entry "demo.reset").
3. Rebuilds the public read model from the log.
4. Sends the synthetic scenarios through the same public API as AGESOA Witness (anonymous reporter: draft,
   correction, evidence, submit), so cases and log entries come from the real event path.
5. Waits until every submitted report reached the decision log and verifies the chain.

Signals ("kejadian berita") are not seeded yet: the Signal agent (#32) will write them through its own path.
Service URLs come from the same variables as the QA suite: API_URL_INGESTION, API_URL_CASE_AUDIT, API_URL_TRUST,
API_URL_DELIVERY, API_URL_TRANSPARENCY. Outside local: FIREBASE_WEB_API_KEY (anonymous reporter sign-in) and
AGESOA_OPS_SA (service account the operator impersonates for /internal/*; audience per service from
AGESOA_AUDIENCE_<SERVICE>, default the service URL).
"""

from __future__ import annotations

import argparse
import io
import os
import struct
import subprocess
import sys
import time
import wave
import zlib
from concurrent.futures import ThreadPoolExecutor

import httpx

SERVICES = ("ingestion", "case-audit", "trust", "delivery", "transparency")
RESET_FIRST = tuple(s for s in SERVICES if s != "transparency")
TIMEOUT = httpx.Timeout(30.0, connect=10.0)
API_KIND = {
    "voice_note": "audio",
    "document": "photo",
}  # scenario evidence kind -> evidence kind of the ingestion API


def service_url(service: str) -> str:
    name = f"API_URL_{service.upper().replace('-', '_')}"
    url = os.environ.get(name)
    if not url:
        sys.exit(f"{name} is not set (same variables as the e2e suite)")
    return url.rstrip("/")


def is_local(urls: dict[str, str]) -> bool:
    return all(u.split("//", 1)[-1].startswith(("localhost", "127.0.0.1", "10.90.")) for u in urls.values())


def internal_headers(service: str, url: str, local: bool) -> dict[str, str]:
    if local:
        return {}
    sa = os.environ.get("AGESOA_OPS_SA")
    if not sa:
        sys.exit("AGESOA_OPS_SA is not set (service account to impersonate for /internal/*)")
    audience = os.environ.get(f"AGESOA_AUDIENCE_{service.upper().replace('-', '_')}", url)
    token = subprocess.run(  # noqa: S603
        [  # noqa: S607
            "gcloud",
            "auth",
            "print-identity-token",
            f"--impersonate-service-account={sa}",
            f"--audiences={audience}",
            "--include-email",
        ],
        capture_output=True,
        text=True,
        check=True,
        shell=sys.platform == "win32",
    ).stdout.strip()
    return {"Authorization": f"Bearer {token}"}


def reporter_headers(local: bool, uid: str) -> dict[str, str]:
    if local:
        return {"Authorization": f"Bearer dev:{uid}"}
    key = os.environ.get("FIREBASE_WEB_API_KEY")
    if not key:
        sys.exit("FIREBASE_WEB_API_KEY is not set (anonymous sign-in for the reporter flow)")
    reply = httpx.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={key}",
        json={"returnSecureToken": True},
        timeout=TIMEOUT,
    )
    reply.raise_for_status()
    return {"Authorization": f"Bearer {reply.json()['idToken']}"}


def synthetic_png(seed: int) -> bytes:
    """A tiny valid grey PNG, different per seed (so evidence hashes differ). Not a real photo."""
    size = 16

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    rows = b"".join(
        b"\x00" + bytes([(seed * 37 + x * 5 + y * 3) % 200 + 20 for x in range(size)]) for y in range(size)
    )
    header = struct.pack(">IIBBBBB", size, size, 8, 0, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(rows))
        + chunk(b"IEND", b"")
    )


def synthetic_wav() -> bytes:
    """Half a second of silence. Not a real voice note."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(8000)
        out.writeframes(b"\x00\x00" * 4000)
    return buffer.getvalue()


_START = time.monotonic()


def ok(reply: httpx.Response) -> httpx.Response:
    if reply.is_error:
        sys.exit(
            f"{reply.request.method} {reply.request.url} -> HTTP {reply.status_code}: {reply.text[:300]}"
        )
    return reply


def step(message: str) -> None:
    print(f"- [{time.monotonic() - _START:5.1f} s] {message}", flush=True)


def preflight(urls: dict[str, str]) -> None:
    def check(item: tuple[str, str]) -> None:
        service, url = item
        body = httpx.get(f"{url}/readyz", timeout=TIMEOUT).json()
        if not body.get("demo_mode") or body.get("environment") == "prod":
            sys.exit(
                f"{service}: demo_mode is off (environment={body.get('environment')}); nothing was changed"
            )

    with ThreadPoolExecutor(max_workers=len(urls)) as pool:
        list(pool.map(check, urls.items()))
    step(f"preflight ok: {len(urls)} services report demo_mode")


def reset_services(urls: dict[str, str], local: bool) -> None:
    def reset(service: str) -> None:
        url = urls[service]
        reply = ok(
            httpx.post(
                f"{url}/internal/demo/reset", headers=internal_headers(service, url, local), timeout=TIMEOUT
            )
        )
        step(f"reset {service}: {len(reply.json()['tables'])} tables emptied")

    # transparency last: its reset writes the first log entry, after the other services are empty
    with ThreadPoolExecutor(max_workers=len(RESET_FIRST)) as pool:
        list(pool.map(reset, RESET_FIRST))
    reset("transparency")


def rebuild_read_model(urls: dict[str, str], local: bool) -> None:
    url = urls["transparency"]
    reply = httpx.post(
        f"{url}/internal/read-model/rebuild",
        headers=internal_headers("transparency", url, local),
        timeout=TIMEOUT,
    )
    step(
        f"read model rebuild: HTTP {reply.status_code}"
        + ("" if reply.is_success else " (not fatal: read model may be off)")
    )


def seed_scenario(ingestion: str, local: bool, scenario_id: str) -> int:
    scenario = httpx.get(f"{ingestion}/v1/demo/scenarios/{scenario_id}", timeout=TIMEOUT)
    scenario.raise_for_status()
    doc = scenario.json()
    headers = reporter_headers(local, f"demo-{scenario_id}")
    districts = httpx.get(f"{ingestion}/v1/regions/districts", headers=headers, timeout=TIMEOUT)
    districts.raise_for_status()
    wanted = doc["region"]["district_name"]
    code = next((d["district_code"] for d in districts.json() if d["district_name"] == wanted), None)
    if code is None:
        sys.exit(f"{scenario_id}: district {wanted!r} is not among the demo districts")
    wav = synthetic_wav()
    submitted = 0
    for index, report in enumerate(doc["reports"]):
        draft = httpx.post(
            f"{ingestion}/v1/reports",
            json={"domain": doc["pack"], "narrative": report.get("narrative"), "district_code": code},
            headers=headers,
            timeout=TIMEOUT,
        )
        ok(draft)
        report_id = draft.json()["id"]
        patch = httpx.patch(
            f"{ingestion}/v1/reports/{report_id}",
            json={"category": report["category"], "fields": report["fields"]},
            headers=headers,
            timeout=TIMEOUT,
        )
        ok(patch)
        for item_index, item in enumerate(report["evidence"]):
            data = wav if item["kind"] == "voice_note" else synthetic_png(index * 10 + item_index)
            name = "note.wav" if item["kind"] == "voice_note" else "photo.png"
            upload = httpx.post(
                f"{ingestion}/v1/reports/{report_id}/evidence",
                data={"kind": API_KIND.get(item["kind"], item["kind"])},
                files={"file": (name, data)},
                headers=headers,
                timeout=TIMEOUT,
            )
            ok(upload)
        ok(httpx.post(f"{ingestion}/v1/reports/{report_id}/submit", headers=headers, timeout=TIMEOUT))
        submitted += 1
    step(f"seeded {scenario_id}: {submitted} reports")
    return submitted


def wait_for_log(transparency: str, expected: int, wait_seconds: int) -> None:
    deadline = time.monotonic() + wait_seconds
    seq = 0
    while time.monotonic() < deadline:
        seq = httpx.get(f"{transparency}/v1/log/head", timeout=TIMEOUT).json()["seq"]
        if seq >= expected:
            break
        time.sleep(2)
    verdict = httpx.get(f"{transparency}/v1/log/verify", timeout=TIMEOUT).json()
    step(f"decision log: {seq} entries, chain ok={verdict['ok']}")
    if seq < expected or not verdict["ok"]:
        sys.exit(f"decision log has {seq} of at least {expected} expected entries, chain ok={verdict['ok']}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--yes", action="store_true", help="required for any environment that is not the local devenv"
    )
    parser.add_argument("--scenarios", help="comma-separated scenario ids (default: all)")
    parser.add_argument("--no-seed", action="store_true", help="reset only, do not send the scenarios")
    parser.add_argument(
        "--wait", type=int, default=60, help="seconds to wait for the decision log (default 60)"
    )
    args = parser.parse_args()

    urls = {service: service_url(service) for service in SERVICES}
    local = is_local(urls)
    if not local and not args.yes:
        sys.exit("these services are not local: pass --yes to empty their databases")
    started = time.monotonic()
    preflight(urls)
    reset_services(urls, local)
    rebuild_read_model(urls, local)
    if not args.no_seed:
        listing = httpx.get(f"{urls['ingestion']}/v1/demo/scenarios", timeout=TIMEOUT)
        listing.raise_for_status()
        ids = [s["id"] for s in listing.json()]
        if args.scenarios:
            ids = [i for i in ids if i in args.scenarios.split(",")]
        with ThreadPoolExecutor(max_workers=max(1, len(ids))) as pool:  # scenarios are independent
            submitted = sum(pool.map(lambda i: seed_scenario(urls["ingestion"], local, i), ids))
        wait_for_log(urls["transparency"], 1 + submitted, args.wait)
    step(f"done in {time.monotonic() - started:.0f} s")


if __name__ == "__main__":
    main()
