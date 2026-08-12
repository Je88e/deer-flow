# WIT AI Platform 前端技术方案

> 本文是 grill-with-docs 三轮澄清的收敛结果；术语以 [CONTEXT.md](../CONTEXT.md) 为准，决策依据见 [docs/adr](./adr/)。

## 1. 架构总览

```
                        Shell Runtime（React + Rsbuild + MF 2.0 host）
                          路由 / 菜单 / 布局 / Token Broker / Event Bus
                                       |
              -------------------------+--------------------------
              |                        |                         |
              v                        v                         v
        MF App（mount 契约）      Iframe App               External App
        QRS / LIMS / ...          Workflow Designer        BI / MES / ERP
        React 或 Vue              Iframe Bridge 通信        SSO 免登跳转
```

所有应用由**运行时 App Manifest** 驱动接入；部署形态为**单域名 nginx 路径反代**；认证统一 **Keycloak OIDC**，Shell 为唯一 Token Broker。

## 2. Monorepo 结构（pnpm workspace + Turborepo）

```
wit-ai-platform-front-shell/
  apps/
    shell/                # Shell Runtime：React 18 + TS + Rsbuild + MF 2.0 host
    app-qrs/              # MF App（React）
    app-lims/             # MF App（React 或 Vue）
  packages/
    design-tokens/        # Style Dictionary：CSS 变量 + TS 常量
    design-system/        # React 组件库 + 框架无关基础 CSS 层
    mf-config/            # Shared Config：singleton 依赖的唯一事实来源
    platform-sdk/         # Mount Contract 类型、Mount Context、Event Bus、
                          # Iframe Bridge、Sentry 接入、契约测试工具
  infra/
    nginx/                # 单域反代配置模板（私有化交付物）
    release/              # Release Manifest 生成脚本
  turbo/generators/       # MF App 脚手架模板（见 docs/scaffolding.md）
  docs/adr/               # 架构决策记录
  CONTEXT.md              # 术语表
```

既有 Vite 应用留在原技术栈，用 `@module-federation/vite` 原地接入；新建应用用 Rsbuild。iframe 与 External App 不进 monorepo。

## 3. 技术选型清单

| 领域 | 选型 | 备注 |
| --- | --- | --- |
| 包管理 / 任务编排 | pnpm workspace + Turborepo | 按变更增量构建 |
| Shell / 新应用构建 | Rsbuild + `@module-federation/rsbuild-plugin`（MF 2.0） | ADR-0004 |
| 既有 Vite 应用接入 | `@module-federation/vite` | 与 MF 2.0 runtime 协议互通 |
| 框架 | React 18 + TS 为主；Vue 3 应用可改造为 MF App | ADR-0005 mount 契约 |
| 路由 | Shell 持顶层路由（React Router）；应用内子路由自管 | 跨应用跳转走 Shell 路由协议 |
| 认证 | keycloak-js（授权码 + PKCE），Shell 独占 | ADR-0003 / ADR-0008 |
| Design System | Style Dictionary tokens + 基础 CSS + React 组件库 | ADR-0006 |
| 跨应用通信 | `@wit/platform-sdk`：Mount Context + 类型化 Event Bus | 禁止应用间直接 import |
| iframe 通信 | `@wit/platform-sdk`：Iframe Bridge（类型化 postMessage，握手 + 版本 + 超时） | ADR-0001 |
| 权限 | Permission Point 体验层裁剪，服务端真鉴权 | ADR-0009 |
| 测试 | Vitest 单测 + mount/manifest 契约测试 | Playwright 冒烟**暂缓** |
| 监控 | Sentry 自托管，按 appId 打 tag | iframe 错误经 Bridge 上报 |
| 交付 | nginx 模板 + 各应用静态包 + Release Manifest | 完整 CI/CD **暂缓** |

## 4. 落地路线图

**P0 地基**：monorepo 骨架；design-tokens 与基础 CSS；mf-config；platform-sdk（Mount Contract 类型 + Event Bus + Iframe Bridge）；Shell 完成 Keycloak 登录、App Manifest 加载、fixture MF App 挂载。

**P1 首个真实应用**：一个 React MF App 按 Mount Contract 接入；ErrorBoundary 与 remote 降级页；Sentry 接入；契约测试进 CI（轻量脚本即可，完整 CI/CD 暂缓）。

**P2 三形态打通**：Workflow Designer 以 Iframe App 接入（Bridge 协议落地）；BI/MES/ERP 以 External App 接入（SSO 跳转菜单）；Vue 应用改造为 MF App 验证混合技术栈。

**P3 交付与规模化**：脚手架模板实现（turbo/gen）；Release Manifest 与私有化安装包；补 Playwright 冒烟与完整 CI/CD。

## 5. 关键纪律（违反任意一条都会腐蚀架构）

1. 应用间禁止直接 import 彼此模块；通知走 Event Bus，跳转走 Shell 路由协议。
2. singleton 依赖只允许通过 `@wit/mf-config` 声明，升级走版本列车。
3. 任何应用不直连 Keycloak；token 只从 Token Broker 获取。
4. Permission Point 不做安全判断，服务端必须重新鉴权。
5. 新应用一律从脚手架生成，不手工复制既有应用。
