# 调查报告：Plan B 执行后前端重连恢复流式输出失效

> **日期**: 2026-06-04
> **关联计划**: `docs/plans/plan-handoff-url-direct-runid.md`
> **结论**: 计划变更本身未引入代码级回归；重连失效最可能是后端重启导致 `MemoryStreamBridge` 缓冲区清空 + 活跃 run 被 `reconcile_orphaned_inflight_runs` 标为 error 的正常行为。

---

## 1. 概述

执行 Plan B（移除后端 handoff token 系统，简化为 URL 直传 `run_id`）后，用户反馈"前端重连恢复流式输出不生效"。本报告记录了完整的代码审查、diff 分析和 SDK 源码追踪过程。

## 2. Plan B 变更清单

| Commit | 范围 | 改动内容 |
|--------|------|----------|
| `29457e42` | Backend | 删除 `handoff.py`、`test_handoff_router.py`，更新 `__init__.py`、`app.py`、`auth_middleware.py`、`csrf_middleware.py`、文档 |
| `9276c323` | Frontend | 删除 `handoff/api.ts`，简化 `page.tsx`（移除 `redeemHandoff` 异步流程） |
| `cb1a9016` | Nginx | 移除 `/api/handoff` location 块（nginx.conf + nginx.local.conf） |
| `84eeaa9a` | Docs | 更新 `run-handoff.md` 文档 |

**差分文件数**: 12 files, +150/-356 lines

**与重连直接相关的文件变更**: 无。重连核心路径（`hooks.ts`、`api-client.ts`、`thread_runs.py`、`services.py`、`memory.py`）均未修改。

## 3. 重连机制的逐层验证

### 3.1 前端：`reconnectOnMount` + sessionStorage

- `useThreadStream` → `useStream(threadId, reconnectOnMount: true)` ✓ 未修改
- SDK 内部 `useStreamLGP` 将 `runMetadataStorage` 设为 `window.sessionStorage` ✓
- `reconnectKey` useMemo 依赖 `[runMetadataStorage, stream.isLoading, threadId]` ✓
- 重连 useEffect `if (reconnectKey && shouldReconnect)` → `joinStream(runId)` ✓

### 3.2 前端：自定义 `joinStream` 包装器

- `getAPIClient()` 对 `client.runs.joinStream` 做了 409 错误包装 ✓ 未修改
- `isInactiveRunStreamError` 匹配: `status===409` + `"not active on this worker"` + `"cannot be streamed"` ✓
- `clearReconnectRun` 清除 `lg:stream:{threadId}` key ✓
- `sanitizeRunStreamOptions` 对流模式做白名单过滤 ✓

### 3.3 SDK 实际的 HTTP 端点

**关键发现**: SDK 的 `joinStream` 使用 **`GET /threads/{threadId}/runs/{runId}/stream`**，而非 `GET /join`。

```js
// @langchain/langgraph-sdk v1.6.0, dist/client.js:944-956
async *joinStream(threadId, runId, options) {
    yield* this.streamWithRetry({
        endpoint: `/threads/${threadId}/runs/${runId}/stream`,
        method: "GET",
        headers: opts?.lastEventId ? { "Last-Event-ID": opts.lastEventId } : void 0,
        params: {
            cancel_on_disconnect: opts?.cancelOnDisconnect ? "1" : "0",
            stream_mode: opts?.streamMode
        }
    });
}
```

请求示例：
```
GET /api/langgraph/threads/{threadId}/runs/{runId}/stream?cancel_on_disconnect=0
Last-Event-ID: -1
```

映射到后端 `stream_existing_run`（`app/gateway/routers/thread_runs.py:285-330`），通过 `require_permission("runs", "read", owner_check=True)`。

### 3.4 后端：`stream_existing_run` 端点

```python
# GET/POST /{thread_id}/runs/{run_id}/stream
async def stream_existing_run(thread_id, run_id, request, action=None, wait=0):
    record = await run_mgr.get(run_id)
    if record is None or record.thread_id != thread_id:
        raise HTTPException(404)
    if record.store_only and action is None:
        raise HTTPException(409, "not active on this worker ... cannot be streamed")
    # 如果 action is not None → cancel → 返回
    # 否则 → sse_consumer(bridge, record, request, run_mgr)
```

`store_only` 判断: run 在持久化存储中存在但在当前 worker 内存中无活跃 task 时（典型场景：后端重启后）。

### 3.5 后端：`sse_consumer` 与 `on_disconnect`

```python
# services.py:373-404
async def sse_consumer(bridge, record, request, run_mgr):
    last_event_id = request.headers.get("Last-Event-ID")  # "-1"
    try:
        async for entry in bridge.subscribe(record.run_id, last_event_id=last_event_id):
            if await request.is_disconnected():
                break
            # yield SSE frames ...
    finally:
        if record.status in (pending, running):
            if record.on_disconnect == DisconnectMode.cancel:
                await run_mgr.cancel(record.run_id)  # ← 取消 run!
```

`on_disconnect` 默认值为 `"cancel"`：

```python
# thread_runs.py:52
on_disconnect: Literal["cancel", "continue"] = Field(default="cancel", ...)
```

**DeerFlow 前端自身创建 run 时**（`thread.submit(streamResumable:true)`），SDK 将其转为 `on_disconnect: "continue"`，所以正常刷新不会取消 run。**但外部系统通过 `POST /runs` 直接创建 run 时，默认不传该字段 → `on_disconnect: cancel`。**

### 3.6 `MemoryStreamBridge` 缓冲与重放

- 事件缓冲上限: 256 个（环形缓冲）✓
- `_resolve_start_offset`: `last_event_id="-1"` 不匹配任何事件 → 回退到 `start_offset` → 重放全部可用事件 ✓
- `subscribe`: 无事件时通过 `asyncio.Condition.wait(heartbeat_interval=15s)` 等待 ✓

### 3.7 后端重启：孤儿 run 恢复

```python
# deps.py:169-175
recovered_runs = await app.state.run_manager.reconcile_orphaned_inflight_runs(
    error="Gateway restarted before this run reached a durable final state.",
    before=now_iso(),
)
```

重启后所有 `pending`/`running` run → `error` 状态。前端重连时 `run_mgr.get()` 返回已完成/error 的 run → `store_only=True` → 409 → `clearReconnectRun` 静默清除 → 回退到 checkpoint 加载历史。

## 4. 前端渲染流程检查

### 4.1 `ChatPage` 的状态门控

```tsx
// page.tsx:342-397
export default function ChatPage() {
    const [ready, setReady] = useState(false);

    useEffect(() => {
        // 提取 runId、threadId
        if (!runId) { setReady(true); return; }           // 普通刷新
        if (!threadId) { setError(...); setReady(true); return; }
        // handoff 场景：写入 sessionStorage
        sessionStorage.setItem(`lg:stream:${threadId}`, runId);
        cleanupUrl();
        setReady(true);
    }, []);

    if (!ready) return <Loading />;
    return <ChatPageInner />;
}
```

**旧代码对比**: `redeemHandoff` 是异步的，在 `ChatPageInner` 挂载前引入了网络延迟。新代码同步完成，但不会影响 SDK 的 `reconnectKey` 计算时机——因为 `sessionStorage.setItem` 在 `setReady(true)` 之前执行，SDK 挂载时 key 已存在。

### 4.2 `useThreadChat` 的 threadId 解析

```tsx
// use-thread-chat.ts
const { thread_id: threadIdFromPath } = useParams<{ thread_id: string }>();
const [threadId] = useState(() => threadIdFromPath === "new" ? uuid() : threadIdFromPath);
```

`useParams` 返回 `"new"` 时生成临时 UUID，否则直接使用 URL 中的 threadId。在 `/workspace/chats/{threadId}` 路径下，threadId 是实际 UUID，与 SDK 使用的 key `lg:stream:{threadId}` 一致。

### 4.3 Provider 层级

```
WorkspaceLayout (server, 需要认证)
  └─ WorkspaceContent (server)
       └─ AuthProvider (client)
            └─ ChatLayout → ChatProviders
                 └─ ChatPage → ChatPageInner → useStream(...reconnectOnMount:true)
```

未发现 Suspense 边界阻碍挂载的问题。

## 5. 后端中间件对 SSE 的影响分析

### 5.1 CSRF Middleware (`BaseHTTPMiddleware`)

- 仅对 POST/PUT/DELETE/PATCH 做 CSRF 验证；GET 请求直接透传 ✓
- `response.headers[CSRF_HEADER_NAME]` 仅在 `_is_auth && POST` 时添加 ✓
- Starlette 的 `BaseHTTPMiddleware` 对 StreamingResponse 有已知的包装问题，但**此问题 Plan B 前后一致**

### 5.2 Auth Middleware (`BaseHTTPMiddleware`)

- `_PUBLIC_PATH_PREFIXES` = `("/health", "/docs", "/redoc", "/openapi.json")` ✓（`/api/handoff` 已在 Plan B 中移除）
- `require_permission("runs", "read", owner_check=True)` 要求用户是 thread 的 owner
- 对于**相同用户创建的 run**（包括 no-auth 模式下 user_id=`"default"`），owner check 通过

### 5.3 Nginx 路由

- SSE 重连请求走 `/api/langgraph/` location → rewrite 到 `/api/*` → proxy to gateway
- 该 location 有长超时（600s）、`proxy_buffering off`、`X-Accel-Buffering no` ✓

## 6. 排查结论

### 未发现代码级回归

Plan B 的 12 个文件变更中，**没有任何文件直接修改了重连链路的关键逻辑**：
- `hooks.ts:385-390` (useStream + reconnectOnMount) — 未修改
- `api-client.ts:102-117` (joinStream 包装器) — 未修改
- `thread_runs.py:285-330` (stream_existing_run) — 未修改
- `services.py:373-404` (sse_consumer) — 未修改
- `memory.py` (MemoryStreamBridge) — 未修改

### 最可能的失效原因

| 场景 | 发生条件 | 表现 |
|------|----------|------|
| 后端重启（`make dev` 重启） | `MemoryStreamBridge` 清空 + `reconcile_orphaned_inflight_runs` | run 变为 error/`store_only` → 409 → 静默清除 sessionStorage → 回退到 checkpoint |
| 外部 run 的 `on_disconnect=cancel` | 外部系统 `POST /runs` 未传 `on_disconnect` 字段 | 页面刷新后 SSE 断连 → run 被取消 → 重连得 409 |
| 已完成的 run | run 先于页面刷新完成 | `onSuccess` 已清除 sessionStorage key → SDK 无 key 可读 → 正常从 checkpoint 加载 |

### 诊断建议

在浏览器 DevTools 中检查：

1. **Network 面板**: 搜索 `/runs/.*stream` 请求：
   - 无此请求 → sessionStorage 无 key（run 已完成或 key 被清除）
   - HTTP 409 → run 不可流式传输（`store_only`）
   - HTTP 200 但无 SSE 事件 → 中间件或 nginx 缓冲问题
2. **Application > Session Storage**: 检查 `lg:stream:{threadId}` key 是否存在
3. **Console**: 检查 SDK 或 fetch 相关的错误日志

## 7. 潜在改进点（非修复）

以下改进可提升重连的健壮性，但不是 Plan B 回归的直接修复：

1. **`stream_existing_run` 端点**: 对 `GET /stream`（无 action）自动将 `on_disconnect` 切换为 `continue`，使外部创建的 run 也支持重连
2. **前端诊断日志**: 在 `joinStream` 包装器中添加 `console.info` 记录重连请求和响应状态
3. **后端诊断日志**: 在 `stream_existing_run` 端点记录 `store_only` 判断的详细信息

## 8. 涉及的关键文件

| 文件 | 角色 |
|------|------|
| `frontend/src/core/threads/hooks.ts:385-390` | useStream + reconnectOnMount |
| `frontend/src/core/api/api-client.ts:65-117` | joinStream wrapper + clearReconnectRun |
| `frontend/src/core/api/stream-mode.ts` | sanitizeRunStreamOptions |
| `frontend/src/core/config/index.ts:21-44` | getLangGraphBaseURL |
| `frontend/src/app/workspace/chats/[thread_id]/page.tsx:342-397` | ChatPage 入口 |
| `frontend/src/components/workspace/chats/use-thread-chat.ts` | threadId 解析 |
| `frontend/node_modules/@langchain/langgraph-sdk/dist/react/stream.lgp.js` | SDK useStreamLGP (reconnectKey, joinStream) |
| `frontend/node_modules/@langchain/langgraph-sdk/dist/react/thread.js` | useControllableThreadId |
| `frontend/node_modules/@langchain/langgraph-sdk/dist/client.js:944-956` | RunsClient.joinStream |
| `backend/app/gateway/routers/thread_runs.py:52,258-330` | RunCreateRequest + stream_existing_run + join_run |
| `backend/app/gateway/services.py:270-404` | start_run + sse_consumer |
| `backend/app/gateway/authz.py:197-301` | require_permission (owner_check) |
| `backend/app/gateway/csrf_middleware.py:174-227` | CSRFMiddleware |
| `backend/app/gateway/auth_middleware.py:25-49` | AuthMiddleware (PUBLIC_PATH_PREFIXES) |
| `backend/packages/harness/deerflow/runtime/stream_bridge/memory.py` | MemoryStreamBridge |
| `docker/nginx/nginx.conf` | Nginx SSE 配置 |
