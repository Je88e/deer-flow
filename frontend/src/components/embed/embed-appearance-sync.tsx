"use client";

import { useEmbedAppearance } from "./use-embed-appearance";

/**
 * Headless mount point for {@link useEmbedAppearance} inside the workspace
 * tree. Rendering null keeps it a drop-in for the server-component
 * WorkspaceContent without wiring contexts through props.
 */
export function EmbedAppearanceSync() {
  useEmbedAppearance();
  return null;
}
