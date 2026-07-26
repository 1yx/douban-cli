## Why

`mark` / `unmark` / `rate` / `comment` 都支持 `--file` 批量入口，唯独 `doulist add` 没有。批量给豆列加一批条目（建书单后一次性导入是高频场景）需要手写 bash 循环——上一轮正是这么绕过的，体验割裂。

## What Changes

为 `doulist add` 增加 `--file <path>` 批量入口，对齐现有批量约定。文件格式：每行一个 target（URL 或 subject id，配合 `doulist-add-accept-subject-id`），支持可选备注（`target,comment` 或制表符分隔），并支持 `--delay` 节流。

## Capabilities

### New Capabilities
- `doulist-add`: 向豆列添加条目，含批量文件输入。

### Modified Capabilities
（与 `doulist-add-accept-subject-id` 共用同一 capability，各自为 delta）

## Impact

- `src/commands/list.ts`：`add` action 增加 `--file` 分支。
- 复用 `mark.ts` 的批量解析 / 节流逻辑（若已抽公共函数则直接调用，否则抽取到 `src/utils`）。
