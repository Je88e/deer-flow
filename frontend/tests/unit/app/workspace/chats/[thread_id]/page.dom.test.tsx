import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";

import WorkspaceChatPage from "@/app/workspace/chats/[thread_id]/page";
import {
  EmbedModeProvider,
  useEmbedMode,
} from "@/components/embed/embed-mode-provider";

rs.mock("@/components/workspace/chats/chat-page", () => ({
  default: function ChatPageProbe() {
    const { embedded } = useEmbedMode();
    return <div data-testid="chat-page-probe">{`embedded=${embedded}`}</div>;
  },
}));

afterEach(cleanup);

describe("workspace chat page", () => {
  it.each([false, true])(
    "inherits workspace embed context (%s)",
    (embedded) => {
      render(
        <EmbedModeProvider embedded={embedded}>
          <WorkspaceChatPage />
        </EmbedModeProvider>,
      );
      expect(screen.getByTestId("chat-page-probe").textContent).toBe(
        `embedded=${embedded}`,
      );
    },
  );
});
