"""Pure-Bearer direct authentication (WIT Shell micro-frontend, plan §3.4).

Requests may carry ``Authorization: Bearer <jwt>`` — a Keycloak access token —
instead of the DeerFlow session cookie. The Gateway validates it offline
against the provider's JWKS (signature / iss / exp plus the relaxed audience
matrix ``azp == client_id`` or ``client_id ∈ aud``), resolves the identity
through the same ``get_or_provision_oidc_user`` path as the OIDC callback and
token exchange, and stamps the same ``request.state.user`` / user-context
state the cookie path does. Credential priority: internal > bearer > cookie.

Wire-path tests build the real Gateway app with canned Keycloak discovery +
JWKS documents and genuinely signed RS256 tokens; state / priority / CSRF
assertions use a minimal AuthMiddleware + CSRFMiddleware app in the production
middleware ordering (CSRF runs before Auth).
"""

import asyncio
import time
from pathlib import Path

import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from jwt.algorithms import RSAAlgorithm

from app.gateway.auth.config import AuthConfig, set_auth_config
from app.gateway.auth.oidc import OIDCService
from deerflow.config.app_config import AppConfig
from deerflow.config.auth_config import AuthAppConfig, OIDCAuthConfig, OIDCProviderConfig
from deerflow.config.authorization_config import AuthorizationConfig

_REPO_ROOT = Path(__file__).resolve().parents[2]
_TEST_SECRET = "test-secret-for-bearer-auth-tests-min32"

ISSUER = "https://keycloak.wit.example.com/realms/wit"
DISCOVERY_URL = f"{ISSUER}/.well-known/openid-configuration"
JWKS_URI = f"{ISSUER}/protocol/openid-connect/certs"
CLIENT_ID = "deerflow"
KID = "wit-bearer-test-key-1"

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


def _make_access_token(
    signing_key=None,
    *,
    azp=CLIENT_ID,
    audience=("account",),
    expires_in=600,
    **claim_overrides,
) -> str:
    """Craft a Keycloak-shaped RS256 access token.

    Keycloak access tokens typically carry ``azp`` (the client the token was
    issued to) and an ``aud`` list that may or may not include that client.
    """
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "sub": "bearer-user-1",
        "exp": now + expires_in,
        "iat": now - 10,
        "email": "bearer@wit.example.com",
        "email_verified": True,
        "name": "Bearer User",
    }
    if azp is not None:
        claims["azp"] = azp
    if audience is not None:
        claims["aud"] = list(audience)
    claims.update(claim_overrides)
    return pyjwt.encode(claims, signing_key or _SIGNING_KEY, algorithm="RS256", headers={"kid": KID})


def _keycloak_provider_config() -> OIDCProviderConfig:
    return OIDCProviderConfig(
        display_name="WIT SSO",
        issuer=ISSUER,
        client_id=CLIENT_ID,
        client_secret="test-secret",
        allowed_email_domains=["wit.example.com"],
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


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _default_route_authorization_config(monkeypatch):
    """Keep middleware apps independent of a repository config.yaml."""
    monkeypatch.setattr(
        "app.gateway.authz._get_route_authorization_config",
        lambda: AuthorizationConfig(),
    )


@pytest.fixture(autouse=True)
def _persistence_engine(tmp_path):
    """Per-test SQLite engine + clean deps caches.

    Bearer authentication provisions real users through the SQLite-backed
    local provider, so each test needs a fresh database.
    """
    from app.gateway import deps
    from deerflow.persistence.engine import close_engine, init_engine

    asyncio.run(init_engine("sqlite", url=f"sqlite+aiosqlite:///{tmp_path}/bearer_auth.db", sqlite_dir=str(tmp_path)))
    deps._cached_local_provider = None
    deps._cached_repo = None
    try:
        yield
    finally:
        deps._cached_local_provider = None
        deps._cached_repo = None
        asyncio.run(close_engine())


def _patch_keycloak_config(monkeypatch) -> None:
    """Point the lazy config + OIDC service lookups at the canned Keycloak."""
    service = OIDCService()
    _serve_keycloak_metadata(service)
    monkeypatch.setattr("app.gateway.routers.auth._get_oidc_service", lambda: service)
    baseline = AppConfig.from_file(str(_REPO_ROOT / "config.example.yaml"))
    patched = baseline.model_copy(deep=True)
    patched.auth = AuthAppConfig(
        oidc=OIDCAuthConfig(
            enabled=True,
            frontend_base_url="/leadagent",
            providers={"keycloak": _keycloak_provider_config()},
        ),
        local=baseline.auth.local,
    )
    monkeypatch.setattr("deerflow.config.app_config.get_app_config", lambda: patched)
    return service


@pytest.fixture
def make_gateway_client(monkeypatch):
    """Factory building the real Gateway app against the canned provider."""
    service = _patch_keycloak_config(monkeypatch)

    def _make() -> TestClient:
        set_auth_config(AuthConfig(jwt_secret=_TEST_SECRET))
        from app.gateway.app import create_app

        return TestClient(create_app())

    try:
        yield _make
    finally:
        asyncio.run(service.close())


@pytest.fixture
def make_middleware_client(monkeypatch):
    """Factory building a minimal AuthMiddleware + CSRFMiddleware app.

    Middleware registration mirrors production ordering (CSRFMiddleware added
    last → outermost → runs before AuthMiddleware).
    """
    service = _patch_keycloak_config(monkeypatch)

    def _make() -> TestClient:
        from app.gateway.auth_middleware import AuthMiddleware
        from app.gateway.csrf_middleware import CSRFMiddleware
        from deerflow.runtime.user_context import get_effective_user_id

        app = FastAPI()
        app.add_middleware(AuthMiddleware)
        app.add_middleware(CSRFMiddleware)

        @app.get("/api/whoami")
        async def whoami(request: Request):
            user = request.state.user
            return {
                "id": str(user.id),
                "email": getattr(user, "email", None),
                "auth_source": request.state.auth_source,
                "auth_scheme": getattr(request.state, "auth_scheme", None),
                "context_user_id": get_effective_user_id(),
            }

        @app.post("/api/mutate")
        async def mutate():
            return {"ok": True}

        return TestClient(app)

    try:
        yield _make
    finally:
        asyncio.run(service.close())


# ── Bearer header parsing ──────────────────────────────────────────────────


def _request_with_headers(headers: dict[str, str]) -> Request:
    raw = [(name.lower().encode(), value.encode()) for name, value in headers.items()]
    return Request({"type": "http", "method": "GET", "path": "/", "headers": raw})


@pytest.mark.parametrize(
    ("header_value", "expected"),
    [
        ("Bearer abc.def.ghi", "abc.def.ghi"),
        ("bearer abc", "abc"),  # RFC 7235: auth scheme is case-insensitive
        ("BEARER abc", "abc"),
        ("Bearer   abc", "abc"),
        ("Bearer", None),  # scheme without a credential
        ("Bearer ", None),
        ("Basic abc", None),
    ],
)
def test_get_bearer_token_parses_authorization_header(header_value, expected):
    from app.gateway.auth_middleware import get_bearer_token

    request = _request_with_headers({"Authorization": header_value})

    assert get_bearer_token(request) == expected


def test_get_bearer_token_returns_none_without_header():
    from app.gateway.auth_middleware import get_bearer_token

    assert get_bearer_token(_request_with_headers({})) is None


# ── Wire path: validation matrix (real Gateway app) ────────────────────────


def test_bearer_azp_match_authenticates(make_gateway_client):
    """azp == client_id suffices even when aud does not contain the client."""
    client = make_gateway_client()

    res = client.get("/api/v1/auth/me", headers=_bearer(_make_access_token()))

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["email"] == "bearer@wit.example.com"
    assert body["oauth_provider"] == "keycloak"


def test_bearer_aud_membership_match_authenticates(make_gateway_client):
    """client_id ∈ aud suffices even without an azp claim."""
    client = make_gateway_client()
    token = _make_access_token(azp=None, audience=(CLIENT_ID, "wit-shell"))

    res = client.get("/api/v1/auth/me", headers=_bearer(token))

    assert res.status_code == 200, res.text
    assert res.json()["email"] == "bearer@wit.example.com"


def test_bearer_azp_and_aud_both_mismatch_returns_401(make_gateway_client):
    client = make_gateway_client()
    token = _make_access_token(azp="other-client", audience=("account",))

    res = client.get("/api/v1/auth/me", headers=_bearer(token))

    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "token_invalid"


def test_bearer_expired_token_returns_401(make_gateway_client):
    client = make_gateway_client()
    token = _make_access_token(expires_in=-600)

    res = client.get("/api/v1/auth/me", headers=_bearer(token))

    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "token_invalid"


def test_bearer_bad_signature_returns_401(make_gateway_client):
    client = make_gateway_client()
    forged = _make_access_token(signing_key=_WRONG_KEY)

    res = client.get("/api/v1/auth/me", headers=_bearer(forged))

    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "token_invalid"


def test_bearer_unknown_issuer_returns_401(make_gateway_client):
    """iss that matches no configured provider → 401 before any JWKS work."""
    client = make_gateway_client()
    token = _make_access_token(iss="https://other.example.com/realms/x")

    res = client.get("/api/v1/auth/me", headers=_bearer(token))

    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "token_invalid"


def test_bearer_malformed_token_returns_401(make_gateway_client):
    client = make_gateway_client()

    res = client.get("/api/v1/auth/me", headers=_bearer("not-a-jwt"))

    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "token_invalid"


def test_bearer_second_request_reuses_provisioned_user(make_gateway_client):
    client = make_gateway_client()

    first = client.get("/api/v1/auth/me", headers=_bearer(_make_access_token()))
    second = client.get("/api/v1/auth/me", headers=_bearer(_make_access_token()))

    assert first.status_code == second.status_code == 200
    assert first.json()["id"] == second.json()["id"]


def test_request_without_credentials_still_401(make_gateway_client):
    """The Bearer branch is dormant: no header → previous fail-closed behavior."""
    client = make_gateway_client()

    res = client.get("/api/v1/auth/me")

    assert res.status_code == 401


# ── Credential priority and request state (middleware app) ─────────────────


def test_internal_credentials_take_priority_over_bearer(make_middleware_client):
    """internal > bearer: a junk Bearer must never be consulted when the
    internal auth token is present."""
    from app.gateway.internal_auth import create_internal_auth_headers
    from deerflow.runtime.user_context import DEFAULT_USER_ID

    client = make_middleware_client()

    res = client.get(
        "/api/whoami",
        headers={**create_internal_auth_headers(), **_bearer("definitely-not-a-jwt")},
    )

    assert res.status_code == 200
    body = res.json()
    assert body["id"] == DEFAULT_USER_ID
    assert body["auth_source"] == "internal"
    assert body["auth_scheme"] is None


def test_bearer_success_stamps_user_state_and_context(make_middleware_client):
    """Bearer success takes the exact session user-stamp path downstream."""
    client = make_middleware_client()

    res = client.get("/api/whoami", headers=_bearer(_make_access_token()))

    assert res.status_code == 200, res.text
    body = res.json()
    assert body["email"] == "bearer@wit.example.com"
    assert body["auth_scheme"] == "bearer"
    # Session-equivalent stamp so downstream resolvers are unchanged.
    assert body["auth_source"] == "session"
    # user_context contextvar carries the resolved user id.
    assert body["context_user_id"] == body["id"]


def test_bearer_failure_does_not_fall_back_to_cookie(make_middleware_client, monkeypatch):
    """A presented-but-invalid Bearer is a 401, never a cookie fallback."""
    from types import SimpleNamespace

    async def fake_cookie_user(request):
        return SimpleNamespace(id="cookie-user", email="cookie@test.local", system_role="user", needs_setup=False)

    monkeypatch.setattr("app.gateway.deps.get_current_user_from_request", fake_cookie_user)
    client = make_middleware_client()

    res = client.get("/api/whoami", headers=_bearer("junk"), cookies={"access_token": "valid-looking-session"})

    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "token_invalid"


# ── CSRF exemption for Bearer-authenticated requests ───────────────────────


def test_bearer_post_without_csrf_token_is_exempt(make_middleware_client):
    """Bearer header → no double-submit token required (header-immune to CSRF)."""
    client = make_middleware_client()

    res = client.post("/api/mutate", headers=_bearer(_make_access_token()))

    assert res.status_code == 200, res.text
    assert res.json() == {"ok": True}


def test_invalid_bearer_post_without_csrf_returns_401(make_middleware_client):
    """The CSRF exemption is not an auth bypass: junk Bearer still fails closed."""
    client = make_middleware_client()

    res = client.post("/api/mutate", headers=_bearer("junk"))

    assert res.status_code == 401
    assert res.json()["detail"]["code"] == "token_invalid"


def test_cookie_post_without_csrf_token_still_blocked(make_middleware_client, monkeypatch):
    """Cookie-authenticated requests keep the double-submit requirement."""
    from types import SimpleNamespace

    async def fake_cookie_user(request):
        return SimpleNamespace(id="cookie-user", email="cookie@test.local", system_role="user", needs_setup=False)

    monkeypatch.setattr("app.gateway.deps.get_current_user_from_request", fake_cookie_user)
    client = make_middleware_client()

    res = client.post("/api/mutate", cookies={"access_token": "valid-looking-session"})

    assert res.status_code == 403
    assert res.json()["detail"] == "CSRF token missing. Include X-CSRF-Token header."
