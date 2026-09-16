import { SHELL_ORIGIN_SEARCH_PARAM } from "@/core/bridge/iframe-bridge-client";

/**
 * URL search parameter that switches a workspace route into EMBED mode for
 * the WIT Shell iframe integration.
 */
export const EMBED_SEARCH_PARAM = "embed";

/**
 * Request header that carries the EMBED flag from the proxy to the
 * workspace layout. App Router layouts never receive `searchParams`
 * (plan §4.1), so `src/proxy.ts` stamps this header from the
 * `?embed=true` query parameter and the layout reads it via `headers()`.
 * The proxy deletes any inbound value first, so the header always reflects
 * the real query string rather than client input.
 */
export const EMBED_REQUEST_HEADER = "x-deerflow-embed";

/**
 * EMBED mode is enabled only by the exact value "true". Anything else — a
 * missing parameter, "1", "false", or any other string — keeps the normal
 * standalone rendering path, so existing URLs never change behavior.
 *
 * When the parameter is repeated (`?embed=true&embed=false`) the first value
 * wins, matching what `URLSearchParams.get()` returns on the client.
 */
export function isEmbedSearchValue(
  value: string | string[] | null | undefined,
): boolean {
  const first = Array.isArray(value) ? value[0] : value;
  return first === "true";
}

/**
 * Append the EMBED search parameter to an internal route path.
 *
 * Every in-embed navigation (thread switch, new chat, delete redirect — from
 * the sidebar, the thread list, or the chat page) must go through this
 * helper: dropping the parameter would leave EMBED mode, restoring the
 * EMBED-hidden menus and cutting the Shell bridge off from the tree.
 *
 * When the current URL carries `?shellOrigin=` (appended by the Shell), it is
 * re-propagated too: after an in-frame reload that parameter is the last
 * reliable origin probe signal left in browsers without
 * `window.location.ancestorOrigins` (Firefox), so dropping it would lock the
 * bridge onto a wrong origin and degrade embed mode to the standalone login.
 */
export interface EmbedHrefOptions {
  /**
   * Shell origin to propagate as `?shellOrigin=`. On the client it defaults
   * to the current URL's value; pass it explicitly where no `window` exists
   * (server-side redirects read it from their `searchParams`). `null` means
   * there is none to propagate.
   */
  shellOrigin?: string | string[] | null;
}

export function embedHref(
  path: string,
  options: EmbedHrefOptions = {},
): string {
  const separator = path.includes("?") ? "&" : "?";
  let href = `${path}${separator}${EMBED_SEARCH_PARAM}=true`;
  const raw =
    options.shellOrigin === undefined
      ? currentShellOriginParam()
      : options.shellOrigin;
  const shellOrigin = Array.isArray(raw) ? raw[0] : raw;
  if (shellOrigin) {
    href += `&${SHELL_ORIGIN_SEARCH_PARAM}=${encodeURIComponent(shellOrigin)}`;
  }
  return href;
}

/** Current URL's `?shellOrigin=` value, or null on the server (no window). */
function currentShellOriginParam(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return new URLSearchParams(window.location.search).get(
    SHELL_ORIGIN_SEARCH_PARAM,
  );
}
