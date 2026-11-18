// 환불 확인 서버 함수(2026-11-18 어뷰징 점검) — Play가 환불 · 취소한 결제(Voided Purchases)를 받아 두고,
// 앱이 자기 결제 토큰을 물으면 그중 환불된 것을 돌려준다. 앱은 그 결제로 준 것을 거둔다(src/meta/catalog.ts revokePaid).
// OTA 배포처(ota/, Vercel)에 함께 올라간다 → 주소 = https://<OTA 호스트>/api/refund. 앱은 VITE_REFUND_URL이 비면 묻지 않는다.
// 서비스 계정 키(PLAY_SA_JSON, Vercel 환경 변수)가 없으면 꺼진 채(off) 아무것도 안 거둔다. 냥수제비 api/refund.ts를 옮긴 것.
// ponytail: DB 없이 서버 메모리에만 둔다 — Play가 주는 최근 30일 창만 본다. 환불 뒤 30일 넘게 앱을 안 켠 사람은 못 거둔다.
//           더 길게 거두려면 냥수제비처럼 DB에 토큰 해시를 적는다.

export const PKG = 'com.zaballgam.gunbbu';
const SYNC_MS = 10 * 60_000; // Voided API 한도 = 하루 6,000 · 30초에 30 → 10분에 한 번이면 넉넉하다
const BACK_MS = 30 * 864e5 - 60_000; // API가 돌려주는 가장 먼 과거(30일)
const MAX_TOKENS = 200;
const MAX_TOKEN_LEN = 512;

/** [startMs, endMs] 사이에 환불 · 취소된 인앱 결제 토큰 */
export type FetchVoided = (startMs: number, endMs: number) => Promise<string[]>;

/** 받아 둔 환불 목록 — 함수 인스턴스 하나의 메모리 */
export interface VoidedCache { at: number; set: Set<string>; busy?: Promise<void> }
export const newCache = (): VoidedCache => ({ at: 0, set: new Set() });

/** 10분이 지났으면 다시 받는다. 겹쳐 와도 한 번만. 받기 실패 = 받아 둔 것을 그대로 쓰고 다음 요청 때 다시 */
async function sync(c: VoidedCache, now: number, fetchVoided: FetchVoided): Promise<void> {
  if (now - c.at < SYNC_MS) return;
  c.busy ??= (async () => {
    try {
      c.set = new Set(await fetchVoided(now - BACK_MS, now));
      c.at = now;
    } catch (e) {
      console.error('refund: voided sync', e instanceof Error ? e.message : '?'); // 안쪽 사정은 로그에만
    }
  })().finally(() => { c.busy = undefined; });
  await c.busy;
}

/** 앱이 보낸 토큰 중 환불된 것. 토큰은 적어 두지 않는다 */
export async function refundCheck(body: unknown, now: number, c: VoidedCache, fetchVoided?: FetchVoided): Promise<Record<string, unknown>> {
  const raw = (body as { tokens?: unknown } | null)?.tokens;
  if (!Array.isArray(raw) || raw.length > MAX_TOKENS || !raw.every((t) => typeof t === 'string' && t.length > 0 && t.length <= MAX_TOKEN_LEN))
    return { err: 'bad_tokens' };
  if (!fetchVoided) return { voided: [], off: true };
  await sync(c, now, fetchVoided);
  return { voided: (raw as string[]).filter((t) => c.set.has(t)) };
}

// ───────── Google Play Developer API(서비스 계정 JWT → 접근 토큰 → voidedpurchases.list) ─────────
const b64url = (s: string | Uint8Array): string =>
  btoa(typeof s === 'string' ? s : String.fromCharCode(...s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** 서비스 계정 JSON(client_email · private_key)으로 환불 목록 받기. 권한 = Play Console 「재무 데이터 보기」 */
export function googleVoided(saJson: string, pkg = PKG, http: typeof fetch = fetch): FetchVoided {
  const sa = JSON.parse(saJson) as { client_email: string; private_key: string };
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (ch) => ch.charCodeAt(0));
  const key = crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return async (startMs, endMs) => {
    const iat = Math.floor(endMs / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 }));
    const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await key, new TextEncoder().encode(`${head}.${claim}`)));
    const tr = await http('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${head}.${claim}.${b64url(sig)}`,
    });
    if (!tr.ok) throw new Error(`token ${tr.status}`);
    const { access_token } = (await tr.json()) as { access_token: string };
    const out: string[] = [];
    let page = '';
    for (let i = 0; i < 20; i++) {
      const q = new URLSearchParams({ startTime: String(startMs), endTime: String(endMs), maxResults: '1000', ...(page ? { token: page } : {}) });
      const r = await http(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/voidedpurchases?${q}`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!r.ok) throw new Error(`voided ${r.status}`);
      const j = (await r.json()) as { voidedPurchases?: { purchaseToken?: string }[]; tokenPagination?: { nextPageToken?: string } };
      for (const v of j.voidedPurchases ?? []) if (v.purchaseToken) out.push(v.purchaseToken);
      page = j.tokenPagination?.nextPageToken ?? '';
      if (!page) break;
    }
    return out;
  };
}

// ───────── Vercel 진입점 ─────────
interface Req { method?: string; body?: unknown }
interface Res { statusCode: number; setHeader(k: string, v: string): void; end(s?: string): void }

const cache = newCache();
let fetcher: FetchVoided | undefined;

export default async function handler(req: Req, res: Res): Promise<void> {
  const send = (status: number, body: unknown): void => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') return send(405, { err: 'bad_op' });
  let body: unknown = req.body;
  if (typeof body === 'string') {
    if (body.length > 200_000) return send(413, { err: 'too_big' });
    try { body = JSON.parse(body); } catch { return send(400, { err: 'bad_json' }); }
  }
  if ((body as { op?: unknown } | null)?.op !== 'refund.check') return send(400, { err: 'bad_op' });
  const sa = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.PLAY_SA_JSON;
  try {
    if (sa) fetcher ??= googleVoided(sa);
  } catch {
    return send(500, { err: 'bad_key' }); // 키 모양이 틀렸다 — 값은 내보내지 않는다
  }
  const out = await refundCheck(body, Date.now(), cache, sa ? fetcher : undefined);
  send(out.err ? 400 : 200, out);
}
