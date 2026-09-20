"use client";

import { useSearchParams } from "next/navigation";

import { EMBED_SEARCH_PARAM, isEmbedSearchValue } from "./embed-mode";

/**
 * URL-parameter EMBED detection for the workspace authentication boundary
 * and route-aware navigation. The workspace provider exposes this same value
 * to descendants through `useEmbedMode()`.
 */
export function useIsEmbedRoute(): boolean {
  const searchParams = useSearchParams();
  return isEmbedSearchValue(searchParams.get(EMBED_SEARCH_PARAM));
}
