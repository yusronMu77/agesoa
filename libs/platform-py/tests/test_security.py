import pytest
from agesoa_platform.hashing import GENESIS_HASH, canonical_json, chain_hash
from agesoa_platform.hmac import sign_webhook, verify_webhook
from agesoa_platform.settings import ServiceSettings
from pydantic import ValidationError

SECRET = "whsec_test"
BODY = b'{"event":"test_event"}'
TS = 1_760_500_000


def test_signature_format_and_known_vector():
    signature = sign_webhook(SECRET, TS, BODY)
    assert signature.startswith("v1=")
    assert len(signature) == 3 + 64
    assert verify_webhook(SECRET, str(TS), signature, BODY, now=TS)


@pytest.mark.parametrize(("skew", "ok"), [(0, True), (300, True), (-300, True), (301, False), (-301, False)])
def test_signature_timestamp_tolerance_is_five_minutes(skew, ok):
    signature = sign_webhook(SECRET, TS, BODY)
    assert verify_webhook(SECRET, str(TS), signature, BODY, now=TS + skew) is ok


@pytest.mark.parametrize(
    ("secret", "timestamp", "body"),
    [
        ("other", str(TS), BODY),
        (SECRET, str(TS + 1), BODY),
        (SECRET, str(TS), BODY + b" "),
        (SECRET, "abc", BODY),
    ],
)
def test_signature_rejects_any_change(secret, timestamp, body):
    signature = sign_webhook(SECRET, TS, BODY)
    assert not verify_webhook(secret, timestamp, signature, body, now=TS)


def test_canonical_json_ignores_key_order_and_keeps_unicode():
    assert canonical_json({"b": 1, "a": "Cibeuréum"}) == canonical_json({"a": "Cibeuréum", "b": 1})
    assert canonical_json({"a": [1, 2]}) == b'{"a":[1,2]}'
    with pytest.raises(ValueError):
        canonical_json({"x": float("nan")})


def test_chain_hash_links_entries():
    first = chain_hash(GENESIS_HASH, {"seq": 1})
    second = chain_hash(first, {"seq": 2})
    assert first != second
    assert chain_hash(GENESIS_HASH, {"seq": 1}) == first
    assert chain_hash(first, {"seq": 2, "tampered": True}) != second
    with pytest.raises(ValueError):
        chain_hash("abc", {})


BASE = {"service_name": "trust", "database_url": "postgresql+asyncpg://u:p@h/trust"}


def test_demo_mode_defaults_off():
    assert ServiceSettings(**BASE).demo_mode is False


def test_demo_mode_is_refused_in_prod():
    with pytest.raises(ValidationError, match="demo_mode cannot be enabled"):
        ServiceSettings(**BASE, environment="prod", demo_mode=True, oidc_audience="aud")
    assert ServiceSettings(**BASE, environment="demo", demo_mode=True, oidc_audience="aud").demo_mode


def test_cloud_environments_require_an_oidc_audience():
    with pytest.raises(ValidationError, match="OIDC_AUDIENCE is required"):
        ServiceSettings(**BASE, environment="demo")
