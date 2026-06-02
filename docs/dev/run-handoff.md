# Cross-Origin Run Handoff（URL 直传方案）

## 背景

DeerFlow 前端的流式展示基于 `useStream` 的断线重连能力，通过 `sessionStorage` 的 `lg:stream:{thread_id}` 键保存 `run_id`。当"触发 run 的 JS 所在页面"与"DeerFlow 前端页面"不同源时，无法共享 `sessionStorage`，需要通过 URL 参数传递 `run_id`。

## 方案概览

- 外部系统通过标准 HTTP 启动 run，拿到 `thread_id` 与 `run_id`
- 外部系统通过 `window.open()` 跳转到 DeerFlow 前端，在 URL 中传递 `run_id`
- 前端页面加载后从 URL 提取 `run_id`，写入 `sessionStorage`，触发 `useStream` 重连并流式渲染

## 支持的 URL 格式

```
/workspace/chats/{thread_id}?run_id={run_id}
/workspace/chats/{thread_id}#run_id={run_id}
```

两种格式等价，`search params`（`?`）和 `hash params`（`#`）均支持。

## 数据流

```
外部系统 JS
  │
  ├─ 1. POST /api/langgraph/threads  → { thread_id }
  ├─ 2. POST .../threads/{tid}/runs  → { run_id }
  │
  └─ 3. window.open(BASE_URL/workspace/chats/{tid}?run_id={rid})
        │
        ▼
DeerFlow 前端
  │
  ├─ page.tsx: 从 URL 提取 run_id
  ├─ sessionStorage.setItem("lg:stream:{tid}", runId)
  ├─ cleanupUrl() 清除 URL 中的 run_id 参数
  └─ useStream (reconnectOnMount: true)
       → client.runs.joinStream(threadId, runId)
       → 流式重连到正在执行的 run
```

## 外部 JS 触发示例

```javascript
const BASE_URL = "http://localhost:2026";

async function startRunAndOpenUI({ metadata, message }) {
  // 1. 创建 thread
  const thread = await fetch(`${BASE_URL}/api/langgraph/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ metadata }),
  }).then((r) => r.json());

  const threadId = thread.thread_id;

  // 2. 创建并启动 run
  const run = await fetch(
    `${BASE_URL}/api/langgraph/threads/${threadId}/runs`,
    {
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
    },
  ).then((r) => r.json());

  const runId = run.run_id;

  // 3. 直接在 URL 中传递 run_id，打开 DeerFlow 前端
  const url = `${BASE_URL}/workspace/chats/${threadId}?run_id=${encodeURIComponent(runId)}`;
  window.open(url, "_blank");
}
```

## 安全考量

- **run_id 不可猜测**：UUID v4 格式（128 bits 随机），等同于不透明 token
- **只读操作**：`client.runs.joinStream` 是只读的流订阅，不授予写入或管理权限
- **自然过期**：run 完成后无法再 join，无需额外 TTL 机制
- **无 CORS 问题**：`window.open()` 不触发 CORS，无需配置 `GATEWAY_CORS_ORIGINS`
- **无认证要求**：纯前端操作，无需 session cookie 或 CSRF token

## 与旧方案（Handoff Token）的对比

| 维度 | 旧方案（Handoff Token） | 新方案（URL 直传） |
|------|------------------------|-------------------|
| 后端 API | 需要 `POST /api/handoff` + `POST /api/handoff/redeem` | 不需要 |
| CORS | 需要配置 `GATEWAY_CORS_ORIGINS` | 无（`window.open` 不触发 CORS） |
| 认证 | redeem 路径需要公开化 | 无 API 调用 |
| 外部系统改动 | 需要 3 步 HTTP 调用 | 只需 2 步 + URL 拼接 |
| 服务端状态 | 进程内存 dict（不跨 worker） | 无 |
