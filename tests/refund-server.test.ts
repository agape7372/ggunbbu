// 환불 확인 서버 함수(ota/api/refund.ts) — 꺼져 있으면 아무것도 안 거두고, 받은 환불 목록과 겹치는 토큰만 돌려준다
import { describe, expect, it, vi } from 'vitest';
import handler, { googleVoided, newCache, refundCheck } from '../ota/api/refund';

describe('환불 확인 서버', () => {
  it('키가 없으면 꺼진 채 빈 목록 · 토큰 모양이 틀리면 거절', async () => {
    expect(await refundCheck({ tokens: ['a'] }, 0, newCache())).toEqual({ voided: [], off: true });
    expect(await refundCheck({ tokens: 'a' }, 0, newCache())).toEqual({ err: 'bad_tokens' });
    expect(await refundCheck({ tokens: [''] }, 0, newCache())).toEqual({ err: 'bad_tokens' });
    expect(await refundCheck({ tokens: Array(201).fill('a') }, 0, newCache())).toEqual({ err: 'bad_tokens' });
  });

  it('보낸 토큰 중 환불된 것만 · 10분 안엔 다시 안 받고 · 받기가 실패하면 받아 둔 것을 쓴다', async () => {
    const c = newCache();
    const f = vi.fn(async () => ['a', 'x']);
    expect(await refundCheck({ tokens: ['a', 'b'] }, 1e12, c, f)).toEqual({ voided: ['a'] });
    await refundCheck({ tokens: ['a'] }, 1e12 + 60_000, c, f);
    expect(f).toHaveBeenCalledTimes(1);
    const bad = vi.fn(async () => { throw new Error('quota'); });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await refundCheck({ tokens: ['a'] }, 1e12 + 11 * 60_000, c, bad)).toEqual({ voided: ['a'] });
  });

  it('서비스 계정으로 서명한 JWT를 내고 쪽을 넘겨 다 받는다', async () => {
    const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
    const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...der))}\n-----END PRIVATE KEY-----\n`;
    let jwt = '';
    const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('oauth2')) {
        jwt = decodeURIComponent(String(init?.body)).split('assertion=')[1]!;
        return new Response(JSON.stringify({ access_token: 'at' }));
      }
      const page = new URL(u).searchParams.get('token');
      return new Response(JSON.stringify(page ? { voidedPurchases: [{ purchaseToken: 'v2' }] } : { voidedPurchases: [{ purchaseToken: 'v1' }], tokenPagination: { nextPageToken: 'p2' } }));
    });
    const got = await googleVoided(JSON.stringify({ client_email: 'sa@x', private_key: pem }), 'com.zaballgam.gunbbu', http as typeof fetch)(0, 1e12);
    expect(got).toEqual(['v1', 'v2']);
    const [h, c, s] = jwt.split('.');
    const unb = (x: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', kp.publicKey, unb(s!), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
    expect(JSON.parse(atob(c!.replace(/-/g, '+').replace(/_/g, '/')))).toMatchObject({ iss: 'sa@x', scope: 'https://www.googleapis.com/auth/androidpublisher' });
  });

  it('진입점 — 사전 요청 · 글 본문(text/plain) · 모르는 op', async () => {
    const res = () => ({ statusCode: 0, headers: {} as Record<string, string>, out: '', setHeader(k: string, v: string) { this.headers[k] = v; }, end(s = '') { this.out = s; } });
    const r1 = res();
    await handler({ method: 'OPTIONS' }, r1);
    expect(r1.statusCode).toBe(204);
    expect(r1.headers['Access-Control-Allow-Origin']).toBe('*');
    const r2 = res();
    await handler({ method: 'POST', body: JSON.stringify({ op: 'refund.check', tokens: ['a'] }) }, r2);
    expect([r2.statusCode, JSON.parse(r2.out)]).toEqual([200, { voided: [], off: true }]);
    const r3 = res();
    await handler({ method: 'POST', body: '{"op":"nope"}' }, r3);
    expect(r3.statusCode).toBe(400);
  });
});
