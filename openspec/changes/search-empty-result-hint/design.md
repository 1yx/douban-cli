## Context

`book search` / `movie search` 在 0 结果时静默输出空数组或空列表。用户无法分辨是真无结果、触发反爬、还是关键词太短（见 `fix-book-search-short-query`），只能盲试换词。

## Goals / Non-Goals

**Goals:**
- 0 结果时（非 `--json`）给一行可操作提示，引导用户换词或排查反爬。

**Non-Goals:**
- 不改 `--json` 契约（保持机器可读，不混入提示文本）。
- 不做自动重试或自动换词。

## Decisions

- 在 `book search` / `movie search` 的 action 中，结果为空且非 `--json` 时，打印一行提示到 stderr（不污染 stdout 管道）。
- 提示文案统一抽常量（如 `src/utils`），两类搜索复用，例如：「未找到结果。可能原因：关键词过短 / 触发反爬。试试更具体的关键词，或加副标题、作者名。」
- `--json` 模式照常输出 `[]`，无任何附加文本。

## Risks / Trade-offs

- 提示写 stdout 会破坏 `| jq` 等管道——故落 stderr，且仅非 json 触发。
- 文案过长可能干扰交互体验——保持单行、可操作。
