import { afterEach, describe, expect, it } from "@rstest/core";
import { cleanup, render, screen } from "@testing-library/react";

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
});
