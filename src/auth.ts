import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stderr as output } from 'node:process';
import { withSpinner } from './utils/spinner.js';
import { getCurrentUserProfile } from './api/authenticated.js';

export interface AuthSession {
  dbcl2: string;
  ck?: string;
  cookies: string;
  source: string;
  updatedAt: string;
}

interface EncryptedAuthCache {
  version: 1;
  source: string;
  updatedAt: string;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

const AUTH_CACHE_PATH = path.join(os.homedir(), '.douban-cli-auth.json');
const DOUBAN_LOGIN_URL = 'https://accounts.douban.com/passport/login';

type PuppeteerCookie = { name?: string; value?: string };

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function parseEncryptedAuthCache(raw: unknown): EncryptedAuthCache | null {
  const obj = asObject(raw);
  if (!obj) return null;

  if (obj.version !== 1) return null;

  const source = typeof obj.source === 'string' ? obj.source : '';
  const updatedAt = typeof obj.updatedAt === 'string' ? obj.updatedAt : '';
  const salt = typeof obj.salt === 'string' ? obj.salt : '';
  const iv = typeof obj.iv === 'string' ? obj.iv : '';
  const tag = typeof obj.tag === 'string' ? obj.tag : '';
  const data = typeof obj.data === 'string' ? obj.data : '';

  if (!source || !updatedAt || !salt || !iv || !tag || !data) return null;

  return {
    version: 1,
    source,
    updatedAt,
    salt,
    iv,
    tag,
    data
  };
}

function parseAuthSession(raw: unknown): AuthSession | null {
  const obj = asObject(raw);
  if (!obj) return null;

  const dbcl2 = typeof obj.dbcl2 === 'string' ? obj.dbcl2.trim() : '';
  if (!dbcl2) return null;

  const ck = typeof obj.ck === 'string' && obj.ck.trim() ? obj.ck.trim() : undefined;
  const source = typeof obj.source === 'string' && obj.source.trim() ? obj.source.trim() : 'Browser';
  const updatedAt = typeof obj.updatedAt === 'string' && obj.updatedAt.trim() ? obj.updatedAt.trim() : new Date().toISOString();
  const cookies = buildCookieHeader(dbcl2, ck);

  return {
    dbcl2,
    ck,
    cookies,
    source,
    updatedAt
  };
}

function machineSecret(): Buffer {
  const payload = `${os.userInfo().username}|${os.hostname()}|${os.homedir()}|douban-cli`;
  return createHash('sha256').update(payload).digest();
}

function encryptCache(auth: AuthSession): EncryptedAuthCache {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(machineSecret(), salt, 120000, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(auth), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    version: 1,
    source: auth.source,
    updatedAt: auth.updatedAt,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64')
  };
}

function decryptCache(payload: EncryptedAuthCache): AuthSession | null {
  try {
    const salt = Buffer.from(payload.salt, 'base64');
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const data = Buffer.from(payload.data, 'base64');
    const key = pbkdf2Sync(machineSecret(), salt, 120000, 32, 'sha256');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    const decoded = JSON.parse(plaintext.toString('utf8')) as unknown;
    return parseAuthSession(decoded);
  } catch (error) {
    reportRecoverableError('解密登录缓存失败', error);
    return null;
  }
}

function readAuthCache(): AuthSession | null {
  if (!existsSync(AUTH_CACHE_PATH)) return null;

  try {
    const stat = statSync(AUTH_CACHE_PATH);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs > 30 * 24 * 60 * 60 * 1000) return null;

    const raw = JSON.parse(readFileSync(AUTH_CACHE_PATH, 'utf8')) as unknown;
    const parsed = parseEncryptedAuthCache(raw);
    if (!parsed) return null;
    return decryptCache(parsed);
  } catch (error) {
    reportRecoverableError('读取登录缓存失败', error);
    return null;
  }
}

function saveAuthCache(auth: AuthSession): void {
  const encrypted = encryptCache(auth);
  writeFileSync(AUTH_CACHE_PATH, `${JSON.stringify(encrypted, null, 2)}\n`, { mode: 0o600 });
}

export function clearAuthCache(): void {
  if (!existsSync(AUTH_CACHE_PATH)) return;
  unlinkSync(AUTH_CACHE_PATH);
}

export function getCachedAuthSession(clear = false): AuthSession | null {
  const cached = readAuthCache();
  if (clear) clearAuthCache();
  return cached;
}

function buildCookieHeader(dbcl2: string, ck?: string): string {
  const parts = [`dbcl2=${dbcl2}`];
  if (ck) parts.push(`ck=${ck}`);
  return parts.join('; ');
}

function createSession(dbcl2: string, ck: string | undefined, source: string): AuthSession {
  return {
    dbcl2,
    ck,
    cookies: buildCookieHeader(dbcl2, ck),
    source,
    updatedAt: new Date().toISOString()
  };
}

function extractCookieValue(header: string, name: string): string | undefined {
  const pattern = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`);
  const match = header.match(pattern);
  if (!match?.[1]) return undefined;
  return match[1].replace(/^"|"$/g, '').trim() || undefined;
}

/** 从完整的 Cookie 字符串中解析出 dbcl2（必需）与 ck（可选）。 */
export function parseCookieHeader(header: string): { dbcl2: string; ck?: string } | null {
  // 容忍整行请求头：剥掉可选的 `Cookie:` / `cookie:` 前缀，避免用户从 F12 复制整行时被拒
  const cleaned = header.replace(/^\s*cookie\s*:\s*/i, '');
  const dbcl2 = extractCookieValue(cleaned, 'dbcl2');
  if (!dbcl2) return null;
  const ck = extractCookieValue(cleaned, 'ck');
  return { dbcl2, ck };
}

/**
 * 解析 Netscape cookies.txt 内容，提取 dbcl2（必需）与 ck（可选）。
 * 兼容 #HttpOnly_<domain> 前缀的行（HttpOnly cookie 在该格式中以 # 开头但并非注释）。
 */
export function parseNetscapeCookies(content: string): { dbcl2: string; ck?: string } | null {
  let dbcl2: string | undefined;
  let ck: string | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // #HttpOnly_<domain> 是合法的 cookie 行前缀，不是注释
    const stripped = line.replace(/^#HttpOnly_/i, '');
    if (stripped.startsWith('#')) continue;

    const fields = stripped.split('\t');
    if (fields.length < 7) continue;

    const name = fields[5];
    const value = fields[6];
    if (!name) continue;

    const cleanValue = typeof value === 'string' ? value.replace(/^"|"$/g, '').trim() : '';

    if (name === 'dbcl2' && !dbcl2 && cleanValue) {
      dbcl2 = cleanValue;
    } else if (name === 'ck' && !ck && cleanValue) {
      ck = cleanValue;
    }
  }

  if (!dbcl2) return null;
  return { dbcl2, ck };
}

/**
 * 手动导入 Cookie 登录（跳过浏览器登录流程），适用于 sweet-cookie/puppeteer
 * 抓不到登录态的兜底场景。支持两种入参：
 *   1. Netscape cookies.txt 文件路径（如 douban login --cookie cookies.txt）
 *   2. 原始 Cookie 字符串（如 douban login --cookie "dbcl2=...; ck=..."）
 */
export async function loginWithCookie(cookieInput: string): Promise<AuthSession> {
  const trimmed = cookieInput.trim();
  const looksLikeFile = /\.(txt|cookies)$/i.test(trimmed) || existsSync(trimmed);

  let session: AuthSession;
  if (looksLikeFile) {
    if (!existsSync(trimmed)) {
      throw new Error(`Cookie 文件不存在：${trimmed}`);
    }
    const content = readFileSync(trimmed, 'utf8');
    const parsed = parseNetscapeCookies(content);
    if (!parsed) {
      throw new Error(`文件 ${trimmed} 中未找到 dbcl2 cookie，请确认是 Netscape cookies.txt 格式且包含已登录的豆瓣 cookie`);
    }
    session = createSession(parsed.dbcl2, parsed.ck, 'Manual (file)');
  } else {
    const parsed = parseCookieHeader(trimmed);
    if (!parsed) {
      throw new Error('Cookie 中未找到 dbcl2，请传入含 dbcl2 的完整 Cookie 字符串，或 Netscape cookies.txt 文件路径');
    }
    session = createSession(parsed.dbcl2, parsed.ck, 'Manual');
  }

  // 校验 cookie 服务端有效，防止导入过期/错误的 cookie 造成「假成功」
  if (!await isValidSession(session)) {
    throw new Error('Cookie 解析成功但服务端校验失败：dbcl2 可能已过期或不属于豆瓣登录态，请重新获取 Cookie 后重试');
  }

  saveAuthCache(session);
  return session;
}

interface SweetCookieResult {
  cookies: Array<{ name: string; value: string; source?: { browser?: string } }>;
  warnings: string[];
}

interface BrowserCookieBucket {
  source: string;
  dbcl2?: string;
  ck?: string;
}

interface PuppeteerPage {
  goto(url: string, options?: { waitUntil?: string }): Promise<unknown>;
  waitForFunction(pageFunction: string | (() => unknown), options?: { timeout?: number }): Promise<unknown>;
  cookies(): Promise<PuppeteerCookie[]>;
}

interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
}

interface PuppeteerLaunchOptions {
  headless?: boolean;
  defaultViewport?: null | { width: number; height: number };
}

type PuppeteerLaunch = (options?: PuppeteerLaunchOptions) => Promise<PuppeteerBrowser>;

type BrowserName = 'chrome' | 'edge' | 'firefox' | 'safari';
interface BrowserInfo {
  name: BrowserName;
  /** 是否明确为 Google Chrome（非 Brave/Arc/Vivaldi 等 Chromium 衍生）。决定能否用 Google Chrome 的 profile 覆盖。 */
  isGoogleChrome: boolean;
}

function reportRecoverableError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[auth] ${context}: ${message}`);
}

function normalizeBrowserSource(source: string): string {
  const lower = source.trim().toLowerCase();
  if (!lower) return 'Browser';

  const mapping: Record<string, string> = {
    chrome: 'Chrome',
    edge: 'Edge',
    firefox: 'Firefox',
    safari: 'Safari'
  };

  return mapping[lower] || source.charAt(0).toUpperCase() + source.slice(1);
}

/**
 * 读取 Chrome 最近使用的 profile 目录名（如 "Default" / "Profile 10"）。
 * openLoginPage() 会用系统默认浏览器打开登录页，Chrome 通常在「最近使用的 profile」里打开；
 * 若不指定，sweet-cookie 只读 Default profile，与实际登录的 profile 错位就抓不到 cookie。
 * 读取失败返回 undefined，交由库走默认行为。
 */
function resolveChromeProfile(): string | undefined {
  try {
    const home = os.homedir();
    const dataDir = process.platform === 'darwin'
      ? path.join(home, 'Library/Application Support/Google/Chrome')
      : process.platform === 'win32'
        ? path.join(home, 'AppData/Local/Google/Chrome/User Data')
        : process.platform === 'linux'
          ? path.join(home, '.config/google-chrome')
          : null;
    if (!dataDir) return undefined;

    const localStatePath = path.join(dataDir, 'Local State');
    if (!existsSync(localStatePath)) return undefined;

    const data = JSON.parse(readFileSync(localStatePath, 'utf8')) as { profile?: { last_used?: string } };
    const lastUsed = data.profile?.last_used;
    return typeof lastUsed === 'string' && lastUsed ? lastUsed : undefined;
  } catch {
    return undefined;
  }
}

/** bundle id（macOS）→ BrowserName；未知或非浏览器返回 null。 */
function mapBrowserBundle(bundle?: string): BrowserInfo | null {
  if (!bundle) return null;
  const b = bundle.toLowerCase();
  if (b.includes('google.chrome')) return { name: 'chrome', isGoogleChrome: true };
  if (b.includes('apple.safari')) return { name: 'safari', isGoogleChrome: false };
  if (b.includes('mozilla.firefox')) return { name: 'firefox', isGoogleChrome: false };
  if (b.includes('microsoft.edge')) return { name: 'edge', isGoogleChrome: false };
  // Chromium 衍生（Brave/Arc/Vivaldi 等）复用 chrome provider，但不是 Google Chrome——
  // 它们各自的 profile 目录与 Google Chrome 不同，不能用 Google Chrome 的 Local State 覆盖。
  if (b.includes('brave') || b.includes('thebrowser') || b.includes('vivaldi') || b.includes('chromium')) return { name: 'chrome', isGoogleChrome: false };
  return null;
}

/** .desktop 文件名（Linux）→ BrowserName。 */
function mapDesktopEntry(entry: string): BrowserInfo | null {
  if (entry.includes('brave') || entry.includes('vivaldi')) return { name: 'chrome', isGoogleChrome: false };
  if (entry.includes('google-chrome') || entry.includes('googlechrome')) return { name: 'chrome', isGoogleChrome: true };
  if (entry.includes('chrom')) return { name: 'chrome', isGoogleChrome: false };
  if (entry.includes('firefox')) return { name: 'firefox', isGoogleChrome: false };
  if (entry.includes('edge')) return { name: 'edge', isGoogleChrome: false };
  return null;
}

/** ProgId（Windows）→ BrowserName。 */
function mapProgId(progId: string): BrowserInfo | null {
  const p = progId.toLowerCase();
  if (p.includes('firefox')) return { name: 'firefox', isGoogleChrome: false };
  if (p.includes('edge')) return { name: 'edge', isGoogleChrome: false };
  // ChromeHTML 是 Google Chrome 的默认 ProgId；其他含 chrom 的（如 BraveHTML）不是 Google Chrome
  if (p.includes('chromehtml')) return { name: 'chrome', isGoogleChrome: true };
  if (p.includes('chrom')) return { name: 'chrome', isGoogleChrome: false };
  return null;
}

/**
 * 解析系统默认浏览器（openLoginPage 实际打开页面的那个），优先从它提取 cookie，避免无关浏览器的授权弹窗。
 * 读取失败返回 null，调用方降级为尝试所有支持的浏览器。
 * 同时返回 isGoogleChrome：只有明确是 Google Chrome 时才可用它的 Local State 作为 profile 覆盖，
 * Brave/Arc/Vivaldi 等 Chromium 衍生与 Google Chrome 的 profile 目录不同。
 */
function resolveDefaultBrowser(): BrowserInfo | null {
  try {
    if (process.platform === 'darwin') {
      const plist = path.join(os.homedir(), 'Library/Preferences/com.apple.LaunchServices/com.apple.launchservices.secure.plist');
      if (!existsSync(plist)) return null;
      const out = spawnSync('plutil', ['-convert', 'json', '-o', '-', plist], { encoding: 'utf8' });
      if (out.status !== 0 || !out.stdout) return null;
      const handlers = (JSON.parse(out.stdout).LSHandlers ?? []) as Array<{ LSHandlerURLScheme?: string; LSHandlerRoleAll?: string }>;
      const role = handlers.find((h) => h.LSHandlerURLScheme === 'https')?.LSHandlerRoleAll;
      return mapBrowserBundle(role);
    }
    if (process.platform === 'linux') {
      const out = spawnSync('xdg-settings', ['get', 'default-web-browser'], { encoding: 'utf8' });
      if (out.status !== 0 || !out.stdout) return null;
      return mapDesktopEntry(out.stdout.trim().toLowerCase());
    }
    if (process.platform === 'win32') {
      const out = spawnSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice', '/v', 'ProgId'], { encoding: 'utf8' });
      const match = out.stdout.match(/ProgId\s+REG_SZ\s+(\S+)/i);
      return match ? mapProgId(match[1]) : null;
    }
  } catch {
    return null;
  }
  return null;
}

/** 校验 session 服务端是否真的有效（防止存入过期/失效的 cookie 造成「假成功」）。 */
async function isValidSession(session: AuthSession): Promise<boolean> {
  try {
    await getCurrentUserProfile(session.cookies);
    return true;
  } catch {
    return false;
  }
}

/** 从 sweet-cookie 结果里挑出含 dbcl2 的会话（优先同时含 ck 的来源）。 */
function pickSessionFromResult(result: SweetCookieResult): AuthSession | null {
  const grouped = new Map<string, BrowserCookieBucket>();
  for (const cookie of result.cookies) {
    if (!cookie?.name || typeof cookie.value !== 'string') continue;

    const rawSource = cookie.source?.browser || 'browser';
    const key = rawSource.trim().toLowerCase() || 'browser';
    const source = normalizeBrowserSource(rawSource || 'Browser');
    const bucket = grouped.get(key) || { source };

    if (cookie.name === 'dbcl2' && !bucket.dbcl2) {
      bucket.dbcl2 = cookie.value.replace(/^"|"$/g, '').trim();
    }
    if (cookie.name === 'ck' && !bucket.ck) {
      bucket.ck = cookie.value.trim();
    }
    grouped.set(key, bucket);
  }

  const buckets = [...grouped.values()];
  const selected = buckets.find((bucket) => bucket.dbcl2 && bucket.ck)
    || buckets.find((bucket) => bucket.dbcl2);
  if (!selected?.dbcl2) return null;
  return createSession(selected.dbcl2, selected.ck, selected.source);
}

async function extractFromBrowsers(): Promise<AuthSession | null> {
  // 使用 sweet-cookie 库提取浏览器 cookie（支持 Chrome/Edge/Firefox/Safari）
  let getCookies: (options: {
    url: string;
    browsers?: BrowserName[];
    chromeProfile?: string;
    edgeProfile?: string;
    firefoxProfile?: string;
    profile?: string;
    timeoutMs?: number;
  }) => Promise<SweetCookieResult>;

  try {
    const mod = await import('@steipete/sweet-cookie');
    getCookies = mod.getCookies;
  } catch (error) {
    reportRecoverableError('加载 sweet-cookie 失败', error);
    return null;
  }

  // 与 openLoginPage 实际打开的 profile 对齐：读 Google Chrome 最近使用的 profile。
  // 注意：sweet-cookie 的 chrome provider 也覆盖 Brave/Arc/Vivaldi 等 Chromium 衍生，
  // 但它们 profile 目录与 Google Chrome 不同，不能套用 Google Chrome 的 Local State，
  // 因此只有明确检测到 Google Chrome 时才覆盖 profile，其他情况交由 sweet-cookie 走默认行为。
  const resolved = resolveDefaultBrowser();
  const chromeProfile = resolved?.isGoogleChrome ? resolveChromeProfile() : undefined;

  const tryExtract = async (browsers: BrowserName[]): Promise<AuthSession | null> => {
    try {
      const result = await getCookies({
        url: 'https://www.douban.com',
        browsers,
        ...(chromeProfile ? { chromeProfile } : {})
      });
      return pickSessionFromResult(result);
    } catch (error) {
      reportRecoverableError('从浏览器提取 Cookie 失败', error);
      return null;
    }
  };

  // 先试默认浏览器：命中即返回（不触发其他浏览器的授权弹窗）。
  // 没命中再按四浏览器顺序全量兜底——extractFromBrowsers 也被 detectAuthSession()/douban me
  // 等无登录页场景调用，那时默认浏览器不一定持有 cookie（如默认 Safari 但豆瓣在 Chrome 登录），
  // 必须能回落到其他浏览器。sweet-cookie 对列表是「全试 + 合并」不短路，此处手动短路。
  const target = resolved?.name;
  if (target) {
    const primary = await tryExtract([target]);
    if (primary) return primary;
  }
  return tryExtract(['chrome', 'edge', 'firefox', 'safari']);
}

function openLoginPage(): void {
  let command: string;
  let args: string[];

  if (process.platform === 'darwin') {
    command = 'open';
    args = [DOUBAN_LOGIN_URL];
  } else if (process.platform === 'linux') {
    command = 'xdg-open';
    args = [DOUBAN_LOGIN_URL];
  } else if (process.platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', DOUBAN_LOGIN_URL];
  } else {
    throw new Error('当前平台暂不支持自动打开浏览器登录流程');
  }

  const opened = spawnSync(command, args, { stdio: 'ignore' });
  if (opened.error || opened.status !== 0) {
    const message = opened.error?.message || `exit code ${opened.status ?? 'unknown'}`;
    throw new Error(`打开浏览器失败: ${message}`);
  }
}

async function waitForEnter(): Promise<void> {
  const rl = readline.createInterface({ input, output });
  try {
    await rl.question('完成豆瓣登录后，按回车继续提取 Cookie...');
  } finally {
    rl.close();
  }
}

function toSessionFromPuppeteerCookies(cookies: PuppeteerCookie[]): AuthSession | null {
  let dbcl2 = '';
  let ck = '';

  for (const cookie of cookies) {
    if (!cookie?.name || typeof cookie.value !== 'string') continue;
    if (cookie.name === 'dbcl2' && !dbcl2) dbcl2 = cookie.value.replace(/^"|"$/g, '');
    if (cookie.name === 'ck' && !ck) ck = cookie.value;
  }

  if (!dbcl2) return null;
  return createSession(dbcl2, ck || undefined, 'Puppeteer');
}

/**
 * 轮询 page.cookies() 等待 dbcl2 cookie 出现。
 * dbcl2 是 HttpOnly cookie，document.cookie 读不到，必须用 CDP 的 page.cookies()。
 */
async function waitForDbcl2Cookie(page: PuppeteerPage, timeoutMs: number): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const cookies = (await page.cookies()) as PuppeteerCookie[];
    const dbcl2 = cookies.find((c) => c?.name === 'dbcl2');
    if (dbcl2 && typeof dbcl2.value === 'string' && dbcl2.value) {
      return dbcl2.value.replace(/^"|"$/g, '').trim();
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

async function extractFromPuppeteerBrowserLogin(): Promise<AuthSession | null> {
  let puppeteerModule: unknown;
  try {
    const moduleName = 'puppeteer';
    puppeteerModule = await import(moduleName);
  } catch (error) {
    reportRecoverableError('加载 puppeteer 失败', error);
    return null;
  }

  const launch = (puppeteerModule as { default?: { launch?: PuppeteerLaunch }; launch?: PuppeteerLaunch }).default?.launch
    || (puppeteerModule as { launch?: PuppeteerLaunch }).launch;
  if (typeof launch !== 'function') return null;

  let browser: PuppeteerBrowser | null = null;

  try {
    browser = await launch({
      headless: false,
      defaultViewport: null
    });

    const page = await browser.newPage();
    await page.goto(DOUBAN_LOGIN_URL, { waitUntil: 'domcontentloaded' });

    // dbcl2 是 HttpOnly cookie，document.cookie 读不到，旧实现用 waitForFunction 等待
    // document.cookie.includes('dbcl2=') 永远不会成立，必然 180s 超时。改为轮询 page.cookies()。
    const dbcl2 = await waitForDbcl2Cookie(page, 180000);
    if (!dbcl2) {
      throw new Error('登录超时（180s）：未检测到 dbcl2 Cookie');
    }

    const cookies = await page.cookies();
    return toSessionFromPuppeteerCookies(cookies as PuppeteerCookie[]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const needsBrowser = /Could not find (?:Chrome|the browser)|Failed to launch the browser/i.test(message);
    const hint = needsBrowser ? '（puppeteer 未下载浏览器，可运行 `npx puppeteer browsers install chrome` 后重试）' : '';
    reportRecoverableError(`通过 puppeteer 登录提取 Cookie 失败${hint}`, error);
    return null;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        reportRecoverableError('关闭 puppeteer 浏览器失败', error);
      }
    }
  }
}

export async function loginWithBrowser(): Promise<AuthSession> {
  // 先检查浏览器是否已处于登录态（不打开任何登录页/新窗口）。
  // 豆瓣在浏览器里已是登录状态时，直接复用现有 cookie，避免重复打开登录页。
  // 注意：Chrome cookie 是惰性写盘，浏览器里登出后磁盘可能仍残留失效 dbcl2，
  // 因此必须服务端校验，避免存入失效 cookie 造成「假成功」。
  const existing = await withSpinner(
    '正在检查浏览器登录状态...',
    () => extractFromBrowsers(),
    process.stderr.isTTY
  );
  if (existing && await isValidSession(existing)) {
    saveAuthCache(existing);
    return existing;
  }

  // 未登录：puppeteer 自动登录，用 spinner 给反馈（puppeteer 缺失/失败会快速返回 null）。
  const fromPuppeteer = await withSpinner(
    '正在通过 puppeteer 打开浏览器登录豆瓣...',
    () => extractFromPuppeteerBrowserLogin(),
    process.stderr.isTTY
  );
  if (fromPuppeteer) {
    saveAuthCache(fromPuppeteer);
    return fromPuppeteer;
  }

  // 交互阶段：打开默认浏览器 + 等用户登录后回车。
  // 关键：这里不能用 spinner——spinner 每 80ms 重写一行，会把 readline 的「按回车」提示盖住，表现为卡死。
  // 所有提示走 stderr：`douban login --json` 走到该路径时 stdout 只输出最终 JSON，不被这些提示污染。
  console.error('未检测到登录态，改为打开默认浏览器：请在浏览器完成豆瓣登录后，回到终端按回车继续。');
  openLoginPage();
  await waitForEnter();

  // 用户按回车后，Chrome 可能尚未把新 dbcl2 刷盘（cookie 惰性写盘，实测约 30-50s）。
  // 而且若磁盘残留旧失效 dbcl2，首次读到的会是旧值，必须等「值变化」才算新登录生效。
  // 此时 readline 已关闭，可安全用 spinner 给反馈。
  const staleDbcl2 = existing?.dbcl2;
  const extracted = await withSpinner(
    '正在等待浏览器写入新 Cookie（最多 60s）...',
    async () => {
      for (let attempt = 0; attempt < 30; attempt++) {
        if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 2000));
        const candidate = await extractFromBrowsers();
        if (!candidate) continue;
        // 之前未登录（staleDbcl2 为空）→ 任何 dbcl2 都是新的；之前有旧值 → 必须值变化才算新登录
        if (!staleDbcl2 || candidate.dbcl2 !== staleDbcl2) {
          return candidate;
        }
        // 值未变化：可能是开头 isValidSession 因瞬时网络/解析失败误判为失效，
        // 但浏览器其实已登录且 cookie 未变。重验一次，通过则复用，避免白等 60s 后报失败。
        if (await isValidSession(candidate)) {
          return candidate;
        }
      }
      return null;
    },
    process.stderr.isTTY
  );

  if (!extracted) {
    if (process.platform === 'darwin') {
      throw new Error('登录后仍未提取到新 dbcl2 Cookie：浏览器可能尚未将新 cookie 写盘（Chrome 约每 30-50s 落盘一次），或需授予 keychain 权限以解密豆瓣网的 cookie。可稍等片刻后重试 `douban login`，或使用 `douban login --cookie` 手动导入。');
    }
    throw new Error('登录后仍未提取到新 dbcl2 Cookie，浏览器可能尚未将新 cookie 写盘（Chrome 约每 30-50s 落盘一次），请稍等片刻后重试，或确认已在浏览器完成登录。');
  }

  // 新 cookie 落盘后再服务端校验一次，确保有效
  if (!await isValidSession(extracted)) {
    throw new Error('已提取到新 Cookie 但服务端校验失败，登录可能未真正完成，请重试。');
  }

  saveAuthCache(extracted);
  return extracted;
}

export async function detectAuthSession(): Promise<AuthSession | null> {
  const cached = readAuthCache();
  if (cached) return cached;

  const extracted = await extractFromBrowsers();
  if (!extracted) return null;

  saveAuthCache(extracted);
  return extracted;
}

export async function ensureAuth(): Promise<AuthSession> {
  // 读命令（whoami / mark / social 等）只认本地缓存，不自动发起交互式浏览器登录——
  // 否则会在 spinner 内触发 readline 等待，提示被盖住，看起来卡死。
  // 需要登录时请显式运行 douban login。
  const cached = readAuthCache();
  if (cached) return cached;

  throw new Error('未检测到可用豆瓣登录态');
}
