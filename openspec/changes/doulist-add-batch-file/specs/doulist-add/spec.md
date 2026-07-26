## ADDED Requirements

### Requirement: 批量文件输入

`doulist add` 支持从文件批量添加条目，格式与现有 `mark` 系列 `--file` 对齐。

#### Scenario: 纯 target 列表

- **WHEN** 用户运行 `douban doulist add <doulistId> --file books.txt`，文件每行一个 target
- **THEN** 逐行添加每个 target 到豆列

#### Scenario: 含备注

- **WHEN** 文件某行为 `22229485,需求`
- **THEN** 该条目以 comment `需求` 添加（也接受制表符分隔）

#### Scenario: 单条失败不中断

- **WHEN** 批量过程中某条目添加失败
- **THEN** 继续处理剩余条目，结束时汇总成功/失败计数与失败明细

### Requirement: 节流

- **WHEN** 使用 `--file` 批量且指定 `--delay <秒>`
- **THEN** 每次添加之间按指定间隔休眠，行为与 `mark --file --delay` 一致
