"use client";

import { useSearchParams } from "next/navigation";

import { EMBED_SEARCH_PARAM, isEmbedSearchValue } from "./embed-mode";

/**
 * URL-parameter EMBED detection for components that render above the page
 * tree (sidebar slots, the settings dialog host). Those live in the layout,
 * outside the page-scoped `EmbedModeProvider`, so they cannot call
 * `useEmbedMode()` — instead they read the same `?embed=true` parameter the
 * proxy stamps into the workspace layout. Page-tree components should use
 * `useEmbedMode()` instead of this hook.
 */
export function useIsEmbedRoute(): boolean {
  const searchParams = useSearchParams();
  return isEmbedSearchValue(searchParams.get(EMBED_SEARCH_PARAM));
}
