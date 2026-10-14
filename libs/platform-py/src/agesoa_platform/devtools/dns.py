"""Local stand-in for public DNS TXT records (organization domain verification, TC-101/TC-102).

Organizations prove control of their domain with a TXT record `agesoa-verify=<token>`. Fictional demo domains
(`*.example`) have no real DNS, so locally trust resolves through this server instead (`DNS_RESOLVER=host:port`).
It answers TXT queries from an in-memory table that tests and the demo operator set over HTTP:

    PUT    /records/{name}   {"txt": ["agesoa-verify=..."]}   set the TXT values of a name
    DELETE /records/{name}                                    remove them
    GET    /records                                           list everything

Never used outside local/test: production verification resolves real public DNS.

    uv run agesoa-dev-dns --dns-port 5353 --http-port 8053
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import signal

import dns.flags
import dns.message
import dns.name
import dns.rcode
import dns.rdataclass
import dns.rdatatype
import dns.rrset
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel, Field

log = logging.getLogger("dev-dns")
TTL = 5


class Records(BaseModel):
    txt: list[str] = Field(default_factory=list, max_length=20)


class Zone:
    """name (lower case, no trailing dot) -> TXT strings."""

    def __init__(self) -> None:
        self.txt: dict[str, list[str]] = {}

    @staticmethod
    def key(name: str) -> str:
        return name.strip().rstrip(".").lower()

    def answer(self, wire: bytes) -> bytes:
        query = dns.message.from_wire(wire)
        response = dns.message.make_response(query)
        response.flags |= dns.flags.AA
        for question in query.question:
            values = self.txt.get(self.key(question.name.to_text()))
            if values is None:
                response.set_rcode(dns.rcode.NXDOMAIN)
                continue
            if question.rdtype in (dns.rdatatype.TXT, dns.rdatatype.ANY) and values:
                quoted = ['"' + v.replace("\\", "\\\\").replace('"', '\\"') + '"' for v in values]
                response.answer.append(
                    dns.rrset.from_text_list(question.name, TTL, dns.rdataclass.IN, dns.rdatatype.TXT, quoted)
                )
        return response.to_wire()


class _Protocol(asyncio.DatagramProtocol):
    def __init__(self, zone: Zone) -> None:
        self.zone = zone

    def connection_made(self, transport: asyncio.BaseTransport) -> None:
        self.transport = transport  # type: ignore[assignment]

    def datagram_received(self, data: bytes, addr: tuple[str, int]) -> None:
        try:
            self.transport.sendto(self.zone.answer(data), addr)  # type: ignore[attr-defined]
        except Exception:  # a malformed packet must not stop the server
            log.exception("bad DNS query from %s", addr)


def admin_app(zone: Zone) -> FastAPI:
    app = FastAPI(title="agesoa-dev-dns", docs_url=None, redoc_url=None)

    @app.get("/records")
    def list_records() -> dict[str, list[str]]:
        return zone.txt

    @app.put("/records/{name}")
    def set_records(name: str, body: Records) -> dict[str, list[str]]:
        zone.txt[zone.key(name)] = body.txt
        log.info("TXT %s = %s", zone.key(name), body.txt)
        return {zone.key(name): body.txt}

    @app.delete("/records/{name}", status_code=204)
    def delete_records(name: str) -> None:
        zone.txt.pop(zone.key(name), None)

    @app.get("/healthz")
    def healthz() -> dict[str, str]:
        return {"status": "ok"}

    return app


async def serve(host: str, dns_port: int, http_port: int) -> None:
    zone = Zone()
    loop = asyncio.get_running_loop()
    transport, _ = await loop.create_datagram_endpoint(lambda: _Protocol(zone), local_addr=(host, dns_port))
    server = uvicorn.Server(uvicorn.Config(admin_app(zone), host=host, port=http_port, log_level="warning"))
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, lambda: setattr(server, "should_exit", True))
    log.info("DNS on udp/%s, admin HTTP on %s", dns_port, http_port)
    try:
        await server.serve()
    finally:
        transport.close()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    # In the devenv cluster it must listen on the pod address; locally pass --host 127.0.0.1.
    parser.add_argument("--host", default="0.0.0.0")  # noqa: S104
    parser.add_argument("--dns-port", type=int, default=5353)
    parser.add_argument("--http-port", type=int, default=8053)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    asyncio.run(serve(args.host, args.dns_port, args.http_port))


if __name__ == "__main__":
    main()
