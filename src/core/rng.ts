// mulberry32 시드 PRNG — 상태를 GameState.rngState에 보존해 결정론 유지.

/** 상태를 1스텝 진행시키고 [0,1) 난수와 새 상태를 반환 */
export function rngNext(state: number): { value: number; state: number } {
  let a = (state + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a };
}

/** GameState를 직접 진행시키는 헬퍼 */
export function rand(s: { rngState: number }): number {
  const r = rngNext(s.rngState);
  s.rngState = r.state;
  return r.value;
}

/** 0..n-1 정수 */
export function randInt(s: { rngState: number }, n: number): number {
  return Math.floor(rand(s) * n);
}

/** 가중 추첨: weights 합 1 불필요 */
export function randPick(s: { rngState: number }, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = rand(s) * total;
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i];
    if (x < 0) return i;
  }
  return weights.length - 1;
}
