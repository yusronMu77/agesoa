"""agesoa-dev-dns: TXT answers from the in-memory table (local stand-in for public DNS)."""

import asyncio

import dns.asyncresolver
import dns.message
import dns.rcode
import dns.rdatatype
import pytest
from agesoa_platform.devtools.dns import Zone, _Protocol, admin_app
from fastapi.testclient import TestClient


def ask(zone: Zone, name: str) -> dns.message.Message:
    return dns.message.from_wire(zone.answer(dns.message.make_query(name, dns.rdatatype.TXT).to_wire()))


def test_txt_records_are_answered_and_unknown_names_do_not_exist():
    zone = Zone()
    TestClient(admin_app(zone)).put(
        "/records/Redaksi.Example.", json={"txt": ['agesoa-verify=a"b', "v=spf1 -all"]}
    )
    answer = ask(zone, "redaksi.example")
    assert answer.rcode() == dns.rcode.NOERROR
    values = sorted(b"".join(r.strings).decode() for r in answer.answer[0])
    assert values == ['agesoa-verify=a"b', "v=spf1 -all"]
    assert ask(zone, "other.example").rcode() == dns.rcode.NXDOMAIN


def test_records_can_be_listed_and_removed():
    zone = Zone()
    client = TestClient(admin_app(zone))
    client.put("/records/a.example", json={"txt": ["x"]})
    assert client.get("/records").json() == {"a.example": ["x"]}
    assert client.delete("/records/a.example").status_code == 204
    assert ask(zone, "a.example").rcode() == dns.rcode.NXDOMAIN


@pytest.mark.parametrize("bad", [b"", b"\x00\x01garbage"])
async def test_malformed_packets_do_not_stop_the_server(bad):
    zone = Zone()
    zone.txt["ok.example"] = ["fine"]
    loop = asyncio.get_running_loop()
    transport, _ = await loop.create_datagram_endpoint(lambda: _Protocol(zone), local_addr=("127.0.0.1", 0))
    port = transport.get_extra_info("sockname")[1]
    try:
        sender, _ = await loop.create_datagram_endpoint(
            asyncio.DatagramProtocol, remote_addr=("127.0.0.1", port)
        )
        sender.sendto(bad)
        sender.close()
        resolver = dns.asyncresolver.Resolver(configure=False)
        resolver.nameservers, resolver.port = ["127.0.0.1"], port
        answer = await resolver.resolve("ok.example", "TXT")
        assert [b"".join(r.strings) for r in answer] == [b"fine"]
    finally:
        transport.close()
