import { expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 글꼴은 소스에 쓰인 글자만 담은 서브셋이다(scripts/subset-fonts.py). 새 문구의 글자가
// 서브셋에 없으면 그 글자만 시스템 글꼴로 튀어 한 단어 안에서 서체가 갈린다.
// 이 테스트가 깨지면: python scripts/subset-fonts.py <원본 TTF 폴더> 를 다시 돌린다.
const root = fileURLToPath(new URL('..', import.meta.url));

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|json)$/.test(name) && name !== 'font-glyphs.json') out.push(p);
  }
  return out;
}

it('every non-ASCII character in the source is inside the font subset', () => {
  const { text } = JSON.parse(readFileSync(join(root, 'src/assets/font-glyphs.json'), 'utf8'));
  const have = new Set(text);
  const pages = readdirSync(join(root, 'public')).filter((n) => n.endsWith('.html')).map((n) => join(root, 'public', n));
  const files = [...walk(join(root, 'src')), join(root, 'index.html'), ...pages];
  const missing = new Map();
  for (const f of files) {
    for (const ch of readFileSync(f, 'utf8')) {
      if (ch.codePointAt(0) > 127 && !have.has(ch)) missing.set(ch, f.slice(root.length));
    }
  }
  expect([...missing.entries()]).toEqual([]);
});
