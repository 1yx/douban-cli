## 1. 类别推断基础

- [ ] 1.1 确认如何获知目标豆列的 `category`（`view`/`ls` 返回是否带 category；或本地 `create` 时记录）
- [ ] 1.2 定义类别优先级：`--type` > 豆列 category > 默认 `book`

## 2. target 规范化

- [ ] 2.1 在 `add` action 或 `addDoulistItem`（`src/api`）加 `/^\d+$/` 判定，拼成对应类别 subject URL
- [ ] 2.2 新增 `--type book|movie` 选项并校验取值
- [ ] 2.3 非 id target（URL / 小组话题 / 外链）逻辑不变

## 3. 验证

- [ ] 3.1 `doulist add <id> 22229485 --type book` 等价于加 `https://book.douban.com/subject/22229485/`
- [ ] 3.2 豆列 category=movie 时纯数字自动拼 movie URL
- [ ] 3.3 混合豆列默认 book 并在输出提示可用 `--type`
- [ ] 3.4 URL / 外链 target 行为不变
- [ ] 3.5 更新 README 与 `doulist add --help` 的 target 说明
