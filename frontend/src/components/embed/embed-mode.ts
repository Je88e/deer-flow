/**
 * URL search parameter that switches a workspace route into EMBED mode for
 * the WIT Shell iframe integration.
 */
export const EMBED_SEARCH_PARAM = "embed";

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
 * Every in-embed navigation (thread switch, new chat, delete redirect) must go
 * through this helper: dropping the parameter would leave the iframe's
 * `/workspace/chats/...` route and re-render the standalone layout.
 */
export function embedHref(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${EMBED_SEARCH_PARAM}=true`;
}
