import { Command } from 'commander';
import {
  getHotLists,
  getDoulistEntries,
  getUserDoulists,
  type DoulistCategory,
  type DoulistEntry,
  type UserDoulist,
  type UserDoulistCategory
} from '../api/index.js';
import { getCachedAuthSession } from '../auth.js';
import { withErrorHandler } from '../utils/error.js';
import { parsePositiveInt } from '../utils/parsing.js';
import { withSpinner } from '../utils/spinner.js';

const CATEGORY_ICON: Record<DoulistCategory, string> = {
  movie: '影',
  book: '书',
  music: '音',
  game: '游'
};

const CARD_CATEGORY_ICON: Record<UserDoulistCategory, string> = {
  movie: '影',
  book: '书',
  common: '混'
};

/** 取本地登录态 cookie（无则 undefined，公开内容照常可读） */
function authCookies(): string | undefined {
  return getCachedAuthSession()?.cookies;
}

function printHot(items: ReturnType<typeof getHotLists> extends Promise<infer T> ? T : never): void {
  console.log('\n🗂️  热门片单\n');
  items.forEach((item, i) => {
    console.log(`${(i + 1).toString().padStart(2)}. ${item.title}`);
    console.log(`    作者: ${item.author} | 关注: ${item.followers}`);
    console.log(`    最近更新: ${item.recent}`);
  });
}

function printEntries(detail: { id: string; title: string; total: number; entries: DoulistEntry[] }): void {
  console.log(`\n📋 ${detail.title}  （共 ${detail.total} 条）\n`);
  for (const e of detail.entries) {
    if (e.kind === 'subject') {
      const icon = CATEGORY_ICON[e.category ?? 'game'];
      const rating = e.rating ? `   ★${e.rating}${e.votes ? ` (${e.votes})` : ''}` : '';
      console.log(`${e.index.toString().padStart(2)}. [${icon}] ${e.title}${rating}`);
      if (e.abstract) console.log(`    ${e.abstract}`);
      console.log(`    ${e.url}`);
    } else {
      console.log(`${e.index.toString().padStart(2)}. [杂] ${e.title}`);
      if (e.author) console.log(`    添加者: ${e.author}`);
      if (e.abstract) console.log(`    ${e.abstract}`);
      console.log(`    来源: ${e.source || '未知'}   |   ${e.url}`);
    }
  }
}

function printUserDoulists(result: {
  user: string;
  category?: string;
  followed: boolean;
  total: number;
  lists: UserDoulist[];
}): void {
  const catLabel = result.category === 'movie' ? '影单' : result.category === 'book' ? '书单' : '豆列';
  const prefix = result.followed ? `${result.user} 关注的` : `${result.user} 的`;
  console.log(`\n📚 ${prefix}${catLabel}（共 ${result.total} 张）\n`);
  result.lists.forEach((item, i) => {
    const icon = CARD_CATEGORY_ICON[item.category];
    console.log(`${(i + 1).toString().padStart(2)}. [${icon}] ${item.title}${item.followers ? `   关注 ${item.followers}` : ''}`);
    const meta = [
      item.creator,
      item.updatedAt ? `${item.updatedAt} 更新` : '',
      item.progress
    ].filter(Boolean).join(' · ');
    if (meta) console.log(`    ${meta}`);
    console.log(`    ${item.url}`);
  });
}

export function registerListCommands(program: Command): void {
  // ── 资源组：doulist（noun-first）──
  const doulist = program
    .command('doulist')
    .description('管理豆列 / 书单 / 影单（查看、导出、关注等）');

  // doulist hot —— 热门推荐
  doulist
    .command('hot')
    .description('获取热门豆列推荐')
    .option('-n, --limit <n>', '返回数量', '20')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({
      command: 'doulist hot',
      suggestion: '可尝试：douban doulist hot -n 10'
    }, async (opts) => {
      const limit = parsePositiveInt(opts.limit, '--limit', 20);
      const items = await withSpinner('正在获取热门豆列...', () => getHotLists(limit), !opts.json);
      if (opts.json) console.log(JSON.stringify(items, null, 2));
      else printHot(items);
    }));

  // doulist view <id> —— 导出某张单的全部条目
  doulist
    .command('view <id>')
    .description('导出某张豆列/书单/影单的全部条目（id 或 /doulist/{id}/ URL）')
    .option('-n, --limit <n>', '最多导出条数')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({
      command: 'doulist view',
      suggestion: '可尝试：douban doulist view 163361938'
    }, async (id, opts) => {
      const limit = opts.limit ? parsePositiveInt(opts.limit, '--limit', 0) : undefined;
      const detail = await withSpinner(
        '正在获取豆列条目...',
        () => getDoulistEntries(id, { limit, cookies: authCookies() }),
        !opts.json
      );
      if (opts.json) console.log(JSON.stringify(detail, null, 2));
      else printEntries(detail);
    }));

  // doulist ls --user <id> —— 列出某用户的单
  doulist
    .command('ls')
    .description('列出某用户的豆列/书单/影单（需 --user 指定用户）')
    .requiredOption('--user <id>', '豆瓣用户 id 或 uid')
    .option('--category <cat>', '类目过滤：movie(影单) / book(书单)')
    .option('--followed', '仅看我关注的（默认全部）')
    .option('-n, --limit <n>', '最多返回张数')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({
      command: 'doulist ls',
      suggestion: '可尝试：douban doulist ls --user arcana --category movie'
    }, async (opts) => {
      const limit = opts.limit ? parsePositiveInt(opts.limit, '--limit', 0) : undefined;
      const category = opts.category as 'movie' | 'book' | undefined;
      if (category && category !== 'movie' && category !== 'book') {
        throw new Error(`--category 仅支持 movie 或 book（${category} 无效）`);
      }
      const result = await withSpinner(
        `正在获取 ${opts.user} 的豆列...`,
        () => getUserDoulists(opts.user, { category, followed: opts.followed, limit, cookies: authCookies() }),
        !opts.json
      );
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else printUserDoulists(result);
    }));

  // ── 兼容别名：list = doulist hot（保留旧入口）──
  program
    .command('list', { hidden: false })
    .description('获取热门豆列推荐（douban doulist hot 的别名）')
    .option('-n, --limit <n>', '返回数量', '20')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({
      command: 'list',
      suggestion: '可尝试：douban list -n 10'
    }, async (opts) => {
      const limit = parsePositiveInt(opts.limit, '--limit', 20);
      const items = await withSpinner('正在获取热门豆列...', () => getHotLists(limit), !opts.json);
      if (opts.json) console.log(JSON.stringify(items, null, 2));
      else printHot(items);
    }));
}
