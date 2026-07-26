## ADDED Requirements

### Requirement: 短中文关键词可用

书籍搜索不得因关键词较短而静默返回空结果（排除真实无结果的情况）。

#### Scenario: 三字中文书名

- **WHEN** 用户运行 `douban book search "启示录"`
- **THEN** 返回非空结果列表，且包含 Marty Cagan《启示录》相关条目

### Requirement: 结果字段契约保持

切换搜索数据源后，返回的每条结果必须保持现有 `BookSearchItem` 字段。

#### Scenario: 字段映射

- **WHEN** `searchBooks` 返回任意结果
- **THEN** 每条结果包含 `id`、`title`、`rating`、`year`、`url`、`cover`、`abstract` 字段，含义与切换前一致

### Requirement: 反爬不静默

- **WHEN** 搜索请求触发反爬挑战或非正常响应
- **THEN** 抛出明确错误（不返回空数组伪装成功）
