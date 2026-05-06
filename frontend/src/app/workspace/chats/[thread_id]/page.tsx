"use client";

import { ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useMemo, useState } from "react";

import { type PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { ArtifactTrigger } from "@/components/workspace/artifacts";
import {
  ChatBox,
  useSpecificChatMode,
  useThreadChat,
} from "@/components/workspace/chats";
import { ExportTrigger } from "@/components/workspace/export-trigger";
import { InputBox } from "@/components/workspace/input-box";
import {
  MessageList,
  MESSAGE_LIST_DEFAULT_PADDING_BOTTOM,
  MESSAGE_LIST_FOLLOWUPS_EXTRA_PADDING_BOTTOM,
} from "@/components/workspace/messages";
import { ThreadContext } from "@/components/workspace/messages/context";
import { ThreadTitle } from "@/components/workspace/thread-title";
import { TodoList } from "@/components/workspace/todo-list";
import { TokenUsageIndicator } from "@/components/workspace/token-usage-indicator";
import { Tooltip } from "@/components/workspace/tooltip";
import { redeemHandoff } from "@/core/handoff/api";
import { useI18n } from "@/core/i18n/hooks";
import { useModels } from "@/core/models/hooks";
import { useNotification } from "@/core/notification/hooks";
import { useLocalSettings, useThreadSettings } from "@/core/settings";
import { useThreads, useThreadStream } from "@/core/threads/hooks";
import { textOfMessage } from "@/core/threads/utils";
import { env } from "@/env";
import { cn } from "@/lib/utils";

function getHashParams(hash: string): URLSearchParams {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  const query = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
  return new URLSearchParams(query);
}

function getThreadIdFromPathname(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const chatsIndex = parts.findIndex(
    (part, idx) => part === "chats" && parts[idx - 1] === "workspace",
  );
  if (chatsIndex < 0) {
    return null;
  }
  const threadId = parts[chatsIndex + 1];
  return threadId?.trim() ? threadId : null;
}

function normalizeUrlParam(value: string | null): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function ChatPageInner() {
  const { t } = useI18n();
  const router = useRouter();
  const [showFollowups, setShowFollowups] = useState(false);
  const { threadId, setThreadId, isNewThread, setIsNewThread, isMock } =
    useThreadChat();
  const [settings, setSettings] = useThreadSettings(threadId);
  const [localSettings, setLocalSettings] = useLocalSettings();
  const { tokenUsageEnabled } = useModels();
  const mountedRef = useRef(false);
  const { data: threads = [] } = useThreads();
  useSpecificChatMode();

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  const { showNotification } = useNotification();

  const {
    thread,
    sendMessage,
    isUploading,
    isHistoryLoading,
    hasMoreHistory,
    loadMoreHistory,
  } = useThreadStream({
    threadId: isNewThread ? undefined : threadId,
    context: settings.context,
    isMock,
    onSend: (_threadId) => {
      setThreadId(_threadId);
      setIsNewThread(false);
    },
    onStart: (createdThreadId) => {
      setThreadId(createdThreadId);
      setIsNewThread(false);
      // ! Important: Never use next.js router for navigation in this case, otherwise it will cause the thread to re-mount and lose all states. Use native history API instead.
      history.replaceState(null, "", `/workspace/chats/${createdThreadId}`);
    },
    onFinish: (state) => {
      if (document.hidden || !document.hasFocus()) {
        let body = "Conversation finished";
        const lastMessage = state.messages.at(-1);
        if (lastMessage) {
          const textContent = textOfMessage(lastMessage);
          if (textContent) {
            body =
              textContent.length > 200
                ? textContent.substring(0, 200) + "..."
                : textContent;
          }
        }
        showNotification(state.title, { body });
      }
    },
  });

  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      void sendMessage(threadId, message);
    },
    [sendMessage, threadId],
  );
  const handleStop = useCallback(async () => {
    await thread.stop();
  }, [thread]);

  const messageListPaddingBottom = showFollowups
    ? MESSAGE_LIST_DEFAULT_PADDING_BOTTOM +
      MESSAGE_LIST_FOLLOWUPS_EXTRA_PADDING_BOTTOM
    : undefined;
  const tokenUsageInlineMode = tokenUsageEnabled
    ? localSettings.tokenUsage.inlineMode
    : "off";

  const persistedThread = useMemo(() => {
    return threads.find((item) => item.thread_id === threadId);
  }, [threadId, threads]);
  const source = useMemo(() => {
    const streamMetadata = (
      thread as unknown as { metadata?: Record<string, unknown> }
    ).metadata;
    const persistedMetadata = persistedThread?.metadata ?? undefined;
    const valuesMetadata = (
      thread.values as unknown as { metadata?: Record<string, unknown> }
    )?.metadata;

    const streamSource = streamMetadata?.source;
    if (typeof streamSource === "string") {
      return streamSource;
    }
    const persistedSource = (
      persistedMetadata as Record<string, unknown> | null
    )?.source;
    if (typeof persistedSource === "string") {
      return persistedSource;
    }
    const valuesSource = valuesMetadata?.source;
    if (typeof valuesSource === "string") {
      return valuesSource;
    }
    return null;
  }, [persistedThread?.metadata, thread]);
  const showAuditButton = source === "starlims";

  return (
    <ThreadContext.Provider value={{ thread, isMock }}>
      <ChatBox threadId={threadId}>
        <div className="relative flex size-full min-h-0 justify-between">
          <header
            className={cn(
              "absolute top-0 right-0 left-0 z-30 flex h-12 shrink-0 items-center px-4",
              isNewThread
                ? "bg-background/0 backdrop-blur-none"
                : "bg-background/80 shadow-xs backdrop-blur",
            )}
          >
            <div className="flex w-full items-center text-sm font-medium">
              <ThreadTitle threadId={threadId} thread={thread} />
            </div>
            <div className="flex items-center gap-2">
              {showAuditButton && (
                <Tooltip content={t.pages.audits}>
                  <Button
                    className="text-muted-foreground hover:text-foreground"
                    variant="ghost"
                    disabled={thread.isLoading}
                    onClick={() =>
                      router.push(
                        `/workspace/audits/${encodeURIComponent(threadId)}`,
                      )
                    }
                  >
                    <ListChecks />
                    {t.pages.audits}
                  </Button>
                </Tooltip>
              )}
              <TokenUsageIndicator
                enabled={tokenUsageEnabled}
                messages={thread.messages}
                preferences={localSettings.tokenUsage}
                onPreferencesChange={(preferences) =>
                  setLocalSettings("tokenUsage", preferences)
                }
              />
              <ExportTrigger threadId={threadId} />
              <ArtifactTrigger />
            </div>
          </header>
          <main className="flex min-h-0 max-w-full grow flex-col">
            <div className="flex size-full justify-center">
              <MessageList
                className={cn("size-full", !isNewThread && "pt-10")}
                threadId={threadId}
                thread={thread}
                paddingBottom={messageListPaddingBottom}
                hasMoreHistory={hasMoreHistory}
                loadMoreHistory={loadMoreHistory}
                isHistoryLoading={isHistoryLoading}
                tokenUsageInlineMode={tokenUsageInlineMode}
              />
            </div>
            <div className="absolute right-0 bottom-0 left-0 z-30 flex justify-center px-4">
              <div
                className={cn(
                  "relative w-full",
                  isNewThread && "-translate-y-[calc(50vh-96px)]",
                  isNewThread
                    ? "max-w-(--container-width-sm)"
                    : "max-w-(--container-width-md)",
                )}
              >
                <div className="absolute -top-4 right-0 left-0 z-0">
                  <div className="absolute right-0 bottom-0 left-0">
                    <TodoList
                      className="bg-background/5"
                      todos={thread.values.todos ?? []}
                      hidden={
                        !thread.values.todos || thread.values.todos.length === 0
                      }
                    />
                  </div>
                </div>
                {mountedRef.current ? (
                  <InputBox
                    className={cn("bg-background/5 w-full -translate-y-4")}
                    isNewThread={isNewThread}
                    threadId={threadId}
                    autoFocus={isNewThread}
                    status={
                      thread.error
                        ? "error"
                        : thread.isLoading
                          ? "streaming"
                          : "ready"
                    }
                    context={settings.context}
                    // extraHeader={
                    //   isNewThread && <Welcome mode={settings.context.mode} />
                    // }
                    disabled={
                      env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" ||
                      isUploading
                    }
                    onContextChange={(context) =>
                      setSettings("context", context)
                    }
                    onFollowupsVisibilityChange={setShowFollowups}
                    onSubmit={handleSubmit}
                    onStop={handleStop}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    className={cn(
                      "bg-background/5 h-32 w-full -translate-y-4 rounded-2xl",
                    )}
                  />
                )}
                {env.NEXT_PUBLIC_STATIC_WEBSITE_ONLY === "true" && (
                  <div className="text-muted-foreground/67 w-full translate-y-12 text-center text-xs">
                    {t.common.notAvailableInDemoMode}
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </ChatBox>
    </ThreadContext.Provider>
  );
}

export default function ChatPage() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hashParams = getHashParams(url.hash);
    const token =
      normalizeUrlParam(hashParams.get("handoff")) ??
      normalizeUrlParam(url.searchParams.get("handoff"));
    const runId =
      normalizeUrlParam(hashParams.get("run_id")) ??
      normalizeUrlParam(url.searchParams.get("run_id"));
    const threadId = getThreadIdFromPathname(url.pathname);

    const cleanupUrl = () => {
      url.hash = "";
      url.searchParams.delete("handoff");
      url.searchParams.delete("run_id");
      const search = url.searchParams.toString();
      const nextUrl = `${url.pathname}${search ? `?${search}` : ""}`;
      history.replaceState(null, "", nextUrl);
    };

    if (!token && !runId) {
      setReady(true);
      return;
    }

    if (!threadId) {
      cleanupUrl();
      setError("Invalid chat URL.");
      setReady(true);
      return;
    }

    if (token) {
      void redeemHandoff(token)
        .then((redeemed) => {
          if (redeemed.thread_id !== threadId) {
            throw new Error("Handoff thread mismatch.");
          }
          window.sessionStorage.setItem(
            `lg:stream:${threadId}`,
            redeemed.run_id,
          );
          cleanupUrl();
          setReady(true);
        })
        .catch((e: unknown) => {
          cleanupUrl();
          setError(
            e instanceof Error ? e.message : "Failed to redeem handoff.",
          );
          setReady(true);
        });
      return;
    }

    if (runId) {
      window.sessionStorage.setItem(`lg:stream:${threadId}`, runId);
      cleanupUrl();
      setReady(true);
    }
  }, []);

  if (!ready) {
    return (
      <div className="flex size-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex size-full items-center justify-center px-4">
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  return <ChatPageInner />;
}
