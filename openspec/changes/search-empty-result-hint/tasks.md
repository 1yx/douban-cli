## 1. 提示实现

- [ ] 1.1 在 `src/utils` 抽出统一空结果提示文案常量
- [ ] 1.2 `book search` action：结果为空且非 `--json` 时向 stderr 打印提示
- [ ] 1.3 `movie search` action：同上
- [ ] 1.4 确保 `--json` 模式 stdout 仍为 `[]`，无附加文本

## 2. 验证

- [ ] 2.1 `book search "<不存在的词>"` 非 json 打印可操作提示
- [ ] 2.2 `--json` 输出纯净 `[]`
- [ ] 2.3 提示走 stderr，`| jq` 等管道不受污染
- [ ] 2.4 `movie search` 空结果同样生效
