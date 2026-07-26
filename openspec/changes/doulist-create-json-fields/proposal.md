## Why

`douban doulist create --json` 只返回 `{ id, url }`，缺少 `title` 与 `category`。脚本化使用时无法从输出确认实际创建的标题与类目（尤其 category 有默认/推断时），与人类可读输出信息不对齐。

## What Changes

`create --json` 输出补充 `title` 与 `category` 字段，使结构化输出自描述、可被下游脚本直接信任。

## Capabilities

### New Capabilities
- `doulist-create`: 创建豆列/书单/影单，含结构化输出契约。

### Modified Capabilities
（首建）

## Impact

- `src/commands/list.ts`：`create` action 的 JSON 输出拼装。
- `createDoulist`（`src/api`）返回值补 `title` / `category`，或 command 层从 `opts` 注入。
