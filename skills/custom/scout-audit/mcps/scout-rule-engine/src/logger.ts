// logger.ts — MCP tool invocation logger for rule engine (stderr only)

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
  process.stderr.write(JSON.stringify(entry) + "\n")
}

type ToolResult = { content: Array<{ type: "text"; text: string }> }

export function withLogging<TArgs extends Record<string, unknown>>(
  toolName: string,
  handler: (args: TArgs) => Promise<ToolResult>
): (args: TArgs) => Promise<ToolResult> {
  return async (args: TArgs) => {
    const start = Date.now()
    try {
      const result = await handler(args)
      const text = result.content[0]?.text ?? ""
      // For rule engine, summarize as pass/fail/skip counts
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
