## Why

`book search` / `movie search` 在 0 结果时静默输出空数组或空列表，用户无法判断是真没结果、触发反爬、还是关键词太短（见 `fix-book-search-short-query`）。无可操作提示，上一轮遇到空结果时只能靠经验换词盲试。

## What Changes

search 类命令在 0 结果时（**非 `--json` 模式**）打印一行可操作提示，例如：「未找到结果。可能原因：关键词过短 / 触发反爬。试试更具体的关键词，或加副标题、作者名。」`--json` 模式保持原样（机器可读，不混入提示文本）。

## Capabilities

### New Capabilities
- `search-feedback`: 搜索结果为空时给用户的可操作反馈。

### Modified Capabilities
（首建）

## Impact

- `src/commands/book.ts`：`search` action 的空结果分支。
- `src/commands/movie.ts`（或对应 search 命令位置）：同上。
