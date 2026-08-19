import { afterEach, describe, expect, it } from "@rstest/core";
import { cleanup, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import {
  EmbedModeProvider,
  useEmbedMode,
} from "@/components/embed/embed-mode-provider";

afterEach(cleanup);

function createWrapper(embedded: boolean) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <EmbedModeProvider embedded={embedded}>{children}</EmbedModeProvider>
    );
  };
}

describe("useEmbedMode", () => {
  it("defaults to embedded=false without a provider (standalone app)", () => {
    const { result } = renderHook(() => useEmbedMode());
    expect(result.current.embedded).toBe(false);
  });

  it("reads embedded=true from the provider", () => {
    const { result } = renderHook(() => useEmbedMode(), {
      wrapper: createWrapper(true),
    });
    expect(result.current.embedded).toBe(true);
  });

  it("reads embedded=false when the provider is explicit", () => {
    const { result } = renderHook(() => useEmbedMode(), {
      wrapper: createWrapper(false),
    });
    expect(result.current.embedded).toBe(false);
  });
});
