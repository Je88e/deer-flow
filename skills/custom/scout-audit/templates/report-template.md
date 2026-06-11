# Scout 合规审核报告

> **Ownership:** 本文件是审核报告版式、段落顺序、占位符布局与整改建议来源标签写法的权威模板；`SKILL.md` 只引用报告 contract，不重复模板细节。

> 报告编号: {reportNo} | 批号: {batchNo} | 文档类型: {docType}
> 品名: {productName} | 规格: {specification} | 审核日期: {auditDate}

---

## 审核总评: {overallResult}

| 状态 | 数量 |
|------|------|
| PASS | {passCount} |
| SKIP | {skipCount} |
| FAIL | {failCount} |

---

## 详细规则结果

### 基本信息 (B001–B005)

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| B001 | 样品批号准确 | {B001_status} | {B001_details} |
| B002 | 产品信息完整 | {B002_status} | {B002_details} |
| B003 | 检测项目完整 | {B003_status} | {B003_details} |
| B004 | 日期逻辑正确 | {B004_status} | {B004_details} |
| B005 | 报告编号唯一 | {B005_status} | {B005_details} |

### 数值判定 (N001–N002)

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| N001 | 结果在标准限度内 | {N001_status} | {N001_details} |
| N002 | 结果在可选结果内 | {N002_status} | {N002_details} |

### 数值规范 (R001–R004)

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| R001 | 有效数字位数正确 | {R001_status} | {R001_details} |
| R002 | 修约方式正确 | {R002_status} | {R002_details} |
| R003 | 单位统一规范 | {R003_status} | {R003_details} |
| R004 | 数值无多余小数 | {R004_status} | {R004_details} |

<!-- 若有检测限豁免修正，在此添加注释 -->
<!-- > **注:** R002/R004 原始判定为 FAIL，因 XXX 为检测限表达方式 (isDetectionLimit: true)，依据规则豁免条款修正为 PASS。 -->

### 精密度 (P001–P003) — ELN 专用

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| P001 | 平行样相对偏差合格 | {P001_status} | {P001_details} |
| P002 | 重复性RSD合格 | {P002_status} | {P002_details} |
| P003 | 加标回收率合格 | {P003_status} | {P003_details} |

### 环境/仪器 (E001–E005) — ELN 专用

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| E001 | 人员资质校验 | {E001_status} | {E001_details} |
| E002 | 仪器编号匹配 | {E002_status} | {E002_details} |
| E003 | 仪器在校准期内 | {E003_status} | {E003_details} |
| E004 | 环境条件合格 | {E004_status} | {E004_details} |
| E005 | 系统适用性合格 | {E005_status} | {E005_details} |

### 签名/审核 (S001–S004)

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| S001 | 签名完整 | {S001_status} | {S001_details} |
| S002 | 电子签名合规 | {S002_status} | {S002_details} |
| S003 | 禁止代签 | {S003_status} | {S003_details} |
| S004 | 审核流程完整 | {S004_status} | {S004_details} |

### 数据完整性 (D001–D003)

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| D001 | 修改规范 | {D001_status} | {D001_details} |
| D002 | 原始数据可追溯 | {D002_status} | {D002_details} |
| D003 | 无缺失页面 | {D003_status} | {D003_details} |

### 逻辑一致性 (L001–L004)

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| L001 | 结果与结论一致 | {L001_status} | {L001_details} |
| L002 | 跨页数据一致 | {L002_status} | {L002_details} |
| L003 | 计算公式正确 | {L003_status} | {L003_details} |
| L004 | 标准编号正确 | {L004_status} | {L004_details} |

<!-- 若有 COA 格式修正，在此添加注释 -->
<!-- > **注:** L001 原始判定为 FAIL（单项结论字段为空）。COA 格式使用总结论而非逐项结论，总结论与全部合格结果一致，修正为 PASS。 -->

### 结论/表述 (C001–C002)

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| C001 | 结论规范 | {C001_status} | {C001_details} |
| C002 | 无歧义表述 | {C002_status} | {C002_details} |

---

## 修正记录

<!-- 仅当 corrections[] 非空时输出此部分 -->
| 规则ID | 原始状态 | 修正后 | 原因 |
|--------|---------|--------|------|
| {correction_ruleId} | {correction_originalStatus} | {correction_correctedTo} | {correction_reason} |

---

## 规则引擎告警与证据定位

<!-- 仅当存在 warning 级 FAIL 或 evidence.location 时输出此部分 -->
| 规则ID | 严重级别 | 证据定位 | 说明 |
|--------|---------|---------|------|
| {trace_ruleId} | {trace_severity} | {trace_location} | {trace_details} |

---

## 规则执行汇总

| 状态 | 数量 |
|------|------|
| PASS | {passCount} |
| SKIP | {skipCount} |
| FAIL | {failCount} |
| **TOTAL** | **32** |

- 适用规则: {applicableCount} | 通过: {passCount} | 失败: {failCount}
- 豁免规则: {skipCount} ({skipReasons})

<!-- FAIL 项整改建议（仅在有 FAIL 时出现） -->

## 整改建议

<!-- 仅当存在 FAIL 结果时输出此部分，每条 FAIL 一条建议 -->
<!-- ### {ruleId}: {ruleName}
- **期望:** {expected}
- **实际:** {actual}
- **证据定位:** {location}
- **严重级别:** {severity}
- **整改建议:** {remediation} -->

---

## 审核结论

**{overallResult}** — {overallSummary}

---

# Template C: 联合审核报告 (auditMode="joint")

```markdown
# Scout 联合合规审核报告

> 批号: {batchNo} | 品名: {productName} | 规格: {specification}
> COA 报告编号: {coaReportNo} | ELN 编号: {elnReportNo}
> 审核日期: {auditDate} | 审核模式: 联合审核 (COA + ELN)

---

## 审核总评: {overallResult}

| 文档 | PASS | FAIL | SKIP | 合计 |
|------|------|------|------|------|
| COA | {coaPassCount} | {coaFailCount} | {coaSkipCount} | 32 |
| ELN | {elnPassCount} | {elnFailCount} | {elnSkipCount} | 32 |
| 跨文档 | {crossPassCount} | {crossFailCount} | {crossSkipCount} | 5 |
| **合计** | **{passCount}** | **{failCount}** | **{skipCount}** | **69** |

<!-- 若 ELN 经过 Phase 3.5 筛选，添加: -->
> **ELN 筛选说明:** ELN 原始含 {originalSampleCount} 个样品，经 Phase 3.5 筛选（依据 COA 批号 {batchNo}，方式: {filterMethod}），保留 {filteredSampleCount} 个样品参与审核。排除样品ID: {excludedSampleIds}。

---

## COA 审核结果

<!-- 标准 32 条规则表格，Template A 结构 -->
<!-- 包含: 基本信息 / 数值判定 / 数值规范 / 签名审核 / 数据完整性 / 逻辑一致性 / 结论表述 -->

---

## ELN 审核结果

<!-- 标准 32 条规则表格，Template A 结构 -->
<!-- 若 ELN 经筛选，段落标题可加注: -->
<!-- ### ELN 审核结果（筛选后，{filteredSampleCount}/{originalSampleCount} 样品） -->

---

## 跨文档一致性审核 (X001-X005)

| 规则ID | 规则名称 | 状态 | 说明 |
|--------|---------|------|------|
| X001 | 结果数据一致 | {X001_status} | {X001_details} |
| X002 | 签名角色对应 | {X002_status} | {X002_details} |
| X003 | 日期逻辑一致 | {X003_status} | {X003_details} |
| X004 | 检测项目覆盖 | {X004_status} | {X004_details} |
| X005 | 仪器使用一致 | {X005_status} | {X005_details} |

---

## 修正记录

<!-- joint 模式下 corrections 可能来自 COA 或 ELN -->
| 文档 | 规则ID | 原始状态 | 修正后 | 原因 |
|------|--------|---------|--------|------|
| {correction_doc} | {correction_ruleId} | {correction_originalStatus} | {correction_correctedTo} | {correction_reason} |

---

## 整改建议

<!-- 合并 COA、ELN、跨文档的全部 FAIL 项 -->
<!-- 每条标题必须带来源标签，禁止只写裸规则号；这是 joint 报告整改建议的固定 contract。
示例:
### COA - B002: 产品信息完整
### ELN - S001: 签名完整
### 跨文档 - X003: 日期逻辑一致 -->

---

## 审核结论

**{overallResult}** — {overallSummary}
```

## 模板变量映射 (joint 模式, generate-report.ts)

| 模板变量 | 来源 |
|---------|------|
| `{batchNo}` | jointResultsJSON.batchNo |
| `{productName}` | jointResultsJSON.productName |
| `{coaReportNo}` | jointResultsJSON.documents.coa.reportNo |
| `{elnReportNo}` | jointResultsJSON.documents.eln.reportNo |
| `{coaPassCount}` 等 | 从 jointResultsJSON.documents.coa.ruleResults 计算 |
| `{crossPassCount}` 等 | 从 jointResultsJSON.crossDocumentRules 计算 |
| `{originalSampleCount}` | jointResultsJSON.elnFiltering.originalSampleCount |
| `{filteredSampleCount}` | jointResultsJSON.elnFiltering.filteredSampleCount |

<!-- overallSummary 模板:
  PASS: "该 {docType} 文档全部适用规则审核通过，未发现合规问题。"
  CONDITIONAL_PASS: "该 {docType} 文档存在 {warningCount} 项警告级别问题，需复核后确认。"
  FAIL: "该 {docType} 文档存在 {severeCount} 项严重问题，审核不通过，需整改后重新提交。"
-->
