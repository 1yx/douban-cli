## ADDED Requirements

### Requirement: subject id 输入

`doulist add` 的 `target` 接受纯数字 subject id，自动拼成对应类别的 subject URL。

#### Scenario: 显式指定类别

- **WHEN** 用户运行 `douban doulist add <doulistId> 22229485 --type book`
- **THEN** 等价于添加 `https://book.douban.com/subject/22229485/`

#### Scenario: 按豆列类别推断

- **WHEN** 目标豆列 `category` 为 `movie`、`target` 为纯数字且未指定 `--type`
- **THEN** 拼接为 `https://movie.douban.com/subject/<id>/`

#### Scenario: 默认类别

- **WHEN** `target` 为纯数字、无 `--type` 且豆列类别未知（混合豆列）
- **THEN** 默认按 `book` 拼接，并在输出中提示可用 `--type` 覆盖

### Requirement: 非 id target 不受影响

- **WHEN** `target` 为 URL 或非纯数字字符串
- **THEN** 沿用原有 URL / 小组话题 / 外链处理逻辑，行为不变
