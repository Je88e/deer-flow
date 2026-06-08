// logger.ts — MCP tool invocation logger (stderr only, never stdout)

export interface LogEntry {
  timestamp: string
  tool: string
  params: Record<string, unknown>
  resultSummary: string
  durationMs: number
  status: "ok" | "error"
}

export function logToolCall(
  tool: string,
  params: Record<string, unknown>,
  result: { ok: boolean; summary: string },
  startTime: number
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    tool,
    params,
    resultSummary: result.summary,
    durationMs: Date.now() - startTime,
    status: result.ok ? "ok" : "error",
  }
  // MCP uses stdout for protocol; log to stderr only
  process.stderr.write(JSON.stringify(entry) + "\n")
}

type ToolResult = { content: Array<{ type: "text"; text: string }> }

/** Wrap a tool handler with logging */
export function withLogging<TArgs extends Record<string, unknown>>(
  toolName: string,
  handler: (args: TArgs) => Promise<ToolResult>
): (args: TArgs) => Promise<ToolResult> {
  return async (args: TArgs) => {
    const start = Date.now()
    try {
      const result = await handler(args)
      // Truncate summary to prevent huge log lines
      const text = result.content[0]?.text ?? ""
      const summary = text.length > 200 ? text.slice(0, 200) + "..." : text
      logToolCall(toolName, args as Record<string, unknown>, { ok: true, summary }, start)
      return result
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logToolCall(toolName, args as Record<string, unknown>, { ok: false, summary: msg }, start)
      throw err
    }
  }
}
