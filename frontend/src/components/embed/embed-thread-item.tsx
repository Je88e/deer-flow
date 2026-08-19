"use client";

import { Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/core/i18n/hooks";
import type { AgentThread } from "@/core/threads/types";
import { isThreadPinned, titleOfThread } from "@/core/threads/utils";
import { isIMEComposing } from "@/lib/ime";
import { cn } from "@/lib/utils";

export interface EmbedThreadItemProps {
  thread: AgentThread;
  /** True when this thread is the one currently open in the chat pane. */
  isActive: boolean;
  onSelect: (thread: AgentThread) => void;
  onTogglePinned: (thread: AgentThread) => void;
  onDelete: (thread: AgentThread) => void;
  onRename: (thread: AgentThread, title: string) => void;
}

/**
 * One compact row in the EMBED thread panel: click switches the conversation,
 * hover actions expose pin / rename / delete. Titles and pinned state come
 * from the shared thread utils; this component owns no data logic.
 */
export function EmbedThreadItem({
  thread,
  isActive,
  onSelect,
  onTogglePinned,
  onDelete,
  onRename,
}: EmbedThreadItemProps) {
  const { t } = useI18n();
  const [draftTitle, setDraftTitle] = useState<string | null>(null);
  const isRenaming = draftTitle !== null;
  const pinned = isThreadPinned(thread);

  const commitRename = () => {
    const nextTitle = draftTitle?.trim() ?? "";
    setDraftTitle(null);
    if (nextTitle && nextTitle !== titleOfThread(thread)) {
      onRename(thread, nextTitle);
    }
  };

  if (isRenaming) {
    return (
      <Input
        autoFocus
        aria-label={t.common.rename}
        className="h-8 px-2 text-sm"
        value={draftTitle}
        onChange={(event) => setDraftTitle(event.target.value)}
        onBlur={commitRename}
        onKeyDown={(event) => {
          if (isIMEComposing(event)) {
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            commitRename();
          } else if (event.key === "Escape") {
            event.preventDefault();
            setDraftTitle(null);
          }
        }}
        data-testid="embed-thread-rename-input"
      />
    );
  }

  return (
    <div
      className={cn(
        "group/embed-thread flex items-center gap-0.5 rounded-md pr-0.5",
        isActive
          ? "bg-accent text-accent-foreground"
          : "hover:bg-accent/50 dark:hover:bg-accent/40",
      )}
    >
      <button
        type="button"
        aria-current={isActive ? "page" : undefined}
        className="flex min-w-0 grow cursor-pointer items-center gap-1.5 px-2 py-1.5 text-left text-sm"
        onClick={() => onSelect(thread)}
      >
        {pinned && (
          <Pin
            aria-hidden="true"
            className="text-muted-foreground size-3 shrink-0"
          />
        )}
        <span className="min-w-0 truncate">{titleOfThread(thread)}</span>
      </button>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover/embed-thread:opacity-100 focus-within:opacity-100">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground size-6"
          aria-label={pinned ? t.chats.unpinChat : t.chats.pinChat}
          title={pinned ? t.chats.unpinChat : t.chats.pinChat}
          onClick={() => onTogglePinned(thread)}
        >
          {pinned ? (
            <PinOff aria-hidden="true" className="size-3.5" />
          ) : (
            <Pin aria-hidden="true" className="size-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground size-6"
          aria-label={t.common.rename}
          title={t.common.rename}
          onClick={() => setDraftTitle(titleOfThread(thread))}
        >
          <Pencil aria-hidden="true" className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive size-6"
          aria-label={t.common.delete}
          title={t.common.delete}
          onClick={() => onDelete(thread)}
        >
          <Trash2 aria-hidden="true" className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
