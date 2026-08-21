"use client";

import { Loader2Icon } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { useAuth } from "@/core/auth/AuthProvider";
import {
  authenticateViaBridge,
  wireBridgeLogout,
} from "@/core/auth/embed-auth";
import { getIframeBridgeClient } from "@/core/bridge/iframe-bridge-client";
import { useI18n } from "@/core/i18n/hooks";

import { useEmbedMode } from "./embed-mode-provider";

type EmbedAuthGateState = "authenticating" | "settled";

/**
 * One-shot guard for the bootstrap router.refresh(). After the refreshed
 * tree mounts, the cached first-auth resolves "authenticated" again, and
 * without this flag a still-null user would refresh forever. Module scope:
 * the guard must survive the remount that the refresh itself causes.
 */
let bootstrapRefreshIssued = false;

/** Test-only: reset the bootstrap refresh guard between cases. */
export function resetEmbedAuthGateForTesting(): void {
  bootstrapRefreshIssued = false;
}

/**
 * One-time bridge authentication gate for the EMBED tree (plan §3.1).
 *
 * While embedded, the workspace renders behind a brief "authenticating"
 * state until the bridge sequence (handshake → AUTH_TOKEN → token-exchange →
 * READY) settles.
 *
 * Two contexts:
 *
 * - Authenticated layout (an unexpired session cookie existed on arrival):
 *   every non-success outcome still renders the children — the failure was
 *   already reported to the Shell (AUTH_FAILED) and the standalone auth
 *   path stays in charge (§10.3).
 * - Unauthenticated bootstrap branch (workspace layout admitted the bare
 *   page tree because middleware stamped `?embed=true`; `user` is null):
 *   success triggers a router.refresh() so the server layout re-runs with
 *   the fresh session cookie and swaps in the authenticated tree; failure
 *   degrades to the standalone login page inside the iframe.
 *
 * Not embedded: children render immediately and the bridge is never touched.
 */
export function EmbedAuthGate({ children }: { children: ReactNode }) {
  const { embedded } = useEmbedMode();
  const { t } = useI18n();
  const { user } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<EmbedAuthGateState>(
    embedded ? "authenticating" : "settled",
  );
  const { thread_id: routeThreadId } = useParams<{ thread_id?: string }>();
  // READY reports the active thread. `/new` has no backend thread yet, so it
  // carries the empty placeholder; derivation matches useThreadChat (Task 5).
  const readyThreadId =
    routeThreadId && routeThreadId !== "new" ? routeThreadId : "";

  useEffect(() => {
    if (!embedded) {
      return;
    }
    const client = getIframeBridgeClient();
    if (!client) {
      // ?embed=true outside a Shell iframe: no bridge to authenticate with.
      // In the bootstrap branch there is no session at all, so continue to
      // the standalone login page instead of rendering an unauthenticated
      // workspace.
      if (!user) {
        router.replace("/login");
        return;
      }
      setState("settled");
      return;
    }
    const unsubscribeLogout = wireBridgeLogout(client);
    let cancelled = false;
    // authenticateViaBridge is idempotent per client (embed-auth caches the
    // first run), so effect re-runs on thread navigation never repeat the
    // sequence — only the LOGOUT subscription is taken again.
    void authenticateViaBridge(client, { threadId: readyThreadId }).then(
      (result) => {
        if (cancelled) {
          return;
        }
        if (!user) {
          if (result.status === "authenticated") {
            // Bootstrap complete: the session cookie now exists. Re-run the
            // server layout so it swaps in the authenticated branch; keep
            // the overlay until the refreshed tree arrives. The one-shot
            // guard prevents a refresh loop if the user is still null.
            if (!bootstrapRefreshIssued) {
              bootstrapRefreshIssued = true;
              router.refresh();
              return;
            }
          } else {
            // no-bridge / failed with no session to fall back on: degrade
            // to the standalone login page (§10.3 accepted behavior). The
            // Shell was already notified via AUTH_FAILED when applicable.
            router.replace("/login");
            return;
          }
        }
        setState("settled");
      },
    );
    return () => {
      cancelled = true;
      unsubscribeLogout();
    };
  }, [embedded, readyThreadId, user, router]);

  if (embedded && state === "authenticating") {
    return (
      <div
        className="text-muted-foreground flex size-full flex-col items-center justify-center gap-2"
        data-embed-auth="authenticating"
        role="status"
      >
        <Loader2Icon aria-hidden="true" className="size-5 animate-spin" />
        <span className="text-sm">{t.common.loading}</span>
      </div>
    );
  }

  return <>{children}</>;
}
