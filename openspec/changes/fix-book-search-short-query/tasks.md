## 1. 端点调研

- [ ] 1.1 确认 rexxar 搜索端点路径与参数（`m.douban.com/rexxar/api/v2/search?q=<kw>&cat=book` 或等价），带 cookie/UA 实测返回结构
- [ ] 1.2 对照现有 HTML 解析输出的 `BookSearchItem`，确定字段映射规则（`abstract` 由 author/publisher/pubdate/price 拼接）

## 2. 切换实现

- [ ] 2.1 重写 `src/api/book.ts` 的 `searchBooks` 为 rexxar JSON 请求 + 字段映射
- [ ] 2.2 复用 `fetchJson` 与登录态 cookie / 浏览器 UA（与 `getBookInfo` 一致）
- [ ] 2.3 反爬或非正常响应显式抛错，不静默返回空数组

## 3. 验证

- [ ] 3.1 `book search "启示录"` 返回非空且含 Marty Cagan《启示录》
- [ ] 3.2 `book search "三体"` 等正常词回归通过
- [ ] 3.3 `--json` 每条结果字段齐全（id/title/rating/year/url/cover/abstract）
- [ ] 3.4 反爬场景抛错而非空数组
