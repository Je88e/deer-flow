import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

import WorkspaceChatPage from "@/app/workspace/chats/[thread_id]/page";
import { useEmbedMode } from "@/components/embed/embed-mode-provider";

// ChatPage pulls in the whole chat stack (streams, queries, settings). For
// the embed branch decision we only need to know what wraps it, so replace
// it with a probe that reports the embed context it renders under. The probe
// component is injected via globalThis so the hoisted mock factory stays
// free of outer references.
rs.mock("@/components/workspace/chats/chat-page", () => ({
  default: function ChatPageProbeSlot() {
    const probe = (globalThis as { __chatPageProbe?: () => ReactNode })
      .__chatPageProbe;
    const Probe = probe ?? (() => <div data-testid="chat-page-probe" />);
    return <Probe />;
  },
}));

// Task 5 mounts the EMBED thread panel inside EmbedLayout. This suite pins
// the page's embed-branch decision, so stub the panel rather than dragging
// its hooks and i18n provider requirements into every case.
rs.mock("@/components/embed/embed-thread-list", () => ({
  EmbedThreadList: () => <div data-testid="embed-thread-list" />,
}));

afterEach(() => {
  delete (globalThis as { __chatPageProbe?: () => ReactNode }).__chatPageProbe;
  cleanup();
});

function installEmbedProbe() {
  // Reports the embed context the mocked ChatPage renders under.
  (globalThis as { __chatPageProbe?: () => ReactNode }).__chatPageProbe =
    function EmbedProbe(): ReactElement {
      const { embedded } = useEmbedMode();
      return <div data-testid="chat-page-probe">{`embedded=${embedded}`}</div>;
    };
}

async function renderPage(
  searchParams: Record<string, string | string[] | undefined>,
) {
  installEmbedProbe();
  const element = await WorkspaceChatPage({
    searchParams: Promise.resolve(searchParams),
  });
  return render(element);
}

describe("workspace chat page embed branch", () => {
  it("keeps the original rendering path when embed is absent", async () => {
    await renderPage({});
    expect(screen.getByTestId("chat-page-probe").textContent).toBe(
      "embedded=false",
    );
    expect(document.querySelector('[data-embed-layout="true"]')).toBeNull();
  });

  it("does not enter embed mode for other embed values", async () => {
    await renderPage({ embed: "1" });
    expect(screen.getByTestId("chat-page-probe").textContent).toBe(
      "embedded=false",
    );
    expect(document.querySelector('[data-embed-layout="true"]')).toBeNull();
  });

  it("wraps chat in the embed shell and context when ?embed=true", async () => {
    await renderPage({ embed: "true" });
    expect(screen.getByTestId("chat-page-probe").textContent).toBe(
      "embedded=true",
    );
    const shell = document.querySelector('[data-embed-layout="true"]');
    expect(shell).not.toBeNull();
    expect(shell?.contains(screen.getByTestId("chat-page-probe"))).toBe(true);
  });
});
