import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

rs.mock("@/core/i18n/hooks", () => ({
  useI18n: () => ({
    locale: "en-US",
    changeLocale: rs.fn(),
    t: {
      common: { rename: "Rename", delete: "Delete" },
      chats: { pinChat: "Pin chat", unpinChat: "Unpin chat" },
    },
  }),
}));

import { EmbedThreadItem } from "@/components/embed/embed-thread-item";
import type { AgentThread } from "@/core/threads/types";

function makeThread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    thread_id: "thread-1",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    status: "idle",
    metadata: {},
    values: {
      title: "Trip to Kyoto",
      messages: [],
      artifacts: [],
      todos: [],
    },
    ...overrides,
  } as AgentThread;
}

function setupItem(
  overrides: {
    thread?: AgentThread;
    isActive?: boolean;
  } = {},
) {
  const onSelect = rs.fn();
  const onTogglePinned = rs.fn();
  const onDelete = rs.fn();
  const onRename = rs.fn();
  const thread = overrides.thread ?? makeThread();
  render(
    <EmbedThreadItem
      thread={thread}
      isActive={overrides.isActive ?? false}
      onSelect={onSelect}
      onTogglePinned={onTogglePinned}
      onDelete={onDelete}
      onRename={onRename}
    />,
  );
  return { thread, onSelect, onTogglePinned, onDelete, onRename };
}

afterEach(cleanup);

describe("EmbedThreadItem", () => {
  it("renders the thread title from the shared util", () => {
    setupItem();
    expect(
      screen.getByRole("button", { name: "Trip to Kyoto" }),
    ).not.toBeNull();
  });

  it("falls back to the shared Untitled default", () => {
    setupItem({
      thread: makeThread({ values: {} as AgentThread["values"] }),
    });
    expect(screen.getByRole("button", { name: "Untitled" })).not.toBeNull();
  });

  it("marks the active thread with aria-current", () => {
    setupItem({ isActive: true });
    expect(
      screen
        .getByRole("button", { name: "Trip to Kyoto" })
        .getAttribute("aria-current"),
    ).toBe("page");
  });

  it("does not mark inactive threads", () => {
    setupItem({ isActive: false });
    expect(
      screen
        .getByRole("button", { name: "Trip to Kyoto" })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("selects the thread when the row is clicked", () => {
    const { thread, onSelect } = setupItem();
    fireEvent.click(screen.getByRole("button", { name: "Trip to Kyoto" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(thread);
  });

  it("offers pin/unpin depending on the shared pinned state", () => {
    const pinned = setupItem({
      thread: makeThread({ metadata: { deerflow_pinned: true } }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Unpin chat" }));
    expect(pinned.onTogglePinned).toHaveBeenCalledWith(pinned.thread);
    cleanup();

    const unpinned = setupItem();
    fireEvent.click(screen.getByRole("button", { name: "Pin chat" }));
    expect(unpinned.onTogglePinned).toHaveBeenCalledWith(unpinned.thread);
  });

  it("renames inline: edit, Enter commits, Escape cancels", () => {
    const { onRename } = setupItem();
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));

    const input = screen.getByTestId("embed-thread-rename-input");
    expect((input as HTMLInputElement).value).toBe("Trip to Kyoto");

    fireEvent.change(input, { target: { value: "Kyoto notes" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(onRename).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Trip to Kyoto" }),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const inputAgain = screen.getByTestId("embed-thread-rename-input");
    fireEvent.change(inputAgain, { target: { value: "Kyoto notes" } });
    fireEvent.keyDown(inputAgain, { key: "Enter" });
    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onRename).toHaveBeenCalledWith(expect.anything(), "Kyoto notes");
  });

  it("does not commit an empty rename", () => {
    const { onRename } = setupItem();
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const input = screen.getByTestId("embed-thread-rename-input");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRename).not.toHaveBeenCalled();
  });

  it("deletes the thread from the row action", () => {
    const { thread, onDelete } = setupItem();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith(thread);
  });
});
