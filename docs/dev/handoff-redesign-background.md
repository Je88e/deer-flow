# Handoff 重连机制改造 — 背景调研

## 1. 当前 Handoff 架构

### 1.1 组件全景

```
外部系统 (cross-origin)                    DeerFlow
┌─────────────────────────┐       ┌──────────────────────────────────┐
│ 浏览器 JS                │       │                                  │
│                          │       │  nginx (:2026)                   │
│ ① POST /api/langgraph/   │──────▶│    ├─ /api/langgraph/* → gateway │
│    threads (创建 thread)  │       │    ├─ /api/handoff     → gateway │
│                          │       │    └─ /               → frontend │
│ ② POST .../runs (创建 run)│──────▶│                                  │
│                          │       │  gateway (:8001)                 │
│ ③ POST /api/handoff      │──────▶│    ├─ AuthMiddleware (fail-closed)│
│    (创建 handoff token)   │       │    ├─ CSRFMiddleware             │
│                          │       │    ├─ CORSMiddleware (条件安装)    │
│ ④ window.open(           │       │    └─ routers/handoff.py          │
│    /workspace/chats/     │       │       POST /api/handoff           │
│    {tid}#handoff={token})│       │       POST /api/handoff/redeem    │
└─────────────────────────┘       │                                  │
                                  │  frontend (:3000)                 │
                                  │    page.tsx → redeemHandoff()    │
                                  │    → sessionStorage → useStream   │
                                  └──────────────────────────────────┘
```

### 1.2 数据流

```
步骤 1-2: 外部系统通过 HTTP API 创建 thread + run
  输入: 外部系统的 access_token cookie
  输出: thread_id, run_id

步骤 3: 外部系统创建 handoff token
  请求: POST /api/handoff  { thread_id, run_id, ttl_seconds }
  后端: 校验 run 存在且属于指定 thread
       生成 secrets.token_urlsafe(32) 随机 token
       存入进程内存 dict (带过期时间)
  响应: { token, expires_at }

步骤 4: 外部系统打开 DeerFlow 前端页面
  URL: /workspace/chats/{thread_id}#handoff={token}
  
步骤 5: 前端兑换 handoff token
  请求: POST /api/handoff/redeem  { token }
  后端: 查找 token → pop (一次性消费)
       校验未过期
  响应: { thread_id, run_id, expires_at }

步骤 6: 前端写入 sessionStorage，触发 useStream 重连
  sessionStorage.setItem("lg:stream:{thread_id}", run_id)
  → useStream (reconnectOnMount: true) 检测到 key
  → 调用 client.runs.joinStream(thread_id, run_id)
  → 流式重连到正在执行的 run
```

### 1.3 当前实现的关键文件

| 层 | 文件 | 职责 |
|---|------|------|
| 后端 | `backend/app/gateway/routers/handoff.py` | `POST /api/handoff` 创建, `POST /api/handoff/redeem` 兑换 |
| 后端 | `backend/app/gateway/auth_middleware.py` | 认证门 (handoff 路径已在 P1 中加入 `_PUBLIC_PATH_PREFIXES`) |
| 后端 | `backend/app/gateway/app.py:384` | `app.include_router(handoff.router)` |
| 前端 | `frontend/src/core/handoff/api.ts` | `redeemHandoff(token)` API 调用 |
| 前端 | `frontend/src/app/workspace/chats/[thread_id]/page.tsx:347-407` | Handoff token 解析 + sessionStorage 写入 |
| Nginx | `docker/nginx/nginx.conf` + `nginx.local.conf` | `/api/handoff` location 代理 |
| 文档 | `docs/dev/run-handoff.md` | 外部 JS 触发示例 |

---

## 2. useStream 重连机制 (LangGraph SDK)

### 2.1 核心原理

`useStream` 来自 `@langchain/langgraph-sdk` (v1.6.0)，实际执行路径是 `useStreamLGP`。

**重连的触发条件**：
- `reconnectOnMount: true`（DeerFlow 代码中固定设为 true）
- `sessionStorage.getItem("lg:stream:{threadId}")` 返回非空的 run_id
- 当前 stream 不在 loading 状态

**重连的执行流程**：

```
useStreamLGP 挂载
  │
  ├─ runMetadataStorage = window.sessionStorage (因为 reconnectOnMount=true)
  │
  ├─ reconnectKey = useMemo(() => {
  │     const runId = sessionStorage.getItem(`lg:stream:${threadId}`)
  │     return runId ? { runId, threadId } : undefined
  │   })
  │
  └─ useEffect(() => {
       if (reconnectKey && shouldReconnect) {
         shouldReconnect = false
         joinStream(reconnectKey.runId)
       }
     })

joinStream(runId):
  ├─ client.runs.joinStream(threadId, runId, ...)
  │    → LangGraph API: GET /api/runs/{runId}/stream
  │    → 订阅正在执行的 run 的 SSE 事件流
  ├─ 成功: sessionStorage.removeItem("lg:stream:{threadId}")
  └─ 409 (run not active): clearReconnectRun() → 静默清理
```

### 2.2 sessionStorage Key 生命周期

```
submit() 调用
  └─ onRunCreated:  setItem("lg:stream:{tid}", runId)    ← 写入

stream 正常完成
  └─ onSuccess:      removeItem("lg:stream:{tid}")       ← 清理

stream 被 stop()
  └─ onStop:         removeItem("lg:stream:{tid}")       ← 清理

外部 handoff/run_id URL
  └─ page.tsx:       setItem("lg:stream:{tid}", runId)   ← 写入

joinStream 成功重连
  └─ onSuccess:      removeItem("lg:stream:{tid}")       ← 清理

joinStream 409 失败
  └─ clearReconnectRun: removeItem("lg:stream:{tid}")    ← 清理
```

---

## 3. 关键发现：前端已支持 URL 直传 run_id

### 3.1 现有代码

`frontend/src/app/workspace/chats/[thread_id]/page.tsx` (lines 347-407)：

```typescript
useEffect(() => {
    const url = new URL(window.location.href);
    const hashParams = getHashParams(url.hash);
    
    // 从 URL hash 或 search params 中提取 handoff token
    const token =
      normalizeUrlParam(hashParams.get("handoff")) ??
      normalizeUrlParam(url.searchParams.get("handoff"));
    
    // ★ 已经支持从 URL hash 或 search params 中直接提取 run_id
    const runId =
      normalizeUrlParam(hashParams.get("run_id")) ??
      normalizeUrlParam(url.searchParams.get("run_id"));
    
    const threadId = getThreadIdFromPathname(url.pathname);

    // ... handoff token 处理 (需要后端 API) ...

    } else if (runId) {
        // ★ 直接写入 sessionStorage，无需任何后端调用
        window.sessionStorage.setItem(`lg:stream:${threadId}`, runId);
        cleanupUrl();
        setReady(true);
    }
}, []);
```

### 3.2 这意味着什么

前端已经实现了 "URL 直传 run_id" 方案的核心逻辑。以下 URL 格式均支持：

```
/workspace/chats/{thread_id}?run_id={run_id}
/workspace/chats/{thread_id}#run_id={run_id}
/workspace/chats/{thread_id}#handoff={token}     ← 当前 handoff 方案
```

---

## 4. 两种方案对比

### 方案 A：当前 Handoff Token（两步验证）

```
外部系统                          DeerFlow 后端              DeerFlow 前端
    │                                  │                         │
    │── POST /api/handoff ────────────▶│                         │
    │   { thread_id, run_id }          │ 校验 run 存在            │
    │                                  │ 生成 token (内存)        │
    │◀── { token, expires_at } ───────│                         │
    │                                  │                         │
    │── window.open(URL#handoff=token) ─────────────────────────▶│
    │                                                             │
    │                                  │◀── POST /api/handoff/redeem ─│
    │                                  │── { thread_id, run_id } ───▶│
    │                                                             │
    │                                  │              sessionStorage.setItem()
    │                                  │              useStream 重连
```

### 方案 B：URL 直传 run_id（零后端调用）

```
外部系统                          DeerFlow 前端
    │                                  │
    │── window.open(                   │
    │   URL?run_id={run_id}) ─────────▶│
    │                                  │
    │                   sessionStorage.setItem("lg:stream:{tid}", runId)
    │                   useStream 重连
    │                   (无需任何后端 API 调用)
```

### 4.1 差异分析

| 维度 | 方案 A (Handoff Token) | 方案 B (URL 直传) |
|------|----------------------|-------------------|
| 后端接口 | 需要 `POST /api/handoff` + `POST /api/handoff/redeem` | **不需要** |
| 后端存储 | 进程内存 dict (不持久、不多 worker) | N/A |
| CORS 问题 | 需要配置 `GATEWAY_CORS_ORIGINS` | **无** (window.open 不触发 CORS) |
| 认证要求 | redeem 已公开化 (P1) | N/A (无 API 调用) |
| 服务端校验 | 校验 run 存在 + thread 匹配 + token 未过期 | **无** |
| 一次性消费 | token pop 后不可重用 | run_id 可被多次使用 (URL 可被分享) |
| 过期控制 | TTL (默认 5 分钟) | **无** (run_id 永久有效，直到 run 结束) |
| 安全性 | token 是短期随机串，与 run_id 无直接关联 | **run_id 直接暴露在 URL 中** |
| 实现复杂度 | 前后端 + nginx 配置 | **纯前端**（且已经实现） |
| 外部系统改动 | 需要调用 `/api/handoff` 获取 token | 直接拼接 run_id 到 URL |

### 4.2 方案 B 的安全考量

**run_id 暴露的风险**：
- run_id 是 UUID v4 格式，不可猜测（128 bits 随机）
- 知道 run_id 只能 join stream（观看），不能修改 run 或 thread
- `client.runs.joinStream` 是只读操作
- 但 run_id 出现在浏览器 URL 中，会留在浏览器历史、可能被分享

**与方案 A 的安全性对比**：
- 方案 A 的 handoff token 也是通过 URL hash 传递的，同样暴露在 URL 中
- 方案 A 的 token 有 TTL 和一次性消费保护
- 方案 B 的 run_id 无 TTL，但 run 本身有生命周期（完成后无法 join）

**实际风险等级**：低。run_id 是只读的流订阅能力，不授予任何写入或管理权限。

---

## 5. 改造建议

### 5.1 如果采用方案 B

**可以移除的代码**：
| 文件 | 操作 |
|------|------|
| `backend/app/gateway/routers/handoff.py` | 完全移除 |
| `backend/app/gateway/routers/__init__.py` | 移除 `handoff` 导入和 `__all__` 条目 |
| `backend/app/gateway/app.py` | 移除 `handoff` 导入和 `app.include_router(handoff.router)` |
| `backend/app/gateway/auth_middleware.py` | 从 `_PUBLIC_PATH_PREFIXES` 移除 `/api/handoff` (P1 的改动可回退) |
| `frontend/src/core/handoff/api.ts` | 完全移除 |
| `frontend/src/app/workspace/chats/[thread_id]/page.tsx` | 移除 `redeemHandoff` 相关逻辑（`run_id` 直传逻辑保留） |
| `docker/nginx/nginx.conf` | 移除 `/api/handoff` location 块 |
| `docker/nginx/nginx.local.conf` | 移除 `/api/handoff` location 块 |
| `docs/dev/run-handoff.md` | 更新为 URL 直传方案 |
| `backend/tests/test_handoff_router.py` | 移除 |

**前端需要保留/调整的代码**：
- `page.tsx` 中 `run_id` 的提取和 `sessionStorage` 写入逻辑 → **已实现，保留**
- `page.tsx` 中 `handoff` token 的提取和 `redeemHandoff` 逻辑 → **可移除**

### 5.2 如果保留方案 A 但简化

可以考虑将 create + redeem 合并为一步：
- 移除 `POST /api/handoff/redeem`
- `POST /api/handoff` 直接返回 `{ thread_id, run_id }`，外部系统直接用 `?run_id={run_id}` 传递
- 但这样就等于方案 B 加了一个服务端校验层

---

## 6. 当前 P0/P1 修复状态

| 修复 | 文件 | 状态 |
|------|------|------|
| nginx `/api/handoff` 配置对齐 | `docker/nginx/nginx.conf` | ✅ 已完成 |
| nginx `/api/handoff` 配置对齐 | `docker/nginx/nginx.local.conf` | ✅ 已完成 |
| Handoff 路径公开化 | `backend/app/gateway/auth_middleware.py` | ✅ 已完成 |
| 修复 `RunManager.get()` 缺少 await | `backend/app/gateway/routers/handoff.py` | ✅ 已完成 |
| CORS origin 配置 | `.env` (`GATEWAY_CORS_ORIGINS`) | ✅ 已配置 |

---

## 7. 决策参考

如果以下条件满足，**方案 B 是更优选择**：

1. 外部系统只需要"打开 DeerFlow 页面并展示正在执行的 run"，不需要额外的服务端校验
2. run_id 的不可猜测性（UUID v4）足以满足安全要求
3. 不需要 token TTL 控制（run 本身的完成/失败已经提供了自然的有效期）

如果以下条件满足，**保留方案 A**：

1. 需要服务端校验外部系统的请求合法性（thread/run 确实属于该请求者）
2. 需要严格控制 token 的生命周期（如 5 分钟后禁止重连）
3. 需要防止 run_id 被分享/泄露后的重放攻击

**推荐**：方案 B (URL 直传 run_id)。理由：
- 大幅简化架构（移除整个后端 handoff 模块 + 前端 API 层）
- 消除 CORS 问题（无跨域 API 调用）
- 消除认证问题（无 API 需要 session）
- run_id 本身是 UUID v4，安全性足够
- 前端已实现相关逻辑
