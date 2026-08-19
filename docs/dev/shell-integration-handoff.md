# DeerFlow × WIT Shell 集成 — 交接文档

> 2026-08-19 · 分支 `feat/shell-embed-integration`（16 commits，9476fa11..17911bba）已合并入 `dev`
> 配套需求源：[deerflow-shell-integration-plan.md](deerflow-shell-integration-plan.md)
> 执行方式：subagent-driven-development（T1-T7 逐任务实现+评审+fix loop，终审 FIX-THEN-SHIP → 修复后 SHIP）

## 1. 交付内容总览

| 域 | 交付 | 关键提交 |
|---|---|---|
| 后端认证 | `POST /api/v1/auth/token-exchange`（复用 `validate_id_token`，nonce 跳过）；session/CSRF cookie Path 固定 `/leadagent`；7 天会话 | 659f6688, b619c0af, 60aea7e8 |
| 后端 Bearer | `validate_access_token`（azp/aud 宽容）；AuthMiddleware 凭证优先级 internal>bearer>cookie；Bearer 请求 CSRF 豁免 | 3fb1f51e, 5d8b6e56 |
| Bridge | vendored `bridge-protocol.ts`（七消息、顶层 `version:"1.0"`）；`IframeBridgeClient` 单例（显式 targetOrigin、入站 origin 校验、SSR 安全）；`use-bridge.ts` hooks | 821b34ba |
| EMBED 壳 | `?embed=true` 检测（page 级 await searchParams）；EmbedModeProvider；EmbedLayout（插槽式）；WorkspaceSidebar 自隐藏 | bd25c5ba |
| EMBED 线程面板 | EmbedThreadList / EmbedThreadItem / useEmbedThreads（复用共享 hooks，零复制）；embedHref 携带 `?embed=true` | c8e29fc5, 331f763c |
| EMBED 认证编排 | `embed-auth.ts`：handshake→waitForToken→token-exchange→READY；401 静默续期（单飞）；LOGOUT keepalive；EmbedAuthGate | dbcfb103 |
| basePath 单构建 | `next.config.js` basePath=`/leadagent` + 根 307 + rewrites 相对 basePath；浏览器端 `/api` 全量改走 `apiBase()`；history.replaceState 前缀；e2e 全量适配 | 58cbe9bb, 0b23cd3f, 607b751f, aaba98b4 |
| 终审修复 | F1：embed 线程列表 pathname 比较剥前缀（`stripBasePath` 共享 helper）；F2：fetcher 401 门控续期 + LOGOUT 清 activeBridge | 7cef46f1, 17911bba |

验证基线：前端 rstest 1139 passed / 仅 3 个预存失败文件（与本分支零文件重叠）；后端 token-exchange + Bearer 32 例全绿；`pnpm check` 0 新错；dev 冒烟（307 链、rewrite 触发、静态资产前缀隔离）全过。

## 2. Shell 联调必带（计划 Step 8）

1. **bridge-protocol.ts 逐字段对齐 Shell 仓库**——vendored schema 文件头已标"待与 Shell 仓库对齐"；七消息契约以计划 §5.1 为准。
2. **Keycloak wit-shell client audience mapper 配置**（§10.7）——不配则 token-exchange 恒 401（aud 不匹配）。
3. **§10.6 静默续签实测**——真实链路：操作 401 → `AUTH_TOKEN_REQUEST("session-expired")` → Shell 重发 token → 重 exchange → 原请求重试。
4. **LOGOUT 联动实测**——Shell 发 LOGOUT 后 keepalive 请求在页面卸载场景送达 Gateway。
5. **§10.1 端到端 UX 实测**——iframe 全程无交互加载；"第 8 天回来"场景。

## 3. 集成期硬化（可随联调 PR 带入）

| # | 项 | 位置 | 修法要点 |
|---|---|---|---|
| 1 | token-exchange 限速 + 畸形 token 401 化 | `backend/app/gateway/auth/oidc.py:296`（`get_unverified_header` 在 try 外，畸形 JWT 穿透为 500） | 包进 try 或捕获 PyJWTError 包装为 OIDCValidationError；补畸形 token→401 单测；端点加限速 |
| 2 | exchange fetch 加超时 | `frontend/src/core/auth/embed-auth.ts` `exchangeIdToken` | `AbortSignal.timeout(5000)`；超时走 failed 路径报 AUTH_FAILED（否则 Gateway 挂起时 gate 永停 authenticating） |
| 3 | `frontend/AGENTS.md` 登记新域 | core 域清单 + `bridge/`；components 清单 + `embed/` | 各一行 |
| 4 | §10.3 降级行为裁决 | 计划文字 vs 现状：握手失败后 iframe 内显示登录页（用户手点 SSO 续接），非自动 OIDC 跳转 | 接受现状并更新计划文字，或 embed 检测下自动跳 `${apiBase()}/v1/auth/oauth/keycloak` |
| 5 | auth 错误分类/归一化清理 | T1① JWKS 401 vs discovery 502 不对称；T1③ OIDCIdentity 归一化重复；T2② iss 尾斜杠；T2④ `_metadata_from_dict` 缺字段 500 | 一次 auth.py 清理 PR |
| 6 | embed 下隐藏移动端 SidebarTrigger | `chat-page.tsx`（消费 `useEmbedMode`） | 小改 |
| 7 | LangGraph SDK 通道续期接线 | `useInfiniteThreads`/`useStream` 的 401 目前是温和 error state（无硬跳，iframe 刷新可自愈） | api-client 层或 embed 子树包 `withEmbedAuthRetry`（其 HTTPError/裸 Response 分支已备好复用） |
| 8 | measure-route-assets 带前缀 fixture | `tests/unit/scripts/measure-route-assets.test.ts` | 补 `/leadagent/_next/static/...` fixture |
| 9 | 部署加固：Shell nginx 对 `/leadagent/` 加 `frame-ancestors 'self'` | 运维侧 | 同源即可 |
| 10 | fetcher 401 剥前缀路径补单测（F2 已改该分支，接续期测试一并） | `tests/unit/core/api/fetcher.test.ts` | 已有 6 例 pin 401 门控；剥前缀边界可再补 |

## 4. 预存问题（与本分支无关，建议另开 issue）

| 项 | 影响 |
|---|---|
| **scout-audit 页预渲染 bug**（`useI18n must be used within I18nProvider`，build 期失败） | **阻塞整个 e2e CI**：默认 e2e 的 webServer 跑 `next build`，此 bug 不修则套件无法起动。最优先 |
| scout-audit ×2 单测 `import "vitest"`（TS2307） | typecheck/单测噪音 |
| i18n 文案漂移：`translations.test.ts` 期望"通过 DeerFlow 智能体…"实为"通过智能体…" | 单测红 |
| backend `backend/.deer-flow/.jwt_secret` root 属主（PermissionError，2 个测试） | 本机环境问题 |

## 5. 已知边界与有意取舍（复审记录在案）

- **非 EMBED 零回归**：`NEXT_PUBLIC_BASE_PATH` 未设时 `basePath()`→`""`、所有路径逐字节等价旧行为；root 部署形态由 env.test.ts 及全量单测锁住。
- **LOGOUT×in-flight 续期竞态**：极窄窗口内续期的 token-exchange 可能在 keepalive logout 后落地重建 session cookie（同一用户身份、低风险，代码注释明示取舍）。
- **e2e 的 `BASE = "/leadagent"` 常量与 goto 字面量混用**：`tests/e2e/utils/paths.ts` 供 href 断言/选择器用；goto 保持字面量——语义一致、grep 双向可检索，统一替换属无谓 diff。
- **Ready 的 threadId 在 `/new` 场景传空串**：诚实信号（伪造占位 uuid 对 Shell 无语义），测试双分支钉死。
- **T1 TDD 顺序**为 transcript 证据裁定（diff 不可证）。

## 6. Cannot-verify（需联调/后续动作闭环）

1. 端到端续期 UX（§10.1）——机制单测在，真实链路依赖联调。
2. token-exchange 对运行中 Gateway 的实测——需联调环境真实 Keycloak ID token。
3. e2e 套件实跑——被 §4 的 scout-audit build bug 阻塞。
4. T7-N1（history.replaceState 前缀）浏览器实测——静态+单测已过，浏览器实测并入 e2e 阻塞项。
