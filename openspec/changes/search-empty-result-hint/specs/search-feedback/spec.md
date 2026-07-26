## ADDED Requirements

### Requirement: 空结果可操作提示

search 类命令在结果为空且未启用 `--json` 时，必须给出可操作的提示信息。

#### Scenario: 非 json 空结果

- **WHEN** `book search` / `movie search` 返回空结果列表且未指定 `--json`
- **THEN** 向 stderr 打印一行提示，建议更换关键词或排查反爬

#### Scenario: json 模式保持纯净

- **WHEN** 搜索返回空结果且指定了 `--json`
- **THEN** 标准输出为 `[]`，无任何附加提示文本（保证管道可解析）

### Requirement: 提示不污染管道

- **WHEN** 用户将非 json 搜索输出通过管道传给下游命令
- **THEN** 空结果提示出现在 stderr，不混入 stdout 数据流
