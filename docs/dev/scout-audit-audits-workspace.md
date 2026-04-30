# Scout Audit 独立结果工作台（Audits Workspace）实现总结

## 背景与目标

本次任务为 `scout-audit` 任务的产出文件（三件套）提供一个独立的前端结果展示页面：

- 不依赖聊天页，不在聊天页上增加入口
- 通过路由参数选择 thread，并支持像聊天页一样切换不同 thread
- 复用现有 Threads 与 Artifacts 能力，不优先新增后端聚合接口
- 现阶段按“所有 threads 都是 scout-audit 相关”处理，缺少产物时展示空态

## 交付内容

### 1) 新增独立路由与布局

- 路由入口：
  - `/workspace/audits`：默认跳转到第一个 thread 的审计页
  - `/workspace/audits/[thread_id]`：显示指定 thread 的审计结果
- Layout 结构：
  - 左侧：线程列表（搜索 + 高亮当前 thread）
  - 右侧：审计结果详情面板（Tabs：总览 / 规则结果 / 修正记录 / Phase 日志 / 原始报告）

对应实现：

- `frontend/src/app/workspace/audits/layout.tsx`
- `frontend/src/app/workspace/audits/page.tsx`
- `frontend/src/app/workspace/audits/[thread_id]/page.tsx`

### 2) 线程切换列表（像聊天页一样切换 thread）

在 audits layout 左侧实现线程列表：

- 使用 `useThreads()` 拉取线程列表
- 支持关键词搜索（按 thread title）
- 点击条目通过路由切换 thread
- 显示 threadId、更新时间与 artifacts 数量

对应实现：

- `frontend/src/components/workspace/scout-audit/audit-thread-list.tsx`
- `frontend/src/core/scout-audit/utils.ts`（构建 audits 路由）

### 3) Scout-audit 数据层：识别三件套并构建 ViewModel

以 thread 的 `values.artifacts` 为入口（artifact 路径均在 `/mnt/user-data/outputs/*`）：

- 从 artifacts 中选取完整的三件套：
  - `*-results.json`
  - `*-audit-report.md`
  - `*-session-log.jsonl`
- 并行拉取三个文件文本内容（走 Gateway artifacts 读取接口）
- 解析 `results.json` 与 `session-log.jsonl`，并构建 UI 需要的 ViewModel：
  - Header 信息：reportNo、batchNo、docType、overallResult 等
  - Summary cards：PASS/FAIL/SKIP/修正数量
  - Rule 分组：按规则前缀（B/N/R/P/E/S/D/L/C）分组
  - Corrections：修正记录列表
  - Phase timeline：JSONL 转为 phase 数组并排序

对应实现：

- `frontend/src/core/scout-audit/types.ts`
- `frontend/src/core/scout-audit/parser.ts`
- `frontend/src/core/scout-audit/hooks.ts`

### 4) 结果展示 UI（审计工作台）

主面板提供：

- 顶部 Banner：threadTitle + reportNo + overallResult badge + 基本元信息
- 下载按钮：三件套文件直链下载（results/report/session-log）
- Tabs：
  - 总览：报告字段与“适用规则通过率”进度条
  - 规则结果：分组表格（规则ID/状态/严重级别/说明）
  - 修正记录：展示原始状态 → 修正状态与原因
  - Phase 日志：时间线 + JSON 详情（原样展示）
  - 原始报告：Markdown 渲染 `audit-report.md`
- 空态与错误态：
  - 没有三件套：提示“该线程暂无审核结果”
  - 拉取失败/解析失败：提示“审核结果加载失败”

对应实现：

- `frontend/src/components/workspace/scout-audit/audit-dashboard.tsx`

### 5) 导航与 i18n 补齐

- 在 Workspace 左侧导航中增加 “审核结果（Audits）” 入口
- breadcrumb 支持 `audits`
- i18n 新增 audits 相关字段（中英文）
- 页面 document.title 支持 audits

对应实现：

- `frontend/src/components/workspace/workspace-nav-chat-list.tsx`
- `frontend/src/components/workspace/workspace-container.tsx`
- `frontend/src/core/i18n/locales/types.ts`
- `frontend/src/core/i18n/locales/zh-CN.ts`
- `frontend/src/core/i18n/locales/en-US.ts`

## 复用的系统能力（无新增后端接口）

本次实现主要复用现有能力：

- Threads 列表：`useThreads()`（已包含 `values` 与 `values.artifacts`）
- Artifacts 读取：Gateway `/api/threads/{thread_id}/artifacts/...`（前端以文本方式拉取，再解析 JSON/JSONL/Markdown）

## 验证与测试

- 新增单元测试覆盖：
  - 三件套选择逻辑
  - session-log.jsonl 解析与排序
  - ViewModel 组装（规则分组、汇总卡片、corrections、文件路径）
  - audits 路由构建

对应测试：

- `frontend/tests/unit/core/scout-audit/parser.test.ts`
- `frontend/tests/unit/core/scout-audit/utils.test.ts`

校验：

- `pnpm check`（lint + typecheck）通过（仓库中存在的历史 warning 保留）
- 新增测试用例通过

## 当前约束与后续可选增强

### 当前约束

- 按需求“所有 threads 都是 scout-audit 相关”处理：不做 thread 类型识别；只要 thread 缺少三件套就显示空态
- 三件套选择策略：当前选择 artifacts 中“存在完整三件套的某一组 basename”，若一个 thread 有多组结果，后续可按更新时间或命名策略扩展

### 后续可选增强

- 增加 thread 识别与过滤（例如只显示包含 results.json 的线程）
- 当一个 thread 有多组 results（多次运行）时，支持在右侧选择具体 reportNo
- 更强的规则筛选/排序（按 status、severity 等）
- 若 threads 数量很大，可考虑增加后端聚合接口减少前端探测成本

