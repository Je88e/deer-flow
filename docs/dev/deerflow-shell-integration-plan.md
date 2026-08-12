# DeerFlow × WIT Shell 集成技术方案

> 本文是 grilling 设计树访谈的收敛结果。术语以 [MF 技术方案](./mf-technical-plan.md) 为准。

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
| D3 | 认证模式 | **Phase 1 方案 B（Shell 注入 token）**；方案 A（OIDC 静默续接）为备选 |
| D4 | Token 验证 | JWKS 离线验证，复用已有 `OIDCService` |
| D5 | EMBED 模式 | 隐藏 `WorkspaceSidebar`，新建轻量 Thread 组件承载对话管理 |
| D6 | Bridge 协议 | 最小集：`HANDSHAKE` + `AUTH_TOKEN` + `READY` + `AUTH_FAILED` |
| D7 | Phase 2 触发 | 走一步看一步，不预设硬条件 |
| D8 | 部署拓扑 | 同域子路径 `/witagent/*`，DeerFlow Next.js 设 `basePath: "/witagent"` |
| D9 | Thread 列表 | DeerFlow 内渲染轻量 Thread 组件，随 EMBED 模式启动 |
| D10 | EMBED 触发 | URL 参数 `?embed=true` 为主，Bridge 消息为辅 |

## 2. 架构总览

```
                     WIT Shell Runtime（React + Rsbuild + MF 2.0 host）
                         路由 / 菜单 / 布局 / Token Broker / Event Bus
                                      |
                   -------------------+-------------------
                   |                                      |
                   v                                      v
             其他 MF App                          DeerFlow (Iframe App)
             (QRS / LIMS / ...)                   /witagent/workspace/...
                                                Iframe Bridge 通信
                                                      |
                                              DeerFlow Next.js (:3000)
                                              + Gateway API (:8001)
                                              + DeerFlow Nginx (:2026)
                                                      |
                                              Keycloak OIDC (共享)
```

### 数据流

```
1. 用户登录 WIT Shell（Keycloak OIDC 授权码 + PKCE）
2. Shell Token Broker 持有 Keycloak access_token
3. 用户点击 "DeerFlow" 菜单 → Shell 加载 iframe(src="/witagent/workspace?embed=true")
4. iframe 加载 → DeerFlow EMBED 模式启动（隐藏 Sidebar，渲染轻量 Thread 组件）
5. Shell Bridge 发送 AUTH_TOKEN { token: "<Keycloak JWT>" }
6. DeerFlow 前端收到 token → POST /witagent/api/v1/auth/token-exchange
7. Gateway 用 JWKS 验证 Keycloak JWT → 签发 DeerFlow session cookie
8. DeerFlow 前端加载 workspace → Bridge 发送 READY { threadId }
9. 用户开始使用 DeerFlow chat
```

## 3. 认证方案

### 3.1 Phase 1 方案 B：Shell 注入 Token（推荐）

```
Shell (Keycloak SSO)                        DeerFlow Gateway
      |                                            |
      |  1. 用户已登录，持有 Keycloak JWT           |
      |                                            |
      |  2. iframe 加载 /witagent/workspace        |
      |     Shell 通过 Bridge 发送 AUTH_TOKEN       |
      |-------------------------------------------->|
      |     { token: "<Keycloak JWT>" }            |
      |                                            |
      |  3. POST /api/v1/auth/token-exchange       |
      |-------------------------------------------->|
      |     { token: "<Keycloak JWT>",             |
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

- Shell 只在 iframe 首次加载时传一次 token。
- DeerFlow 拿到 token 后换取 Gateway session cookie（默认 7 天有效期）。
- 后续 DeerFlow 用自己的 session cookie 续命，不需要持续持有 Keycloak token。
- Gateway 复用已有的 `OIDCService.validate_id_token`（JWKS 验签）和 `get_or_provision_oidc_user`（用户供给）。

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
3. `OIDCService.validate_id_token(metadata, client_id, id_token)` → 本地验签 + 校验 iss / aud / exp / nonce。
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
| Keycloak | access_token (JWT) | 5-15 分钟 | Shell Token Broker 管理 |
| DeerFlow Gateway | session cookie (JWT) | 7 天 | Gateway 自动续期 |
| DeerFlow CSRF | csrf_token cookie | 与 session 同步 | 每次状态变更请求自动验证 |

Shell 不需要管理 DeerFlow 的 session 过期。iframe 内 DeerFlow 的 session cookie 过期后，前端检测到 401 → 通过 Bridge 向 Shell 请求重新发送 AUTH_TOKEN → 重新走 token-exchange 流程。

### 3.2 备选方案 A：OIDC 静默续接

> 当 Shell 不方便实现 token 注入时，可退回此方案。Phase 1 推荐方案 B，但此方案作为 fallback 保留。

```
iframe 加载 /witagent/workspace?embed=true
  → DeerFlow workspace layout (SSR) 检测无 access_token cookie
  → 跳转 /witagent/api/v1/auth/oauth/keycloak
  → Gateway OIDC redirect → Keycloak（检测到已有 SSO session）
  → Keycloak 静默回调 /witagent/api/v1/auth/callback/keycloak
  → Gateway 设置 session cookie
  → 重定向回 /witagent/workspace
  → iframe 加载完成
```

**优点**：DeerFlow 后端零改动（已有完整 OIDC 支持）。

**缺点**：
- iframe 内有 OIDC redirect 闪烁（虽然同源下用户几乎无感）。
- 非标准 Token Broker 模式，与 MF 技术方案文档的认证纪律有偏差。
- Keycloak session 过期时需要完整的 OIDC 重定向流程。

### 3.3 DeerFlow 后端 OIDC 配置

在 `config.yaml` 中添加 Keycloak provider：

```yaml
auth:
  oidc:
    enabled: true
    frontend_base_url: "/witagent"  # iframe 基路径
    providers:
      keycloak:
        display_name: "WIT SSO"
        issuer: "https://keycloak.wit.example.com/realms/wit"
        client_id: "deerflow"
        client_secret: "$KEYCLOAK_CLIENT_SECRET"
        redirect_uri: "https://wit.example.com/witagent/api/v1/auth/callback/keycloak"
        scopes: ["openid", "email", "profile"]
        pkce_enabled: true
        nonce_enabled: true
        token_endpoint_auth_method: "client_secret_post"
        auto_create_users: true
        require_verified_email: true
        allowed_email_domains: ["wit.example.com"]
        admin_emails: ["admin@wit.example.com"]
```

## 4. EMBED 模式

### 4.1 触发机制

**主**：URL 参数 `?embed=true`。
**辅**：Bridge `HANDSHAKE` 消息携带 `{ mode: "embed" }`。

DeerFlow workspace layout（Server Component）在 SSR 阶段读取 `searchParams.embed`，决定渲染模式：

```typescript
// frontend/src/app/workspace/layout.tsx (改动示意)
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
  searchParams,
}: {
  children: React.ReactNode;
  searchParams: { embed?: string; thread_id?: string };
}) {
  const isEmbedded = searchParams.embed === "true";
  // ... auth check (unchanged) ...

  if (isEmbedded) {
    return (
      <AuthProvider initialUser={user}>
        <I18nProvider>
          <EmbedLayout>{children}</EmbedLayout>
        </I18nProvider>
      </AuthProvider>
    );
  }

  // 原有完整 layout（Sidebar + CommandPalette + Settings + Toaster）
  return (
    <AuthProvider initialUser={user}>
      <I18nProvider>
        <WorkspaceContent sidebarState={sidebarState}>{children}</WorkspaceContent>
      </I18nProvider>
    </AuthProvider>
  );
}
```

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
- 监听 Bridge `NAVIGATE` 消息，实现外部驱动的 Thread 切换。

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
│ ┌─ Sidebar ─┐ ┌─ iframe (/witagent/workspace?embed=true) ─┐ │
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

### 5.1 Phase 1 最小协议集

基于 `@wit/platform-sdk` Iframe Bridge（类型化 postMessage，握手 + 版本 + 超时）。

#### Shell → DeerFlow（下行消息）

| 消息类型 | 时机 | 载荷 |
|---------|------|------|
| `HANDSHAKE` | iframe 加载后立即 | `{ version: "1.0", mode: "embed", capabilities: ["theme", "locale"] }` |
| `AUTH_TOKEN` | 握手成功后 | `{ token: string, tokenType: "keycloak-jwt", provider: "keycloak" }` |

#### DeerFlow → Shell（上行消息）

| 消息类型 | 时机 | 载荷 |
|---------|------|------|
| `READY` | 认证完成 + workspace 加载完毕 | `{ threadId: string }` |
| `AUTH_FAILED` | token-exchange 失败 | `{ error: string, code: string }` |

### 5.2 Phase 1.5 扩展协议（后续迭代）

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
  ├── iframe-bridge-client.ts   # Bridge 客户端：收发消息、握手、超时
  ├── message-types.ts          # 类型定义（与 Shell SDK 对齐）
  └── use-bridge.ts             # React hook：在组件中使用 Bridge
```

**设计要点**：

- `IframeBridgeClient` 是一个单例类，封装 `window.parent.postMessage` 通信。
- 握手有超时机制（默认 5 秒）。超时后降级为完整模式（不走 Bridge）。
- 非 EMBED 模式下（DeerFlow 独立运行），Bridge 不初始化，不影响正常功能。
- 预留 Mount Context 接口：Phase 2 迁移 MF App 时，只需替换 Bridge listener 为 Mount Context reader。

```typescript
// frontend/src/core/bridge/iframe-bridge-client.ts (示意)

export class IframeBridgeClient {
  private handshakePromise: Promise<HandshakePayload> | null = null;
  private tokenResolve: ((token: string) => void) | null = null;

  constructor(private timeout = 5000) {
    window.addEventListener("message", this.onMessage);
  }

  /** 发起握手，等待 Shell 响应 */
  async handshake(): Promise<HandshakePayload> {
    if (this.handshakePromise) return this.handshakePromise;
    this.handshakePromise = this.withTimeout(
      new Promise((resolve) => {
        const handler = (e: MessageEvent) => {
          if (e.data?.type === "HANDSHAKE") resolve(e.data.payload);
          window.removeEventListener("message", handler);
        };
        window.addEventListener("message", handler);
        window.parent.postMessage({ type: "HANDSHAKE_REQUEST", payload: {} }, "*");
      }),
      this.timeout,
    );
    return this.handshakePromise;
  }

  /** 等待 Shell 注入 auth token */
  async waitForToken(): Promise<string> {
    return this.withTimeout(
      new Promise<string>((resolve) => {
        this.tokenResolve = resolve;
      }),
      this.timeout,
    );
  }

  /** 向 Shell 报告就绪 */
  sendReady(threadId: string): void {
    window.parent.postMessage({ type: "READY", payload: { threadId } }, "*");
  }

  /** 向 Shell 报告认证失败 */
  sendAuthFailed(error: string, code: string): void {
    window.parent.postMessage({ type: "AUTH_FAILED", payload: { error, code } }, "*");
  }

  private onMessage = (e: MessageEvent) => {
    if (e.data?.type === "AUTH_TOKEN" && this.tokenResolve) {
      this.tokenResolve(e.data.payload.token);
      this.tokenResolve = null;
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

Shell nginx 增加 `/witagent/` location：

```nginx
# Shell nginx
location /witagent/ {
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

DeerFlow 自身的 nginx (:2026) 配置不变——它接收的是剥离了 `/witagent` 前缀的请求。

### 6.2 DeerFlow Next.js 配置

`frontend/next.config.js` 增加 `basePath`：

```javascript
const nextConfig = {
  basePath: process.env.DEERFLOW_EMBED_MODE === "true" ? "/witagent" : "",
  i18n: {
    locales: ["en", "zh"],
    defaultLocale: "en",
  },
  async rewrites() {
    // basePath 下的 API 代理路径
    const base = process.env.DEERFLOW_EMBED_MODE === "true" ? "/witagent" : "";
    return [
      {
        source: `${base}/api/langgraph/:path*`,
        destination: `${process.env.INTERNAL_GATEWAY_URL || "http://localhost:8001"}/api/:path*`,
      },
      {
        source: `${base}/api/:path*`,
        destination: `${process.env.INTERNAL_GATEWAY_URL || "http://localhost:8001"}/api/:path*`,
      },
    ];
  },
  // ... 其余配置不变
};
```

通过环境变量 `DEERFLOW_EMBED_MODE` 控制，同一套代码支持独立部署和嵌入部署。

### 6.3 Cookie 路径

Gateway 设置 session cookie 时需要注意 `Path`：

| Cookie | 完整模式 | EMBED 模式 |
|--------|---------|-----------|
| `access_token` (HttpOnly) | `Path=/` | `Path=/witagent` |
| `csrf_token` | `Path=/` | `Path=/witagent` |

Gateway 的 `session_cookie.py` 需要根据请求路径检测 EMBED 模式，设置正确的 cookie path。同域同源下，`/witagent` path 的 cookie 在 iframe 内的所有请求中自动携带。

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
| Bridge `AUTH_TOKEN` 消息接收 token | Mount Context 读取 token | 仅 token 交付方式不同 |
| `POST /api/v1/auth/token-exchange` | 同 | **零变化** |
| Gateway session cookie | 同 | **零变化** |

Bridge 适配器设计时预留 Mount Context 接口，迁移时替换 listener 即可。

## 8. Phase 1 改造清单

### 8.1 后端（DeerFlow Gateway）

| 改动 | 文件 | 工作量 |
|------|------|--------|
| 新增 `POST /api/v1/auth/token-exchange` 端点 | `backend/app/gateway/routers/auth.py` | ~40 行 |
| Cookie path 支持 `/witagent` | `backend/app/gateway/auth/session_cookie.py` | ~10 行 |
| `config.yaml` OIDC Keycloak provider 配置示例 | `config.example.yaml` | 文档 |
| 测试：token-exchange 端点 | `backend/tests/test_oidc_auth.py` | 跟随 |

### 8.2 前端（DeerFlow Frontend）

| 改动 | 文件 | 工作量 |
|------|------|--------|
| `basePath: "/witagent"` 支持 | `frontend/next.config.js` | ~5 行 |
| EMBED 模式 layout 分支 | `frontend/src/app/workspace/layout.tsx` | ~30 行 |
| `EmbedLayout` 组件 | `frontend/src/components/embed/embed-layout.tsx` | 新文件 |
| `EmbedThreadList` 组件 | `frontend/src/components/embed/embed-thread-list.tsx` | 新文件 |
| `EmbedThreadItem` 组件 | `frontend/src/components/embed/embed-thread-item.tsx` | 新文件 |
| `useEmbedThreads` hook（从 WorkspaceSidebar 提取共享逻辑） | `frontend/src/components/embed/use-embed-threads.ts` | 新文件 |
| `IframeBridgeClient` | `frontend/src/core/bridge/iframe-bridge-client.ts` | 新文件 |
| Bridge 消息类型定义 | `frontend/src/core/bridge/message-types.ts` | 新文件 |
| `useBridge` hook | `frontend/src/core/bridge/use-bridge.ts` | 新文件 |
| EMBED 模式认证流程集成 | `frontend/src/core/auth/embed-auth.ts` | 新文件 |

### 8.3 Shell 侧（WIT Platform）

| 改动 | 说明 |
|------|------|
| Shell 菜单注册 DeerFlow 为 Iframe App | App Manifest 配置 |
| Shell nginx `/witagent/` location | 反代到 DeerFlow |
| Shell Bridge 发送 `HANDSHAKE` + `AUTH_TOKEN` | Iframe App 集成 |
| Shell 接收 `READY` / `AUTH_FAILED` | iframe 状态管理 |

> 文件级复用策略、侵入度分析和原项目启动影响详见 [§9](#9-代码复用策略与侵入度分析)。

### 8.4 文件清单

**新增文件**：

```
backend/app/gateway/routers/auth.py          # 新增 token-exchange 端点（在现有文件内追加）
frontend/src/components/embed/
  ├── embed-layout.tsx
  ├── embed-thread-list.tsx
  ├── embed-thread-item.tsx
  └── use-embed-threads.ts
frontend/src/core/bridge/
  ├── iframe-bridge-client.ts
  ├── message-types.ts
  └── use-bridge.ts
frontend/src/core/auth/
  └── embed-auth.ts
docs/dev/deerflow-shell-integration-plan.md  # 本文档
```

**修改文件**：

```
frontend/next.config.js                      # basePath + rewrites 调整
frontend/src/app/workspace/layout.tsx         # EMBED 模式分支
backend/app/gateway/auth/session_cookie.py    # Cookie path 支持
config.example.yaml                           # OIDC Keycloak 配置示例
```

## 9. 代码复用策略与侵入度分析

### 9.1 新增文件树（标注复用关系）

```
frontend/
├── next.config.js                          # ✏️ 改动：basePath 条件 + rewrites 前缀
├── src/
│   ├── app/workspace/
│   │   └── layout.tsx                      # ✏️ 改动：EMBED 分支（~15 行）
│   │
│   ├── components/embed/                   # 🆕 全新目录
│   │   ├── embed-layout.tsx                #   EMBED 布局壳
│   │   ├── embed-thread-list.tsx           #   轻量 Thread 列表
│   │   ├── embed-thread-item.tsx           #   单条 Thread 项
│   │   └── use-embed-threads.ts            #   薄封装，复用 core/threads/hooks
│   │
│   └── core/
│       ├── bridge/                         # 🆕 全新目录
│       │   ├── iframe-bridge-client.ts     #   postMessage 单例客户端
│       │   ├── message-types.ts            #   类型定义
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
│   └── session_cookie.py                   #   ✏️ 增加 path 参数，默认 "/" 不变
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
| `frontend/src/app/workspace/layout.tsx` | 56 | ~15 行 | 在现有 switch 前加 `if (isEmbedded)` 分支，原路径不变 |
| `frontend/next.config.js` | 83 | ~10 行 | `basePath` 由环境变量控制；rewrites `source` 加 `${base}` 前缀 |
| `backend/app/gateway/routers/auth.py` | ~850 | ~40 行 | 文件末尾追加新路由函数，不修改现有函数 |
| `backend/app/gateway/auth/session_cookie.py` | — | ~5 行 | `set_session_cookie` 增加 `path` 参数，默认值 `"/"` 不变 |
| `config.example.yaml` | — | 文档 | 追加 Keycloak provider 配置示例 |

### 9.4 对原项目启动的影响：零影响

所有改动由环境变量 / URL 参数门控，默认值关闭：

| 门控 | 默认值 | 原项目行为 |
|------|--------|-----------|
| `DEERFLOW_EMBED_MODE` 环境变量 | 未设置 → `basePath = ""` | Next.js 路由、rewrites 完全不变 |
| `?embed=true` URL 参数 | 无此参数 → `isEmbedded = false` | `layout.tsx` 走原 `WorkspaceContent` 分支 |
| `session_cookie.py` 的 `path` 参数 | 默认 `"/"` | 与当前 cookie 行为一致 |
| `token-exchange` 端点 | 新增路由，不被调用即休眠 | 不影响现有 OIDC callback 流程 |
| Bridge 模块 | 仅当 iframe 内运行时初始化 | 独立部署时不加载 |

具体影响分析：

- **`make dev` / `make start`**：不设 `DEERFLOW_EMBED_MODE`，`basePath` 为空，所有路由、
  rewrites、cookie path 与现在完全一致。
- **前端构建**：`next build` 产物不变，新增的 `src/components/embed/` 和
  `src/core/bridge/` 目录在独立部署时不被任何现有文件 import，不影响 bundle。
- **后端启动**：新增的 `token-exchange` 路由注册在现有 router 上，没有请求就不会执行。
- **上游 merge**：改动集中在新增文件 + 少量条件分支
  （`if (process.env.DEERFLOW_EMBED_MODE)` / `if (isEmbedded)`），冲突只可能出现在
  `layout.tsx` 入口处和 `next.config.js` rewrites 段——两处都是追加而非改写，git merge
  时冲突面极小。

## 10. 风险与注意事项

### 10.1 Session 过期处理

DeerFlow session cookie 过期后（默认 7 天），iframe 内请求返回 401。处理方案：

1. 前端检测到 401 → 通过 Bridge 向 Shell 报告 session 过期。
2. Shell 重新发送 `AUTH_TOKEN`。
3. DeerFlow 重新走 token-exchange 流程。

Phase 1 可先实现简单的"检测 401 → 提示用户刷新"，后续再实现自动续期。

### 10.2 并发会话

用户同时打开 DeerFlow 独立版和 Shell 嵌入版时，两者共享同源 cookie。在 `/witagent` basePath 下，cookie path 隔离（`Path=/witagent` vs `Path=/`），不会互相干扰。

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

- EMBED 模式通过 URL 参数触发，不影响独立部署。
- `basePath` 通过环境变量控制，默认关闭。
- Bridge 客户端是新增模块，不修改现有组件。
- `EmbedThreadList` 是新建组件，不修改 `WorkspaceSidebar`。
- Gateway `token-exchange` 端点是新增路由，不修改现有 OIDC 流程。

上游 merge 时，改动集中在新增文件和少量条件分支，冲突面最小。

## 11. 实施顺序

```
Step 1: Gateway token-exchange 端点 + 测试
Step 2: Bridge 适配器（IframeBridgeClient + 消息类型）
Step 3: EMBED 模式 layout + EmbedLayout 组件
Step 4: EmbedThreadList 组件（含 Thread 新建/切换）
Step 5: EMBED 认证流程集成（Bridge token → token-exchange → session）
Step 6: basePath 配置 + nginx 部署验证
Step 7: Shell 侧集成（菜单注册 + Bridge 发消息 + nginx 配置）
Step 8: 端到端测试
```
