import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// 불변 규칙(CLAUDE.md 1 · 6 · 13 · 14)을 소스를 읽어 지키는 정적 가드. 구성은 no-center-star.test.mjs와 같다.
// 판정은 작은 함수 하나씩이고, 맨 아래에서 위반 예시는 걸리고 정상 예시는 안 걸리는지 직접 단언한다.

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// 주석(과 선택하면 문자열 속)을 공백으로 지운다. 줄 번호를 지키려고 줄바꿈은 둔다.
// 주석 속 낱말(「shadowBlur 금지」 같은 설명)에 걸려 거짓 실패가 나지 않게 하려는 것이다.
export function stripCode(src, { blankStrings = false } = {}) {
  let out = '';
  let i = 0;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      const end = src.indexOf('\n', i);
      const stop = end < 0 ? src.length : end;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += blank(src.slice(i, stop));
      i = stop;
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (src[j] === '\n' && c !== '`') break; // 닫히지 않은 따옴표는 줄 끝에서 끊는다(정규식 속 따옴표 방어)
        j++;
      }
      const stop = Math.min(j + 1, src.length);
      const chunk = src.slice(i, stop);
      out += blankStrings ? c + blank(chunk.slice(1, -1)) + (chunk.endsWith(c) ? c : '') : chunk;
      i = stop;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const lines = (code, re) =>
  code
    .split('\n')
    .map((l, i) => (re.test(l) ? `${i + 1}: ${l.trim()}` : null))
    .filter(Boolean);

// ① core는 순수 시뮬: DOM · 시계 · 난수 · 렌더 계층 가져오기 금지(난수는 rngState 경유 mulberry32만)
const CORE_IMPURE = /\b(document|window|globalThis|navigator|localStorage)\b|Math\s*\.\s*random|Date\s*\.\s*now|new\s+Date\b|\bperformance\s*\.|\bcanvas\b|HTMLCanvas|CanvasRenderingContext|\bAudioContext\b/i;
const CORE_BAD_IMPORT = /from\s+['"][^'"]*\/(render|ui|audio|platform|input|storage)(\/|['"])|from\s+['"][^'"]*canvas[^'"]*['"]/i;
export function coreImpurities(src) {
  return [
    ...lines(stripCode(src, { blankStrings: true }), CORE_IMPURE),
    ...lines(stripCode(src), CORE_BAD_IMPORT),
  ];
}

// ② 런타임 의존성 0(devDependencies만)
export function runtimeDeps(pkgText) {
  const pkg = JSON.parse(pkgText);
  return Object.keys(pkg.dependencies ?? {});
}

// ③ shadowBlur 금지(빛은 연출로. 번짐 그림자 · 블룸 없음)
export function shadowBlurHits(src) {
  return lines(stripCode(src, { blankStrings: true }), /\bshadowBlur\b/);
}

// ④ 스테이지 경로는 기기마다 같은 판이어야 해서 엔진 구현에 따라 끝자리가 갈리는 수학 함수를 쓰지 않는다
const NONDET_MATH = /Math\s*\.\s*(pow|sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|asinh|acosh|atanh|exp|expm1|log|log2|log10|log1p|cbrt|hypot)\b|\*\*/;
export function nondetMathHits(src) {
  return lines(stripCode(src, { blankStrings: true }), NONDET_MATH);
}

function walk(dir, ext) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p, ext) : ext.test(p) ? [p] : [];
  });
}
const read = (f) => readFileSync(f, 'utf8');
const rel = (f) => f.slice(ROOT.length).replace(/\\/g, '/');
const scanFiles = (files, fn) => files.flatMap((f) => fn(read(f)).map((h) => `${rel(f)}:${h}`));

const coreFiles = walk(join(ROOT, 'src/core'), /\.ts$/);
const stagePathFiles = coreFiles.filter((f) => /^(stage.*|landmark|script)\.ts$/.test(basename(f)));

describe('불변 규칙 정적 가드', () => {
  it('src/core는 DOM · 시계 · Math.random · 렌더 계층에 닿지 않는다', () => {
    expect(coreFiles.length).toBeGreaterThan(5);
    expect(scanFiles(coreFiles, coreImpurities)).toEqual([]);
  });

  it('루트 package.json에 런타임 dependencies가 없다', () => {
    expect(runtimeDeps(read(join(ROOT, 'package.json')))).toEqual([]);
  });

  it('src 어디에도 shadowBlur가 없다', () => {
    const files = walk(join(ROOT, 'src'), /\.(ts|tsx|js|mjs)$/);
    expect(scanFiles(files, shadowBlurHits)).toEqual([]);
  });

  it('스테이지 경로(stage*.ts · landmark.ts · script.ts)에 Math.pow · 삼각함수 · ** 가 없다', () => {
    expect(stagePathFiles.map((f) => basename(f)).sort()).toEqual(['landmark.ts', 'script.ts', 'stage.ts', 'stages.ts']);
    expect(scanFiles(stagePathFiles, nondetMathHits)).toEqual([]);
  });
});

describe('가드 판정 함수가 실제로 문다', () => {
  it('core 순수: 위반 예시는 걸리고 정상 예시 · 주석 · 문자열은 안 걸린다', () => {
    const bad = [
      'const r = Math.random();',
      'const t = Date.now();',
      'const t = performance.now();',
      'const w = window.innerWidth;',
      'document.title = "x";',
      'const c = new Date();',
      "import { draw } from '../render/renderer';",
      "import { sfx } from '../audio/sfx';",
      "import { c } from './canvas';",
      'let ctx: CanvasRenderingContext2D;',
    ];
    for (const s of bad) expect(coreImpurities(s), s).not.toEqual([]);
    const ok = [
      "import { STACK } from '../config';",
      'const x = nextRand(s.rngState);',
      '// Math.random 금지 · window 도 금지',
      '/* document · Date.now · performance.now */',
      'const msg = "window document Math.random";',
      '/**\n * canvas 는 렌더 몫\n */\nconst a = 1;',
    ];
    for (const s of ok) expect(coreImpurities(s), s).toEqual([]);
  });

  it('런타임 의존성: dependencies 키가 있으면 걸리고 devDependencies만이면 안 걸린다', () => {
    expect(runtimeDeps('{"dependencies":{"left-pad":"1.0.0"}}')).toEqual(['left-pad']);
    expect(runtimeDeps('{"devDependencies":{"vite":"1"}}')).toEqual([]);
    expect(runtimeDeps('{"dependencies":{},"devDependencies":{"vite":"1"}}')).toEqual([]);
  });

  it('shadowBlur: 대입 · 호출은 걸리고 주석 · 문자열 속 낱말은 안 걸린다', () => {
    expect(shadowBlurHits('ctx.shadowBlur = 12;')).not.toEqual([]);
    expect(shadowBlurHits('ctx["shadowBlur"] = 1; ctx.shadowBlur=2')).not.toEqual([]);
    expect(shadowBlurHits('// shadowBlur 금지')).toEqual([]);
    expect(shadowBlurHits('/* shadowBlur · 블룸 금지 */ ctx.fill();')).toEqual([]);
    expect(shadowBlurHits("const why = 'shadowBlur 금지';")).toEqual([]);
  });

  it('스테이지 수학: pow · 삼각함수 · ** 는 걸리고 sqrt · 곱셈 · 주석은 안 걸린다', () => {
    const bad = ['const a = Math.pow(p, 0.7);', 'const a = Math.sin(t);', 'const a = Math.cos(t)', 'const a = Math.tan(t);', 'const a = p ** 2;', 'x **= 2;', 'const a = Math.atan2(y, x);'];
    for (const s of bad) expect(nondetMathHits(s), s).not.toEqual([]);
    const ok = ['const a = Math.sqrt(dx * dx + dy * dy);', 'const a = p * p * 2;', '/** 제곱은 ** 로 쓰지 않는다 Math.pow 도 */', '// Math.sin 금지', 'const a = Math.floor(x) + Math.max(1, 2);'];
    for (const s of ok) expect(nondetMathHits(s), s).toEqual([]);
  });

  it('주석 제거는 줄 번호를 지키고 문자열 속 // 를 주석으로 오인하지 않는다', () => {
    const src = "const u = 'https://x.y'; // Math.random\nconst v = 1;";
    const out = stripCode(src);
    expect(out.split('\n')).toHaveLength(2);
    expect(out).toContain('https://x.y');
    expect(out).not.toContain('Math.random');
  });
});
