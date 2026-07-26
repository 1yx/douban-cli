## Context

`doulist create --json` 当前只输出 `{ id, url }`（见 `src/commands/list.ts` 的 create action）。人类可读模式会打印标题，但结构化输出丢了 `title` 与 `category`，脚本无法从输出确认实际创建结果，尤其在 `category` 存在默认/推断时。

## Goals / Non-Goals

**Goals:**
- `create --json` 输出自描述，含 `title` 与 `category`。
- 结构化输出与人类可读输出信息对齐。

**Non-Goals:**
- 不改 `create` 的非 json 输出格式。
- 不引入额外字段（如创建时间等），仅补齐已有信息。

## Decisions

- 优先让 `createDoulist`（`src/api`）返回值带上 `title` 与 `category`（来自入参或豆瓣回执），command 层直接序列化。
- 若 API 层改动成本高，退一步在 command 层从 `opts.title` / `opts.category` 注入（注意 `category` 默认值需与 API 实际创建一致）。

## Risks / Trade-offs

- 若 command 层注入 `category`，需确保与豆瓣实际创建的豆列类型一致（混合豆列 vs book vs movie），避免误导脚本。
- 改 API 返回值会影响其他潜在调用方——目前仅 create action 调用，影响可控。
