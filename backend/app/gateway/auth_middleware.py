"""Global authentication middleware — fail-closed safety net.

Rejects unauthenticated requests to non-public paths with 401. When a
request passes the cookie check, resolves the JWT payload to a real
``User`` object and stamps it into both ``request.state.user`` and the
``deerflow.runtime.user_context`` contextvar so that repository-layer
owner filtering works automatically via the sentinel pattern.

Fine-grained permission checks remain in authz.py decorators.
"""

import logging
from collections.abc import Callable

import jwt
from fastapi import HTTPException, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

from app.gateway.auth.errors import AuthErrorCode, AuthErrorResponse
from app.gateway.auth.pat import PAT_TOKEN_PREFIX
from app.gateway.auth_disabled import (
    AUTH_SOURCE_AUTH_DISABLED,
    AUTH_SOURCE_INTERNAL,
    AUTH_SOURCE_PAT,
    AUTH_SOURCE_SESSION,
    get_auth_disabled_user,
    is_auth_disabled,
)
from app.gateway.authz import AuthContext, resolve_route_permissions
from app.gateway.internal_auth import INTERNAL_AUTH_HEADER_NAME, get_internal_user, is_valid_internal_auth_token
from app.gateway.request_path import get_request_route_path
from deerflow.config.auth_config import OIDCProviderConfig
from deerflow.runtime.user_context import reset_current_user, set_current_user

logger = logging.getLogger(__name__)

# Marker stamped on requests authenticated through the Authorization header
# (``request.state.auth_scheme``). Distinct from ``auth_source``, which stays
# "session" for Bearer logins so every downstream resolver treats them exactly
# like cookie sessions.
AUTH_SCHEME_BEARER = "bearer"

# Paths that never require authentication.
_PUBLIC_PATH_PREFIXES: tuple[str, ...] = (
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
    "/api/v1/auth/oauth/",
    "/api/v1/auth/callback/",
    # Inbound webhooks authenticate themselves via provider-specific signatures
    # (e.g. GitHub's X-Hub-Signature-256), not session cookies.
    "/api/webhooks/",
)

# Exact auth paths that are public (login/register/status check).
# /api/v1/auth/me, /api/v1/auth/change-password etc. are NOT public.
_PUBLIC_EXACT_PATHS: frozenset[str] = frozenset(
    {
        "/api/v1/auth/login/local",
        "/api/v1/auth/register",
        "/api/v1/auth/logout",
        "/api/v1/auth/setup-status",
        "/api/v1/auth/initialize",
        "/api/v1/auth/providers",
        # WIT Shell iframe exchange: the caller's credential is the Keycloak ID
        # token in the body, not a DeerFlow session cookie.
        "/api/v1/auth/token-exchange",
    }
)


def _is_public(path: str) -> bool:
    stripped = path.rstrip("/")
    if stripped in _PUBLIC_EXACT_PATHS:
        return True
    return any(path.startswith(prefix) for prefix in _PUBLIC_PATH_PREFIXES)


def get_bearer_token(request: Request) -> str | None:
    """Extract the raw token from an ``Authorization: Bearer <token>`` header.

    Returns ``None`` when the header is absent, carries a different auth
    scheme, or has an empty credential. The scheme comparison is
    case-insensitive per RFC 7235.
    """
    authorization = request.headers.get("Authorization")
    if not authorization:
        return None
    scheme, separator, credential = authorization.partition(" ")
    if not separator or scheme.lower() != "bearer":
        return None
    credential = credential.strip()
    return credential or None


def _match_bearer_oidc_provider(issuer: str | None) -> tuple[str, OIDCProviderConfig] | None:
    """Select the configured OIDC provider whose issuer matches ``iss``.

    Trailing-slash differences are tolerated (the same normalization
    ``OIDCService.discover`` applies); anything else must match exactly. The
    strict ``iss`` equality inside JWT validation backstops the selection, so
    a merely-similar issuer can never authenticate.
    """
    if not issuer or not isinstance(issuer, str):
        return None
    from deerflow.config.app_config import get_app_config

    oidc_config = get_app_config().auth.oidc
    if not oidc_config.enabled:
        return None
    normalized = issuer.rstrip("/")
    for provider_id, provider_config in oidc_config.providers.items():
        if provider_config.issuer.rstrip("/") == normalized:
            return provider_id, provider_config
    return None


def _bearer_rejected(message: str) -> HTTPException:
    """401 for a presented-but-invalid Bearer credential (token_invalid)."""
    return HTTPException(
        status_code=401,
        detail=AuthErrorResponse(code=AuthErrorCode.TOKEN_INVALID, message=message).model_dump(),
    )


async def get_user_from_bearer_token(token: str):
    """Resolve an ``Authorization: Bearer`` OIDC access token to a ``User``.

    Direct-Bearer authentication for the micro-frontend deployment (plan
    §3.4): the token's ``iss`` selects the configured provider, the signature
    / ``iss`` / ``exp`` are verified offline against the provider's JWKS with
    the relaxed access-token audience matrix (``azp == client_id`` or
    ``client_id ∈ aud``), and the identity resolves through the same
    ``get_or_provision_oidc_user`` path as the OIDC callback and token
    exchange. Raises ``HTTPException`` 401 (``token_invalid``) when no
    provider matches the issuer or validation fails; provisioning denials
    keep their own status codes, mirroring the cookie branch.
    """
    try:
        unverified = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        raise _bearer_rejected("Bearer token is malformed") from None

    matched = _match_bearer_oidc_provider(unverified.get("iss"))
    if matched is None:
        raise _bearer_rejected("Bearer token issuer does not match a configured SSO provider")
    provider_id, provider_config = matched

    from app.gateway.auth.oidc import OIDCError
    from app.gateway.routers.auth import _get_oidc_service

    service = _get_oidc_service()
    overrides = {
        "authorization_endpoint": provider_config.authorization_endpoint,
        "token_endpoint": provider_config.token_endpoint,
        "userinfo_endpoint": provider_config.userinfo_endpoint,
        "jwks_uri": provider_config.jwks_uri,
    }
    try:
        metadata = await service.discover(provider_config.issuer, overrides)
    except OIDCError as exc:
        logger.warning("Bearer authentication could not resolve OIDC metadata for provider %s: %s", provider_id, exc)
        raise _bearer_rejected("Bearer token could not be validated against its issuer") from exc

    try:
        claims = await service.validate_access_token(metadata, provider_config.client_id, token)
    except OIDCError as exc:
        logger.warning("Bearer authentication rejected an access token for provider %s: %s", provider_id, exc)
        raise _bearer_rejected("Access token validation failed") from exc

    from app.gateway.auth.oidc import OIDCIdentity
    from app.gateway.auth.user_provisioning import get_or_provision_oidc_user
    from app.gateway.deps import get_local_provider

    identity = OIDCIdentity(
        provider=provider_id,
        subject=claims["sub"],
        email=claims.get("email") or "",
        email_verified=claims.get("email_verified") is True,
        name=claims.get("name"),
        claims=claims,
    )
    result = await get_or_provision_oidc_user(provider_id, provider_config, identity, get_local_provider())
    return result["user"]


class AuthMiddleware(BaseHTTPMiddleware):
    """Strict auth gate: reject requests without a valid session.

    Two-stage check for non-public paths:

    1. Credential presence (priority: internal > bearer > cookie) — return
       401 NOT_AUTHENTICATED if missing
    2. Strict validation of the presented credential — return 401
       TOKEN_INVALID if the token is absent, malformed, expired, or the
       signed user does not exist / is stale. A Bearer credential is
       dispatched by format: ``dfp_``-prefixed tokens authenticate as PATs
       (``app.gateway.auth.pat.authenticate_pat``), anything else is
       validated offline against the OIDC provider's JWKS
       (``get_user_from_bearer_token``); an invalid one never falls back to
       the session cookie.

    On success, stamps ``request.state.user`` and the
    ``deerflow.runtime.user_context`` contextvar so that repository-layer
    owner filters work downstream without every route needing a
    ``@require_auth`` decorator. Routes that need per-resource
    authorization (e.g. "user A cannot read user B's thread by guessing
    the URL") should additionally use ``@require_permission(...,
    owner_check=True)`` for explicit enforcement — but authentication
    itself is fully handled here.
    """

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if _is_public(get_request_route_path(request)):
            return await call_next(request)

        internal_user = None
        if is_valid_internal_auth_token(request.headers.get(INTERNAL_AUTH_HEADER_NAME)):
            # Extract the channel owner user ID from the trusted header.
            # When present, the synthetic internal user carries the actual
            # owner identity so that get_effective_user_id() and per-user
            # filesystem paths (custom skills, memory, thread data) resolve
            # to the IM channel user instead of falling back to "default".
            from app.gateway.internal_auth import INTERNAL_OWNER_USER_ID_HEADER_NAME

            owner_user_id = request.headers.get(INTERNAL_OWNER_USER_ID_HEADER_NAME)
            if owner_user_id:
                owner_user_id = owner_user_id.strip()
            internal_user = get_internal_user(owner_user_id=owner_user_id or None)

        auth_source = AUTH_SOURCE_SESSION
        access_token = request.cookies.get("access_token")
        authorization = request.headers.get("authorization")
        bearer_token = get_bearer_token(request)
        pat_scopes: frozenset[str] = frozenset()

        # Non-public path: require credentials (priority: internal > bearer > cookie)
        if internal_user is not None:
            user = internal_user
            auth_source = AUTH_SOURCE_INTERNAL
        elif authorization is not None and not is_auth_disabled():
            # Bearer credential precedence (#4849 + plan §3.4): a
            # present-but-invalid Authorization header is a hard 401 and never
            # silently falls back to the session cookie. This is also what
            # makes the CSRF middleware's Authorization-header skip safe — a
            # cross-site attacker cannot ride a victim's cookie by padding the
            # request with a garbage Authorization header, because the request
            # dies here before any route runs. Auth-disabled mode is an
            # operator override of all authentication, so it stays ahead of the
            # Bearer check (a stray Authorization header from a proxy must not
            # 401 an E2E sandbox). Dispatch is by credential format:
            # ``dfp_``-prefixed tokens authenticate as PATs, any other Bearer
            # credential is validated as an OIDC access token.
            if bearer_token is not None and bearer_token.startswith(PAT_TOKEN_PREFIX):
                from app.gateway.auth.pat import authenticate_pat, is_pat_allowed_route

                try:
                    user, pat_scopes = await authenticate_pat(request.app, authorization)
                except HTTPException as exc:
                    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
                # Default-deny route boundary (#5041 review P1-1): scopes only
                # constrain @require_permission routes, so any route outside the
                # explicit PAT policy is closed to PAT callers outright — an
                # all-scopes token must not reach undecorated mutation routes.
                if not is_pat_allowed_route(request.method, get_request_route_path(request)):
                    return JSONResponse(
                        status_code=403,
                        content={"detail": "PAT credentials are not permitted on this route"},
                    )
                auth_source = AUTH_SOURCE_PAT
            elif bearer_token is not None:
                # Direct-Bearer branch (micro-frontend deployment, plan §3.4):
                # validated strictly against the OIDC provider's JWKS. Success
                # keeps auth_source at "session" so every downstream resolver
                # treats the request exactly like a cookie session.
                try:
                    user = await get_user_from_bearer_token(bearer_token)
                    request.state.auth_scheme = AUTH_SCHEME_BEARER
                except HTTPException as exc:
                    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
            else:
                # Present-but-unusable Authorization header (empty credential
                # or a non-Bearer scheme): the same generic 401 every invalid
                # credential gets, never a silent fall back to the cookie.
                return JSONResponse(status_code=401, content={"detail": "Invalid token"})
        elif bearer_token is not None and not bearer_token.startswith(PAT_TOKEN_PREFIX) and is_auth_disabled():
            # Auth-disabled mode with a non-PAT Bearer credential: validation
            # still runs so a valid OIDC access token resolves its real user,
            # but an invalid one degrades to the auth-disabled user instead of
            # 401ing an E2E sandbox. PATs stay ignored here — auth-disabled is
            # an operator override of all credential checks.
            try:
                user = await get_user_from_bearer_token(bearer_token)
                request.state.auth_scheme = AUTH_SCHEME_BEARER
            except HTTPException:
                user = get_auth_disabled_user()
                auth_source = AUTH_SOURCE_AUTH_DISABLED
        elif access_token:
            # Strict JWT validation: reject junk/expired tokens with 401
            # right here instead of silently passing through. This closes
            # the "junk cookie bypass" gap (AUTH_TEST_PLAN test 7.5.8):
            # without this, non-isolation routes like /api/models would
            # accept any cookie-shaped string as authentication.
            #
            # We call the *strict* resolver so that fine-grained error
            # codes (token_expired, token_invalid, user_not_found, …)
            # propagate from AuthErrorCode, not get flattened into one
            # generic code. BaseHTTPMiddleware doesn't let HTTPException
            # bubble up, so we catch and render it as JSONResponse here.
            from app.gateway.deps import get_current_user_from_request

            try:
                user = await get_current_user_from_request(request)
            except HTTPException as exc:
                if not is_auth_disabled():
                    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
                user = get_auth_disabled_user()
                auth_source = AUTH_SOURCE_AUTH_DISABLED
        elif is_auth_disabled():
            user = get_auth_disabled_user()
            auth_source = AUTH_SOURCE_AUTH_DISABLED
        else:
            return JSONResponse(
                status_code=401,
                content={
                    "detail": AuthErrorResponse(
                        code=AuthErrorCode.NOT_AUTHENTICATED,
                        message="Authentication required",
                    ).model_dump()
                },
            )

        # Stamp both request.state.user (for the contextvar pattern)
        # and request.state.auth (so @require_permission's "auth is
        # None" branch short-circuits instead of running the entire
        # JWT-decode + DB-lookup pipeline a second time per request).
        request.state.user = user
        request.state.auth_source = auth_source
        permissions = await resolve_route_permissions(
            user,
            is_internal=auth_source == AUTH_SOURCE_INTERNAL,
        )
        if auth_source == AUTH_SOURCE_PAT:
            # A PAT can only narrow its owning user's permissions: the stored
            # scopes intersect the resolved route permissions, never widen
            # them, and role changes / authorization policy stay authoritative
            # because they were resolved fresh from the owning user above.
            permissions = [permission for permission in permissions if permission in pat_scopes]
        request.state.auth = AuthContext(user=user, permissions=permissions)
        token = set_current_user(user)
        try:
            return await call_next(request)
        finally:
            reset_current_user(token)
