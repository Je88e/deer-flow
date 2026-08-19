import type { ReactNode } from "react";

import { EmbedThreadList } from "./embed-thread-list";

/**
 * Layout shell for EMBED mode (`?embed=true`).
 *
 * The workspace layout above this shell already provides auth, i18n, the
 * query client, command palette, settings dialogs, and toasts, so this
 * component deliberately re-wraps nothing — duplicate providers would break
 * context singletons. The workspace sidebar is hidden separately by the
 * sidebar itself, which reads the same `embed` URL parameter.
 *
 * `children` carries the chat content; `EmbedThreadList` renders as a
 * collapsible sibling column so the iframe keeps lightweight thread
 * management without the full sidebar.
 */
export function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex size-full min-h-0" data-embed-layout="true">
      <EmbedThreadList />
      {children}
    </div>
  );
}
