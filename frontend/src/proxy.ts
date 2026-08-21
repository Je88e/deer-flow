import { NextResponse, type NextRequest } from "next/server";

import {
  EMBED_REQUEST_HEADER,
  EMBED_SEARCH_PARAM,
} from "@/components/embed/embed-mode";

/**
 * Stamp the EMBED flag onto workspace requests as a request header.
 *
 * The workspace layout runs the server-side auth gate, but App Router
 * layouts never receive `searchParams` — without this header an
 * unauthenticated first-entry iframe hit (`/workspace?embed=true`, no
 * session cookie yet) would redirect to /login before the page could mount
 * EmbedAuthGate, and the bridge handshake would never start (plan §3.1
 * first-entry flow). The layout reads EMBED_REQUEST_HEADER and renders the
 * EMBED bootstrap tree instead of redirecting.
 *
 * The header is proxy-owned: any client-supplied value is deleted first, so
 * it can only reflect the actual query parameter.
 */
export function proxy(request: NextRequest): NextResponse {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete(EMBED_REQUEST_HEADER);
  if (request.nextUrl.searchParams.get(EMBED_SEARCH_PARAM) === "true") {
    requestHeaders.set(EMBED_REQUEST_HEADER, "1");
  }
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/workspace", "/workspace/:path*"],
};
