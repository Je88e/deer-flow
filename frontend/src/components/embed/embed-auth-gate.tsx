"use client";

import { Loader2Icon } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import {
  authenticateViaBridge,
  wireBridgeLogout,
} from "@/core/auth/embed-auth";
import { getIframeBridgeClient } from "@/core/bridge/iframe-bridge-client";
import { useI18n } from "@/core/i18n/hooks";

import { useEmbedMode } from "./embed-mode-provider";

type EmbedAuthGateState = "authenticating" | "settled";

/**
 * One-time bridge authentication gate for the EMBED tree (plan §3.1).
 *
 * While embedded, the workspace renders behind a brief "authenticating"
 * state until the bridge sequence (handshake → AUTH_TOKEN → token-exchange →
 * READY) settles. Every non-success outcome — a standalone window carrying
 * ?embed=true, a handshake timeout, or a failed exchange — still renders the
 * children: the failure was already reported to the Shell (AUTH_FAILED) and
 * the standalone auth path stays in charge of what happens next (§10.3).
 *
 * Not embedded: children render immediately and the bridge is never touched.
 */
export function EmbedAuthGate({ children }: { children: ReactNode }) {
  const { embedded } = useEmbedMode();
  const { t } = useI18n();
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
      setState("settled");
      return;
    }
    const unsubscribeLogout = wireBridgeLogout(client);
    let cancelled = false;
    // authenticateViaBridge is idempotent per client (embed-auth caches the
    // first run), so effect re-runs on thread navigation never repeat the
    // sequence — only the LOGOUT subscription is taken again.
    void authenticateViaBridge(client, { threadId: readyThreadId }).then(() => {
      if (!cancelled) {
        setState("settled");
      }
    });
    return () => {
      cancelled = true;
      unsubscribeLogout();
    };
  }, [embedded, readyThreadId]);

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
