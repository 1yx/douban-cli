## ADDED Requirements

### Requirement: 子命令帮助完整性

`doulist` 的每个子命令在 `--help` 时必须展示其全部可用选项，与 commander 默认行为一致。

#### Scenario: 查看子命令帮助

- **WHEN** 用户运行 `douban doulist create --help`
- **THEN** 输出包含 `--title`、`--category`、`--private`、`--json` 选项及其描述

#### Scenario: 查看带位置参数的子命令帮助

- **WHEN** 用户运行 `douban doulist add --help`
- **THEN** 输出包含 `<doulistId> <target>` 用法及 `-m, --comment` 选项

### Requirement: 顶层分类概览保留

- **WHEN** 用户运行 `douban doulist --help`
- **THEN** 输出仍为按分类组织的子命令概览（子命令名 + 描述）
