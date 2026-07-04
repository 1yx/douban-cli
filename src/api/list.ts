import { cleanText, extractNumericId, fetchHtml, isChallengePage } from './common.js';
import { debug } from '../utils/debug.js';

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
