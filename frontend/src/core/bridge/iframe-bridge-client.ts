/**
 * postMessage client for the WIT Shell iframe bridge (vendored protocol in
 * ./bridge-protocol). See the integration plan §5.3.
 *
 * Security rules enforced here:
 * - Outbound postMessage always passes an explicit targetOrigin (never `"*"`).
 * - Inbound messages whose `event.origin` does not match the Shell origin are
 *   silently dropped before parsing; messages that fail protocol validation are
 *   dropped as well.
 * - The Shell origin is resolved at runtime by probing the parent frame
 *   (see {@link detectParentOrigin}), which trusts whoever embeds the frame —
 *   a deliberate trade-off so one build serves every Shell host.
 *
 * The client performs no logout side effects (controller ruling #4): LOGOUT is
 * surfaced through `onLogout` subscriptions, and the Gateway logout request
 * belongs to the EMBED auth flow (core/auth/embed-auth.ts).
 */

import {
  type AuthTokenPayload,
  type BridgeMessage,
  type HandshakePayload,
  type LocaleChangePayload,
  type ThemeChangePayload,
  authTokenRequestMessage,
  authFailedMessage,
  handshakeRequestMessage,
  parseInbound,
  readyMessage,
} from "./bridge-protocol";

export const DEFAULT_BRIDGE_TIMEOUT_MS = 5000;

/** Raised when the Shell does not answer within the configured timeout. */
export class BridgeTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Timed out after ${timeoutMs}ms waiting for a Shell bridge response`);
    this.name = "BridgeTimeoutError";
  }
}

/**
 * Raised when the bridge is used outside an iframe. The caller (EMBED auth /
 * EmbedLayout) is expected to fall back to standalone mode.
 */
export class BridgeNotEmbeddedError extends Error {
  constructor() {
    super(
      "IframeBridgeClient is unavailable outside an iframe (window.self === window.top)",
    );
    this.name = "BridgeNotEmbeddedError";
  }
}

/**
 * Query parameter the Shell appends to the iframe URL carrying its own
 * origin, e.g. `?shellOrigin=http://localhost:3000`. Declared fallback for
 * the origin probe; kept as a shared constant because embed-mode.ts
 * re-propagates it across internal navigation.
 */
export const SHELL_ORIGIN_SEARCH_PARAM = "shellOrigin";

/**
 * Parse a candidate into a valid http(s) origin, or null for junk
 * (`javascript:`, relative fragments, empty strings). Guards every probe
 * signal before it becomes a postMessage targetOrigin.
 */
function toValidOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) {
    return null;
  }
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

/** Location plus the non-standard ancestorOrigins this probe reads. */
type ProbeLocation = Location & {
  ancestorOrigins?: ArrayLike<string> | null;
};

/**
 * Probe the embedding Shell's origin at runtime so one build serves every
 * Shell host (server, localhost) without rebuilds. Signals, browser-computed
 * facts first and declared text last:
 *
 * 1. `window.location.ancestorOrigins` — browser-computed, not forgeable by
 *    any page content; the last entry is the direct parent. Chromium/Safari
 *    only; Firefox does not implement it.
 * 2. `document.referrer` — on first load it is the embedding page, reduced
 *    to its origin under the default Referrer-Policy (unless the Shell
 *    strips it). A referrer pointing at the frame itself (in-frame reload)
 *    is navigation noise and skipped.
 * 3. `?shellOrigin=` — the Shell appends it to the iframe URL (see the
 *    Shell-side `appendShellOrigin()` host helper) and WitAI's embedHref
 *    re-propagates it across internal navigation. It is URL text that any
 *    URL-passing intermediary could rewrite, so it only outranks the env
 *    fallback, never a browser-computed signal.
 *
 * Returns null when no signal yields a usable origin.
 *
 * Security note: this trusts whoever embeds the frame — the inbound origin
 * check below stays strict against the resolved origin, but that origin is
 * discovered rather than operator-pinned. Accepted trade-off for internal
 * Shell deployments; see docs/dev/deerflow-shell-integration-plan.md.
 */
export function detectParentOrigin(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const ancestors = (window.location as ProbeLocation).ancestorOrigins;
  if (ancestors && ancestors.length > 0) {
    const origin = toValidOrigin(ancestors[ancestors.length - 1]);
    if (origin) {
      return origin;
    }
  }
  const referrer = toValidOrigin(document.referrer);
  if (referrer && referrer !== window.location.origin) {
    return referrer;
  }
  return toValidOrigin(
    new URLSearchParams(window.location.search).get(SHELL_ORIGIN_SEARCH_PARAM),
  );
}

/**
 * Full origin of the Shell host, e.g. `http://localhost:5007`. Probes the
 * parent frame first (see {@link detectParentOrigin}); NEXT_PUBLIC_SHELL_ORIGIN
 * is a build-time fallback for environments where probing yields nothing,
 * and a same-origin sub-path deployment needs no configuration at all.
 * Returns "" on the server, where no window exists.
 */
export function resolveShellOrigin(): string {
  if (typeof window !== "undefined" && isEmbeddedWindow()) {
    const probed = detectParentOrigin();
    if (probed) {
      return probed;
    }
  }
  const configured = process.env.NEXT_PUBLIC_SHELL_ORIGIN;
  if (configured) {
    return configured;
  }
  return typeof window === "undefined" ? "" : window.location.origin;
}

/** True when running inside an iframe (i.e. embedded by the Shell). */
export function isEmbeddedWindow(): boolean {
  return typeof window !== "undefined" && window.self !== window.top;
}

/** Values the Shell pushes for the embedded frame's appearance. */
export type ShellTheme = ThemeChangePayload["theme"];
export type ShellLocale = LocaleChangePayload["locale"];

export interface IframeBridgeClientOptions {
  /** Handshake / token-wait timeout in milliseconds. Defaults to 5000. */
  timeoutMs?: number;
  /** Explicit Shell origin. Defaults to {@link resolveShellOrigin}. */
  shellOrigin?: string;
}

export interface WaitForTokenOptions {
  /**
   * Drop any token that arrived before this call and wait for the next
   * AUTH_TOKEN. The renewal path sets this so a stale unconsumed token is
   * never replayed into token-exchange (Task 3 review Minor③).
   */
  ignorePending?: boolean;
}

export class IframeBridgeClient {
  private readonly timeoutMs: number;
  private readonly shellOrigin: string;
  private readonly embedded: boolean;
  private handshakePromise: Promise<HandshakePayload> | null = null;
  private handshakeResolve: ((payload: HandshakePayload) => void) | null = null;
  private readonly tokenWaiters: Array<(token: AuthTokenPayload) => void> = [];
  private pendingToken: AuthTokenPayload | null = null;
  private readonly logoutHandlers = new Set<() => void>();
  private readonly themeHandlers = new Set<(theme: ShellTheme) => void>();
  private readonly localeHandlers = new Set<(locale: ShellLocale) => void>();
  // Latest-value cache: the Shell pushes the initial theme/locale right after
  // the handshake, which can precede React mounting and subscribing. Handlers
  // registered after a push receive the newest value replayed synchronously.
  private latestTheme: ShellTheme | null = null;
  private latestLocale: ShellLocale | null = null;

  constructor(options: IframeBridgeClientOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS;
    this.shellOrigin = options.shellOrigin ?? resolveShellOrigin();
    this.embedded = isEmbeddedWindow();
    if (this.embedded) {
      window.addEventListener("message", this.onMessage);
    }
  }

  /**
   * Send HANDSHAKE_REQUEST and wait for the Shell's HANDSHAKE. Idempotent: the
   * in-flight (or completed) promise is reused. A failed handshake clears the
   * cache so a retry can start over. Rejects with {@link BridgeTimeoutError}
   * after the timeout or {@link BridgeNotEmbeddedError} outside an iframe.
   */
  handshake(): Promise<HandshakePayload> {
    if (!this.embedded) {
      return Promise.reject(new BridgeNotEmbeddedError());
    }
    if (this.handshakePromise) {
      return this.handshakePromise;
    }
    const promise = this.withTimeout(
      new Promise<HandshakePayload>((resolve) => {
        this.handshakeResolve = resolve;
      }),
      this.timeoutMs,
    );
    // Clear the cache on failure so the next call retries instead of
    // replaying a cached rejection.
    promise.catch(() => {
      if (this.handshakePromise === promise) {
        this.handshakePromise = null;
      }
    });
    this.handshakePromise = promise;
    this.postToShell(handshakeRequestMessage());
    return promise;
  }

  /**
   * Wait for the next AUTH_TOKEN from the Shell. Resolves immediately when a
   * token has already arrived since the last wait. Rejects with
   * {@link BridgeTimeoutError} after the timeout or
   * {@link BridgeNotEmbeddedError} outside an iframe.
   *
   * `ignorePending` (used by the 401 renewal path, core/auth/embed-auth.ts)
   * drops any cached unconsumed token first so a stale one is never replayed
   * — only a token arriving after this call resolves the wait.
   */
  waitForToken(options: WaitForTokenOptions = {}): Promise<AuthTokenPayload> {
    if (!this.embedded) {
      return Promise.reject(new BridgeNotEmbeddedError());
    }
    if (options.ignorePending) {
      this.pendingToken = null;
    } else if (this.pendingToken) {
      const token = this.pendingToken;
      this.pendingToken = null;
      return Promise.resolve(token);
    }
    return this.withTimeout(
      new Promise<AuthTokenPayload>((resolve) => {
        this.tokenWaiters.push(resolve);
      }),
      this.timeoutMs,
    );
  }

  /** Ask the Shell to re-send AUTH_TOKEN (e.g. after a 401). No-op standalone. */
  requestAuthToken(reason: string): void {
    this.postToShell(authTokenRequestMessage(reason));
  }

  /** Report to the Shell that the workspace finished loading. No-op standalone. */
  sendReady(threadId: string): void {
    this.postToShell(readyMessage(threadId));
  }

  /** Report to the Shell that authentication failed. No-op standalone. */
  sendAuthFailed(error: string, code: string): void {
    this.postToShell(authFailedMessage(error, code));
  }

  /**
   * Subscribe to Shell LOGOUT notifications. Returns an unsubscribe function.
   * The client itself performs no logout side effects.
   */
  onLogout(handler: () => void): () => void {
    this.logoutHandlers.add(handler);
    return () => {
      this.logoutHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to Shell THEME_CHANGE pushes. If a value was already pushed
   * (the Shell sends the initial theme right after the handshake), the newest
   * one is replayed to the handler synchronously on subscription. Returns an
   * unsubscribe function.
   */
  onThemeChange(handler: (theme: ShellTheme) => void): () => void {
    if (this.latestTheme !== null) {
      handler(this.latestTheme);
    }
    this.themeHandlers.add(handler);
    return () => {
      this.themeHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to Shell LOCALE_CHANGE pushes; replays the newest pushed value
   * on subscription like {@link onThemeChange}. Returns an unsubscribe
   * function.
   */
  onLocaleChange(handler: (locale: ShellLocale) => void): () => void {
    if (this.latestLocale !== null) {
      handler(this.latestLocale);
    }
    this.localeHandlers.add(handler);
    return () => {
      this.localeHandlers.delete(handler);
    };
  }

  /** Detach the window listener. Intended for tests and teardown. */
  destroy(): void {
    if (this.embedded) {
      window.removeEventListener("message", this.onMessage);
    }
  }

  private postToShell(message: BridgeMessage): void {
    // Guard: never post when not embedded, so a standalone deployment cannot
    // leak bridge traffic to itself.
    if (!this.embedded) {
      return;
    }
    // Always an explicit targetOrigin — never "*".
    window.parent.postMessage(message, this.shellOrigin);
  }

  private readonly onMessage = (event: MessageEvent): void => {
    // Origin mismatch: silently drop, no further processing.
    if (event.origin !== this.shellOrigin) {
      return;
    }
    const message = parseInbound(event.data);
    if (!message) {
      return;
    }
    switch (message.type) {
      case "HANDSHAKE": {
        const resolve = this.handshakeResolve;
        this.handshakeResolve = null;
        resolve?.(message.payload);
        return;
      }
      case "AUTH_TOKEN": {
        const waiters = [...this.tokenWaiters];
        this.tokenWaiters.length = 0;
        if (waiters.length > 0) {
          for (const resolve of waiters) {
            resolve(message.payload);
          }
        } else {
          // Keep the newest token for a waitForToken() called later.
          this.pendingToken = message.payload;
        }
        return;
      }
      case "LOGOUT": {
        for (const handler of this.logoutHandlers) {
          handler();
        }
        return;
      }
      case "THEME_CHANGE": {
        this.latestTheme = message.payload.theme;
        for (const handler of this.themeHandlers) {
          handler(this.latestTheme);
        }
        return;
      }
      case "LOCALE_CHANGE": {
        this.latestLocale = message.payload.locale;
        for (const handler of this.localeHandlers) {
          handler(this.latestLocale);
        }
        return;
      }
      default:
        // Upstream types echoed back at us carry no client-side meaning.
        return;
    }
  };

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new BridgeTimeoutError(ms)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    });
  }
}

let bridgeClientSingleton: IframeBridgeClient | null = null;

/**
 * Get the shared bridge client, or null when the bridge must stay dormant:
 * on the server (no window) or in a standalone (non-iframe) deployment. This
 * is what keeps non-EMBED mode from initializing the bridge at all.
 */
export function getIframeBridgeClient(): IframeBridgeClient | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (!isEmbeddedWindow()) {
    return null;
  }
  bridgeClientSingleton ??= new IframeBridgeClient();
  return bridgeClientSingleton;
}

/** Reset the shared client. Test-only; destroys the existing instance. */
export function resetIframeBridgeClient(): void {
  bridgeClientSingleton?.destroy();
  bridgeClientSingleton = null;
}
