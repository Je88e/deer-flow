import "katex/dist/katex.min.css";
import "streamdown/styles.css";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { EMBED_REQUEST_HEADER } from "@/components/embed/embed-mode";
import { GatewayOfflineFallback } from "@/components/workspace/gateway-offline-fallback";
import { AuthProvider } from "@/core/auth/AuthProvider";
import { getServerSideUser } from "@/core/auth/server";
import { assertNever } from "@/core/auth/types";
import { I18nProvider } from "@/core/i18n/context";
import { detectLocaleServer } from "@/core/i18n/server";

import { WorkspaceContent } from "./workspace-content";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await detectLocaleServer();
  const result = await getServerSideUser();
  // Stamped by src/proxy.ts from the `?embed=true` query parameter
  // (layouts never receive `searchParams`).
  const embedRequested = (await headers()).get(EMBED_REQUEST_HEADER) === "1";

  let content: React.ReactNode;

  switch (result.tag) {
    case "authenticated":
      content = (
        <AuthProvider initialUser={result.user}>
          <WorkspaceContent>{children}</WorkspaceContent>
        </AuthProvider>
      );
      break;
    case "needs_setup":
      redirect("/setup");
    case "system_setup_required":
      redirect("/setup");
    case "unauthenticated":
      if (embedRequested) {
        // EMBED first entry has no session cookie yet — the bridge
        // token-exchange is what creates it (plan §3.1). Render the page
        // tree so the EMBED branch can mount EmbedAuthGate; redirecting to
        // /login here would abort the page and the handshake would never
        // start. The gate overlays the children until token-exchange
        // succeeds, then router.refresh()es into the authenticated branch
        // above. WorkspaceContent is required even here: the page tree
        // SSRs through ChatPage, which needs its QueryClientProvider and
        // SidebarProvider. AuthProvider with a null initialUser keeps
        // useAuth consumers mounted without firing requests, and the
        // distinct key forces a remount when the refresh swaps branches —
        // an identical tree shape would make AuthProvider keep the stale
        // null-user state across router.refresh().
        content = (
          <AuthProvider key="embed-bootstrap" initialUser={null}>
            <WorkspaceContent>{children}</WorkspaceContent>
          </AuthProvider>
        );
      } else {
        redirect("/login");
      }
      break;
    case "gateway_unavailable":
      // GatewayOfflineFallback supplies the AuthProvider; WorkspaceContent
      // already mounts the banner inside its sidebar layout, so renderBanner
      // stays false here to avoid double-mounting.
      content = (
        <GatewayOfflineFallback>
          <WorkspaceContent gatewayUnavailable>{children}</WorkspaceContent>
        </GatewayOfflineFallback>
      );
      break;
    case "config_error":
      throw new Error(result.message);
    default:
      assertNever(result);
  }

  return <I18nProvider initialLocale={locale}>{content}</I18nProvider>;
}
