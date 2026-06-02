# Cross-Origin Browser Client Integration Design

**Date**: 2026-06-01
**Status**: Approved
**Author**: je88e

## Context

DeerFlow's cookie-based authentication (access_token SameSite=Lax + csrf_token SameSite=Strict) blocks external browser frontend applications from authenticating cross-origin. Users who want to embed DeerFlow components in their own web pages cannot complete the auth flow because the browser refuses to send cookies on cross-origin POST requests.

This design solves that problem while preserving all existing security invariants.

## Goal

Enable any browser-based frontend application (regardless of origin) to:

1. Authenticate with DeerFlow backend (login/register/initialize)
2. Make authenticated API calls (threads, runs, models, memory, skills, etc.)
3. Comply with CSRF protection

No new configuration knobs. No breaking changes to existing same-origin deployments.

## Design Decision

**Approach A: Dynamic SameSite based on request scheme** (selected)

- HTTPS requests → `SameSite=None; Secure=True` (cross-origin capable)
- HTTP requests → existing behavior: `SameSite=Lax` for auth, `SameSite=Strict` for CSRF (same-origin only)

This leverages the existing `is_secure_request()` infrastructure already used for the `secure` flag. Zero new config, minimal code delta.

## Implementation

### 1. Dynamic session cookie SameSite

**File**: `backend/app/gateway/routers/auth.py` — `_set_session_cookie()`

Change samesite from hardcoded `"lax"` to dynamic:

```python
samesite = "none" if is_https else "lax"
response.set_cookie(
    key="access_token",
    value=token,
    httponly=True,
    secure=is_https,
    samesite=samesite,
    max_age=config.token_expiry_days * 24 * 3600 if is_https else None,
    path="/",
)
```

### 2. Dynamic CSRF cookie SameSite

**File**: `backend/app/gateway/csrf_middleware.py` — CSRF cookie setting block

Change samesite from hardcoded `"strict"` to dynamic:

```python
samesite = "none" if is_https else "strict"
response.set_cookie(
    key="csrf_token",
    value=csrf_token,
    httponly=False,
    secure=is_https,
    samesite=samesite,
    path="/",
)
```

### 3. Nginx production config fix

**File**: `docker/nginx/nginx.conf` — `/api/` location block

Add missing `proxy_pass_header Set-Cookie;` (already present in local config):

```nginx
location /api/ {
    # ... existing proxy_set_header directives ...
    proxy_pass_header Set-Cookie;   # NEW
    # ... rest unchanged ...
}
```

### 4. Integration guide (new file)

**File**: `backend/docs/THIRD_PARTY_INTEGRATION.md`

Sections:

1. Overview — supported scenarios, architecture diagram
2. Prerequisites — `GATEWAY_CORS_ORIGINS` config, HTTPS requirement
3. Authentication Flow — step-by-step: setup-status → initialize/login → me
4. Cookie & CSRF — two-cookie design, Double Submit Cookie pattern, code example
5. API Reference — endpoint table (models, threads, runs, memory, skills, uploads, artifacts)
6. Code Snippets — JS fetch examples for login, CSRF, streaming
7. Troubleshooting — CORS errors, cookie not sent, 403 CSRF, Nginx cookie stripping

### 5. Demo client (new file)

**File**: `backend/docs/examples/standalone-client.html`

Zero-dependency, single-file HTML/JS demo that:

- Connects to a configurable DeerFlow URL
- Implements full auth flow (setup-status, initialize, login, register, logout, me)
- Automatically injects CSRF token on state-changing requests
- Uses `credentials: "include"` on all fetch calls
- Displays API responses in a scrollable log area
- Provides inline error hints for common misconfigurations (CORS, cookie, CSRF)

## Security Invariants (unchanged)

- JWT only transmitted in HttpOnly cookies (never in response JSON)
- `token_version` mismatch still rejects old sessions after password change
- Client `metadata.user_id` / `metadata.owner_id` still stripped server-side
- Repository `AUTO` still resolves from current user context (no silent global queries)
- Migration/admin scripts still the only callers allowed to pass `user_id=None`
- Double Submit Cookie CSRF validation unchanged
- Origin check for auth endpoints unchanged (reads `GATEWAY_CORS_ORIGINS`)

## What Does NOT Change

- No new auth mechanism (no Bearer token API, no API keys)
- No new environment variables or config fields
- No changes to rate limiting, JWT structure, user model, or repository isolation
- HTTP (non-HTTPS) behavior is identical to current — `SameSite=Lax`/`Strict` preserved
- Internal auth (`X-DeerFlow-Internal-Token`) unchanged
- Existing same-origin deployments continue working without any config changes

## Browser Support

SameSite=None cookies require:

- Chrome 80+ (Feb 2020)
- Firefox 69+ (Sep 2019)
- Safari 13+ (Sep 2019)

All modern browsers are compatible.

## Verification Plan

1. **Unit tests**: Verify `_set_session_cookie` sets correct SameSite for HTTP vs HTTPS
2. **Manual test with demo client**:
   - Start DeerFlow with HTTPS nginx
   - Set `GATEWAY_CORS_ORIGINS` to include the demo client origin
   - Open `standalone-client.html` from a different origin
   - Step through: check-setup → initialize-admin → login → GET /me → create thread → logout
3. **Existing test suite**: `make test` must pass unchanged
4. **Same-origin regression**: Existing frontend login flow must work unchanged
