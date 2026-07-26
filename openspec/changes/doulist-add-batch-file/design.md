## Context

`mark` / `unmark` / `rate` / `comment`（`src/commands/mark.ts`）都支持 `--file` 批量入口和 `--delay` 节流，`doulist add` 却没有。"建书单后一次性导入一批条目"是高频场景，当前需手写 bash 循环绕过（上一轮即如此）。

## Goals / Non-Goals

**Goals:**
- `doulist add` 支持 `--file <path>` 批量添加。
- 文件格式与节流参数与现有 `mark` 系列对齐，降低学习成本。

**Non-Goals:**
- 不做事务化（部分失败不回滚已成功项），仅汇总报告。
- 不新增 `remove --file`（本次仅 `add`）。

## Decisions

- 每行一个 target，支持 `target,comment`（也兼容制表符分隔，与 `comment --file` 一致）。
- target 本身支持 subject id（配合 `doulist-add-accept-subject-id`）与 URL。
- 复用 `mark.ts` 的批量解析与 `--delay` 节流逻辑；若该逻辑未抽公共函数，抽到 `src/utils` 共享。
- 逐条添加，单条失败不中断，结束时打印成功/失败计数与失败明细。

## Risks / Trade-offs

- 批量写操作易触发豆瓣风控——靠 `--delay` 默认值（对齐 mark 系列）兜底，并在帮助中提示。
- 抽取 mark 批量工具为公共函数会触动 `mark.ts`，需保证其行为不变（回归测试覆盖）。
