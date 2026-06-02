# Third-Party Browser Client Integration Guide

Guide for integrating external browser frontend applications with the DeerFlow backend.

## 1. Overview

DeerFlow uses **cookie-based authentication** with a **Double Submit Cookie CSRF** pattern. External browser applications (running on a different origin) can authenticate and call the DeerFlow API — provided the backend is accessed over **HTTPS** and CORS is configured.

**Supported scenarios:**

- A standalone HTML/JS dashboard that calls DeerFlow APIs
- A React/Vue/Angular app embedded in an iframe or separate tab
- A Chrome extension or browser-based tool

**Architecture:**

```
External Browser App (https://app.example.com)
       │
       │  fetch(url, { credentials: "include" })
       │  X-CSRF-Token: <csrf_token from cookie>
       ▼
DeerFlow Nginx (https://deerflow.example.com:2026)
       │
       │  proxy_pass + proxy_pass_header Set-Cookie
       ▼
DeerFlow Gateway (Uvicorn, port 8001)
       │
       │  CORS: allow_credentials=True, origins=GATEWAY_CORS_ORIGINS
       │  CSRF: Double Submit Cookie validation
       │  Auth: JWT in HttpOnly cookie
       ▼
```

## 2. Prerequisites

### 2.1 HTTPS (Required)

Cross-origin cookie sharing requires `SameSite=None; Secure`, which only works over HTTPS. The DeerFlow backend automatically switches to `SameSite=None` when it detects an HTTPS request (via `X-Forwarded-Proto` header set by nginx).

**Local development:** Use mkcert to generate local certificates. See `docker/nginx/` for the nginx SSL configuration.

### 2.2 CORS Configuration

Set the `GATEWAY_CORS_ORIGINS` environment variable to a comma-separated list of allowed origins:

```bash
# .env or docker-compose.yml
GATEWAY_CORS_ORIGINS=https://app.example.com,https://admin.example.com
```

This single variable controls both:
- **CORS middleware** (`Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials`)
- **CSRF origin validation** (auth endpoints check the `Origin` header against this list)

Without this, cross-origin requests will fail with CORS errors.

### 2.3 Nginx Configuration

The production nginx config must include `proxy_pass_header Set-Cookie;` in the `/api/` location block. This is already included in the default configuration.

## 3. Authentication Flow

### 3.1 Step-by-Step

```
1. GET  /api/v1/auth/setup-status     → Check if system is initialized
2. POST /api/v1/auth/initialize        → (First run only) Create admin account
3. POST /api/v1/auth/login/local       → Login, receive cookies
4. GET  /api/v1/auth/me                → Verify authentication
```

### 3.2 Check Setup Status

```javascript
const res = await fetch("https://deerflow.example.com:2026/api/v1/auth/setup-status", {
  credentials: "include",
});
const { status } = await res.json();
// status: "not_initialized" | "ready"
```

### 3.3 Initialize (First Run)

```javascript
const formData = new URLSearchParams();
formData.append("name", "Admin");
formData.append("email", "admin@example.com");
formData.append("password", "your-secure-password");

const res = await fetch("https://deerflow.example.com:2026/api/v1/auth/initialize", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: formData,
  credentials: "include",
});
```

On success, the backend sets `access_token` (HttpOnly) and `csrf_token` cookies.

### 3.4 Login

```javascript
const formData = new URLSearchParams();
formData.append("username", "admin@example.com");
formData.append("password", "your-secure-password");

const res = await fetch("https://deerflow.example.com:2026/api/v1/auth/login/local", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: formData,
  credentials: "include",
});
```

On success, the backend sets fresh `access_token` and `csrf_token` cookies.

### 3.5 Verify Authentication

```javascript
const res = await fetch("https://deerflow.example.com:2026/api/v1/auth/me", {
  credentials: "include",
});
const user = await res.json();
// { user_id: "...", email: "...", name: "..." }
```

## 4. Cookie & CSRF Design

### 4.1 Two Cookies

| Cookie | HttpOnly | Purpose |
|--------|----------|---------|
| `access_token` | Yes | JWT for authentication. Never accessible to JavaScript. |
| `csrf_token` | No | CSRF token. JavaScript must read it to inject the `X-CSRF-Token` header. |

Both cookies use `SameSite=Lax` on HTTP and `SameSite=None; Secure` on HTTPS.

### 4.2 Double Submit Cookie Pattern

For all state-changing requests (POST, PUT, DELETE, PATCH), the client must:

1. Obtain the CSRF token value from the login/initialize response
2. Send it as the `X-CSRF-Token` request header on subsequent requests
3. The gateway compares the header value with the cookie value (constant-time)

**Critical cross-origin detail:** `document.cookie` cannot read cookies set by a different origin due to the browser's Same-Origin Policy. The DeerFlow backend provides the CSRF token value through two channels:

1. **Response header** `X-CSRF-Token` on login/initialize/register POST responses (works cross-origin via CORS `Access-Control-Expose-Headers`)
2. **`document.cookie`** only for same-origin clients

### 4.3 Required Headers Per Method

| Method | Headers Required |
|--------|-----------------|
| GET, HEAD, OPTIONS | `credentials: "include"` only |
| POST, PUT, DELETE, PATCH | `credentials: "include"` + `X-CSRF-Token: <csrf_token>` |

### 4.4 CSRF Helper Function

**Cross-origin approach (recommended for third-party clients):**

Read the token from the login/initialize response header — this works regardless of origin:

```javascript
let csrfToken = null;  // Store in memory, NOT localStorage

async function login(email, password) {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const res = await fetch(`${BASE}/auth/login/local`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
    credentials: "include",
  });

  if (!res.ok) throw new Error("Login failed");

  // Capture CSRF token from response header (works cross-origin)
  csrfToken = res.headers.get("X-CSRF-Token");

  return res.json();
}

function csrfHeaders() {
  return csrfToken ? { "X-CSRF-Token": csrfToken } : {};
}

async function apiFetch(url, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isStateChanging = ["POST", "PUT", "DELETE", "PATCH"].includes(method);

  const headers = new Headers(options.headers);
  if (isStateChanging && csrfToken) {
    headers.set("X-CSRF-Token", csrfToken);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    csrfToken = null;
    window.dispatchEvent(new CustomEvent("deerflow:unauthorized"));
  }

  return res;
}
```

**Same-origin fallback (only works when the client is served from the same origin as the API):**

```javascript
function readCsrfFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}
```

## 5. API Reference

Base URL: `https://<host>:2026/api/v1`

### Authentication

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| GET | `/auth/setup-status` | No | Check if system is initialized |
| POST | `/auth/initialize` | No | Create first admin user |
| POST | `/auth/login/local` | No | Login with email/password |
| POST | `/auth/logout` | Yes | Clear session |
| GET | `/auth/me` | Yes | Get current user info |
| POST | `/auth/change-password` | Yes | Change password |

### Threads

| Method | Path | Description |
|--------|------|-------------|
| GET | `/threads` | List threads |
| POST | `/threads` | Create thread |
| GET | `/threads/{thread_id}` | Get thread |
| DELETE | `/threads/{thread_id}` | Delete thread |
| GET | `/threads/{thread_id}/state` | Get thread state |

### Runs (Streaming)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/runs/stream` | Create and stream a run (SSE) |
| POST | `/runs/wait` | Create and wait for run completion |

### Models

| Method | Path | Description |
|--------|------|-------------|
| GET | `/models` | List available models |

### Memory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/memory` | List memory items |
| POST | `/memory` | Create memory item |
| DELETE | `/memory/{memory_id}` | Delete memory item |

### Skills

| Method | Path | Description |
|--------|------|-------------|
| GET | `/skills` | List installed skills |

### Uploads

| Method | Path | Description |
|--------|------|-------------|
| POST | `/threads/{thread_id}/uploads` | Upload file to thread |

## 6. Code Snippets

### 6.1 Full Login Flow

```javascript
const BASE = "https://deerflow.example.com:2026/api/v1";

async function login(email, password) {
  const formData = new URLSearchParams();
  formData.append("username", email);
  formData.append("password", password);

  const res = await fetch(`${BASE}/auth/login/local`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData,
    credentials: "include",
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.detail || "Login failed");
  }

  return res.json();
}
```

### 6.2 Streaming Run

```javascript
async function streamRun(threadId, message) {
  const body = JSON.stringify({
    thread_id: threadId,
    input: { messages: [{ role: "user", content: message }] },
    config: {},
    stream_mode: ["messages", "custom"],
  });

  const res = await fetch(`${BASE}/runs/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(),
    },
    body,
    credentials: "include",
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    // Parse SSE events from chunk
    const lines = chunk.split("\n");
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));
        console.log("Event:", data);
      }
    }
  }
}
```

### 6.3 Create Thread

```javascript
async function createThread(title) {
  const res = await apiFetch(`${BASE}/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });

  return res.json();
}
```

## 7. Troubleshooting

### CORS Error: "No 'Access-Control-Allow-Origin' header"

**Cause:** `GATEWAY_CORS_ORIGINS` not set, or doesn't include the requesting origin.

**Fix:** Set `GATEWAY_CORS_ORIGINS` to include your app's origin exactly (no trailing slash):

```bash
GATEWAY_CORS_ORIGINS=https://app.example.com
```

### Cookie Not Set After Login

**Cause A:** Not using HTTPS. `SameSite=None` requires `Secure=True`, which browsers only accept over HTTPS.

**Fix:** Access DeerFlow over HTTPS. For local dev, use mkcert certificates.

**Cause B:** Nginx is stripping the `Set-Cookie` header.

**Fix:** Ensure `proxy_pass_header Set-Cookie;` is present in the `/api/` location block in `nginx.conf`.

**Cause C:** Missing `credentials: "include"` in fetch options.

**Fix:** Add `credentials: "include"` to every fetch call:

```javascript
fetch(url, { credentials: "include" })
```

### 403 CSRF Token Missing / Mismatch

**Cause:** `X-CSRF-Token` header not sent on state-changing requests, or value doesn't match the `csrf_token` cookie.

**Fix for cross-origin clients:** Capture the token from the login/initialize response header:

```javascript
// After login/initialize
const csrfToken = res.headers.get("X-CSRF-Token");
// Send on subsequent state-changing requests
headers["X-CSRF-Token"] = csrfToken;
```

**Fix for same-origin clients only:** Read from `document.cookie` (won't work cross-origin):

```javascript
const token = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/)?.[1];
headers["X-CSRF-Token"] = decodeURIComponent(token);
```

### 401 Unauthorized on Authenticated Endpoints

**Cause A:** `access_token` cookie not sent by browser. Check that `credentials: "include"` is set and the request is over HTTPS.

**Cause B:** Token expired. Default expiry is configured in `AUTH_TOKEN_EXPIRY_DAYS`.

**Fix:** Re-authenticate by calling the login endpoint again.

### Preflight OPTIONS Request Fails

**Cause:** CORS preflight not handled. The DeerFlow CORS middleware handles this automatically when `GATEWAY_CORS_ORIGINS` is set.

**Fix:** Verify `GATEWAY_CORS_ORIGINS` is configured and the origin matches exactly.
