## Context

`src/api/book.ts` 的 `searchBooks` 请求 `search.douban.com/book/subject_search`（HTML 端点）并用 `parseBookSearchFromHtml` 解析。短中文关键词（如 `启示录`）会返回空数组，而加长查询串（`启示录 打造用户喜爱`）正常——短词易触发反爬挑战页或返回与解析器不兼容的结构，`isChallengePage` 未判中。项目已有稳定数据源先例：`getBookInfo` 用 `m.douban.com/rexxar/api/v2/book/<id>` 拿结构化 JSON。

## Goals / Non-Goals

**Goals:**
- 短中文关键词（≤ 3 字）能正常返回结果。
- 复用项目已有的 rexxar + cookie/UA 基础设施，规避 HTML 解析。
- 保持 `BookSearchItem[]` 返回字段契约不变（id/title/rating/year/url/cover/abstract）。

**Non-Goals:**
- 不改 `movie search`（见独立 change）。
- 不引入新的 HTML 解析依赖。

## Decisions

- 将 `searchBooks` 切换到移动端 rexxar 搜索接口（`m.douban.com/rexxar/api/v2/search?q=<kw>&cat=book` 或等价端点），返回 JSON。
- 在 `src/api/book.ts` 内做字段映射，把 rexxar 响应映射到现有 `BookSearchItem`，保持下游 `book.ts` command 与 `--json` 输出不变。
- 请求复用 `fetchJson`，带上登录态 cookie 与浏览器 UA（与 `getBookInfo` 一致）。
- 保留对反爬挑战的显式抛错（若 rexxar 仍可能触发），不静默返回空。

## Risks / Trade-offs

- rexxar 搜索端点的确切路径/参数需联网验证（项目已用 rexxar 拿详情，搜索端点需确认）。
- rexxar 可能对未登录请求限流——有 cookie 兜底，但需测试匿名场景。
- 字段映射可能丢字段（如 abstract 需从 author/publisher/pubdate/price 拼接）——以现有 HTML 解析输出为基准对齐。
