import { isEmbedAuthActive, renewEmbedSession } from "@/core/auth/embed-auth";
import { buildLoginUrl } from "@/core/auth/types";
import { basePath, stripBasePath } from "@/env";

import { UnauthorizedError } from "./errors";

/** HTTP methods that the gateway's CSRFMiddleware checks. */
export type StateChangingMethod = "POST" | "PUT" | "DELETE" | "PATCH";

export const STATE_CHANGING_METHODS: ReadonlySet<StateChangingMethod> = new Set(
  ["POST", "PUT", "DELETE", "PATCH"],
);

/** Mirror of the gateway's ``should_check_csrf`` decision. */
export function isStateChangingMethod(method: string): boolean {
  return (STATE_CHANGING_METHODS as ReadonlySet<string>).has(
    method.toUpperCase(),
  );
}

const CSRF_COOKIE_PREFIX = "csrf_token=";

/**
 * Read the ``csrf_token`` cookie set by the gateway at login.
 *
 * SSR-safe: returns ``null`` when ``document`` is undefined so the same
 * helper can be imported from server components without a guard.
 *
 * Uses `String.split` instead of a regex to side-step ESLint's
 * `prefer-regexp-exec` rule and the cookie value's reliable `; `
 * separator (set by the gateway, not the browser, so format is stable).
 */
export function readCsrfCookie(): string | null {
  if (typeof document === "undefined") return null;
  for (const pair of document.cookie.split("; ")) {
    if (pair.startsWith(CSRF_COOKIE_PREFIX)) {
      return decodeURIComponent(pair.slice(CSRF_COOKIE_PREFIX.length));
    }
  }
  return null;
}

/**
 * Merge the CSRF header into ``headers`` for state-changing methods, reading
 * the cookie fresh on every call. GET/HEAD/OPTIONS/TRACE skip it to mirror
 * the gateway's ``should_check_csrf`` logic exactly. Caller-supplied headers
 * win: the helper only ADDS the header when it isn't already present, and it
 * never mutates the caller's Headers instance.
 */
function mergeCsrfHeaders(
  method: string,
  headers: HeadersInit | undefined,
): HeadersInit | undefined {
  if (!isStateChangingMethod(method)) {
    return headers;
  }
  const token = readCsrfCookie();
  if (!token) {
    return headers;
  }
  // Fresh Headers instance so we don't mutate caller-supplied objects.
  const merged = new Headers(headers);
  if (!merged.has("X-CSRF-Token")) {
    merged.set("X-CSRF-Token", token);
  }
  return merged;
}

/**
 * Fetch with credentials and automatic CSRF protection.
 *
 * Two centralized contracts every API call needs:
 *
 * 1. ``credentials: "include"`` so the HttpOnly access_token cookie
 *    accompanies cross-origin SSR-routed requests.
 * 2. ``X-CSRF-Token`` header on state-changing methods (POST/PUT/
 *    DELETE/PATCH), echoed from the ``csrf_token`` cookie. The gateway's
 *    CSRFMiddleware enforces Double Submit Cookie comparison and returns
 *    403 if the header is missing — silently breaking every call site
 *    that uses raw ``fetch()`` instead of this wrapper.
 *
 * On 401 the request auto-redirects to ``/login`` — except inside the WIT
 * Shell iframe (EMBED mode), where an expired session is first renewed
 * silently through the bridge and the request replayed once (plan §10.1).
 */
export async function fetch(
  input: RequestInfo | string,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input.url;
  const method = init?.method ?? "GET";

  const headers = mergeCsrfHeaders(method, init?.headers);

  const res = await globalThis.fetch(url, {
    ...init,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    // §10.1 silent renewal: with an active Shell bridge, ask for a fresh ID
    // token and re-run token-exchange, then replay the request once. The
    // gate is inert outside EMBED mode, where the redirect below runs
    // exactly as before.
    if (isEmbedAuthActive() && (await renewEmbedSession())) {
      const retried = await globalThis.fetch(url, {
        ...init,
        // The renewal's token-exchange rotates the session/CSRF cookies, so
        // the replay rebuilds the CSRF header from the fresh cookie rather
        // than reusing the pre-renewal token (which would 403).
        headers: mergeCsrfHeaders(method, init?.headers),
        credentials: "include",
      });
      if (retried.status !== 401) {
        return retried;
      }
    }
    // Hard navigation (no Next router): apply the base path manually, and
    // strip it from the return path so the post-login redirect stays a
    // router-relative path (the router re-applies the base path itself).
    const base = basePath();
    const returnPath = stripBasePath(window.location.pathname);
    window.location.href = `${base}${buildLoginUrl(returnPath)}`;
    throw new UnauthorizedError();
  }

  return res;
}

/**
 * Build headers for CSRF-protected requests.
 *
 * **Prefer :func:`fetchWithAuth`** for new code — it injects the header
 * automatically on state-changing methods. This helper exists for legacy
 * call sites that need to compose headers manually (e.g. inside
 * `next/server` route handlers that build their own ``Headers`` object).
 *
 * Per RFC-001: Double Submit Cookie pattern.
 */
export function getCsrfHeaders(): HeadersInit {
  const token = readCsrfCookie();
  return token ? { "X-CSRF-Token": token } : {};
}
