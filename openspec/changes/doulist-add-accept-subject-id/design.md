## Context

`doulist add <doulistId> <target>` 的 `target` 仅接受完整 subject URL。用户从 `book search` / `movie` / `book info` 拿到的是纯数字 subject id，必须手动拼 URL 或再查一次链接，多一次跳转。`addDoulistItem`（`src/api`）内部最终也是把 URL 传给豆瓣表单。

## Goals / Non-Goals

**Goals:**
- `target` 为纯数字时自动识别为 subject id 并拼成 subject URL。
- 类别可推断，避免 book/movie URL 混淆。

**Non-Goals:**
- 不做书名/片名模糊匹配（那是 `search` 的职责，组合使用即可）。

## Decisions

- 在 `add` action（或 `addDoulistItem` API 层）增加 target 规范化：`/^\d+$/` 命中则视为 subject id。
- 类别推断优先级：`--type book|movie` 显式参数 → 目标豆列自身 `category` → 默认 `book`。
- 拼接规则：`https://book.douban.com/subject/<id>/` 或 `https://movie.douban.com/subject/<id>/`。
- 非纯数字 target 沿用原逻辑（URL / 小组话题 / 外链）。

## Risks / Trade-offs

- 同一数字 id 在 book/movie 下指向不同条目，依赖类别线索；默认 book 可能误拼——故提供 `--type` 与豆列 category 兜底，并在帮助中说明。
- 若豆瓣豆列表单对 book/movie 的提交参数不同，需确认 `addDoulistItem` 是否需要区分（实现时验证）。
