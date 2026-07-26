## Why

`douban doulist add <doulistId> <target>` 的 `target` 只接受完整 subject URL（如 `https://book.douban.com/subject/22229485/`）。用户手里通常只有纯数字 subject id（从搜索/详情拿到的），必须再拼 URL 或先 search 拿链接，多一次跳转。

## What Changes

当 `target` 为纯数字时，自动识别为 subject id 并拼接为 subject URL。类别推断优先级：`--type book|movie` 显式参数 → 目标豆列自身 category → 默认 `book`。非纯数字仍按原逻辑当 URL / 小组话题 / 外链处理。

## Capabilities

### New Capabilities
- `doulist-add`: 向豆列添加条目的输入契约（URL / subject id / 外链）。

### Modified Capabilities
（与 `doulist-add-batch-file` 共用同一 capability，各自为 delta）

## Impact

- `src/commands/list.ts`：`add` action 的 target 规范化逻辑。
- 新增 `--type book|movie` 选项；或在 `addDoulistItem`（`src/api`）层做 id→URL 转换。
