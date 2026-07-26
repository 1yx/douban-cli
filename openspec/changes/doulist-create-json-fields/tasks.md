## 1. 字段补齐

- [ ] 1.1 优先改 `createDoulist`（`src/api`）返回值，带上 `title` 与 `category`（来自入参或豆瓣回执）
- [ ] 1.2 退路：command 层从 `opts.title` / `opts.category` 注入，确保 `category` 与实际创建一致（含混合豆列表示，如 `null`/`"mixed"`，并文档化）

## 2. 验证

- [ ] 2.1 `create --title "产品" --category book --json` 输出含 `title=产品`、`category=book`
- [ ] 2.2 未指定 `--category` 时 `category` 字段反映混合豆列且语义文档化
- [ ] 2.3 非 json 输出格式不变
