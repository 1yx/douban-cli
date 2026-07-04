import { describe, it, expect } from 'vitest';
import { __test__ } from '../api/list.js';

const { resolveSubjectCategory, parseDoulistPage } = __test__;

describe('resolveSubjectCategory', () => {
  it('按 source 文本判定书/影/音', () => {
    expect(resolveSubjectCategory('豆瓣读书', 'https://book.douban.com/subject/1/')).toBe('book');
    expect(resolveSubjectCategory('豆瓣电影', 'https://movie.douban.com/subject/1/')).toBe('movie');
    expect(resolveSubjectCategory('豆瓣音乐', 'https://music.douban.com/subject/1/')).toBe('music');
  });

  it('source 仅为「豆瓣」+ www 子域 → 游戏', () => {
    expect(resolveSubjectCategory('豆瓣', 'https://www.douban.com/subject/10751337/')).toBe('game');
  });
});

// 一条 subject + 一条 note 的最小片段（贴近真实 douban HTML）
const FIXTURE = `
<div id="1" class="doulist-item" >
  <div class="bd doulist-subject">
    <div class="source">来自：豆瓣读书</div>
    <div class="post"><a href="https://book.douban.com/subject/27054640/"><img src="https://img/cover.jpg"/></a></div>
    <div class="title"><a href="https://book.douban.com/subject/27054640/">DOTA 2</a></div>
    <div class="rating"><span class="allstar40"></span><span class="rating_nums">7.2</span><span>(89人评价)</span></div>
    <div class="abstract">作者: Valve<br />出版社: Dark Horse<br />出版年: 2017</div>
  </div>
  <div class="ft"><div class="actions"><time class="time">2026-07-04 18:00:00</time></div></div>
</div>
<div id="2" class="doulist-item" >
  <div class="bd doulist-note">
    <div class="source">来自：豆瓣小组</div>
    <div class="meta"><a href="https://www.douban.com/people/u1/">某用户</a></div>
    <div class="title"><a href="https://www.douban.com/group/topic/123/">椰子水来了</a></div>
    <div class="pic"><div class="pic-wrap"><a href="..."><img src="https://img/p.jpg"/></a></div></div>
    <div class="abstract"></div>
  </div>
  <div class="ft"><div class="actions"><time class="time">2026-07-04 19:00:00</time></div></div>
</div>
`;

describe('parseDoulistPage', () => {
  const entries = parseDoulistPage(FIXTURE, 1);

  it('切出 subject 与 note 各一条', () => {
    expect(entries).toHaveLength(2);
    expect(entries[0].kind).toBe('subject');
    expect(entries[1].kind).toBe('note');
  });

  it('subject 提取分类/评分/abstract/subjectId', () => {
    const s = entries[0];
    expect(s.category).toBe('book');
    expect(s.title).toBe('DOTA 2');
    expect(s.subjectId).toBe('27054640');
    expect(s.rating).toBe(7.2);
    expect(s.votes).toBe(89);
    expect(s.abstract).toContain('Valve');
    expect(s.addedAt).toBe('2026-07-04 18:00:00');
  });

  it('note 提取标题/作者/来源/外链', () => {
    const n = entries[1];
    expect(n.title).toBe('椰子水来了');
    expect(n.author).toBe('某用户');
    expect(n.source).toBe('豆瓣小组');
    expect(n.url).toContain('/group/topic/123/');
    expect(n.subjectId).toBeUndefined();
    expect(n.rating).toBeUndefined();
  });
});
