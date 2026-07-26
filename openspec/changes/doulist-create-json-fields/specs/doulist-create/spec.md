## ADDED Requirements

### Requirement: JSON 输出完整性

`doulist create --json` 的输出必须自描述，包含标题与类别。

#### Scenario: 指定 title 与 category

- **WHEN** 用户运行 `douban doulist create --title "产品" --category book --json`
- **THEN** 输出 JSON 包含 `id`、`url`、`title`（值为 `产品`）、`category`（值为 `book`）

#### Scenario: 混合豆列（无 category）

- **WHEN** 用户运行 `douban doulist create --title "混合" --json`（未指定 `--category`）
- **THEN** 输出 `category` 字段反映混合豆列（如 `null` 或 `"mixed"`，与实现一致并文档化）
