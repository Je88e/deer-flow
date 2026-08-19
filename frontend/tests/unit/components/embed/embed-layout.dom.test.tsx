import { afterEach, describe, expect, it, rs } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";

// The layout now mounts the embed thread panel (client hooks) beside the
// children slot; stub it so these layout tests stay about the shell itself.
rs.mock("@/components/embed/embed-thread-list", () => ({
  EmbedThreadList: () => <div data-testid="embed-thread-list" />,
}));

import { EmbedLayout } from "@/components/embed/embed-layout";

afterEach(cleanup);

describe("EmbedLayout", () => {
  it("renders its children through the slot", () => {
    render(
      <EmbedLayout>
        <p>chat content</p>
      </EmbedLayout>,
    );
    expect(screen.getByText("chat content")).not.toBeNull();
  });

  it("marks the shell so hosts and tests can detect embed mode", () => {
    const { container } = render(
      <EmbedLayout>
        <p>chat content</p>
      </EmbedLayout>,
    );
    expect(
      container.querySelector('[data-embed-layout="true"]'),
    ).not.toBeNull();
  });

  it("mounts the thread panel as a sibling column", () => {
    render(
      <EmbedLayout>
        <p>chat content</p>
      </EmbedLayout>,
    );
    expect(screen.getByTestId("embed-thread-list")).not.toBeNull();
    expect(screen.getByText("chat content")).not.toBeNull();
  });
});
