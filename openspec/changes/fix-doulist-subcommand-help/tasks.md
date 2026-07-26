## 1. 根因确认

- [ ] 1.1 实测 commander `configureHelp` 的继承行为：确认父 `doulist` 的 `formatHelp` 为何也作用于子命令 `--help`
- [ ] 1.2 全仓 `rg configureHelp` 排查其他命令是否有同类自定义、是否同样丢 options

## 2. 修复实现

- [ ] 2.1 改 `src/commands/list.ts` 的 `formatHelp`：被渲染对象本身是子命令（`cmd.commands` 为空）时走 commander 原生 help；是父命令时保留分类概览并为每个子命令追加 options 摘要
- [ ] 2.2 options 摘要复用 `cmd.options` 的 `.flags` + `.description`，不手写解析

## 3. 验证

- [ ] 3.1 `doulist create --help` 含 `--title` / `--category` / `--private` / `--json`
- [ ] 3.2 `doulist add --help` 含 `<doulistId> <target>` 用法与 `-m, --comment`
- [ ] 3.3 `doulist --help` 仍为分类概览
- [ ] 3.4 其余子命令（view/ls/remove/edit/follow/unfollow/hot）`--help` 均完整
- [ ] 3.5 更新 README 若有帮助示例需同步
