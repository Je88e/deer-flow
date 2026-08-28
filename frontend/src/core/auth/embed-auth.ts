/**
 * EMBED-mode authentication orchestration for the WIT Shell iframe
 * integration (plan §3.1 frontend side / §5.1 / §10.1).
 *
 * First-entry sequence (§2 steps 4-8): handshake → AUTH_TOKEN →
 * POST /api/v1/auth/token-exchange (session cookie) → READY { threadId };
 * failures are reported to the Shell via AUTH_FAILED.
 *
 * 401 silent renewal (§10.1): AUTH_TOKEN_REQUEST { reason: "session-expired" }
 * → new AUTH_TOKEN → re-exchange, single-flight so concurrent 401s trigger
 * exactly one AUTH_TOKEN_REQUEST.
 *
 * LOGOUT (§5.1 + controller ruling #4): the bridge client only exposes the
 * onLogout subscription; the keepalive Gateway logout request lives here.
 *
 * Discipline (§3.4): the Keycloak ID token exists only in local variables —
 * never localStorage — and the WitAI session stays in the Gateway's
 * HttpOnly cookie.
 */

import { UnauthorizedError } from "@/core/api/errors";
import { type IframeBridgeClient } from "@/core/bridge/iframe-bridge-client";
import { apiBase } from "@/env";

/** Reason attached to AUTH_TOKEN_REQUEST when a 401 means the session expired. */
export const SESSION_EXPIRED_REASON = "session-expired";

/** Codes carried by AUTH_FAILED payloads (plan §5.1: `{ error, code }`). */
export const EMBED_AUTH_FAILED_CODES = {
  /** The Shell answered the handshake but never delivered an AUTH_TOKEN. */
  tokenTimeout: "E_TOKEN_TIMEOUT",
  /** token-exchange rejected the ID token (or the request itself failed). */
  exchangeFailed: "E_EXCHANGE_FAILED",
} as const;

export type EmbedAuthResult =
  | { status: "authenticated" }
  | { status: "no-bridge"; error: Error }
  | { status: "failed"; error: Error; code: string };

/** Raised internally when token-exchange answers a non-2xx status. */
export class EmbedAuthExchangeError extends Error {
  constructor(readonly httpStatus: number) {
    super(`token-exchange failed with HTTP ${httpStatus}`);
    this.name = "EmbedAuthExchangeError";
  }
}

export interface EmbedAuthOptions {
  /**
   * Thread id reported in READY. Empty when the route has no thread yet
   * (e.g. `/workspace/chats/new`): the payload is `{ threadId: string }` and
   * a client-generated placeholder would mean nothing to the Shell.
   */
  threadId: string;
}

// ---- module state ---------------------------------------------------------

/**
 * First-sequence promise per bridge client. authenticateViaBridge is
 * idempotent: re-mounts (thread navigation, StrictMode double effects) reuse
 * the settled result instead of re-running handshake / token wait / exchange.
 */
const firstAuthByClient = new WeakMap<
  IframeBridgeClient,
  Promise<EmbedAuthResult>
>();

/** Client of the last successful first-auth; gates the renewal path. */
let activeBridge: IframeBridgeClient | null = null;

/** Shared in-flight renewal so concurrent 401s issue one AUTH_TOKEN_REQUEST. */
let renewalInFlight: Promise<boolean> | null = null;

/** Test-only: clear the cross-call module state (not the per-client cache). */
export function resetEmbedAuthForTesting(): void {
  activeBridge = null;
  renewalInFlight = null;
}

export function isEmbedAuthActive(): boolean {
  return activeBridge !== null;
}

/**
 * Clear the active-bridge marker when the Shell ends the session (LOGOUT).
 * The Gateway session is gone, so a late 401 must not trigger a renewal
 * against a Shell that already logged the user out. Distinct from
 * resetEmbedAuthForTesting: an in-flight renewal is left to settle.
 */
export function deactivateEmbedAuth(): void {
  activeBridge = null;
}

// ---- first-entry sequence -------------------------------------------------

export function authenticateViaBridge(
  client: IframeBridgeClient,
  options: EmbedAuthOptions,
): Promise<EmbedAuthResult> {
  const cached = firstAuthByClient.get(client);
  if (cached) {
    return cached;
  }
  const pending = runFirstAuth(client, options.threadId);
  firstAuthByClient.set(client, pending);
  return pending;
}

async function runFirstAuth(
  client: IframeBridgeClient,
  threadId: string,
): Promise<EmbedAuthResult> {
  try {
    await client.handshake();
  } catch (error) {
    // Timeout (or not embedded): there is no Shell to notify, so no
    // AUTH_FAILED — the caller degrades to the standalone auth path (§10.3).
    return { status: "no-bridge", error: toError(error) };
  }

  let token: string;
  try {
    token = (await client.waitForToken()).token;
  } catch (error) {
    return authFailedResult(
      client,
      error,
      EMBED_AUTH_FAILED_CODES.tokenTimeout,
    );
  }

  try {
    await exchangeIdToken(token);
  } catch (error) {
    return authFailedResult(
      client,
      error,
      EMBED_AUTH_FAILED_CODES.exchangeFailed,
    );
  }

  activeBridge = client;
  client.sendReady(threadId);
  return { status: "authenticated" };
}

function authFailedResult(
  client: IframeBridgeClient,
  error: unknown,
  code: string,
): EmbedAuthResult {
  const authError = toError(error);
  client.sendAuthFailed(authError.message, code);
  return { status: "failed", error: authError, code };
}

/**
 * Exchange the Shell-delivered Keycloak ID token for a WitAI session
 * cookie. Body is the Task 1 contract, byte-for-byte:
 * `{ "token": "<ID token JWT>", "provider": "keycloak" }`.
 */
async function exchangeIdToken(token: string): Promise<void> {
  const response = await fetch(`${apiBase()}/v1/auth/token-exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, provider: "keycloak" }),
    credentials: "include",
  });
  if (!response.ok) {
    throw new EmbedAuthExchangeError(response.status);
  }
}

// ---- LOGOUT (§5.1, controller ruling #4) ----------------------------------

/**
 * Subscribe to Shell LOGOUT notifications and answer each one with the
 * Gateway logout request that clears the HttpOnly session/CSRF cookies
 * (frontend JS cannot delete them itself).
 *
 * `keepalive: true` keeps the request deliverable after the Shell unloads
 * the iframe; the handler is intentionally fire-and-forget (§5.1). Returns
 * the client's unsubscribe function.
 */
export function wireBridgeLogout(client: IframeBridgeClient): () => void {
  return client.onLogout(() => {
    deactivateEmbedAuth();
    void fetch(`${apiBase()}/v1/auth/logout`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
    }).catch(() => {
      // The page is going away; there is nobody left to report to.
    });
  });
}

// ---- 401 silent renewal (§10.1) --------------------------------------------

/**
 * Ask the Shell for a fresh ID token and re-run token-exchange. Single
 * flight: while one renewal runs, concurrent callers await the same attempt
 * and only one AUTH_TOKEN_REQUEST goes out. Resolves false when bridge auth
 * never succeeded or this renewal attempt failed.
 */
export async function renewEmbedSession(
  reason: string = SESSION_EXPIRED_REASON,
): Promise<boolean> {
  const client = activeBridge;
  if (!client) {
    return false;
  }
  renewalInFlight ??= (async () => {
    try {
      // Register the waiter BEFORE the request: the AUTH_TOKEN answering our
      // request then resolves it directly, while a stale unconsumed token
      // cached by the client is dropped instead of replayed into the
      // exchange (Task 3 review Minor③).
      const tokenPromise = client.waitForToken({ ignorePending: true });
      client.requestAuthToken(reason);
      const { token } = await tokenPromise;
      await exchangeIdToken(token);
      return true;
    } catch {
      return false;
    } finally {
      renewalInFlight = null;
    }
  })();
  return renewalInFlight;
}

/**
 * Run `operation` and retry it once after a silent session renewal when it
 * fails with a 401 (or resolves to a bare 401 Response). Anything else — no
 * active bridge auth, a non-401 failure, or a failed renewal — propagates
 * the original outcome untouched, so callers behave identically with and
 * without the wrapper outside EMBED mode.
 */
export async function withEmbedAuthRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  let result: T;
  try {
    result = await operation();
  } catch (error) {
    if (!isEmbedAuthActive() || !isUnauthorized(error)) {
      throw error;
    }
    if (!(await renewEmbedSession())) {
      throw error;
    }
    return operation();
  }
  if (
    result instanceof Response &&
    result.status === 401 &&
    isEmbedAuthActive() &&
    (await renewEmbedSession())
  ) {
    return operation();
  }
  return result;
}

/**
 * Match a 401 however the caller's stack surfaces it: the shared fetcher's
 * UnauthorizedError, an object carrying `status` (LangGraph SDK HTTPError),
 * or the SDK's `"HTTP 401: …"` message form (same matching style as
 * api-client.ts's conflict matcher).
 */
function isUnauthorized(error: unknown): boolean {
  if (error instanceof UnauthorizedError) {
    return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    Reflect.get(error, "status") === 401
  ) {
    return true;
  }
  return error instanceof Error && error.message.includes("HTTP 401");
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
