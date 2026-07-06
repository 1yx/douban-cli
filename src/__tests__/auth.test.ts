import { describe, expect, it } from 'vitest';
import { parseCookieHeader, parseNetscapeCookies } from '../auth.ts';

describe('auth.parseCookieHeader', () => {
  it('从完整 Cookie 字符串中提取 dbcl2 与 ck', () => {
    const result = parseCookieHeader('bid=abc; dbcl2="123456789"; ck=ABCD; ll="en"');
    expect(result).toEqual({ dbcl2: '123456789', ck: 'ABCD' });
  });

  it('缺少 ck 时仅返回 dbcl2', () => {
    const result = parseCookieHeader('dbcl2=998877');
    expect(result).toEqual({ dbcl2: '998877' });
    expect(result?.ck).toBeUndefined();
  });

  it('去掉 dbcl2 值两端的引号', () => {
    const result = parseCookieHeader('dbcl2="quoted_value"');
    expect(result?.dbcl2).toBe('quoted_value');
  });

  it('缺少 dbcl2 返回 null', () => {
    expect(parseCookieHeader('bid=abc; ck=ABCD')).toBeNull();
  });

  it('空字符串返回 null', () => {
    expect(parseCookieHeader('')).toBeNull();
  });

  it('容忍整行请求头的 Cookie: 前缀', () => {
    const result = parseCookieHeader('Cookie: dbcl2="ajksdf"; ck=ABCD');
    expect(result).toEqual({ dbcl2: 'ajksdf', ck: 'ABCD' });
  });

  it('Cookie: 前缀场景下 ck 在首位也能解析', () => {
    const result = parseCookieHeader('Cookie: ck=ABCD; dbcl2="ajksdf"');
    expect(result).toEqual({ dbcl2: 'ajksdf', ck: 'ABCD' });
  });
});

describe('auth.parseNetscapeCookies', () => {
  it('从 Netscape cookies.txt 提取 dbcl2 与 ck', () => {
    const content = [
      '# Netscape HTTP Cookie File',
      '',
      '.douban.com\tTRUE\t/\tFALSE\t1800000000\tbid\tfakeBidValue123',
      '.douban.com\tTRUE\t/\tFALSE\t1800000000\tdbcl2\t"100000001:FAKE_TOKEN_123"',
      '.douban.com\tTRUE\t/\tFALSE\t0\tck\tfakeCKvalue'
    ].join('\n');
    expect(parseNetscapeCookies(content)).toEqual({ dbcl2: '100000001:FAKE_TOKEN_123', ck: 'fakeCKvalue' });
  });

  it('兼容 #HttpOnly_ 前缀的行（不是注释）', () => {
    const content = '#HttpOnly_.douban.com\tTRUE\t/\tTRUE\t1800000000\tdbcl2\t"abc:def"';
    expect(parseNetscapeCookies(content)).toEqual({ dbcl2: 'abc:def' });
  });

  it('去掉值两端的引号', () => {
    const content = '.douban.com\tTRUE\t/\tFALSE\t0\tdbcl2\t"quoted_token"';
    expect(parseNetscapeCookies(content)?.dbcl2).toBe('quoted_token');
  });

  it('缺少 dbcl2 返回 null', () => {
    const content = '.douban.com\tTRUE\t/\tFALSE\t0\tck\tABCD';
    expect(parseNetscapeCookies(content)).toBeNull();
  });

  it('空内容返回 null', () => {
    expect(parseNetscapeCookies('')).toBeNull();
  });
});
