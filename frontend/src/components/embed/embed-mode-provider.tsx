"use client";

import { createContext, useContext, type ReactNode } from "react";

export interface EmbedModeContextValue {
  /** True when this tree renders for the WIT Shell iframe (`?embed=true`). */
  embedded: boolean;
}

// Defaulting to `embedded: false` (instead of null) keeps the hook SSR-safe:
// every consumer outside a provider — the whole standalone app — reads
// "not embedded" and never has to guard against null.
const EmbedModeContext = createContext<EmbedModeContextValue>({
  embedded: false,
});

export function EmbedModeProvider({
  children,
  embedded,
}: {
  children: ReactNode;
  embedded: boolean;
}) {
  return (
    <EmbedModeContext.Provider value={{ embedded }}>
      {children}
    </EmbedModeContext.Provider>
  );
}

export function useEmbedMode(): EmbedModeContextValue {
  return useContext(EmbedModeContext);
}
