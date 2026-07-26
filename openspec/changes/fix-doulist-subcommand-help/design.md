## Context

`src/commands/list.ts` 中 `doulist` 父命令用 `configureHelp({ formatHelp })` 自定义了帮助渲染，目的是给 `doulist --help` 一个带分类的概览。但 `formatHelp` 实现只遍历 `cmd.commands` 输出 `name()` + `description()`，丢弃每个子命令的 `.options`。实测 `doulist create --help` / `add --help` 也只回显这 5 行概览，新用户看不到 `--title` / `--category` / `--private` / `-m` 等参数。

## Goals / Non-Goals

**Goals:**
- `doulist <sub> --help` 能显示该子命令的全部 options（与 commander 默认一致）。
- 保留 `doulist --help` 顶层的分类概览视图。

**Non-Goals:**
- 不改子命令的 options 本身、不改命令结构。
- 不统一重做全 CLI 的 help 主题（仅修 doulist 回归点，附带排查同类用法）。

## Decisions

- 在 `formatHelp` 中区分两种调用：当被渲染的 `cmd` 本身就是某个子命令（`cmd.commands` 为空）时，走 commander 原生 help（含 options）；当 `cmd` 是 doulist 父命令时，保留分类概览，并为每个子命令追加一行 options 摘要。
- 实现优先复用 commander 自带能力（`cmd.helpInformation()` 或遍历 `cmd.options` 的 `.flags` + `.description`），不手写 options 解析。
- 排查 `src/commands/*.ts` 是否还有其他 `configureHelp` 自定义，若有同类丢 options 问题一并修。

## Risks / Trade-offs

- commander 的 `configureHelp` 继承/传播行为需实测确认（父设置是否影响子命令的 `--help`），决策基于实测后定最终落点。
- 顶层概览追加 options 摘要后行数变长，需权衡"一眼扫全"与"信息完整"——倾向完整，概览可折叠展示。
