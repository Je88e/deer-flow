# DeerFlow × WIT Shell 集成技术方案

> 本文是 grilling 设计树访谈的收敛结果。术语以 [MF 技术方案](./mf-technical-plan.md) 为准。
>
> **2026-08-18 审核同步**：已按 Wit Shell 项目组审核清单定稿修订——Bridge 协议以
> Shell 仓库 `packages/platform-sdk/src/iframe-bridge.ts`（zod schema）为唯一权威（七种
> 消息）；AUTH_TOKEN 注入的是 OIDC 授权码 + PKCE 流程签发的 **ID token**，token-exchange
> 直接复用 `OIDCService.validate_id_token`；basePath 定夺为固定 `/leadagent` 单构建。

## 0. 背景与目标

DeerFlow 是一个 LangGraph-based AI super-agent 系统，前端为 Next.js 16 App Router（React 19）。
WIT AI Platform 规划了一套以 Module Federation 2.0 为核心的微前端架构（Shell Runtime）。

**核心问题**：DeerFlow 前端能否接入 WIT Shell？如何接入？

**结论**：采用**分阶段策略**——Phase 1 以 iframe + EMBED 模式快速接入，Phase 2 按需提取 MF App。

## 1. 设计决策总览

| # | 决策 | 结论 |
|---|------|------|
| D1 | 集成形态 | **分阶段**：Phase 1 iframe + EMBED → Phase 2 MF App 提取 |
| D2 | 代码复用策略 | MF App 在 DeerFlow monorepo 内，共享 `src/` 源码 |
| D3 | 认证模式 | **Phase 1 方案 B（Shell 注入 ID token → token-exchange 换 session cookie）**，后端同步落地纯 Bearer 直验分支（§3.4）；方案 A（OIDC 静默续接）为备选；Phase 2 MF App 默认切换纯 Bearer 直验 |
| D4 | Token 验证 | JWKS 离线验证。token-exchange 直接复用已有 `OIDCService.validate_id_token`（ID token，前提是 Keycloak audience mapper，见 §3.1）；`validate_access_token` 变体仅服务 Phase 2 纯 Bearer 分支（§3.4） |
| D5 | EMBED 模式 | 隐藏 `WorkspaceSidebar`，新建轻量 Thread 组件承载对话管理 |
| D6 | Bridge 协议 | 以 Shell 仓库 `iframe-bridge.ts`（zod schema）为唯一权威，七种消息：`HANDSHAKE_REQUEST` / `HANDSHAKE` / `AUTH_TOKEN` / `AUTH_TOKEN_REQUEST` / `READY` / `AUTH_FAILED` / `LOGOUT`（见 §5.1） |
| D7 | Phase 2 触发 | 走一步看一步，不预设硬条件 |
| D8 | 部署拓扑 | 同域子路径，固定 `basePath: "/leadagent"` + 根路径重定向，**单构建产物**同时服务独立版与嵌入版（2026-08-18 定夺，需回传 Shell 侧同步 manifest entry 与 nginx location 路径；DeerFlow 端口固定 `:2026` 不变） |
| D9 | Thread 列表 | DeerFlow 内渲染轻量 Thread 组件，随 EMBED 模式启动 |
| D10 | EMBED 触发 | URL 参数 `?embed=true` 为主，Bridge 消息为辅；判定位置在 page / client 组件（layout 不接收 `searchParams`，见 §4.1） |

## 2. 架构总览

```
                     WIT Shell Runtime（React + Rsbuild + MF 2.0 host）
                         路由 / 菜单 / 布局 / Token Broker / Event Bus
                                      |
                   -------------------+-------------------
                   |                                      |
                   v                                      v
             其他 MF App                          DeerFlow (Iframe App)
             (QRS / LIMS / ...)                   /leadagent/workspace/...
                                                Iframe Bridge 通信
                                                      |
                                              DeerFlow Next.js (:3000)
                                              + Gateway API (:8001)
                                              + DeerFlow Nginx (:2026)
                                                      |
                                              Keycloak OIDC (共享)

  端口说明：DeerFlow 对外端口固定 :2026（标准配置不变）。当前实例
  172.16.1.127:2006 与标准端口的差异属 Shell 侧 nginx 上游配置事项，
  由 Shell 侧自行处理，DeerFlow 侧不感知（见 §6.1）。
```

### 数据流

```
1. 用户登录 WIT Shell（Keycloak OIDC 授权码 + PKCE，public client）
2. Shell 持有该流程签发的 Keycloak ID token（aud 含 wit-shell，集成时由
   audience mapper 追加 deerflow，见 §3.1）
3. 用户点击 "DeerFlow" 菜单 → Shell 加载 iframe(src="/leadagent/workspace?embed=true")
4. iframe 加载 → DeerFlow EMBED 模式启动（隐藏 Sidebar，渲染轻量 Thread 组件）
   → DeerFlow 发送 HANDSHAKE_REQUEST → Shell 回 HANDSHAKE
5. Shell Bridge 发送 AUTH_TOKEN { token, tokenType: "keycloak-jwt", provider: "keycloak" }
6. DeerFlow 前端收到 ID token → POST /leadagent/api/v1/auth/token-exchange
7. Gateway 用 JWKS 验证 ID token（validate_id_token）→ 签发 DeerFlow session cookie
8. DeerFlow 前端加载 workspace → Bridge 发送 READY { threadId }
9. 用户开始使用 DeerFlow chat
```

## 3. 认证方案

### 3.1 Phase 1 方案 B：Shell 注入 ID Token（嵌入主路径）

> **嵌入场景主路径为方案 B。**§3.3 的 deerflow confidential client 仅服务独立部署
> 登录与 fallback 方案 A（§3.2），不参与嵌入主路径。

```
Shell (Keycloak SSO)                        DeerFlow Gateway
      |                                            |
      |  1. 用户已登录，持有授权码 + PKCE 流程       |
      |     签发的 Keycloak ID token               |
      |                                            |
      |  2. iframe 加载 /leadagent/workspace        |
      |     DF 发送 HANDSHAKE_REQUEST               |
      |     → Shell 回 HANDSHAKE                    |
      |     → Shell 通过 Bridge 发送 AUTH_TOKEN     |
      |-------------------------------------------->|
      |     { token: "<Keycloak ID token JWT>",    |
      |       tokenType: "keycloak-jwt",           |
      |       provider: "keycloak" }               |
      |                                            |
      |  3. POST /api/v1/auth/token-exchange       |
      |-------------------------------------------->|
      |     { token: "<Keycloak ID token JWT>",    |
      |       provider: "keycloak" }               |
      |                                            |
      |     Gateway:                               |
      |       a. OIDCService.discover(keycloak)    |
      |       b. validate_id_token(JWKS)           |
      |       c. get_or_provision_oidc_user()      |
      |       d. create_access_token() → session   |
      |                                            |
      |  4. 200 OK + Set-Cookie: access_token      |
      |<--------------------------------------------|
      |     + Set-Cookie: csrf_token               |
      |                                            |
      |  5. Bridge 发送 READY                       |
      |<--------------------------------------------|
```

**关键特性**：

- Shell 只在 iframe 首次加载时传一次 ID token；后续续期经 `AUTH_TOKEN_REQUEST`
  向 Shell 索取新的 ID token（见 §10.1）。
- DeerFlow 拿到 ID token 后换取 Gateway session cookie（默认 7 天有效期）。
- 后续 DeerFlow 用自己的 session cookie 续命，不需要持续持有 Keycloak token。
- Gateway 复用已有的 `OIDCService.validate_id_token`（JWKS 验签）和 `get_or_provision_oidc_user`（用户供给）。

**Token 类型与受众校验**：Bridge `AUTH_TOKEN` 注入的是 Shell 侧 OIDC 授权码 + PKCE
流程（public client）签发的 **ID token**，不是 access token。因此 token-exchange 端点
直接复用现有 `OIDCService.validate_id_token`，无需 `validate_access_token` 变体
（该变体仅服务 Phase 2 纯 Bearer 分支，见 §3.4）。

**受众校验与 audience mapper（集成步骤，非登录流程配置）**：wit-shell 的授权码 +
PKCE 配置本身（public client、standard flow、PKCE S256、redirect URIs、web origins）
不涉及任何 deerflow 内容。按 OIDC 规范，该 ID token 的 `aud` 即签发对象 **wit-shell**；
而 DeerFlow Gateway 严格校验 `aud` 含 `client_id`（`"deerflow"`）是正确行为——这意味着
必须由 Keycloak 在 **wit-shell client 上配置 audience mapper**，把 `deerflow` 加入
ID token 的 `aud` 数组。其本质是一个授权声明："该 token 允许 deerflow 消费"。
不配置则 token-exchange 验签必败（`InvalidAudienceError`）。配置方法见 Shell 侧
P1 Task 5 文档；mapper 追加的值必须与 §3.3 中 Gateway 配置的 `client_id`（`deerflow`）
一致。

**nonce 说明**：`validate_id_token` 的 `nonce` 参数可选（不传即跳过校验）。ID token 的
`nonce` 属于签发方 wit-shell 的防重放上下文，DeerFlow 作为下游验证方无从校验，
token-exchange 调用时传 `nonce=None`，验签 + `iss` / `aud` / `exp` 校验已足够。

#### Gateway 新增端点：`POST /api/v1/auth/token-exchange`

**请求**：

```json
{
  "token": "<Keycloak ID token JWT>",
  "provider": "keycloak"
}
```

**验证流程**（复用现有组件）：

1. 从 `config.yaml → auth.oidc.providers["keycloak"]` 读取 issuer / client_id / client_secret。
2. `OIDCService.discover(issuer)` → 获取 JWKS URI（已缓存，5 分钟 TTL）。
3. `OIDCService.validate_id_token(metadata, client_id, id_token, nonce=None)` → 本地验签 + 校验 iss / aud / exp（nonce 跳过，见上文说明；aud 数组含 `deerflow` 依赖 audience mapper）。
4. `get_or_provision_oidc_user("keycloak", provider_config, identity, local_provider)` → 查找或创建用户。
5. `create_access_token(user.id, token_version=user.token_version)` → 签发 DeerFlow JWT。
6. `set_session_cookie(response, token)` + `set_csrf_cookie(response)` → 设置 cookie 对。

**响应**：

```json
{
  "expires_in": 604800,
  "needs_setup": false
}
```

**与现有 OIDC callback 的差异**：现有 `GET /api/v1/auth/callback/{provider}` 是浏览器重定向流程（Keycloak → callback URL → redirect）；`token-exchange` 是纯 API 调用（前端 JS POST），不涉及浏览器跳转。内部复用相同的验证和供给逻辑。

#### Token 时效设计

| 层级 | Token | 有效期 | 刷新 |
|------|-------|--------|------|
| Keycloak | ID token (JWT) | 5-15 分钟（同为短时效） | 401 → `AUTH_TOKEN_REQUEST` → Shell 重发新 ID token → 重新 exchange |
| DeerFlow Gateway | session cookie (JWT) | 7 天 | Gateway 自动续期 |
| DeerFlow CSRF | csrf_token cookie | 与 session 同步 | 每次状态变更请求自动验证 |

Shell 不需要管理 DeerFlow 的 session 过期。iframe 内 DeerFlow 的 session cookie 过期后，前端检测到 401 → 通过 Bridge 发送 `AUTH_TOKEN_REQUEST` → Shell 自动重新取 token 并重发 `AUTH_TOKEN`（Shell 侧已实现并有测试覆盖）→ 重新走 token-exchange 流程。

#### 用户体验全流程

首次进入（无跳转、无闪烁、无登录框）：

```
用户登录 Shell（Keycloak 授权码 + PKCE，DeerFlow 不参与）
  → 点击 "DeerFlow" 菜单 → Shell 渲染 iframe(/leadagent/workspace?embed=true)
  → EMBED 模式启动 → Bridge 握手 → Shell 下发 AUTH_TOKEN
  → 前端 POST token-exchange（一次普通 POST，~100-300ms）
  → Set-Cookie → 加载 workspace → Bridge 上报 READY
  → 用户看到聊天界面
```

之所以没有 Keycloak 页面闪烁：用户身份的"重定向流"在 Shell 登录时早已完成，
DeerFlow 只做一次本地换票。这也是方案 B 优于备选方案 A 的地方——方案 A 需要在
iframe 内走一次真实的 OIDC 302 跳转链。

| 场景 | 用户感知 |
|------|---------|
| 首次进入 | iframe 加载 → 极短"认证中"→ 聊天界面；无页面跳转、无登录框 |
| 日常使用 / 刷新 / 隔天回来 | 与独立版 DeerFlow 无差别；cookie 在 `Path=/leadagent` 下，无需再走 token-exchange |
| 第 8 天回来（session 过期） | 请求 401 → 前端经 Bridge 发送 `AUTH_TOKEN_REQUEST` → Shell 重发新 ID token → 重新 exchange → 自动重试原请求；一次 <1s 的加载，无任何交互 |
| Keycloak SSO 也过期 | Shell 走自己的重新登录流程，完成后重发 AUTH_TOKEN；DeerFlow 侧逻辑不变 |
| Shell 登出 | Shell 下发 `LOGOUT` → DeerFlow 调 Gateway logout 端点清理 session/CSRF cookie（§5.1，`keepalive: true`）；否则共享电脑上 7 天 cookie 会残留 |
| 独立版 + 嵌入版并用 | 同域下两者是同一 URL 空间（`/leadagent`），共享同一 session；不同域名部署则天然隔离（§10.2） |
| 长任务（agent 跑 20-30 分钟） | SSE 流认证在连接建立时完成，7 天窗口内不会因 token 时效中断 |

### 3.2 备选方案 A：OIDC 静默续接

> 当 Shell 不方便实现 token 注入时，可退回此方案。Phase 1 推荐方案 B，但此方案作为 fallback 保留。

```
iframe 加载 /leadagent/workspace?embed=true
  → DeerFlow workspace layout (SSR) 检测无 access_token cookie
  → 跳转 /leadagent/api/v1/auth/oauth/keycloak
  → Gateway OIDC redirect → Keycloak（检测到已有 SSO session）
  → Keycloak 静默回调 /leadagent/api/v1/auth/callback/keycloak
  → Gateway 设置 session cookie
  → 重定向回 /leadagent/workspace
  → iframe 加载完成
```

**优点**：DeerFlow 后端零改动（已有完整 OIDC 支持）。

**缺点**：
- iframe 内有 OIDC redirect 闪烁（虽然同源下用户几乎无感）。
- 非标准 Token Broker 模式，与 MF 技术方案文档的认证纪律有偏差。
- Keycloak session 过期时需要完整的 OIDC 重定向流程。

### 3.3 DeerFlow 后端 OIDC 配置

> 该 deerflow confidential client（PKCE）保留不变，服务两个用途：**独立部署登录**
> 与 **fallback 方案 A**（§3.2）。嵌入主路径（方案 B）不经过它的授权码流程，但
> token-exchange 的验证配置（issuer / client_id）同样取自本条目，且 wit-shell 上
> audience mapper 追加的 `aud` 值必须等于此处的 `client_id`（`deerflow`）。

在 `config.yaml` 中添加 Keycloak provider：

```yaml
auth:
  oidc:
    enabled: true
    frontend_base_url: "/leadagent"  # iframe 基路径
    providers:
      keycloak:
        display_name: "WIT SSO"
        issuer: "https://keycloak.wit.example.com/realms/wit"
        client_id: "deerflow"
        client_secret: "$KEYCLOAK_CLIENT_SECRET"
        redirect_uri: "https://wit.example.com/leadagent/api/v1/auth/callback/keycloak"
        scopes: ["openid", "email", "profile"]
        pkce_enabled: true
        nonce_enabled: true
        token_endpoint_auth_method: "client_secret_post"
        auto_create_users: true
        require_verified_email: true
        allowed_email_domains: ["wit.example.com"]
        admin_emails: ["admin@wit.example.com"]
```

### 3.4 纯 Bearer 直验模式（后端 Phase 1 落地，前端 Phase 2 启用）

微前端社区的标准形态：子应用不持有自己的会话，每个请求携带
`Authorization: Bearer <keycloak-jwt>`，Gateway 作为 bearer-only 验证方对每个请求做
JWKS 离线验证。Phase 1 与方案 B **并存实现**（后端一次到位，无请求时不触发，不影响
独立部署）；Phase 2 提取 MF App 后切换为生产路径。

> **与 §3.1 的边界**：Phase 2 纯 Bearer 分支中，前端作为 Authorization header 携带的
> 是 **access token**（`aud` 语义与 ID token 不同），因此该分支必须使用
> `validate_access_token` 变体。Phase 1 的 token-exchange 走 ID token +
> `validate_id_token`（§3.1），两者互不替代。

#### 数据流

```
Shell Token Broker（内存持有 Keycloak access token，refresh token 静默刷新）
        |  Mount Context / Bridge 注入 token
        v
DeerFlow 前端（token 存内存，不放 localStorage）
        |  每个请求: Authorization: Bearer <jwt>
        v
Gateway AuthMiddleware Bearer 分支
        |  按 issuer 匹配已配置的 OIDC provider
        |  validate_access_token() — JWKS 本地验签 + iss/exp + azp/aud 宽容校验
        |  get_or_provision_oidc_user()
        v
request.state.user + user_context contextvar
        （下游 threads / memory / skills / sandbox 的 users/{user_id} 隔离自动工作）
```

#### 后端改动

| 改动 | 文件 | 说明 |
|------|------|------|
| `validate_access_token()` 验证变体（仅 Phase 2 Bearer 分支使用） | `backend/app/gateway/auth/oidc.py` | 签名 / `iss` / `exp` 校验复用 `validate_id_token` 逻辑；`aud` 校验放宽为 `azp == client_id` 或 `client_id ∈ aud` |
| AuthMiddleware Bearer 分支 | `backend/app/gateway/auth_middleware.py` | 凭证提取优先级 internal > bearer > cookie；验证成功后走与 session 完全相同的 user stamp 路径（`request.state.user` + contextvar），下游 owner 隔离零改动 |
| CSRF 豁免 | `backend/app/gateway/csrf_middleware.py` | 以 Bearer 认证成功的请求豁免双重提交检查（Bearer header 天然免疫 CSRF） |

性能：JWKS 有进程内缓存（5 分钟 TTL），RS256 本地验签亚毫秒级——每请求离线验证
就是 bearer-only 的标准形态。可选优化：请求级 `(token-hash → user)` 短 TTL 缓存。

#### 前端约束（Phase 2 事项）

- **Authorization 注入点**：LangGraph SDK `onRequest` hook（现注入 X-CSRF-Token 处，
  `api-client.ts`）与 `fetcher.ts`。SDK 的 SSE 用 fetch 实现（非 EventSource），可
  携带自定义 header。
- **token 生命周期**：Keycloak access token 5-15 分钟过期，前端需 401 拦截 → 向
  Shell 索取新 token → 重试原请求；SSE 流重连（joinStream）时 token 恰好过期同样
  走此路径。
- **无 SSR 问题**：MF App 是纯 SPA（Rsbuild）。这正是纯 Bearer 推迟到 Phase 2 的
  原因——Phase 1 的 Next.js workspace 布局在 Server Component 里读 cookie 判定
  登录，内存 token 对 SSR 不可见。

#### Phase 1（cookie）与 Phase 2（纯 Bearer）用户体验对照

| 维度 | Phase 1（token-exchange + cookie） | Phase 2（纯 Bearer） |
|------|-----------------------------------|----------------------|
| 首次进入 | 一次 exchange（~100-300ms）后用 cookie | 每次加载从 Mount Context 同步读 token，无等待感 |
| token 时效 | 7 天 session，一周静默续一次 | 5-15 分钟，前端静默刷新，用户无感 |
| 页面刷新 | cookie 直接可用 | 重新读 Mount Context token，同帧完成 |
| 风险点 | 无 | 长 SSE 流重连时 token 恰好过期需先刷新（401 重试覆盖） |

用户可感知差异趋近于零；差异全在机制层。Phase 1 做掉的 Bearer 验证分支在 Phase 2
直接就是生产路径，前端只改 token 来源（Bridge listener → Mount Context reader）。

## 4. EMBED 模式

### 4.1 触发机制

**主**：URL 参数 `?embed=true`。
**辅**：Bridge `HANDSHAKE` 消息携带 `{ mode: "embed" }`。

**判定位置**：App Router 的 **layout 不接收 `searchParams` prop**（仅 page 接收），且
Next 16 中 `searchParams` 是 **Promise，必须 `await`**。因此 embed 判定放在
`workspace/chats/[thread_id]/page.tsx`（async Server Component，`await searchParams`），
判定结果经 `EmbedModeProvider`（client context）驱动布局切换；workspace `layout.tsx`
的 auth 检查与 Provider 嵌套保持不变。

```typescript
// frontend/src/app/workspace/chats/[thread_id]/page.tsx (改动示意)
export const dynamic = "force-dynamic";

export default async function ChatThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ thread_id: string }>;
  searchParams: Promise<{ embed?: string }>;
}) {
  const { thread_id } = await params;       // Next 16: Promise
  const { embed } = await searchParams;     // Next 16: Promise
  const isEmbedded = embed === "true";

  // layout.tsx 已完成 auth 检查与 AuthProvider/I18nProvider 嵌套（不变）
  return (
    <EmbedModeProvider embedded={isEmbedded}>
      {isEmbedded ? (
        <EmbedLayout>
          <ChatView threadId={thread_id} />
        </EmbedLayout>
      ) : (
        <WorkspaceContent>
          <ChatView threadId={thread_id} />
        </WorkspaceContent>
      )}
    </EmbedModeProvider>
  );
}
```

不适合 SSR 判定的场景（如 client 侧路由跳转后的 embed 状态跟随）可用
`useSearchParams()` 的 client hook 版本（项目内已有先例：
`workspace/scheduled-tasks/page.tsx`）。

### 4.2 EMBED 布局

| 组件 | 完整模式 | EMBED 模式 | 说明 |
|------|---------|-----------|------|
| `WorkspaceSidebar` | ✅ 渲染 | ❌ 隐藏 | Shell 提供顶层导航 |
| **`EmbedThreadList`（新建）** | — | ✅ 渲染 | 轻量对话管理组件，承载 Thread 新建和切换功能 |
| `CommandPalette` | ✅ | ✅ | Chat 内部操作，用户期望保留 |
| `SettingsDialogHost` | ✅ | ✅ | DeerFlow 特有配置（模型选择、偏好） |
| `Toaster` | ✅ | ✅ | 交互反馈 |
| `ThemeProvider` | ✅ next-themes | ✅ next-themes | 通过 Bridge 跟随 Shell 主题 |

### 4.3 `EmbedThreadList` 组件（新建）

替代原 `WorkspaceSidebar` 中的 Thread 管理功能，专为 EMBED 模式设计。

**职责**：

- 展示当前用户的 Thread 列表（调用 Gateway `GET /api/v1/threads`）。
- 新建对话（调用 Gateway `POST /api/v1/threads`）。
- 切换对话（Next.js `router.push` 到 `/workspace/chats/{threadId}`）。
- 监听 Bridge `NAVIGATE` 消息，实现外部驱动的 Thread 切换（Phase 1.5 扩展消息，
  不在七种定稿内，见 §5.2）。

**设计原则**：

- 轻量：比 `WorkspaceSidebar` 更紧凑，可能是一个顶部下拉、侧边折叠面板或精简列表。
- 自包含：所有 Gateway API 调用封装在组件内，Shell 不需要感知 Gateway API。
- 复用：共享 `WorkspaceSidebar` 中的 thread 数据获取逻辑（提取为 hook）。

**文件位置**：

```
frontend/src/components/embed/
  ├── embed-thread-list.tsx    # 主组件
  ├── embed-thread-item.tsx    # 单条 Thread 项
  └── use-embed-threads.ts     # Thread 数据 hook（从 WorkspaceSidebar 提取共享逻辑）
```

### 4.4 EMBED 模式布局示意

```
┌─ Shell ──────────────────────────────────────────────┐
│  [Shell 顶栏 / 菜单]                                  │
│ ┌─ Sidebar ─┐ ┌─ iframe (/leadagent/workspace?embed=true) ─┐ │
│ │ Dashboard │ │ ┌─ EmbedThreadList ─┐                     │ │
│ │ DeerFlow ●│ │ │ [+ 新对话]         │ ┌─ Chat Area ────┐ │ │
│ │ Reports   │ │ │ Thread 1 (active)  │ │                 │ │ │
│ │ Settings  │ │ │ Thread 2           │ │  Message List   │ │ │
│ │           │ │ │ Thread 3           │ │  Composer       │ │ │
│ │           │ │ └────────────────────┘ │                 │ │ │
│ │           │ │                        └─────────────────┘ │ │
│ └───────────┘ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

## 5. Iframe Bridge 协议

### 5.1 Bridge 协议（七种消息，2026-08-18 定稿）

基于 `@wit/platform-sdk` Iframe Bridge（类型化 postMessage，握手 + 版本 + 超时）。
**消息类型与形状以 Shell 仓库 `packages/platform-sdk/src/iframe-bridge.ts`（zod
schema）为唯一权威**，七种消息：`HANDSHAKE_REQUEST` / `HANDSHAKE` / `AUTH_TOKEN` /
`AUTH_TOKEN_REQUEST` / `READY` / `AUTH_FAILED` / `LOGOUT`。DeerFlow 侧 vendor 该
schema（§5.3），不自造平行类型定义。

**消息信封**：每条消息（含上行）在**消息顶层**携带 `version: "1.0"`；`version` 不在
HANDSHAKE payload 内。

#### Shell → DeerFlow（下行消息）

| 消息类型 | 时机 | 载荷 |
|---------|------|------|
| `HANDSHAKE` | 收到 `HANDSHAKE_REQUEST` 后 | `{ mode: "embed", capabilities: [...] }`（以 iframe-bridge.ts 为准；`version` 在消息顶层） |
| `AUTH_TOKEN` | 握手成功后 / 收到 `AUTH_TOKEN_REQUEST` 后重发 | `{ token: string, tokenType: "keycloak-jwt", provider: "keycloak" }`（固定形状） |
| `LOGOUT` | Shell 登出前向已挂载 iframe 下发 | `{}` |

#### DeerFlow → Shell（上行消息）

| 消息类型 | 时机 | 载荷 |
|---------|------|------|
| `HANDSHAKE_REQUEST` | iframe 加载后立即（发起握手） | `{}` |
| `AUTH_TOKEN_REQUEST` | 检测到 401（session 过期）需要续期时 | `{ reason?: string }`；Shell host 收到后自动重新取 token 并重发 `AUTH_TOKEN`（Shell 侧已实现并有测试覆盖） |
| `READY` | 认证完成 + workspace 加载完毕 | `{ threadId: string }` |
| `AUTH_FAILED` | token-exchange 失败 | `{ error: string, code: string }` |

#### `LOGOUT` 的处理语义

DeerFlow 收到 `LOGOUT` 后**必须调用 Gateway logout 端点**（复用现有
`POST /api/v1/auth/logout`，`auth.py:372`）清理 session/CSRF cookie：

- session cookie 是 **HttpOnly**，前端 JS 无法直接删除，只能由 Gateway 响应清除；
- 该请求必须带 **`keepalive: true`**——Shell 在下发 `LOGOUT` 后即完成登出跳转，
  页面可能立即被卸载，`keepalive` 确保请求在卸载后仍能送达；
- 需带 `credentials: "include"`（cookie 随请求发送）。

### 5.2 Phase 1.5 扩展协议（后续迭代）

> 以下消息**不在 2026-08-18 定稿的七种消息内**，属后续协议演进：新增前须先在
> Shell 侧 `iframe-bridge.ts` 中扩展 schema 并升版本，DeerFlow 侧同步 vendor 文件。

| 方向 | 消息类型 | 说明 |
|------|---------|------|
| Shell → DF | `NAVIGATE` | 切换 Thread：`{ threadId?: string, action?: "new-chat" }` |
| Shell → DF | `THEME_CHANGE` | 主题同步：`{ theme: "dark" \| "light" }` |
| Shell → DF | `LOCALE_CHANGE` | 语言切换：`{ locale: "en" \| "zh" }` |
| DF → Shell | `TITLE_CHANGE` | Thread 标题变化：`{ title: string }` |
| DF → Shell | `NAVIGATION_REQUEST` | DeerFlow 内部需要 Shell 层跳转：`{ path: string }` |

### 5.3 Bridge 适配器

封装在 `frontend/src/core/bridge/` 下，提供统一的收发接口：

```
frontend/src/core/bridge/
  ├── bridge-protocol.ts        # 📦 vendored：从 Shell 仓库 iframe-bridge.ts 复制的 zod schema
  │                             #    （标注来源路径与版本；协议演进时由 Shell 侧通知同步；
  │                             #     若 zod 版本或代码风格不适配，做最小适配调整）
  ├── iframe-bridge-client.ts   # Bridge 客户端：收发消息、握手、超时
  └── use-bridge.ts             # React hook：在组件中使用 Bridge
```

**设计要点**：

- **消息类型以 vendored schema 为准**：不另建 `message-types.ts`，类型一律
  `z.infer` 自 `bridge-protocol.ts`，避免与 Shell 侧类型漂移。
- `IframeBridgeClient` 是一个单例类，封装 `window.parent.postMessage` 通信。
- **postMessage 一律使用显式 `targetOrigin`**（禁止 `"*"`）：取自环境变量
  `NEXT_PUBLIC_SHELL_ORIGIN`（完整 origin，如 `http://localhost:5007`），
  未设置时默认 `window.location.origin`（同域子路径生产部署）。
- **入站消息先校验 `event.origin`**，与 `shellOrigin` 不匹配一律丢弃，不做任何处理。
- **每条消息（含上行）在顶层携带 `version: "1.0"`**。
- 握手有超时机制（默认 5 秒）。超时后降级为完整模式（不走 Bridge）。
- 非 EMBED 模式下（DeerFlow 独立运行），Bridge 不初始化，不影响正常功能。
- 预留 Mount Context 接口：Phase 2 迁移 MF App 时，只需替换 Bridge listener 为 Mount Context reader。

```typescript
// frontend/src/core/bridge/iframe-bridge-client.ts (示意)
import { type AuthTokenMessage, type HandshakeMessage, parseInbound } from "./bridge-protocol";

const SHELL_ORIGIN =
  process.env.NEXT_PUBLIC_SHELL_ORIGIN ?? window.location.origin;

export class IframeBridgeClient {
  private handshakePromise: Promise<HandshakeMessage["payload"]> | null = null;
  private tokenResolve: ((token: AuthTokenMessage["payload"]) => void) | null = null;

  constructor(private timeout = 5000) {
    window.addEventListener("message", this.onMessage);
  }

  /** 发起握手，等待 Shell 响应 HANDSHAKE */
  async handshake(): Promise<HandshakeMessage["payload"]> {
    if (this.handshakePromise) return this.handshakePromise;
    this.handshakePromise = this.withTimeout(
      new Promise((resolve) => {
        const handler = (e: MessageEvent) => {
          // 入站消息：先校验 origin，再交给 vendored schema 解析
          if (e.origin === SHELL_ORIGIN && e.data?.type === "HANDSHAKE") {
            resolve(parseInbound(e.data).payload);
            window.removeEventListener("message", handler);
          }
        };
        window.addEventListener("message", handler);
        // 上行消息同样带顶层 version；显式 targetOrigin，不用 "*"
        window.parent.postMessage(
          { version: "1.0", type: "HANDSHAKE_REQUEST", payload: {} },
          SHELL_ORIGIN,
        );
      }),
      this.timeout,
    );
    return this.handshakePromise;
  }

  /** 等待 Shell 注入 auth token（AUTH_TOKEN） */
  async waitForToken(): Promise<AuthTokenMessage["payload"]> {
    return this.withTimeout(
      new Promise<AuthTokenMessage["payload"]>((resolve) => {
        this.tokenResolve = resolve;
      }),
      this.timeout,
    );
  }

  /** 401 静默续期：请求 Shell 重发 AUTH_TOKEN */
  requestAuthToken(reason: string): void {
    window.parent.postMessage(
      { version: "1.0", type: "AUTH_TOKEN_REQUEST", payload: { reason } },
      SHELL_ORIGIN,
    );
  }

  /** 向 Shell 报告就绪 */
  sendReady(threadId: string): void {
    window.parent.postMessage(
      { version: "1.0", type: "READY", payload: { threadId } },
      SHELL_ORIGIN,
    );
  }

  /** 向 Shell 报告认证失败 */
  sendAuthFailed(error: string, code: string): void {
    window.parent.postMessage(
      { version: "1.0", type: "AUTH_FAILED", payload: { error, code } },
      SHELL_ORIGIN,
    );
  }

  private onMessage = (e: MessageEvent) => {
    if (e.origin !== SHELL_ORIGIN) return; // 入站 origin 校验：不匹配即丢弃
    const message = parseInbound(e.data); // vendored schema 校验形状与 version
    if (message.type === "AUTH_TOKEN" && this.tokenResolve) {
      this.tokenResolve(message.payload);
      this.tokenResolve = null;
    }
    if (message.type === "LOGOUT") {
      // HttpOnly cookie 前端 JS 无法删除：调 Gateway logout 端点清除。
      // Shell 下发 LOGOUT 后立即登出跳转，keepalive 保证页面卸载后请求仍送达。
      void fetch("/api/v1/auth/logout", {
        method: "POST",
        credentials: "include",
        keepalive: true,
      });
    }
  };

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new BridgeTimeoutError(ms)), ms),
      ),
    ]);
  }
}
```

## 6. 部署拓扑

### 6.1 Nginx 配置

Shell nginx 增加 `/leadagent/` location：

> DeerFlow 对外端口固定 `:2026`。当前实例 `172.16.1.127:2006` 与标准端口的
> 差异由 Shell 侧在上游配置中自行处理，DeerFlow 侧不感知（2026-08-18 确认）。

```nginx
# Shell nginx
location /leadagent/ {
  proxy_pass http://<deerflow-host>:2026/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;

  # SSE 支持（agent streaming）
  proxy_buffering off;
  proxy_cache off;
  proxy_read_timeout 600s;

  # WebSocket 支持（browser live）
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
}
```

DeerFlow 自身的 nginx (:2026) 配置不变——它接收的是剥离了 `/leadagent` 前缀的请求。

### 6.2 DeerFlow Next.js 配置（2026-08-18 定夺：固定 basePath，单构建）

固定 `basePath: "/leadagent"` + 根路径重定向，**单构建产物**同时服务独立版与嵌入版，
放弃 `DEERFLOW_EMBED_MODE` 构建期切换（避免双构建产物运维）：

```javascript
const nextConfig = {
  basePath: "/leadagent",
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
  },
  async redirects() {
    // 根路径 → /leadagent（basePath 之外的入口，需 basePath: false）
    return [{ source: "/", destination: "/leadagent", basePath: false, permanent: false }];
  },
  async rewrites() {
    // basePath 下的 API 代理路径（source 相对 basePath，无需再拼前缀）
    return [
      {
        source: "/api/langgraph/:path*",
        destination: `${process.env.INTERNAL_GATEWAY_URL || "http://localhost:8001"}/api/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${process.env.INTERNAL_GATEWAY_URL || "http://localhost:8001"}/api/:path*`,
      },
    ];
  },
  // ... 其余配置不变
};
```

独立部署入口为 `host/leadagent`（根路径自动重定向）；本地开发访问
`localhost:3000/leadagent`。

### 6.3 Cookie 路径

固定 basePath 后，独立版与嵌入版是同一 URL 空间，cookie path 统一：

| Cookie | Path |
|--------|------|
| `access_token` (HttpOnly) | `Path=/leadagent` |
| `csrf_token` | `Path=/leadagent` |

`session_cookie.py` 的 path 改为**静态配置**（固定 `/leadagent`），不再需要"按请求路径
检测 EMBED 模式"的运行时分支。同域同源下，`/leadagent` path 的 cookie 在 iframe 内的
所有请求中自动携带。

## 7. Phase 2：MF App 提取路线

### 7.1 迁移触发条件

不预设硬触发条件。Phase 1 上线后根据实际体验决定，可能的触发因素：

- iframe 加载性能不满足要求
- 需要 chat 组件深度嵌入 Shell 页面（非全屏 iframe）
- Shell 统一要求所有应用为 MF App 形态

### 7.2 迁移策略

在 DeerFlow monorepo 内新建 `frontend/apps/mf-app/`，共享 `frontend/src/` 源码：

```
frontend/
  ├── src/                    # 共享源码（现有 DeerFlow 前端）
  │   ├── components/         # 共享组件
  │   ├── core/               # 共享核心（api-client, auth, hooks）
  │   └── ...
  ├── apps/
  │   ├── mf-app/             # Phase 2: Rsbuild SPA (MF App)
  │   │   ├── rsbuild.config.ts
  │   │   ├── src/
  │   │   │   ├── index.tsx   # MF App 入口 + Mount Contract
  │   │   │   └── App.tsx     # 复用 src/components/ 中的 chat UI
  │   │   └── package.json
  │   └── next-app/           # Phase 2: 原 Next.js app 重命名（可选）
  ├── package.json
  └── next.config.js
```

### 7.3 迁移时的认证复用

Phase 1 完成的 `token-exchange` 端点和前端认证逻辑可直接复用：

| Phase 1 (iframe) | Phase 2 (MF App) | 变化 |
|------------------|------------------|------|
| Bridge `AUTH_TOKEN` 消息接收 ID token | Mount Context 读取 access token | token 交付方式不同，且类型不同（ID token → access token，验证路径随之切换，见 §3.4 边界注） |
| `POST /api/v1/auth/token-exchange` → session cookie | 默认切换为纯 Bearer 直验（§3.4）：token 直接放 `Authorization` header，Gateway Bearer 分支验证 | 前端注入点从"exchange 调用"改为"每请求 header"；后端两条路径 Phase 1 已并存 |
| （备选）继续走 token-exchange + cookie | 同 | MF App 若需保留 cookie 语义也可复用，**零变化** |

Bridge 适配器设计时预留 Mount Context 接口，迁移时替换 listener 即可。

## 8. Phase 1 改造清单

### 8.1 后端（DeerFlow Gateway）

| 改动 | 文件 | 工作量 |
|------|------|--------|
| 新增 `POST /api/v1/auth/token-exchange` 端点（复用 `validate_id_token`，nonce 跳过） | `backend/app/gateway/routers/auth.py` | ~40 行 |
| `validate_access_token()` 验证变体（azp/aud 宽容校验，**仅 Phase 2 纯 Bearer 分支**，§3.4） | `backend/app/gateway/auth/oidc.py` | ~50 行 |
| AuthMiddleware Bearer 分支（Phase 2 预置，§3.4） | `backend/app/gateway/auth_middleware.py` | ~60-80 行 |
| Bearer 请求 CSRF 豁免（§3.4） | `backend/app/gateway/csrf_middleware.py` | ~10 行 |
| Cookie path 固定 `/leadagent`（静态配置，§6.3） | `backend/app/gateway/auth/session_cookie.py` | ~10 行 |
| `config.yaml` OIDC Keycloak provider 配置示例 | `config.example.yaml` | 文档 |
| 测试：token-exchange 端点 + Bearer 分支 | `backend/tests/test_oidc_auth.py` | 跟随 |

### 8.2 前端（DeerFlow Frontend）

| 改动 | 文件 | 工作量 |
|------|------|--------|
| 固定 `basePath: "/leadagent"` + 根路径重定向（单构建，§6.2） | `frontend/next.config.js` | ~10 行 |
| EMBED 判定改在 page（`await searchParams`，§4.1） | `frontend/src/app/workspace/chats/[thread_id]/page.tsx` | ~20 行 |
| `EmbedModeProvider`（client context） | `frontend/src/components/embed/embed-mode-provider.tsx` | 新文件 |
| `EmbedLayout` 组件 | `frontend/src/components/embed/embed-layout.tsx` | 新文件 |
| `EmbedThreadList` 组件 | `frontend/src/components/embed/embed-thread-list.tsx` | 新文件 |
| `EmbedThreadItem` 组件 | `frontend/src/components/embed/embed-thread-item.tsx` | 新文件 |
| `useEmbedThreads` hook（从 WorkspaceSidebar 提取共享逻辑） | `frontend/src/components/embed/use-embed-threads.ts` | 新文件 |
| vendored Bridge 协议 schema（复制自 Shell 仓库 iframe-bridge.ts，必要时做适配调整） | `frontend/src/core/bridge/bridge-protocol.ts` | 新文件 |
| `IframeBridgeClient`（显式 targetOrigin + origin 校验 + 顶层 version） | `frontend/src/core/bridge/iframe-bridge-client.ts` | 新文件 |
| `useBridge` hook | `frontend/src/core/bridge/use-bridge.ts` | 新文件 |
| EMBED 模式认证流程集成（含 `AUTH_TOKEN_REQUEST` 续期与 `LOGOUT` 的 `keepalive` logout） | `frontend/src/core/auth/embed-auth.ts` | 新文件 |
| `NEXT_PUBLIC_SHELL_ORIGIN` 环境变量 | `frontend/src/env.js` + `.env.example` | ~5 行 |

### 8.3 Shell 侧（WIT Platform）

| 改动 | 说明 |
|------|------|
| Shell 菜单注册 DeerFlow 为 Iframe App | App Manifest 配置（entry 路径 `/leadagent`，随本次定夺同步） |
| Shell nginx `/leadagent/` location | 反代到 DeerFlow `:2026`（当前实例 2006 端口差异由 Shell 侧上游配置处理，§6.1） |
| Shell Bridge 发送 `HANDSHAKE` / `AUTH_TOKEN` / `LOGOUT` | Iframe App 集成（已定稿并有测试覆盖） |
| Shell 接收 `HANDSHAKE_REQUEST` / `AUTH_TOKEN_REQUEST` / `READY` / `AUTH_FAILED` | iframe 状态管理与静默续期（`AUTH_TOKEN_REQUEST` 已实现并有测试覆盖） |
| Keycloak wit-shell client 配置 audience mapper（`deerflow` 加入 ID token `aud`） | 集成步骤（非登录流程配置），方法见 Shell 侧 P1 Task 5 文档 |

> 文件级复用策略、侵入度分析和原项目启动影响详见 [§9](#9-代码复用策略与侵入度分析)。

### 8.4 文件清单

**新增文件**：

```
backend/app/gateway/routers/auth.py          # 新增 token-exchange 端点（在现有文件内追加）
frontend/src/components/embed/
  ├── embed-mode-provider.tsx
  ├── embed-layout.tsx
  ├── embed-thread-list.tsx
  ├── embed-thread-item.tsx
  └── use-embed-threads.ts
frontend/src/core/bridge/
  ├── bridge-protocol.ts                      # vendored：Shell 仓库 iframe-bridge.ts 的 zod schema
  ├── iframe-bridge-client.ts
  └── use-bridge.ts
frontend/src/core/auth/
  └── embed-auth.ts
docs/dev/deerflow-shell-integration-plan.md  # 本文档
```

**修改文件**：

```
frontend/next.config.js                      # 固定 basePath /leadagent + 根重定向 + rewrites
frontend/src/app/workspace/chats/[thread_id]/page.tsx  # EMBED 判定（await searchParams）
frontend/src/env.js                          # NEXT_PUBLIC_SHELL_ORIGIN
backend/app/gateway/auth/session_cookie.py    # Cookie path 固定 /leadagent
config.example.yaml                           # OIDC Keycloak 配置示例
```

## 9. 代码复用策略与侵入度分析

### 9.1 新增文件树（标注复用关系）

```
frontend/
├── next.config.js                          # ✏️ 改动：固定 basePath + 根重定向 + rewrites
├── src/
│   ├── app/workspace/
│   │   ├── layout.tsx                      #   （不动）auth 检查与 Provider 嵌套保持
│   │   └── chats/[thread_id]/page.tsx      # ✏️ 改动：EMBED 判定（await searchParams，~20 行）
│   │
│   ├── components/embed/                   # 🆕 全新目录
│   │   ├── embed-mode-provider.tsx         #   embed 状态 client context
│   │   ├── embed-layout.tsx                #   EMBED 布局壳
│   │   ├── embed-thread-list.tsx           #   轻量 Thread 列表
│   │   ├── embed-thread-item.tsx           #   单条 Thread 项
│   │   └── use-embed-threads.ts            #   薄封装，复用 core/threads/hooks
│   │
│   └── core/
│       ├── bridge/                         # 🆕 全新目录
│       │   ├── bridge-protocol.ts          #   📦 vendored：Shell 仓库 iframe-bridge.ts
│       │   ├── iframe-bridge-client.ts     #   postMessage 单例客户端
│       │   └── use-bridge.ts               #   React hook 封装
│       │
│       └── auth/                           # ✏️ 已有目录，新增一个文件
│           ├── AuthProvider.tsx            #   （不动）
│           ├── server.ts                   #   （不动）
│           ├── ...
│           └── embed-auth.ts               # 🆕 EMBED 认证流程
│
backend/app/gateway/
├── routers/auth.py                         # ✏️ 追加路由函数（~40行）
├── auth/
│   ├── oidc.py                             #   （不动）validate_id_token 复用
│   ├── oidc_state.py                       #   （不动）
│   ├── user_provisioning.py                #   （不动）get_or_provision_oidc_user 复用
│   └── session_cookie.py                   #   ✏️ path 固定 "/leadagent"
│
config.example.yaml                         # ✏️ 追加 Keycloak provider 示例
```

### 9.2 代码复用链路（函数级）

所有新增组件复用现有模块的 export，不复制逻辑、不修改现有函数签名：

```
┌──────────────────────────────────────────────────────────────────┐
│  现有代码（零改动）                                                 │
│                                                                   │
│  src/core/threads/hooks.ts (3303 行)                               │
│    ├─ useInfiniteThreads()   ← EmbedThreadList 直接 import         │
│    ├─ useDeleteThread()      ← EmbedThreadList 直接 import         │
│    ├─ usePinThread()         ← EmbedThreadList 直接 import         │
│    └─ useRenameThread()      ← EmbedThreadList 直接 import         │
│                                                                   │
│  src/core/threads/utils.ts                                        │
│    ├─ titleOfThread()        ← EmbedThreadItem 直接 import         │
│    ├─ pathOfThread()         ← EmbedThreadItem 直接 import         │
│    └─ isThreadPinned()       ← EmbedThreadItem 直接 import         │
│                                                                   │
│  src/core/threads/thread-list-model.ts                            │
│    └─ buildThreadListModel() ← use-embed-threads 直接 import       │
│                                                                   │
│  src/core/api/api-client.ts                                       │
│    └─ getAPIClient()         ← embed-auth.ts 直接 import           │
│                                                                   │
│  src/core/auth/AuthProvider.tsx                                   │
│    └─ AuthProvider           ← embed-layout.tsx 直接 import        │
│                                                                   │
│  src/core/i18n/context.tsx                                        │
│    └─ I18nProvider           ← embed-layout.tsx 直接 import        │
│                                                                   │
│  backend/app/gateway/auth/oidc.py                                 │
│    ├─ OIDCService.discover()        ← token-exchange 端点复用      │
│    └─ OIDCService.validate_id_token() ← token-exchange 端点复用    │
│                                                                   │
│  backend/app/gateway/auth/user_provisioning.py                    │
│    └─ get_or_provision_oidc_user()  ← token-exchange 端点复用      │
└──────────────────────────────────────────────────────────────────┘
```

`EmbedThreadList` 不复制 `RecentChatList`（472 行）的任何逻辑，只 import 同样的
hooks。`use-embed-threads.ts` 仅做一层薄封装（调整分页参数、默认展开行为等），核心
数据获取完全走 `src/core/threads/hooks.ts`。

### 9.3 改动文件侵入度

| 文件 | 当前行数 | 改动量 | 改动性质 |
|------|---------|--------|---------|
| `frontend/src/app/workspace/chats/[thread_id]/page.tsx` | — | ~20 行 | 加 `searchParams` 参数与 `EmbedModeProvider` 包裹，原渲染路径不变 |
| `frontend/next.config.js` | 83 | ~10 行 | `basePath` 固定 `/leadagent`；`redirects()` 加根重定向；rewrites `source` 相对 basePath |
| `backend/app/gateway/routers/auth.py` | ~850 | ~40 行 | 文件末尾追加新路由函数，不修改现有函数 |
| `backend/app/gateway/auth/session_cookie.py` | — | ~5 行 | cookie path 固定 `/leadagent`（静态值） |
| `config.example.yaml` | — | 文档 | 追加 Keycloak provider 配置示例 |

### 9.4 对原项目启动的影响：布局零改动，路由空间有永久 diff

2026-08-18 定夺固定 basePath 后，改动不再由环境变量整体关闭，分两类：

| 改动 | 行为 |
|------|------|
| `?embed=true` URL 参数 | 无此参数 → `isEmbedded = false`，走原 `WorkspaceContent` 渲染，功能不变 |
| `basePath: "/leadagent"` | **永久生效**（单构建定夺），独立部署入口变为 `host/leadagent`（根路径重定向兜底），本地开发访问 `localhost:3000/leadagent` |
| cookie path | 固定 `/leadagent`，对所有部署一致 |
| `token-exchange` 端点 | 新增路由，不被调用即休眠，不影响现有 OIDC callback 流程 |
| Bridge 模块 | 仅当 iframe 内运行时初始化，独立部署时不加载 |

具体影响分析：

- **`make dev` / `make start`**：功能行为不变，仅 URL 前缀变为 `/leadagent`
  （根路径自动重定向）。
- **前端构建**：单构建产物，新增的 `src/components/embed/` 和 `src/core/bridge/`
  目录在无 `?embed=true` 时不被渲染路径引用。
- **后端启动**：新增的 `token-exchange` 路由注册在现有 router 上，没有请求就不会执行。
- **上游 merge**：新增文件零冲突；`next.config.js` 的 basePath / redirects / rewrites
  与 `page.tsx` 的 EMBED 分支是**常驻 diff**（非条件开关），上游若改动 rewrites 段或
  workspace 路由结构会产生小冲突——两处均为追加性质，解决成本低，但不再像环境变量
  方案那样"默认关闭"。这是单构建定夺接受的代价（换来单产物运维与单一测试面）。

## 10. 风险与注意事项

### 10.1 Session 过期处理

DeerFlow session cookie 过期后（默认 7 天），iframe 内请求返回 401。处理方案（协议已定稿，Shell 侧 `AUTH_TOKEN_REQUEST` 已实现并有测试覆盖，Phase 1 直接落地自动续期）：

1. 前端检测到 401 → 通过 Bridge 发送 `AUTH_TOKEN_REQUEST { reason: "session-expired" }`（§5.1）。
2. Shell 自动重新取 token 并重发 `AUTH_TOKEN`（新 ID token）。
3. DeerFlow 重新走 token-exchange 流程，自动重试原请求。

### 10.2 并发会话

固定 basePath（单构建）后，同域下独立版与嵌入版是**同一 URL 空间**（`/leadagent`）、
同一 session cookie——同一用户在两处看到的是同一会话，不存在两套 cookie 互相覆盖的
问题。若独立版部署在不同域名，则 cookie 天然隔离，互不干扰。

### 10.3 Bridge 握手失败

如果 Bridge 握手超时（5 秒内 Shell 未响应），DeerFlow 降级为完整模式：

1. 不走 Bridge 认证。
2. 检测到无 session cookie → 跳转 OIDC 静默续接流程（备选方案 A）。
3. 用户仍可正常使用，只是缺少 Shell 集成功能。

### 10.4 basePath 对现有路由的影响

- `i18n` 配置与 `basePath` 兼容（Next.js 原生支持）。
- `next/headers` 的 `cookies()` 在 `basePath` 下正常工作。
- Nextra docs 路由（`/[lang]/docs/*`）需要验证 basePath 兼容性。
- 前端中硬编码的 `/api/...` 路径需要适配 basePath（应使用配置函数而非硬编码）。

### 10.5 上游同步

DeerFlow 是 fork 项目。Phase 1 的改动策略是**非侵入式**（详见 §9）：

- EMBED 模式通过 URL 参数触发，不影响独立部署的功能行为。
- `basePath: "/leadagent"` 固定生效（单构建定夺，§6.2）——这是与上游的**常驻 diff**，
  不再是可关闭的环境变量；代价与收益见 §9.4。
- Bridge 客户端是新增模块，不修改现有组件。
- `EmbedThreadList` 是新建组件，不修改 `WorkspaceSidebar`。
- Gateway `token-exchange` 端点是新增路由，不修改现有 OIDC 流程。

上游 merge 时，改动集中在新增文件、`next.config.js` 的 basePath/rewrites 段与
`page.tsx` 的 EMBED 分支——后两处是常驻 diff，冲突面小但非零。

### 10.6 Shell Token 静默续签是体验前提

所有"无感续期"（session 过期自动 re-exchange、Phase 2 的 5-15 分钟静默刷新）都建立
在一个前提上：DeerFlow 需要 token 时，Shell 拿得出有效的 Keycloak token（嵌入主路径
为重新签发的 ID token；Phase 2 Bearer 分支为 refresh token 静默轮换的 access token）。
若 Shell 侧未实现静默续签，过期时 iframe 内会卡在"等待新 token"，体验退化为"需要
刷新页面"。集成验收时此条应作为 **Shell 侧硬性测试项**。

### 10.7 ID token 受众与 audience mapper（必配项）

嵌入主路径注入的是 ID token，其 `aud` 即签发对象 **wit-shell**（OIDC 规范行为）。
Gateway 严格校验 `aud` 含 `deerflow`（`client_id`）是正确行为，因此**必须在 Keycloak
的 wit-shell client 上配置 audience mapper** 把 `deerflow` 加入 ID token 的 `aud`
数组（本质是授权声明；详见 §3.1）。不配置则 token-exchange 验证必败——这是集成
步骤而非登录流程配置，配置方法见 Shell 侧 P1 Task 5 文档，集成验收时列为检查项。

`validate_access_token` 变体（azp/aud 宽容校验，§3.4）仅服务 Phase 2 纯 Bearer 分支
（彼时前端以 access token 作 Authorization header），与 token-exchange 无关。

## 11. 实施顺序

```
Step 1: Gateway token-exchange 端点（复用 validate_id_token，nonce 跳过）+ Bearer 验证分支
        （validate_access_token / AuthMiddleware / CSRF 豁免，Phase 2 预置）+ 测试
Step 2: Bridge 适配器（vendor iframe-bridge.ts schema → bridge-protocol.ts + IframeBridgeClient）
Step 3: EMBED 判定（page await searchParams + EmbedModeProvider）+ EmbedLayout 组件
Step 4: EmbedThreadList 组件（含 Thread 新建/切换）
Step 5: EMBED 认证流程集成（Bridge ID token → token-exchange → session；
        含 AUTH_TOKEN_REQUEST 续期与 LOGOUT 的 keepalive logout）
Step 6: 固定 basePath /leadagent + 根路径重定向 + nginx 部署验证
Step 7: Shell 侧集成（菜单注册 + Bridge 消息 + nginx 配置 + wit-shell audience mapper）；
        回传定夺结果：basePath "/leadagent"（DeerFlow 端口固定 :2026，
        当前实例 2006 的差异由 Shell 侧上游配置处理）
Step 8: 端到端测试（含 401 静默续期、LOGOUT 联动、audience mapper 验证）
```
