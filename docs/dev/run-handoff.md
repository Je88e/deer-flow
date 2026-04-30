# Cross-Origin Run Handoff

## 背景

DeerFlow 前端的流式展示基于 `useStream` 的断线重连能力，默认通过同源 `sessionStorage` 的 `lg:stream:{thread_id}` 保存 `run_id`。当“触发 run 的 JS 所在页面”与“DeerFlow 前端页面”不同源时，无法共享 `sessionStorage`，需要新的交接机制。

## 方案概览

- 外部系统通过标准 HTTP 启动 run，拿到 `thread_id` 与 `run_id`
- 外部系统向 DeerFlow Gateway 创建一次性 `handoff token`
- 跳转到 DeerFlow 前端时使用 hash 传递 token：`/workspace/chats/{thread_id}#handoff={token}`
- 前端页面加载后兑换 token，写入 `sessionStorage`，触发 `useStream` 重连并流式渲染

## API

### 创建 handoff token

`POST /api/handoff`

Body:

```json
{
  "thread_id": "t_...",
  "run_id": "r_...",
  "ttl_seconds": 300
}
```

Response:

```json
{
  "token": "....",
  "expires_at": "2026-04-28T00:00:00+00:00"
}
```

### 兑换 handoff token

`POST /api/handoff/redeem`

Body:

```json
{
  "token": "...."
}
```

Response:

```json
{
  "thread_id": "t_...",
  "run_id": "r_...",
  "expires_at": "2026-04-28T00:00:00+00:00"
}
```

## 外部 JS 触发示例（StarLIMS 等）

```javascript
const BASE_URL = "http://localhost:2026";

async function startRunAndOpenUI({ metadata, message }) {
  const thread = await fetch(`${BASE_URL}/api/langgraph/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata }),
  }).then((r) => r.json());

  const threadId = thread.thread_id;

  const run = await fetch(`${BASE_URL}/api/langgraph/threads/${threadId}/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input: {
        messages: [
          { type: "human", content: [{ type: "text", text: message }] },
        ],
      },
      config: { recursion_limit: 1000 },
      stream_mode: ["values", "messages-tuple", "custom"],
      stream_subgraphs: true,
    }),
  }).then((r) => r.json());

  const runId = run.run_id;

  const handoff = await fetch(`${BASE_URL}/api/handoff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ thread_id: threadId, run_id: runId, ttl_seconds: 300 }),
  }).then((r) => r.json());

  const token = handoff.token;
  const url = `${BASE_URL}/workspace/chats/${threadId}#handoff=${encodeURIComponent(token)}`;
  window.open(url, "_blank");
}
```

