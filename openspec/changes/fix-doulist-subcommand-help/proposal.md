## Why

`douban doulist <sub> --help`（如 `doulist create --help`、`doulist add --help`）只回显 doulist 顶层的 5 行概览，看不到该子命令的任何 option（`--title` / `--category` / `--private` / `-m` 等）。新用户必须翻源码 `src/commands/list.ts` 才知道怎么用，是帮助系统的明显回归。

根因：`src/commands/list.ts` 中 `doulist.configureHelp({ formatHelp })` 自定义了帮助渲染，但实现只遍历子命令的 `name()` 与 `description()`，丢弃了每个子命令的 `.options`。

## What Changes

让 `doulist <sub> --help` 显示该子命令的全部 options（与 commander 默认行为一致），同时保留顶层 `doulist --help` 的分类概览。倾向最小改动：在自定义 `formatHelp` 里为每个子命令追加其 options 摘要，或直接对子命令放行 commander 默认 help。

## Capabilities

### New Capabilities
- `cli-help`: CLI 帮助系统的渲染规则，覆盖命令/子命令/选项的展示一致性。

### Modified Capabilities
（项目暂无已存 spec，首建）

## Impact

- `src/commands/list.ts`：`doulist.configureHelp` 的 `formatHelp` 实现。
- 排查是否还有其他命令复用了同一套自定义 `configureHelp`，需一并统一。
