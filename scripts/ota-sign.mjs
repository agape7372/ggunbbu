// OTA 매니페스트 서명(2026-11-18 어뷰징 점검) — Vercel 계정이 털려 manifest.json · zip을 같이 바꿔도 앱이 안 받게 한다.
// 개인 키 = 레포 밖 D:\keys\gunbbu\ota-sign.pem(P-256 → backup-keys.ps1로 백업). 앱은 공개 키 둘을 박았다(11-23) —
// 이 키를 잃으면 평소 안 쓰는 둘째 개인 키를 OTA_KEY로 넘겨 서명한다(위치는 주인만 앎). 둘 다 잃으면 새 키 + 새 AAB.
// 공개 키 = src/platform/ota.ts otaKey. 서명 글 형식은 그 파일 otaMessage와 같아야 한다(tests/ota.test.ts가 둘을 맞대 본다).
// 냥수제비 scripts/ota-sign.mjs 이식.
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';

export const OTA_KEY = process.env.OTA_KEY || 'D:/keys/gunbbu/ota-sign.pem';

export const otaMessage = ({ version, url, checksum }) => `gunbbu-ota\n${version}\n${url}\n${checksum}`;

/** manifest에 sig(ECDSA P-256 · SHA-256 · r‖s base64 = 웹 crypto.subtle 형식)를 붙여 돌려준다 */
export function signManifest(m, pem) {
  const sig = sign('sha256', Buffer.from(otaMessage(m)), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  return { ...m, sig: sig.toString('base64') };
}

/** 개인 키의 짝 공개 키 — 앱 otaKey에 박는 꼴(SPKI DER base64)과 같다. ota-release가 이 글자를 산출물 안에서 찾는다 */
export const publicKeyOf = (pem) => createPublicKey(pem).export({ type: 'spki', format: 'der' }).toString('base64');

/** 앱에 박힌 공개 키(SPKI base64)로 맞는지: 키를 잘못 짝지은 판이 나가면 모든 앱이 OTA를 못 받는다 → 게시 전에 막는다 */
export function verifyManifest(m, spkiB64) {
  const key = createPublicKey({ key: Buffer.from(spkiB64, 'base64'), format: 'der', type: 'spki' });
  return verify('sha256', Buffer.from(otaMessage(m)), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(m.sig ?? '', 'base64'));
}
