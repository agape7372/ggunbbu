// 이펙트 검수 하네스 — 페이지 안에서 도는 쪽(scripts/fx/fx.mjs가 import('/scripts/fx/page.ts')로 싣는다).
// 가짜 시계 · 틱 루프 · 장면 사전 · 크롭 · 시트 · 계측은 여기 한 벌뿐이다. 본보기 = tmp/wazafx/legfx2.mjs · wazacap.mjs.
// tsconfig include에 들어 있어 src API가 바뀌면 `npx tsc --noEmit`이 여기서 깨진다.
import { consumeEvents, drawGame, initRenderer, setFeedbackOptions, setInvulnLook, type InvulnLook } from '../../src/render/renderer';
import { RECIPES, drawBladeFx, pool, resetBladeFx, seedBladeFx, type Recipe } from '../../src/render/bladeFx';
import { tickEffects } from '../../src/render/effects';
import { wazaShowState } from '../../src/render/wazaShow';
import { greatLook } from '../../src/render/sprites';
import { advance, makeState } from '../../src/core/sim';
import { hurtPlayer } from '../../src/core/combat';
import { makeFloor, makeStack } from '../../src/core/building';
import { cameraClamp } from '../../src/core/camera';
import { VIEW } from '../../src/config';
import type { GameState, InputFrame, Material, WazaId, WeaponId } from '../../src/core/types';

type Draft = Partial<Recipe>;
type Crop = [w: number, h: number, top: number];
/** after = 이 틱까지의 사건은 건너뛴다(hit은 첫 타격 1틱을 넘기고 둘째 16틱을 잡는다) */
/** hurt = 1틱에 다친다(피격 무적 표시 판정) — 계측은 무기 조각 대신 졸라맨 먹 화소 */
interface Scene { floors: Material[] | null; total?: number; y?: number; gauge?: boolean; hurt?: boolean; kind: string; after?: number; off: number[]; crop: Crop; k: number }
interface Cell { label: string; cv: HTMLCanvasElement | null }
/** gap = 이 줄 위에 더 띄울 틈(띠를 접을 때 구간 사이) */
interface Row { name: string; cells: Cell[]; gap?: number }
/** 한 줄 = 무기 하나(초안이 있으면 「지금」 + 초안마다 한 줄 · --invuln이면 무적 표시 두 안) */
interface Line { name: string; w: WeaponId; draft?: Draft; look?: InvulnLook }
export interface Opts { scale?: number; gray?: boolean; waza?: WazaId; frames?: number; every?: number; cols?: number; from?: number; flash?: boolean; invuln?: boolean }

// 장면 사전 — off = 사건 뒤 틱, crop = [폭, 높이, 위](논리 px), k = 시트 배율
export const S: Record<string, Scene> = {
  aura: { floors: null, kind: 'idle', off: [20, 26, 32, 38, 44, 50, 56, 62], crop: [130, 150, 475], k: 1.3 },
  hit: { floors: ['hard', 'hard', 'hard'], y: 60, kind: 'hit', after: 10, off: [0, 2, 4, 7, 11, 16], crop: [190, 240, 350], k: 0.95 },
  floor: { floors: ['weak', 'mid', 'mid'], y: 60, kind: 'floorCollapse', off: [0, 2, 4, 7, 11, 16, 24], crop: [200, 240, 350], k: 0.9 },
  destroy: { floors: ['weak'], total: 4, y: 60, kind: 'stackDestroy', off: [0, 3, 6, 10, 16, 24, 34], crop: [300, 330, 290], k: 0.68 },
  whiff: { floors: null, kind: 'slash', off: [0, 2, 4, 7, 10], crop: [170, 170, 450], k: 1.2 },
  special: { floors: ['mid', 'mid', 'mid', 'mid'], y: 140, gauge: true, kind: 'special', off: [10, 14, 18, 24, 34, 44], crop: [360, 560, 60], k: 0.42 },
  hurt: { floors: null, hurt: true, kind: 'hurt', off: [0, 1, 2, 3, 30, 60, 89, 90], crop: [130, 150, 475], k: 1.3 },
};

// ── 가짜 시계 · 캔버스 ───────────────────────────────────────
let fake = 1e7;
performance.now = () => fake;
const cv = document.createElement('canvas');
cv.width = 720; cv.height = 1560;
const ctx = cv.getContext('2d')!;
/** 무기 조각 층만 따로 — 계측용(1배, 투명) */
const mcv = document.createElement('canvas');
mcv.width = VIEW.W; mcv.height = 780;
const mctx = mcv.getContext('2d', { willReadFrequently: true })!;
const IN: InputFrame = { jump: false, guard: false, attack: false, special: false };
const ORIG = { ...RECIPES };
const drafts = new Map<string, Draft>();
// ponytail: renderer의 smoothCam은 export가 아니라 같은 식을 따라 센다. 사망 · 보스 격파의 slowFactor(<1)는 모른다 — 그런 장면을 넣으면 renderer에서 값을 내보내 받는다
let cam = 0;

function frame(s: GameState): void {
  fake += 1000 / 60;
  consumeEvents(s);
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.fillStyle = '#F4F1E8'; ctx.fillRect(0, 0, 360, 780);
  drawGame(ctx, s);
  cam = cameraClamp(cam, s.player.y);
  s.events = [];
}

function make(w: WeaponId, sc: Scene, waza?: WazaId): GameState {
  const s = makeState({ seed: 7 });
  s.weapon = w; s.stackSpawnCd = 99999;
  if (waza) s.waza = waza;
  if (sc.gauge) s.wazaGauge = 100;
  if (sc.floors) {
    const st = makeStack({ variant: 'building', theme: 'europe', floors: sc.floors.map(makeFloor), y: sc.y, vy: 0 });
    if (sc.total) st.totalFloors = sc.total;
    s.stack = st;
  } else s.stack = null;
  return s;
}

function crop(s: GameState, [cw, ch, top]: Crop, k: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = Math.round(cw * k); c.height = Math.round(ch * k);
  const x0 = cw >= 360 ? 0 : VIEW.LANE_X[s.player.lane] - cw / 2;
  c.getContext('2d')!.drawImage(cv, x0 * 2, top * 2, cw * 2, ch * 2, 0, 0, c.width, c.height);
  return c;
}

/** 한 판 — 매 틱 onTick(s, t, at)을 부른다(at = 사건 틱, 아직이면 -1). true를 돌려주면 멈춘다.
 *  시작마다 연출 상태 · 난수를 되감고, 초안은 이 판 동안만 RECIPES에 얹는다 */
function run(line: Line, sc: Scene, input: (t: number) => Partial<InputFrame>, onTick: (s: GameState, t: number, at: number) => boolean, opts: Opts = {}, maxT = 600): void {
  fake += 1000 / 60;
  tickEffects(); // fxLastNow를 가짜 시계에 맞춘다 — 첫 프레임 dt가 판마다 1/60
  // 화면 번쩍임(다침 붉은 면 · 완파 반전 · 필살 반전)은 기본으로 끈다 — 무기 이펙트와 상관없이 양쪽 줄에 똑같이 깜빡여 판정 영상에서 눈이 아프다(11-22 지적). --flash면 게임 기본(2)
  setFeedbackOptions({ flashLevel: opts.flash ? 2 : 0 });
  setInvulnLook(line.look ?? 'line');
  initRenderer(); // resetRunState(effects · screenfx · boss · landmark · wazaShow) + smoothCam 0
  resetBladeFx();
  seedBladeFx(7);
  cam = 0;
  const shape = greatLook(line.w)?.shape;
  if (line.draft && !shape) throw new Error('초안 바꿔 끼우기는 RECIPES에 든 대검만');
  if (line.draft && shape) RECIPES[shape] = { ...ORIG[shape], ...line.draft };
  try {
    const s = make(line.w, sc, opts.waza);
    let at = -1;
    for (let t = 1; t <= maxT; t++) {
      advance(s, { ...IN, ...input(t) });
      if (sc.hurt && t === 1) hurtPlayer(s);
      s.stackSpawnCd = Math.max(s.stackSpawnCd, 9999);
      const hit = at < 0 && t > (sc.after ?? 0) && s.events.some((e) => e.kind === sc.kind);
      frame(s);
      if (sc.kind === 'idle' ? t === 1 && at < 0 : hit) at = t;
      if (onTick(s, t, at)) break;
    }
  } finally {
    if (shape) RECIPES[shape] = ORIG[shape];
    setInvulnLook('line');
  }
}

/** 장면 입력 — 본보기와 같다(hit은 둘째 타격 16틱을 잡는다) */
const inputOf = (name: string) => (t: number): Partial<InputFrame> => ({
  attack: name !== 'special' && name !== 'aura' && name !== 'hurt' && (t === 1 || (name === 'hit' && t === 16)),
  special: name === 'special' && t === 4,
});
const sceneOf = (name: string): Scene => {
  const sc = S[name];
  if (!sc) throw new Error(`모르는 장면: ${name} (있는 것: ${Object.keys(S).join(', ')})`);
  return sc;
};

function cells(line: Line, name: string, opts: Opts): Cell[] {
  const sc = sceneOf(name);
  const k = opts.scale ?? sc.k;
  const out: Cell[] = [];
  run(line, sc, inputOf(name), (s, t, at) => {
    if (at < 0) return false;
    const d = t - at;
    if (sc.off.includes(d)) out.push({ label: `${name} +${d}`, cv: crop(s, sc.crop, k) });
    return d >= sc.off[sc.off.length - 1];
  }, opts, 300);
  return out;
}

// ── 시트 ─────────────────────────────────────────────────────
function sheet(rows: Row[], title: string, gray = false): string {
  const pad = 3, top = 14;
  mctx.font = '12px sans-serif';
  const lw = Math.ceil(Math.max(58, ...rows.map((r) => mctx.measureText(r.name).width + 8))); // 줄 이름 칸
  const rowH = (row: Row): number => Math.max(1, ...row.cells.map((c) => c.cv?.height ?? 0));
  const W = Math.max(200, ...rows.map((row) => row.cells.reduce((a, c) => a + (c.cv?.width ?? 60) + pad, pad + lw)));
  const H = rows.reduce((a, row) => a + (row.gap ?? 0) + rowH(row) + top + pad, 20);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#666'; g.fillRect(0, 0, W, H);
  g.font = '12px sans-serif'; g.fillStyle = '#fff';
  g.fillText(title, 4, 13);
  let y = 18;
  for (const row of rows) {
    y += row.gap ?? 0;
    g.fillStyle = '#fff'; g.fillText(row.name, 3, y + top + 12);
    let x = lw;
    for (const cl of row.cells) {
      g.fillStyle = '#ddd'; g.fillText(cl.label, x + 2, y + 11);
      if (cl.cv) g.drawImage(cl.cv, x, y + top);
      x += (cl.cv?.width ?? 60) + pad;
    }
    y += rowH(row) + top + pad;
  }
  if (gray) {
    const o = document.createElement('canvas'); o.width = W; o.height = H;
    const og = o.getContext('2d')!;
    og.filter = 'grayscale(1)';
    og.drawImage(c, 0, 0);
    return o.toDataURL('image/png');
  }
  return c.toDataURL('image/png');
}

/** 줄 목록 — 초안이 있으면 무기 하나 × (「지금」 + 초안), --invuln이면 무기 하나 × (밝은 테 · 옛 점멸), 없으면 무기마다 */
function lines(weapons: WeaponId[], draftNames: string[], opts: Opts = {}): Line[] {
  if (opts.invuln) return [{ name: '밝은 테', w: weapons[0], look: 'line' }, { name: '옛 점멸', w: weapons[0], look: 'blink' }];
  if (!draftNames.length) return weapons.map((w) => ({ name: w, w }));
  if (weapons.length !== 1) throw new Error('초안을 줄 땐 --weapons에 무기 하나만');
  const w = weapons[0];
  if (!greatLook(w)) throw new Error(`초안 바꿔 끼우기는 RECIPES에 든 대검만(${w}는 대검이 아니다)`);
  return [{ name: '지금', w }, ...draftNames.map((n) => ({ name: n, w, draft: drafts.get(n)! }))];
}

// ── 바깥(fx.mjs)이 부르는 것 ─────────────────────────────────

/** 초안 모듈을 싣는다 — 레포 상대 경로. 이름 = 파일 이름 */
export async function loadDrafts(paths: string[]): Promise<string[]> {
  const names: string[] = [];
  for (const p of paths) {
    const m = (await import(/* @vite-ignore */ '/' + p)) as { default?: Draft };
    if (!m.default || typeof m.default !== 'object') throw new Error(`초안 ${p}에 export default 레시피가 없다`);
    const name = p.split('?')[0].split('/').pop()!.replace(/\.[^.]+$/, ''); // ?t=<mtime>은 바깥이 붙인다(고친 초안을 새로 싣게)
    drafts.set(name, m.default);
    names.push(name);
  }
  return names;
}

/** 모든 run 뒤 RECIPES가 처음 그대로인가 */
export function recipesIntact(): boolean {
  return (Object.keys(ORIG) as (keyof typeof ORIG)[]).every((k) => RECIPES[k] === ORIG[k]);
}

export function sheetPng(weapons: WeaponId[], name: string, draftNames: string[], opts: Opts): string {
  const rows = lines(weapons, draftNames, opts).map((l) => ({ name: l.name, cells: cells(l, name, opts) }));
  const w = draftNames.length ? ` · ${weapons[0]}` : '';
  return sheet(rows, `${name}${w} — 줄 = ${draftNames.length ? '지금 · 초안' : '무기'}, 칸 = 사건 뒤 틱${opts.scale ? ` · ×${opts.scale}` : ''}`, opts.gray);
}

export interface MotionFrame { t: number; area: number; w: number; h: number; births: number }

/** 무기 조각 층의 보이는 넓이 · 둘레(알파 > 0 화소의 상자 폭 · 높이) */
function measure(): { area: number; w: number; h: number } {
  mctx.setTransform(1, 0, 0, 1, 0, 0);
  mctx.clearRect(0, 0, mcv.width, mcv.height);
  drawBladeFx(mctx, cam);
  const d = mctx.getImageData(0, 0, mcv.width, mcv.height).data;
  return countBox(d, mcv.width, (i) => d[i + 3] !== 0);
}

/** 졸라맨 먹 화소 — 한지보다 어둡고 차가운(파랑 ≥ 빨강) 화소 수. 먹 #1A1A20 · 옅은 먹 #A9A7AE는 차갑고 배경 그림은 다 따뜻하다(11-23 실측).
 *  hurt 장면은 무기 조각이 없어 이걸로 꺼짐 · 다시 켜짐을 센다 */
function inkArea(c: HTMLCanvasElement): { area: number; w: number; h: number } {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  return countBox(d, c.width, (i) => d[i] + d[i + 1] + d[i + 2] < 600 && d[i + 2] >= d[i]); // 한지 #F4F1E8 = 717 · 옅은 먹 = 510
}

/** keep(화소 첫 바이트 자리)이 참인 화소 수와 그 상자 폭 · 높이 */
function countBox(d: Uint8ClampedArray, width: number, keep: (i: number) => boolean): { area: number; w: number; h: number } {
  let area = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let i = 0, n = 0; i < d.length; i += 4, n++) {
    if (!keep(i)) continue;
    area++;
    const x = n % width, y = (n / width) | 0;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return { area, w: x1 < 0 ? 0 : x1 - x0 + 1, h: y1 < 0 ? 0 : y1 - y0 + 1 };
}

/** 다시 켜진 번수 — 넓이가 그때까지 정점의 반 아래로 꺼졌다가 전체 정점의 5분의 1 넘게 되살아난 횟수. 사건 이펙트(타격 · 층 깨기 · 완파)는 0이어야 한다(깜빡임 금지 — 눈이 아프다). 늦게 오는 작은 층은 안 센다 */
function relit(frames: MotionFrame[], peak: number): number {
  let hi = 0, low = Infinity, n = 0;
  for (const f of frames) {
    hi = Math.max(hi, f.area);
    if (f.area < hi * 0.5) low = Math.min(low, f.area);
    if (f.area > low + peak * 0.2) { n++; hi = f.area; low = Infinity; }
  }
  return n;
}

function summary(frames: MotionFrame[]) {
  let peak = frames[0];
  for (const f of frames) if (f.area > peak.area) peak = f;
  // 끝 = 넓이가 정점의 5% 위인 마지막 칸 — 서 있는 내내 도는 칼 기운(수백 화소)이 0이 안 돼서 0으로는 끝을 못 잡는다
  const floor = peak.area * 0.05;
  const last = [...frames].reverse().find((f) => f.area > floor);
  const total = frames.reduce((a, f) => a + f.births, 0);
  return {
    /** 마지막 칸에도 정점의 5% 넘게 남았다 = 창 안에서 안 끝남(peakFrac은 창 안 값) */
    cut: frames[frames.length - 1].area > floor,
    peakFrame: peak.t,
    peakArea: peak.area,
    relit: relit(frames, peak.area),
    /** 창 안에서 가장 넓었던 상자 폭 · 높이(px) — 「둘레는 그대로」를 지금 줄과 견준다 */
    maxBox: [Math.max(...frames.map((f) => f.w)), Math.max(...frames.map((f) => f.h))],
    peakFrac: last && last.t > 0 ? +(peak.t / last.t).toFixed(3) : null,
    birthFrames: frames.filter((f) => f.births > 0).length,
    birthPeakShare: total ? +(Math.max(...frames.map((f) => f.births)) / total).toFixed(3) : null,
  };
}

const BAND = 56;
/** 칸 밑 계측 띠 — 왼쪽 막대 = 넓이(줄 최대 대비), 오른쪽 눈금 = 그 프레임에 태어난 조각 수 */
function banded(crop: HTMLCanvasElement, f: MotionFrame, maxArea: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = crop.width; c.height = crop.height + BAND;
  const g = c.getContext('2d')!;
  g.drawImage(crop, 0, 0);
  const y = crop.height, half = c.width / 2;
  g.fillStyle = '#222'; g.fillRect(0, y, c.width, BAND);
  const bh = maxArea ? Math.round((f.area / maxArea) * (BAND - 16)) : 0;
  g.fillStyle = '#E8B04A'; g.fillRect(6, y + BAND - 4 - bh, half - 12, bh);
  g.fillStyle = '#7FD0F0';
  for (let i = 0; i < Math.min(f.births, 40); i++) g.fillRect(half + 4 + (i % 10) * 5, y + BAND - 6 - Math.floor(i / 10) * 6, 3, 4);
  g.fillStyle = '#fff'; g.font = '11px sans-serif';
  g.fillText(`넓이 ${f.area}`, 6, y + 11);
  g.fillText(`태어남 ${f.births}`, half + 4, y + 11);
  return c;
}

/** 연속 프레임 띠 — 줄마다 사건 틱부터 frames칸(every 틱 간격), 폰 1배 크롭 + 계측 띠 */
export function stripPng(weapons: WeaponId[], name: string, draftNames: string[], opts: Opts): { png: string; motion: unknown[] } {
  const sc = sceneOf(name);
  const N = opts.frames ?? 24, K = opts.every ?? 1, F = opts.from ?? 0;
  const groups: { name: string; cells: Cell[] }[] = [];
  const motion: unknown[] = [];
  for (const l of lines(weapons, draftNames, opts)) {
    const shots: { cv: HTMLCanvasElement; f: MotionFrame }[] = [];
    const alive = pool.map((p) => p.alive), seed = pool.map((p) => p.seed);
    let born = 0;
    run(l, sc, inputOf(name), (s, t, at) => {
      // 태어남 — 죽음 → 삶이거나 seed가 바뀐 칸(매 틱 세어 찍는 칸까지 모은다)
      pool.forEach((p, i) => {
        if (p.alive && (!alive[i] || p.seed !== seed[i])) born++;
        alive[i] = p.alive; seed[i] = p.seed;
      });
      if (at < 0) { born = 0; return false; }
      const d = t - at;
      if (d >= F && (d - F) % K === 0) {
        const c = crop(s, sc.crop, 1);
        shots.push({ cv: c, f: { t: d, ...(sc.hurt ? inkArea(c) : measure()), births: born } });
        born = 0;
      }
      return shots.length >= N;
    }, opts);
    const frames = shots.map((x) => x.f);
    const max = Math.max(0, ...frames.map((f) => f.area));
    groups.push({ name: l.name, cells: shots.map((x) => ({ label: `+${x.f.t}`, cv: banded(x.cv, x.f, max) })) });
    motion.push({ weapon: l.w, scene: name, row: l.name, frames, summary: frames.length ? summary(frames) : null });
  }
  // 접기 — cols칸씩, 같은 구간의 줄(지금 · 초안 …)을 붙여 놓고 구간 사이는 더 띄운다. 한 장 폭 2400 안으로 cols를 조용히 줄인다
  const cw = Math.round(sc.crop[0]) + 3;
  const C = Math.max(1, Math.min(opts.cols ?? 8, Math.floor((2400 - 140) / cw))); // 140 = 줄 이름 칸 넉넉히
  const rows: Row[] = [];
  for (let i = 0; i < N; i += C) {
    groups.forEach((gr, j) => {
      const part = gr.cells.slice(i, i + C);
      if (part.length) rows.push({ name: `${gr.name} ${part[0].label}~${part[part.length - 1].label}`, cells: part, gap: i > 0 && j === 0 ? 14 : 0 });
    });
  }
  const w = draftNames.length ? ` · ${weapons[0]}` : '';
  return { png: sheet(rows, `${name}${w} 띠 — ${N}칸 × ${K}틱, 폰 1배 · 밑 띠 = 무기 조각 넓이(막대) · 태어난 조각(눈금)`, opts.gray), motion };
}

/** 영화 — 서 있기 → 타격 셋 → 층 깨기 → 완파 → 헛스윙(+ 필살). 줄마다 1배 360×780 JPEG 열 */
export function movieFrames(weapons: WeaponId[], draftNames: string[], opts: Opts): { name: string; frames: string[] }[] {
  const small = document.createElement('canvas'); small.width = 360; small.height = 780;
  const sg = small.getContext('2d')!;
  return lines(weapons, draftNames, opts).map((l) => {
    const frames: string[] = [];
    const snap = (cap: string): void => {
      sg.filter = opts.gray ? 'grayscale(1)' : 'none';
      sg.drawImage(cv, 0, 0, 720, 1560, 0, 0, 360, 780);
      sg.filter = 'none';
      sg.fillStyle = '#1A1A20'; sg.font = 'bold 13px sans-serif';
      sg.fillText(cap, 8, 772);
      if (draftNames.length || opts.invuln) sg.fillText(l.name, 8, 16);
      frames.push(small.toDataURL('image/jpeg', 0.86));
    };
    const seg = (name: string, cap: string, ticks: number, attackAt: number[]): void =>
      run(l, sceneOf(name), (t) => ({ attack: attackAt.includes(t) }), (_s, t) => { snap(cap); return t >= ticks; }, opts);
    if (opts.invuln) { // 무적 표시 두 안 — 다친 뒤 무적 내내 서 있다가 베고, 끝나고 조금 더
      seg('hurt', '피격 무적', 120, [40, 56, 72]);
      return { name: l.name, frames };
    }
    seg('aura', '서 있기', 70, []);
    seg('hit', '타격', 62, [4, 20, 36]);
    seg('floor', '층 깨기', 50, [4]);
    seg('destroy', '완파', 64, [4]);
    seg('whiff', '헛스윙', 34, [4]);
    if (opts.waza) {
      // 필살 — 발동 4틱, 연출이 끝나고 20틱 더(wazacap 본보기)
      let seen = false, after = 0;
      run(l, sceneOf('special'), (t) => ({ special: t === 4 }), () => {
        const v = wazaShowState();
        if (v) seen = true;
        snap(`필살 ${opts.waza}${v ? ` f${v.f}` : ''}`);
        return seen && !v && ++after > 20;
      }, opts);
    }
    return { name: l.name, frames };
  });
}
