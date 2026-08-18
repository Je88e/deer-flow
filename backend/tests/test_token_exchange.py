"""POST /api/v1/auth/token-exchange — WIT Shell ID-token → DeerFlow session.

The embedded (iframe) frontend receives a Keycloak ID token from the WIT Shell
bridge and exchanges it for the normal DeerFlow cookie pair. Unlike the OIDC
callback this is a pure API call: no redirect, no state cookie, and the nonce
check is skipped because the nonce belongs to the issuing wit-shell
authorization-code flow (docs/dev/deerflow-shell-integration-plan.md §3.1).

These tests exercise the real wire path — discovery + JWKS validation with
genuinely signed RS256 tokens, real provisioning into SQLite, real cookie
issuance through CSRFMiddleware — stubbing only the OIDC provider's HTTP
endpoints.
"""

import asyncio
import time
from pathlib import Path

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jwt.algorithms import RSAAlgorithm

from app.gateway.auth.config import AuthConfig, set_auth_config
from app.gateway.auth.errors import TokenError
from app.gateway.auth.jwt import decode_token
from app.gateway.auth.oidc import OIDCService
from deerflow.config.app_config import AppConfig
from deerflow.config.auth_config import AuthAppConfig, OIDCAuthConfig, OIDCProviderConfig

_REPO_ROOT = Path(__file__).resolve().parents[2]
_TEST_SECRET = "test-secret-for-token-exchange-tests-min32"

ISSUER = "https://keycloak.wit.example.com/realms/wit"
DISCOVERY_URL = f"{ISSUER}/.well-known/openid-configuration"
JWKS_URI = f"{ISSUER}/protocol/openid-connect/certs"
CLIENT_ID = "deerflow"
KID = "wit-test-key-1"

# Real RSA keypairs so signature / audience / expiry failures come from the
# actual jwt decode path, not from a stubbed validator.
_SIGNING_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_WRONG_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)

JWKS_DOCUMENT = {
    "keys": [
        {
            **RSAAlgorithm.to_jwk(_SIGNING_KEY.public_key(), as_dict=True),
            "kid": KID,
            "use": "sig",
            "alg": "RS256",
        }
    ]
}

DISCOVERY_DOCUMENT = {
    "issuer": ISSUER,
    "authorization_endpoint": f"{ISSUER}/protocol/openid-connect/auth",
    "token_endpoint": f"{ISSUER}/protocol/openid-connect/token",
    "userinfo_endpoint": f"{ISSUER}/protocol/openid-connect/userinfo",
    "jwks_uri": JWKS_URI,
}


def _make_id_token(
    signing_key=None,
    *,
    audience=("wit-shell", CLIENT_ID),
    expires_in=600,
    **claim_overrides,
) -> str:
    """Craft a Keycloak-shaped RS256 ID token (aud includes deerflow via the audience mapper)."""
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": list(audience),
        "sub": "shell-user-1",
        "exp": now + expires_in,
        "iat": now - 10,
        "email": "user@wit.example.com",
        "email_verified": True,
        "name": "WIT User",
    }
    claims.update(claim_overrides)
    return pyjwt.encode(claims, signing_key or _SIGNING_KEY, algorithm="RS256", headers={"kid": KID})


def _keycloak_provider_config() -> OIDCProviderConfig:
    return OIDCProviderConfig(
        display_name="WIT SSO",
        issuer=ISSUER,
        client_id=CLIENT_ID,
        client_secret="test-secret",
        allowed_email_domains=["wit.example.com"],
        admin_emails=["admin@wit.example.com"],
    )


class _FakeHTTPResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def _serve_keycloak_metadata(service: OIDCService) -> None:
    """Point the service's HTTP client at canned discovery + JWKS documents."""

    async def fake_get(url, *args, **kwargs):
        if url == DISCOVERY_URL:
            return _FakeHTTPResponse(DISCOVERY_DOCUMENT)
        if url == JWKS_URI:
            return _FakeHTTPResponse(JWKS_DOCUMENT)
        raise AssertionError(f"unexpected OIDC HTTP fetch: {url}")

    service._http.get = fake_get  # type: ignore[method-assign]


@pytest.fixture(autouse=True)
def _persistence_engine(tmp_path):
    """Per-test SQLite engine + clean deps caches (mirrors test_local_registration_gate).

    The exchange handler provisions real users through the SQLite-backed local
    provider, so each test needs a fresh database.
    """
    from app.gateway import deps
    from deerflow.persistence.engine import close_engine, init_engine

    asyncio.run(init_engine("sqlite", url=f"sqlite+aiosqlite:///{tmp_path}/token_exchange.db", sqlite_dir=str(tmp_path)))
    deps._cached_local_provider = None
    deps._cached_repo = None
    try:
        yield
    finally:
        deps._cached_local_provider = None
        deps._cached_repo = None
        asyncio.run(close_engine())


@pytest.fixture
def make_client(monkeypatch):
    """Factory for a TestClient whose app config carries the keycloak provider.

    Returns ``(client_factory, oidc_service)``. The service is the real
    ``OIDCService`` singleton the router resolves, with its HTTP client aimed
    at the canned Keycloak documents.
    """
    service = OIDCService()
    _serve_keycloak_metadata(service)
    monkeypatch.setattr("app.gateway.routers.auth._get_oidc_service", lambda: service)

    def _make(*, oidc_enabled: bool = True) -> TestClient:
        set_auth_config(AuthConfig(jwt_secret=_TEST_SECRET))
        # config.yaml is operator-owned; build the baseline from the committed
        # example so the other sections the app lifespan reads stay valid.
        baseline = AppConfig.from_file(str(_REPO_ROOT / "config.example.yaml"))
        patched = baseline.model_copy(deep=True)
        patched.auth = AuthAppConfig(
            oidc=OIDCAuthConfig(
                enabled=oidc_enabled,
                frontend_base_url="/leadagent",
                providers={"keycloak": _keycloak_provider_config()},
            ),
            local=baseline.auth.local,
        )
        monkeypatch.setattr("deerflow.config.app_config.get_app_config", lambda: patched)

        from app.gateway.app import create_app

        return TestClient(create_app())

    try:
        yield _make
    finally:
        asyncio.run(service.close())


def _set_cookie_headers(resp) -> list[str]:
    return [v for k, v in resp.headers.multi_items() if k.lower() == "set-cookie"]


def _exchange(client: TestClient, token: str, *, provider: str = "keycloak"):
    return client.post("/api/v1/auth/token-exchange", json={"token": token, "provider": provider})


# ── Success ─────────────────────────────────────────────────────────────────


def test_token_exchange_success_sets_cookie_pair(make_client):
    client = make_client()

    resp = _exchange(client, _make_id_token())

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body == {"expires_in": 604800, "needs_setup": False}

    set_cookies = _set_cookie_headers(resp)
    access_cookies = [h for h in set_cookies if h.startswith("access_token=")]
    csrf_cookies = [h for h in set_cookies if h.startswith("csrf_token=")]
    assert access_cookies, "token-exchange must set the access_token cookie"
    assert csrf_cookies, "token-exchange response must carry the csrf_token cookie pair"
    assert "httponly" in access_cookies[0].lower()
    # WIT Shell serves DeerFlow under /leadagent; the auth cookie family is
    # scoped to that base path (plan §6.3).
    assert "path=/leadagent" in access_cookies[0].lower()
    assert "path=/leadagent" in csrf_cookies[0].lower()
    # CSRF middleware also exposes the token for cross-origin JS clients.
    assert resp.headers.get("X-CSRF-Token")

    raw_access = access_cookies[0].split(";", 1)[0].split("=", 1)[1]
    payload = decode_token(raw_access)
    assert not isinstance(payload, TokenError)
    assert payload.sub


def test_token_exchange_without_csrf_cookie_reaches_handler(make_client):
    """A first-call POST carries no cookies; CSRFMiddleware must not 403 it.

    Pins the middleware exemption decision: token-exchange is treated like
    login/register (origin-checked, double-submit-free).
    """
    client = make_client()

    resp = _exchange(client, _make_id_token())

    assert resp.status_code == 200, resp.text


def test_token_exchange_reuses_provisioned_user_on_second_call(make_client):
    client = make_client()

    first = _exchange(client, _make_id_token())
    second = _exchange(client, _make_id_token())

    assert first.status_code == second.status_code == 200
    sub_first = decode_token(_set_cookie_headers(first)[0].split(";", 1)[0].split("=", 1)[1])
    sub_second = decode_token(_set_cookie_headers(second)[0].split(";", 1)[0].split("=", 1)[1])
    assert not isinstance(sub_first, TokenError) and not isinstance(sub_second, TokenError)
    assert sub_first.sub == sub_second.sub


def test_token_exchange_rejects_cross_site_origin(make_client):
    """The CSRF exemption keeps the auth-endpoint origin gate (login-CSRF defense)."""
    client = make_client()

    resp = _exchange_with_origin(client, _make_id_token(), "https://evil.example")

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Cross-site auth request denied."


def _exchange_with_origin(client: TestClient, token: str, origin: str):
    return client.post(
        "/api/v1/auth/token-exchange",
        json={"token": token, "provider": "keycloak"},
        headers={"Origin": origin},
    )


# ── Validation failures → 401 ───────────────────────────────────────────────


def test_token_exchange_invalid_signature_returns_401(make_client):
    client = make_client()
    forged = _make_id_token(signing_key=_WRONG_KEY)

    resp = _exchange(client, forged)

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "token_invalid"


def test_token_exchange_expired_token_returns_401(make_client):
    client = make_client()
    expired = _make_id_token(expires_in=-600)

    resp = _exchange(client, expired)

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "token_invalid"


def test_token_exchange_wrong_audience_returns_401(make_client):
    """No Keycloak audience mapper → aud lacks deerflow → InvalidAudienceError → 401."""
    client = make_client()
    wrong_aud = _make_id_token(audience=("wit-shell",))

    resp = _exchange(client, wrong_aud)

    assert resp.status_code == 401
    assert resp.json()["detail"]["code"] == "token_invalid"


# ── Provider / configuration errors ────────────────────────────────────────


def test_token_exchange_unknown_provider_returns_400(make_client):
    client = make_client()

    resp = _exchange(client, _make_id_token(), provider="nonexistent")

    assert resp.status_code == 400
    assert "Unknown SSO provider" in resp.json()["detail"]


def test_token_exchange_sso_disabled_returns_404(make_client):
    client = make_client(oidc_enabled=False)

    resp = _exchange(client, _make_id_token())

    assert resp.status_code == 404
    assert resp.json()["detail"] == "SSO authentication is not enabled"
