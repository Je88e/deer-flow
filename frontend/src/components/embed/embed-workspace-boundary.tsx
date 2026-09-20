"use client";

import { type ReactNode } from "react";

import { EmbedAuthGate } from "./embed-auth-gate";
import { EmbedModeProvider } from "./embed-mode-provider";
import { useIsEmbedRoute } from "./use-is-embed-route";

/** Keep every workspace API consumer behind the initial Shell exchange. */
export function EmbedWorkspaceBoundary({ children }: { children: ReactNode }) {
  // Layouts persist across client navigation; read the live query rather than
  // retaining the first server request's embed flag.
  const embedded = useIsEmbedRoute();
  return (
    <EmbedModeProvider embedded={embedded}>
      <EmbedAuthGate key={embedded ? "embed" : "standalone"}>
        {children}
      </EmbedAuthGate>
    </EmbedModeProvider>
  );
}
