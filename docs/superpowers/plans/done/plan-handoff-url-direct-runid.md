# Handoff 方案 B：URL 直传 run_id — 改造计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除后端 handoff token 系统，将跨域 run 交接简化为纯前端 URL 直传 `run_id` 方案，消除 CORS 问题和认证复杂性。

**Architecture:** 外部系统创建 thread + run 后，直接通过 `window.open(URL?run_id={run_id})` 打开 DeerFlow 前端。前端已有完整的 `run_id` URL 解析和 `sessionStorage` 写入逻辑，无需任何后端 API 调用。useStream 自动检测 sessionStorage 中的 run_id 并重连到正在执行的 run 的 SSE 流。

**Tech Stack:** Python/FastAPI (后端删除), TypeScript/React/Next.js (前端简化), Nginx (配置清理)

---

## File Structure

### 将被删除的文件

| 文件 | 职责 |
|------|------|
| `backend/app/gateway/routers/handoff.py` | `POST /api/handoff` + `POST /api/handoff/redeem` 路由 |
| `frontend/src/core/handoff/api.ts` | `redeemHandoff()` API 调用 |
| `backend/tests/test_handoff_router.py` | Handoff 路由测试 |

### 将被修改的文件

| 文件 | 改动 |
|------|------|
| `backend/app/gateway/routers/__init__.py` | 移除 handoff 导入和 `__all__` 条目 |
| `backend/app/gateway/app.py:20,311-313,384` | 移除 handoff 导入、OpenAPI tag、router 注册 |
| `backend/app/gateway/auth_middleware.py:30-38` | 从 `_PUBLIC_PATH_PREFIXES` 移除 `/api/handoff` |
| `frontend/src/app/workspace/chats/[thread_id]/page.tsx:26,347-407` | 移除 `redeemHandoff` 导入和 token 兑换逻辑 |
| `docker/nginx/nginx.conf:146-159` | 移除 `/api/handoff` location 块 |
| `docker/nginx/nginx.local.conf:130-143` | 移除 `/api/handoff` location 块 |
| `docs/dev/run-handoff.md` | 更新为 URL 直传方案文档 |
| `backend/docs/THIRD_PARTY_INTEGRATION.md` | 移除 handoff API 引用（如适用） |

### 保持不变的文件

| 文件 | 原因 |
|------|------|
| `docs/dev/handoff-redesign-background.md` | 保留为历史背景参考 |

---

## Task 1: 移除后端 handoff 路由模块

**Files:**
- Delete: `backend/app/gateway/routers/handoff.py`
- Delete: `backend/tests/test_handoff_router.py`
- Modify: `backend/app/gateway/routers/__init__.py:1`
- Modify: `backend/app/gateway/app.py:13-30,311-313,384`
- Modify: `backend/app/gateway/auth_middleware.py:25-39`

- [ ] **Step 1: 删除 handoff 路由文件和测试文件**

```bash
rm backend/app/gateway/routers/handoff.py
rm backend/tests/test_handoff_router.py
```

- [ ] **Step 2: 更新 `routers/__init__.py` — 移除 handoff**

将 `backend/app/gateway/routers/__init__.py` 改为：

```python
from . import artifacts, assistants_compat, mcp, models, skills, suggestions, thread_runs, threads, uploads

__all__ = [
    "artifacts",
    "assistants_compat",
    "mcp",
    "models",
    "skills",
    "suggestions",
    "threads",
    "thread_runs",
    "uploads",
]
```

- [ ] **Step 3: 更新 `app.py` — 移除 handoff 导入和注册**

在 `backend/app/gateway/app.py` 中：

(a) 从 import 块（行 13-30）移除 `handoff`：

```python
from app.gateway.routers import (
    agents,
    artifacts,
    assistants_compat,
    auth,
    channels,
    feedback,
    mcp,
    memory,
    models,
    runs,
    skills,
    suggestions,
    thread_runs,
    threads,
    uploads,
)
```

(b) 从 `openapi_tags`（行 258-315）移除 handoff tag：

```python
            {
                "name": "health",
                "description": "Health check and system status endpoints",
            },
```

（删除行 311-313 的 handoff tag 块）

(c) 从 router 注册区（行 384 附近）移除 handoff：

删除这一行：
```python
    app.include_router(handoff.router)
```

- [ ] **Step 4: 更新 `auth_middleware.py` — 移除 `/api/handoff` 公开路径**

将 `backend/app/gateway/auth_middleware.py` 的 `_PUBLIC_PATH_PREFIXES`（行 25-39）改为：

```python
# Paths that never require authentication.
_PUBLIC_PATH_PREFIXES: tuple[str, ...] = (
    "/health",
    "/docs",
    "/redoc",
    "/openapi.json",
)
```

删除原来的 `/api/handoff` 条目及其上方 6 行注释。

- [ ] **Step 5: 提交后端变更**

```bash
git add -A backend/
git commit -m "refactor: remove backend handoff token system (Plan B migration)"
```

---

## Task 2: 简化前端 — 移除 handoff token 兑换逻辑

**Files:**
- Delete: `frontend/src/core/handoff/api.ts`
- Modify: `frontend/src/app/workspace/chats/[thread_id]/page.tsx:26,347-407`

- [ ] **Step 1: 删除 handoff API 模块**

```bash
rm frontend/src/core/handoff/api.ts
```

检查 `frontend/src/core/handoff/` 目录是否还有其他文件，如果目录为空则删除整个目录：

```bash
rmdir frontend/src/core/handoff 2>/dev/null; true
```

- [ ] **Step 2: 简化 `page.tsx` — 移除 handoff token 逻辑**

在 `frontend/src/app/workspace/chats/[thread_id]/page.tsx` 中：

(a) 删除第 26 行的 import：
```typescript
// 删除这一行：
import { redeemHandoff } from "@/core/handoff/api";
```

(b) 将 `ChatPage` 组件（行 343-426）简化为只保留 `run_id` 逻辑：

```typescript
export default function ChatPage() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hashParams = getHashParams(url.hash);
    const runId =
      normalizeUrlParam(hashParams.get("run_id")) ??
      normalizeUrlParam(url.searchParams.get("run_id"));
    const threadId = getThreadIdFromPathname(url.pathname);

    const cleanupUrl = () => {
      url.hash = "";
      url.searchParams.delete("run_id");
      const search = url.searchParams.toString();
      const nextUrl = `${url.pathname}${search ? `?${search}` : ""}`;
      history.replaceState(null, "", nextUrl);
    };

    if (!runId) {
      setReady(true);
      return;
    }

    if (!threadId) {
      cleanupUrl();
      setError("Invalid chat URL.");
      setReady(true);
      return;
    }

    // Direct run_id pass-through: write to sessionStorage, triggering useStream reconnect
    window.sessionStorage.setItem(`lg:stream:${threadId}`, runId);
    cleanupUrl();
    setReady(true);
  }, []);

  if (!ready) {
    return (
      <div className="flex size-full items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex size-full items-center justify-center px-4">
        <div className="text-sm">{error}</div>
      </div>
    );
  }

  return <ChatPageInner />;
}
```

关键变更：
- 移除了 `token` 变量和 `handoff` 参数提取
- 移除了 `redeemHandoff()` 异步调用及其错误处理
- `cleanupUrl()` 不再清理 `handoff` 参数
- 只保留 `run_id` 直接写入 `sessionStorage` 的逻辑（同步、零网络调用）
- 移除了 `void redeemHandoff(...).then(...)` 的异步分支和 Loading 状态

- [ ] **Step 3: 验证前端构建**

Run: `cd /home/jesse/project/deer-flow/frontend && pnpm check`
Expected: No type errors, no lint errors. The `redeemHandoff` import is gone.

- [ ] **Step 4: 提交前端变更**

```bash
git add -A frontend/
git commit -m "refactor: remove handoff token redemption, simplify to URL-direct run_id"
```

---

## Task 3: 清理 Nginx 配置 — 移除 handoff location 块

**Files:**
- Modify: `docker/nginx/nginx.conf:146-159`
- Modify: `docker/nginx/nginx.local.conf:130-143`

- [ ] **Step 1: 更新 `nginx.conf`（Docker 生产）**

在 `docker/nginx/nginx.conf` 中，删除行 146-159（`/api/handoff` location 块）：

删除这个完整的 location 块：
```nginx
        # Handoff: cross-origin run-handoff tokens for external browser clients.
        # Uses the same headers as other API locations so cookie forwarding,
        # buffering, and proxy caching stay aligned.
        location /api/handoff {
            proxy_pass http://$gateway_upstream;
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_pass_header Set-Cookie;
            proxy_buffering off;
            proxy_cache off;
        }
```

注意：这不会影响功能，因为 `/api/handoff` 路径会被 catch-all `location /api/` 块（在它后面）兜底。但由于后端已不再注册此路由，所有对 `/api/handoff` 的请求都会返回 404。移除显式 location 块可以让 nginx 配置更干净。

- [ ] **Step 2: 更新 `nginx.local.conf`（本地开发）**

在 `docker/nginx/nginx.local.conf` 中，删除行 146-159（同样的 `/api/handoff` location 块）：

删除这个完整的 location 块：
```nginx
        # Handoff: cross-origin run-handoff tokens for external browser clients.
        # Uses the same headers as other API locations so cookie forwarding,
        # buffering, and proxy caching stay aligned.
        location /api/handoff {
            proxy_pass http://gateway;
            proxy_http_version 1.1;
            proxy_set_header Host $http_host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_pass_header Set-Cookie;
            proxy_buffering off;
            proxy_cache off;
        }
```

- [ ] **Step 3: 提交 Nginx 变更**

```bash
git add docker/nginx/
git commit -m "refactor: remove /api/handoff nginx location blocks (Plan B migration)"
```

---

## Task 4: 更新文档

**Files:**
- Rewrite: `docs/dev/run-handoff.md`
- Update: `backend/docs/THIRD_PARTY_INTEGRATION.md` (如包含 handoff 引用)

- [ ] **Step 1: 重写 `docs/dev/run-handoff.md`**

将文件内容替换为 URL 直传方案的文档：

```markdown
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
```

- [ ] **Step 2: 检查 `THIRD_PARTY_INTEGRATION.md` 是否引用 handoff**

Run: `grep -n "handoff" /home/jesse/project/deer-flow/backend/docs/THIRD_PARTY_INTEGRATION.md`

如果输出为空（当前文档中不包含 handoff 引用），则无需修改此文件。

- [ ] **Step 3: 提交文档变更**

```bash
git add docs/dev/run-handoff.md
git commit -m "docs: update run-handoff to URL-direct run_id scheme (Plan B)"
```

---

## Task 5: 验证构建和测试

**Files:** 无新文件

- [ ] **Step 1: 运行后端测试**

Run: `cd /home/jesse/project/deer-flow/backend && PYTHONPATH=. uv run pytest tests/ -v --ignore=tests/test_handoff_router.py -x`
Expected: All tests pass. No import errors from missing `handoff` module.

- [ ] **Step 2: 验证后端 lint**

Run: `cd /home/jesse/project/deer-flow/backend && make lint`
Expected: No lint errors.

- [ ] **Step 3: 验证前端构建和类型检查**

Run: `cd /home/jesse/project/deer-flow/frontend && pnpm check`
Expected: No type errors, no lint errors.

- [ ] **Step 4: 验证 Gateway 启动**

Run: `cd /home/jesse/project/deer-flow/backend && PYTHONPATH=. uv run python -c "from app.gateway.app import create_app; app = create_app(); routes = [r.path for r in app.routes]; assert '/api/handoff' not in routes; assert '/api/handoff/redeem' not in routes; print('OK: handoff routes removed')"`
Expected: `OK: handoff routes removed`

- [ ] **Step 5: 提交验证（无需提交，仅确认通过）**

---

## Self-Review Checklist

### Spec Coverage

| 背景/需求 | 对应 Task |
|-----------|-----------|
| 移除 `backend/app/gateway/routers/handoff.py` | Task 1 |
| 移除 `backend/tests/test_handoff_router.py` | Task 1 |
| 更新 `__init__.py` | Task 1 |
| 更新 `app.py` 导入、tag、router | Task 1 |
| 更新 `auth_middleware.py` 公开路径 | Task 1 |
| 移除 `frontend/src/core/handoff/api.ts` | Task 2 |
| 简化 `page.tsx` token 兑换逻辑 | Task 2 |
| 移除 `nginx.conf` handoff location | Task 3 |
| 移除 `nginx.local.conf` handoff location | Task 3 |
| 更新 `docs/dev/run-handoff.md` | Task 4 |
| 验证构建和测试 | Task 5 |

### Placeholder Scan

No TBD, TODO, or placeholder steps found. All code blocks contain complete implementations.

### Type Consistency

- `run_id` is `string | null` throughout (from `normalizeUrlParam` return type)
- `threadId` is `string | null` (from `getThreadIdFromPathname` return type)
- No cross-task type dependencies (each task is independent cleanup)
