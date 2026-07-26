## Why

`douban book search "启示录"` 返回空数组 `[]`，必须换成更长的查询串（如 `启示录 打造用户喜爱`）才搜得到。短中文关键词搜索不可用，直接阻断"按书名加豆列/查详情"等核心流程——上一轮操作即被此卡住。

根因：`src/api/book.ts` 的 `searchBooks` 走 `search.douban.com/book/subject_search` 的 **HTML 端点**并用 `parseBookSearchFromHtml` 解析；短中文词容易触发反爬挑战页或返回与解析器不兼容的结果页结构，导致解析为空，而 `isChallengePage` 未判中。

## What Changes

将书籍搜索切换到项目已在使用的稳定结构化数据源——移动端 rexxar API（`m.douban.com/rexxar/api/v2/...`，`getBookInfo` 已在用），返回 JSON 规避 HTML 解析与反爬；或在 HTML 路径上补齐挑战页检测、重试与解析容错。**优先采用 rexxar 方案**。

## Capabilities

### New Capabilities
- `book-search`: 按关键词搜索豆瓣书籍并返回结构化结果列表。

### Modified Capabilities
（首建）

## Impact

- `src/api/book.ts`：`searchBooks` 实现与返回类型（`BookSearchItem[]` 字段保持兼容）。
- 请求需带 cookie/UA（项目已有 `fetchJson` 与登录态 cookie 基础设施）。
