import { cleanText, extractNumericId, fetchHtml, isChallengePage, FETCH_TIMEOUT_MS } from './common.js';
import { debug } from '../utils/debug.js';
import { postForm, resolveCk } from './authenticated.js';

const DOULIST_BASE = 'https://www.douban.com';

// ============================================================
// 热门豆列推荐
// ============================================================

export interface DoulistItem {
  id: string;
  title: string;
  author: string;
  followers: string;
  recent: string;
  url: string;
}

/**
 * Get hot doulist recommendations from https://www.douban.com/doulist/
 */
export async function getHotLists(limit = 20): Promise<DoulistItem[]> {
  if (!Number.isFinite(limit) || limit <= 0) return [];

  const html = await fetchHtml(`${DOULIST_BASE}/doulist/`, {
    Referer: DOULIST_BASE
  });

  if (isChallengePage(html)) {
    throw new Error('豆列页面触发了反爬挑战，暂时无法解析');
  }

  const results: DoulistItem[] = [];
  const itemRegex = /<li class="doulist-item"[\s\S]*?<\/li>/g;

  let match;
  while ((match = itemRegex.exec(html)) !== null && results.length < limit) {
    const block = match[0];

    const linkMatch = block.match(/<div class="title"><a href="(https:\/\/www\.douban\.com\/doulist\/(\d+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a><\/div>/);
    if (!linkMatch) continue;

    const metaMatch = block.match(/<p class="meta">([\s\S]*?)<\/p>/);
    const recentMatch = block.match(/<div class="bd doulist-note">[\s\S]*?<div class="title">\s*<a[^>]*>([\s\S]*?)<\/a>/);

    const metaText = metaMatch ? cleanText(metaMatch[1]) : '';
    const authorMatch = metaText.match(/^(.*?)创建/);
    const followersMatch = metaText.match(/(\d+)\s*关注/);

    results.push({
      id: linkMatch[2] || extractNumericId(linkMatch[1], 'doulist'),
      title: cleanText(linkMatch[3]),
      author: authorMatch ? cleanText(authorMatch[1]) : '-',
      followers: followersMatch ? followersMatch[1] : '-',
      recent: recentMatch ? cleanText(recentMatch[1]) : '-',
      url: linkMatch[1]
    });
  }

  return results;
}

// ============================================================
// 单张豆列/书单/影单 —— 条目导出
// ============================================================

export type DoulistCategory = 'book' | 'movie' | 'music' | 'game';
export type DoulistEntryKind = 'subject' | 'note';

export interface DoulistEntry {
  index: number;
  kind: DoulistEntryKind;
  /** subject 条目的目录分类（书/影/音/游）；note 条目无 */
  category?: DoulistCategory;
  /** 来源原文，如「豆瓣读书」「豆瓣小组」 */
  source: string;
  title: string;
  /** 条目链接（note 可为豆瓣外链） */
  url: string;
  /** subject 的豆瓣 id（note 无） */
  subjectId?: string;
  rating?: number;
  votes?: number;
  /** subject 元数据原文（作者/出版社/导演…） */
  abstract?: string;
  /** note 的添加者 */
  author?: string;
  cover?: string;
  addedAt?: string;
}

export interface DoulistDetail {
  id: string;
  title: string;
  total: number;
  entries: DoulistEntry[];
}

export interface GetDoulistOptions {
  limit?: number;
  cookies?: string;
}

/** 接受豆列 id 或完整 URL，归一化为纯 id */
function resolveDoulistId(idOrUrl: string): string {
  const m = idOrUrl.match(/doulist\/(\d+)/);
  if (m) return m[1];
  if (/^\d+$/.test(idOrUrl)) return idOrUrl;
  throw new Error(`无法识别豆列 ID：${idOrUrl}（应为纯数字 id 或 /doulist/{id}/ 形式的 URL）`);
}

function resolveSubjectCategory(source: string, url: string): DoulistCategory {
  if (/电影/.test(source) || /movie\.douban\.com/.test(url)) return 'movie';
  if (/读书/.test(source) || /book\.douban\.com/.test(url)) return 'book';
  if (/音乐/.test(source) || /music\.douban\.com/.test(url)) return 'music';
  // source 仅为「豆瓣」、url 在 www.douban.com/subject/ → 游戏
  return 'game';
}
export const __test__ = { resolveSubjectCategory, parseDoulistPage };

function decodeHref(href: string): string {
  return href.replace(/&amp;/g, '&').trim();
}

/** 解析下一页 start 参数；无下一页返回 null */
function parseNextStart(html: string): number | null {
  const m = html.match(/rel="next"\s+href="([^"]+)"/);
  if (!m?.[1]) return null;
  const href = decodeHref(m[1]);
  try {
    const start = Number(new URL(href, DOULIST_BASE).searchParams.get('start'));
    return Number.isInteger(start) && start > 0 ? start : null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debug('list', `解析下一页 start 失败: ${message}`);
    return null;
  }
}

/** 把单个 doulist-item 块解析成一条 entry */
function parseDoulistEntry(block: string, index: number): DoulistEntry | null {
  const kind: DoulistEntryKind = /bd doulist-subject/.test(block) ? 'subject' : 'note';
  const source = cleanText(block.match(/来自：([^<]*)/)?.[1] || '');

  const titleM = block.match(/class="title">[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/);
  const title = cleanText(titleM?.[2] || '');
  const url = titleM ? decodeHref(titleM[1]) : '';
  if (!title && !url) return null;

  const addedAt = cleanText(block.match(/class="time">([^<]*)/)?.[1] || '') || undefined;
  const coverM = block.match(/class="post">[\s\S]*?<img[^>]*src="([^"]*)"/)
    || block.match(/class="pic">[\s\S]*?<img[^>]*src="([^"]*)"/);

  if (kind === 'subject') {
    const ratingNums = block.match(/rating_nums">([^<]*)/);
    const votesM = block.match(/\((\d+)\s*人评价\)/);
    const abstract = cleanText(block.match(/class="abstract">([\s\S]*?)<\/div>/)?.[1] || '');
    return {
      index,
      kind,
      category: resolveSubjectCategory(source, url),
      source,
      title,
      url,
      subjectId: url.match(/subject\/(\d+)/)?.[1],
      rating: ratingNums && ratingNums[1] ? Number(ratingNums[1]) : undefined,
      votes: votesM ? Number(votesM[1]) : undefined,
      abstract: abstract || undefined,
      cover: coverM?.[1],
      addedAt
    };
  }

  // note
  const authorM = block.match(/class="meta">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/);
  const abstract = cleanText(block.match(/class="abstract">([\s\S]*?)<\/div>/)?.[1] || '');
  return {
    index,
    kind,
    source,
    title,
    url,
    author: authorM ? cleanText(authorM[1]) : undefined,
    abstract: abstract || undefined,
    cover: coverM?.[1],
    addedAt
  };
}

function parseDoulistPage(html: string, startIndex: number): DoulistEntry[] {
  // 真正的条目节点是 <div id="..." class="doulist-item" >；按该 token 切分
  const parts = html.split('class="doulist-item"').slice(1);
  const entries: DoulistEntry[] = [];
  let idx = startIndex;
  for (const block of parts) {
    const entry = parseDoulistEntry(block, idx);
    if (entry) {
      entries.push(entry);
      idx++;
    }
  }
  return entries;
}

/**
 * 导出某张豆列/书单/影单的全部条目（自动翻页）。
 * 公开豆列无需登录；私密或含笔记的豆列需登录态（传 cookies）。
 */
export async function getDoulistEntries(
  idOrUrl: string,
  options: GetDoulistOptions = {}
): Promise<DoulistDetail> {
  const id = resolveDoulistId(idOrUrl);
  const limit = options.limit && options.limit > 0 ? options.limit : Infinity;
  const cookies = options.cookies;

  const entries: DoulistEntry[] = [];
  const seen = new Set<string>();
  let start = 0;
  let title = '';

  while (entries.length < limit) {
    const url = `${DOULIST_BASE}/doulist/${id}/${start ? `?start=${start}&sort=time` : ''}`;
    const html = await fetchHtml(url, {
      Referer: `${DOULIST_BASE}/`,
      ...(cookies ? { Cookie: cookies } : {})
    });

    if (/没有访问权限/.test(html)) {
      throw new Error(
        cookies
          ? `豆列 ${id} 无访问权限（可能未关注该私密豆列，或登录态已失效）`
          : `豆列 ${id} 为私密豆列，需登录态：请先 \`douban login\` 后重试`
      );
    }
    if (isChallengePage(html)) {
      throw new Error('豆列页面触发了反爬挑战，暂时无法解析');
    }

    if (!title) {
      title = cleanText(html.match(/<title>([^<]*)<\/title>/)?.[1] || `豆列 ${id}`);
    }

    const page = parseDoulistPage(html, entries.length + 1);
    if (page.length === 0) break;

    for (const entry of page) {
      const key = entry.subjectId || entry.url || `${entry.title}:${entry.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entry.index = entries.length + 1;
      entries.push(entry);
      if (entries.length >= limit) break;
    }

    const next = parseNextStart(html);
    if (next === null || next <= start) break;
    start = next;
  }

  return { id, title, total: entries.length, entries };
}

// ============================================================
// 某用户的豆列/书单/影单 —— 卡片列表
// ============================================================

export type UserDoulistCategory = 'movie' | 'book' | 'common';
export type SubjectDoulistCategory = 'movie' | 'book';

export interface UserDoulist {
  id: string;
  title: string;
  /** movie=影单 / book=书单 / common=混合豆列 */
  category: UserDoulistCategory;
  url: string;
  followers?: number;
  creator?: string;
  updatedAt?: string;
  /** 进度文本，如「看过 0/150 部」 */
  progress?: string;
  intro?: string;
}

export interface UserDoulistResult {
  user: string;
  category?: SubjectDoulistCategory;
  followed: boolean;
  total: number;
  lists: UserDoulist[];
}

export interface GetUserDoulistsOptions {
  category?: SubjectDoulistCategory;
  followed?: boolean;
  limit?: number;
  cookies?: string;
}

function resolveCardCategory(iconClass: string): UserDoulistCategory {
  if (/doulist-movie/.test(iconClass)) return 'movie';
  if (/doulist-book/.test(iconClass)) return 'book';
  return 'common';
}

function parseUserDoulistCard(block: string): UserDoulist | null {
  const h3 = block.match(/<h3>[\s\S]*?<a[^>]*href="([^"]*\/doulist\/(\d+)\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
  if (!h3?.[2]) return null;

  const iconM = block.match(/doulist-category-icon\s+(doulist-[a-z]+)/);
  const followersM = block.match(/collect-num">([^<]*)/);
  const followersNum = followersM?.[1]?.match(/(\d+)/)?.[1];
  const creatorM = block.match(/class="meta"[\s\S]*?<a[^>]*href="[^"]*\/people\/([^/"']+)\/"[^>]*>([\s\S]*?)<\/a>/);
  const updatedM = block.match(/(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s*&?nbsp;?\s*更新/);
  const progressM = block.match(/(看过\s*\d+\/\d+\s*部)/);
  const introM = block.match(/class="intro">([\s\S]*?)<\/p>/);

  return {
    id: h3[2],
    title: cleanText(h3[3]),
    category: resolveCardCategory(iconM?.[1] || ''),
    url: decodeHref(h3[1]),
    followers: followersNum ? Number(followersNum) : undefined,
    creator: creatorM ? cleanText(creatorM[2]) : undefined,
    updatedAt: updatedM?.[1],
    progress: progressM?.[1] || undefined,
    intro: introM ? cleanText(introM[1]) : undefined
  };
}

function parseUserDoulistPage(html: string): UserDoulist[] {
  const lists: UserDoulist[] = [];
  const parts = html.split(/<li>/).slice(1);
  for (const raw of parts) {
    const block = raw.split(/<\/li>/)[0];
    const card = parseUserDoulistCard(block);
    if (card) lists.push(card);
  }
  return lists;
}

function buildUserDoulistUrl(
  user: string,
  category: SubjectDoulistCategory | undefined,
  followed: boolean | undefined
): string {
  const u = encodeURIComponent(user);
  if (category) {
    const path = `${DOULIST_BASE}/people/${u}/subject_doulists/${category}`;
    return followed ? `${path}?owned=followed` : path;
  }
  return `${DOULIST_BASE}/people/${u}/doulists/${followed ? 'collect' : 'all'}`;
}

/**
 * 列出某用户的豆列/书单/影单（自动翻页）。
 * 公开主页无需登录；访问他人或被限制内容时传 cookies。
 */
export async function getUserDoulists(
  user: string,
  options: GetUserDoulistsOptions = {}
): Promise<UserDoulistResult> {
  const id = user.trim();
  if (!id) throw new Error('用户 ID 不能为空');

  const limit = options.limit && options.limit > 0 ? options.limit : Infinity;
  const cookies = options.cookies;
  const category = options.category;
  const followed = options.followed === true;

  const lists: UserDoulist[] = [];
  const seen = new Set<string>();
  let start = 0;

  while (lists.length < limit) {
    const base = buildUserDoulistUrl(id, category, followed);
    const url = start ? `${base}${base.includes('?') ? '&' : '?'}start=${start}` : base;
    const html = await fetchHtml(url, {
      Referer: `${DOULIST_BASE}/people/${id}/`,
      ...(cookies ? { Cookie: cookies } : {})
    });

    if (/没有访问权限/.test(html)) {
      throw new Error(
        cookies
          ? `无权访问用户 ${id} 的豆列（登录态可能已失效）`
          : `用户 ${id} 的豆列需登录态访问：请先 \`douban login\` 后重试`
      );
    }
    if (isChallengePage(html)) {
      throw new Error('豆列页面触发了反爬挑战，暂时无法解析');
    }

    const page = parseUserDoulistPage(html);
    if (page.length === 0) break;

    for (const card of page) {
      if (seen.has(card.id)) continue;
      seen.add(card.id);
      lists.push(card);
      if (lists.length >= limit) break;
    }

    const next = parseNextStart(html);
    if (next === null || next <= start) break;
    start = next;
  }

  return {
    user: id,
    category,
    followed,
    total: lists.length,
    lists
  };
}

// ============================================================
// 写操作（create / add / remove / edit / follow / unfollow）
// 所有写操作均需登录态 cookie + ck token。
// ============================================================

/** 目录分类 → 豆瓣 kind 码 */
const KIND_BY_CATEGORY: Record<DoulistCategory, string> = {
  book: '1001',
  movie: '1002',
  music: '1003',
  game: '3114'
};
const NOTE_KIND = '1013'; // 小组话题 / 自由链接型条目

function requireCookies(cookies: string | undefined): string {
  if (!cookies) {
    throw new Error('该操作需要登录态：请先 `douban login`');
  }
  return cookies;
}

// ── create ────────────────────────────────────────────────
export interface CreateDoulistOptions {
  title: string;
  /** 设为影单/书单（不传则创建混合豆列） */
  category?: SubjectDoulistCategory;
  private?: boolean;
  cookies: string;
}

export interface CreateDoulistResult {
  id: string;
  url: string;
}

export async function createDoulist(options: CreateDoulistOptions): Promise<CreateDoulistResult> {
  const cookies = requireCookies(options.cookies);
  const title = options.title.trim();
  if (!title) throw new Error('豆列标题不能为空');

  const ck = await resolveCk(cookies);
  const data: Record<string, string> = {
    title,
    is_private: options.private ? '1' : '0',
    ck
  };
  if (options.category) data.category = options.category;

  const res = await postForm(
    `${DOULIST_BASE}/j/doulist/add`,
    data,
    cookies,
    `${DOULIST_BASE}/`
  );
  const id = String(res.id ?? '').trim();
  if (!id) throw new Error('创建豆列失败：服务端未返回 id');
  return { id, url: `${DOULIST_BASE}/doulist/${id}/` };
}

// ── add（条目）────────────────────────────────────────────
export interface AddDoulistItemOptions {
  doulistId: string;
  /** subject 链接 / 小组话题链接 / 外链 URL */
  target: string;
  comment?: string;
  cookies: string;
}

interface ResolvedTarget {
  sid?: string;
  skind?: string;
  surl?: string;
}

/** 从目标解析出 sid+skind（目录条目）或 surl（note） */
function resolveAddTarget(target: string): ResolvedTarget {
  const subj = target.match(/(book|movie|music)\.douban\.com\/subject\/(\d+)/);
  if (subj) return { sid: subj[2], skind: KIND_BY_CATEGORY[subj[1] as DoulistCategory] };

  const game = target.match(/www\.douban\.com\/subject\/(\d+)/);
  if (game) return { sid: game[1], skind: KIND_BY_CATEGORY.game };

  // 小组话题 / 任意外链 → note（surl）
  if (/^https?:\/\//i.test(target) || /douban\.com\/group\/topic\/\d+/.test(target)) {
    return { surl: target };
  }

  throw new Error(
    `无法识别条目「${target}」：请提供豆瓣 subject 链接（book/movie/music.douban.com/subject/...）、游戏链接、或小组话题/外链 URL`
  );
}

export async function addDoulistItem(options: AddDoulistItemOptions): Promise<void> {
  const cookies = requireCookies(options.cookies);
  const doulistId = resolveDoulistId(options.doulistId);
  const ck = await resolveCk(cookies);
  const { sid, skind, surl } = resolveAddTarget(options.target.trim());

  const data: Record<string, string> = {
    comment: options.comment?.trim() || '',
    ck
  };
  if (surl) {
    data.surl = surl;
  } else {
    data.sid = sid!;
    data.skind = skind!;
  }

  await postForm(
    `${DOULIST_BASE}/j/doulist/${doulistId}/additem`,
    data,
    cookies,
    `${DOULIST_BASE}/doulist/${doulistId}/`
  );
}

// ── remove（条目）─────────────────────────────────────────
export interface RemoveDoulistItemOptions {
  doulistId: string;
  /** 条目 subject 链接、小组话题链接，或 @index（来自 douban doulist view） */
  target: string;
  cookies: string;
}

/** 解析移除目标为 tid + tkind；@index 时回查豆列条目 */
async function resolveRemoveTarget(
  doulistId: string,
  target: string,
  cookies: string
): Promise<{ tid: string; tkind: string }> {
  const trimmed = target.trim();

  if (trimmed.startsWith('@')) {
    const idx = Number(trimmed.slice(1));
    if (!Number.isInteger(idx) || idx < 1) {
      throw new Error(`无效的序号：${trimmed}（应为 @1、@2 …，对应 douban doulist view 输出的序号）`);
    }
    const detail = await getDoulistEntries(doulistId, { cookies });
    const entry = detail.entries.find((e) => e.index === idx);
    if (!entry) throw new Error(`序号 @${idx} 超出范围（该豆列共 ${detail.total} 条）`);

    if (entry.kind === 'subject' && entry.category) {
      const tid = entry.subjectId || extractIdFromUrl(entry.url);
      if (!tid) throw new Error(`无法从该条目解析 subject id：${entry.url}`);
      return { tid, tkind: KIND_BY_CATEGORY[entry.category] };
    }
    // note：tid 取 url 中的数字 id，tkind 为小组类
    const noteId = extractIdFromUrl(entry.url);
    if (!noteId) throw new Error(`无法从该 note 条目解析 id：${entry.url}（请改用完整链接）`);
    return { tid: noteId, tkind: NOTE_KIND };
  }

  // 链接形式
  const subj = trimmed.match(/(book|movie|music)\.douban\.com\/subject\/(\d+)/);
  if (subj) return { tid: subj[2], tkind: KIND_BY_CATEGORY[subj[1] as DoulistCategory] };
  const game = trimmed.match(/www\.douban\.com\/subject\/(\d+)/);
  if (game) return { tid: game[1], tkind: KIND_BY_CATEGORY.game };
  const group = trimmed.match(/group\/topic\/(\d+)/);
  if (group) return { tid: group[1], tkind: NOTE_KIND };

  throw new Error(
    `无法识别条目「${trimmed}」：请用 @index（如 @3）或豆瓣 subject/小组话题链接`
  );
}

function extractIdFromUrl(url: string): string | undefined {
  return url.match(/\/(\d{4,})\/?/)?.[1];
}

export async function removeDoulistItem(options: RemoveDoulistItemOptions): Promise<void> {
  const cookies = requireCookies(options.cookies);
  const doulistId = resolveDoulistId(options.doulistId);
  const ck = await resolveCk(cookies);
  const { tid, tkind } = await resolveRemoveTarget(doulistId, options.target, cookies);

  await postForm(
    `${DOULIST_BASE}/j/doulist/${doulistId}/removeitem`,
    { tid, tkind, ck },
    cookies,
    `${DOULIST_BASE}/doulist/${doulistId}/`
  );
}

// ── edit（元数据：title / about）──────────────────────────
export interface EditDoulistOptions {
  doulistId: string;
  title?: string;
  about?: string;
  cookies: string;
}

/**
 * 编辑豆列标题/简介。edit 表单会全量提交字段，故先抓取当前值再合并覆盖，
 * 避免只改标题却清空简介/标签。
 */
export async function editDoulist(options: EditDoulistOptions): Promise<void> {
  const cookies = requireCookies(options.cookies);
  const doulistId = resolveDoulistId(options.doulistId);
  const editUrl = `${DOULIST_BASE}/doulist/${doulistId}/edit`;

  const html = await fetchHtml(editUrl, { Referer: `${DOULIST_BASE}/doulist/${doulistId}/`, Cookie: cookies });
  if (/没有访问权限|不存在/.test(html)) {
    throw new Error(`无权编辑豆列 ${doulistId}（仅创建者可改，或登录态已失效）`);
  }

  const curTitle = html.match(/name="dl_title"[^>]*value="([^"]*)"/)?.[1] || '';
  const curAbout = html.match(/<textarea[^>]*name="dl_about"[^>]*>([\s\S]*?)<\/textarea>/)?.[1] || '';
  const tagMatches = [...html.matchAll(/<input[^>]*name="dl_tags"[^>]*checked[^>]*value="([^"]*)"/g)];
  const tags = tagMatches.map((m) => decodeHtmlEntities(m[1]));

  const ck = await resolveCk(cookies);
  const form = new FormData();
  form.append('ck', ck);
  form.append('dl_title', options.title?.trim() || decodeHtmlEntities(curTitle));
  form.append('dl_about', options.about !== undefined ? options.about : decodeHtmlEntities(curAbout));
  for (const tag of tags) form.append('dl_tags', tag);

  const res = await fetch(editUrl, {
    method: 'POST',
    headers: { Cookie: cookies, Referer: editUrl },
    body: form,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });

  if (!res.ok) {
    throw new Error(`编辑豆列失败：HTTP ${res.status}`);
  }
}

function decodeHtmlEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
}

// ── follow / unfollow ─────────────────────────────────────
export async function followDoulist(idOrUrl: string, cookies: string): Promise<void> {
  requireCookies(cookies);
  const doulistId = resolveDoulistId(idOrUrl);
  const ck = await resolveCk(cookies);
  // 关注为 GET /doulist/{id}/?collect=yes&ck=
  const html = await fetchHtml(`${DOULIST_BASE}/doulist/${doulistId}/?collect=yes&ck=${encodeURIComponent(ck)}`, {
    Referer: `${DOULIST_BASE}/doulist/${doulistId}/`,
    Cookie: cookies
  });
  if (/没有访问权限/.test(html)) {
    throw new Error(`关注豆列 ${doulistId} 失败：无访问权限或登录态已失效`);
  }
}

export async function unfollowDoulist(idOrUrl: string, cookies: string): Promise<void> {
  const cookies_ = requireCookies(cookies);
  const doulistId = resolveDoulistId(idOrUrl);
  const ck = await resolveCk(cookies_);
  await postForm(
    `${DOULIST_BASE}/j/doulist/decollect`,
    { dl_id: doulistId, ck },
    cookies_,
    `${DOULIST_BASE}/`
  );
}
