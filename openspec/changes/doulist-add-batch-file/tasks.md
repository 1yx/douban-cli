## 1. 复用批量工具

- [ ] 1.1 审查 `src/commands/mark.ts` 的 `--file` 解析与 `--delay` 节流实现
- [ ] 1.2 若未公共化，抽取到 `src/utils`，保证 `mark` 系列行为不变（回归覆盖）

## 2. add 批量分支

- [ ] 2.1 `doulist add` 增加 `--file <path>` 与 `--delay <秒>` 选项
- [ ] 2.2 每行解析 target（支持 subject id，配合 `doulist-add-accept-subject-id`）+ 可选 `,comment` 或制表符备注
- [ ] 2.3 逐条添加，单条失败不中断；结束打印成功/失败计数与失败明细

## 3. 验证

- [ ] 3.1 纯 target 列表批量添加成功
- [ ] 3.2 含 `id,comment` 行以备注添加
- [ ] 3.3 部分失败时继续并汇总明细
- [ ] 3.4 `--delay` 生效，节奏与 `mark --file --delay` 一致
- [ ] 3.5 README 补 `doulist add --file` 示例
