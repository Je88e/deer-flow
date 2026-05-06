import { expect, test } from "vitest";

import { pathOfAuditThread } from "@/core/scout-audit/utils";

test("builds audit thread routes", () => {
  expect(pathOfAuditThread("thread-123")).toBe("/workspace/audits/thread-123");
});
