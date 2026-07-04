import { Command } from 'commander';
import {
  getHotLists,
  getDoulistEntries,
  getUserDoulists,
  createDoulist,
  addDoulistItem,
  removeDoulistItem,
  editDoulist,
  followDoulist,
  unfollowDoulist,
  type DoulistCategory,
  type DoulistEntry,
  type UserDoulist,
  type UserDoulistCategory
} from '../api/index.js';
import { getCachedAuthSession, ensureAuth } from '../auth.js';
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
    .description('管理豆列 / 书单 / 影单（查看、导出、创建、增删条目、关注等）');

  // doulist 子命令用自己的帮助格式（不继承 root 的分类模板）
  doulist.configureHelp({
    formatHelp: (cmd) => {
      let out = '用法: douban doulist <command> [options]\n\n子命令:\n';
      for (const c of cmd.commands) {
        out += `  ${c.name().padEnd(10)} ${c.description()}\n`;
      }
      out += '\n示例:\n';
      out += '  douban doulist hot                热门豆列\n';
      out += '  douban doulist view 163361938     导出某张单的条目\n';
      out += '  douban doulist ls --user arcana   列某用户的单\n';
      return out;
    }
  });

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

  // ── write：create / add / remove / edit / follow / unfollow ──

  doulist
    .command('create')
    .description('创建豆列 / 书单 / 影单')
    .requiredOption('--title <title>', '标题')
    .option('--category <cat>', '影单(movie) / 书单(book)，不传则为混合豆列')
    .option('--private', '私密豆列')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({ command: 'doulist create', suggestion: '可尝试：douban doulist create --title "我的影单" --category movie' }, async (opts) => {
      const auth = await withSpinner('正在检查登录状态...', () => ensureAuth(), !opts.json);
      const category = opts.category as 'movie' | 'book' | undefined;
      if (category && category !== 'movie' && category !== 'book') {
        throw new Error(`--category 仅支持 movie 或 book（${category} 无效）`);
      }
      const result = await withSpinner('正在创建豆列...', () => createDoulist({ title: opts.title, category, private: opts.private, cookies: auth.cookies }), !opts.json);
      if (opts.json) console.log(JSON.stringify(result, null, 2));
      else console.log(`\n✓ 已创建：${result.url}`);
    }));

  doulist
    .command('add <doulistId> <target>')
    .description('向豆列添加条目（subject 链接 / 小组话题 / 外链 URL）')
    .option('-m, --comment <text>', '备注')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({ command: 'doulist add', suggestion: '可尝试：douban doulist add 163361938 https://movie.douban.com/subject/1292052/' }, async (doulistId, target, opts) => {
      const auth = await withSpinner('正在检查登录状态...', () => ensureAuth(), !opts.json);
      await withSpinner('正在添加条目...', () => addDoulistItem({ doulistId, target, comment: opts.comment, cookies: auth.cookies }), !opts.json);
      if (opts.json) console.log(JSON.stringify({ ok: true }));
      else console.log(`\n✓ 已添加到豆列 ${doulistId}`);
    }));

  doulist
    .command('remove <doulistId> <target>')
    .description('从豆列移除条目（@index 或 subject/小组话题链接）')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({ command: 'doulist remove', suggestion: '可尝试：douban doulist remove 163361938 @3' }, async (doulistId, target, opts) => {
      const auth = await withSpinner('正在检查登录状态...', () => ensureAuth(), !opts.json);
      await withSpinner('正在移除条目...', () => removeDoulistItem({ doulistId, target, cookies: auth.cookies }), !opts.json);
      if (opts.json) console.log(JSON.stringify({ ok: true }));
      else console.log(`\n✓ 已从豆列 ${doulistId} 移除 ${target}`);
    }));

  doulist
    .command('edit <doulistId>')
    .description('编辑豆列标题 / 简介（仅创建者可改）')
    .option('--title <title>', '新标题')
    .option('--about <text>', '新简介')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({ command: 'doulist edit', suggestion: '可尝试：douban doulist edit 163361938 --title "新标题"' }, async (doulistId, opts) => {
      if (!opts.title && opts.about === undefined) {
        throw new Error('请至少指定 --title 或 --about 之一');
      }
      const auth = await withSpinner('正在检查登录状态...', () => ensureAuth(), !opts.json);
      await withSpinner('正在编辑豆列...', () => editDoulist({ doulistId, title: opts.title, about: opts.about, cookies: auth.cookies }), !opts.json);
      if (opts.json) console.log(JSON.stringify({ ok: true }));
      else console.log(`\n✓ 已更新豆列 ${doulistId}`);
    }));

  doulist
    .command('follow <doulistId>')
    .description('关注豆列 / 书单 / 影单')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({ command: 'doulist follow', suggestion: '可尝试：douban doulist follow 163361938' }, async (doulistId, opts) => {
      const auth = await withSpinner('正在检查登录状态...', () => ensureAuth(), !opts.json);
      await withSpinner('正在关注...', () => followDoulist(doulistId, auth.cookies), !opts.json);
      if (opts.json) console.log(JSON.stringify({ ok: true }));
      else console.log(`\n✓ 已关注豆列 ${doulistId}`);
    }));

  doulist
    .command('unfollow <doulistId>')
    .description('取消关注豆列 / 书单 / 影单')
    .option('--json', '以 JSON 输出')
    .action(withErrorHandler({ command: 'doulist unfollow', suggestion: '可尝试：douban doulist unfollow 163361938' }, async (doulistId, opts) => {
      const auth = await withSpinner('正在检查登录状态...', () => ensureAuth(), !opts.json);
      await withSpinner('正在取消关注...', () => unfollowDoulist(doulistId, auth.cookies), !opts.json);
      if (opts.json) console.log(JSON.stringify({ ok: true }));
      else console.log(`\n✓ 已取消关注豆列 ${doulistId}`);
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
