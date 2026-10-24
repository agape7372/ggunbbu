"""글꼴 서브셋 — 소스에 실제로 쓰인 글자만 남겨 woff2로 굽는다.

    python scripts/subset-fonts.py <원본 TTF 폴더>

원본(OFL, Google Fonts 저장소)은 레포에 넣지 않는다(합계 7MB). 폴더에 아래 파일명이 있어야 한다:
  BlackHanSans-Regular.ttf · IBMPlexSansKR-Medium.ttf · IBMPlexSansKR-Bold.ttf ·
  IBMPlexMono-Medium.ttf · IBMPlexMono-Bold.ttf

출력: public/fonts/*.woff2 + src/assets/font-glyphs.json(서브셋에 넣은 글자 목록).
tests/font-glyphs.test.mjs 가 소스 글자 ⊆ 목록을 검사한다 — 새 문구를 넣고 테스트가 깨지면 이 스크립트를 다시 돌린다.
사용자 입력 칸이 없는 게임이라(이름 입력 없음) 쓰인 글자만으로 충분하다. 입력 칸이 생기면 KS X 1001 2350자로 넓힐 것.
요구: pip install fonttools brotli
"""
import glob
import json
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 숫자·영문·기본 문장부호는 문구와 상관없이 늘 넣는다(점수·버전·날짜).
BASE = ''.join(chr(c) for c in range(0x20, 0x7F))

FONTS = [
    # (원본, 출력, 한글 포함 여부, 바꿀 패밀리 이름)
    # Plex는 OFL "Reserved Font Name"이 걸려 있어 서브셋(=수정본)에 원래 이름을 쓸 수 없다 → 이름을 바꾼다.
    # Black Han Sans는 예약 이름이 없어 그대로 둔다.
    ('BlackHanSans-Regular.ttf', 'display.woff2', True, None),
    ('IBMPlexSansKR-Medium.ttf', 'ui-500.woff2', True, 'Gunbbu Sans'),
    ('IBMPlexSansKR-Bold.ttf', 'ui-700.woff2', True, 'Gunbbu Sans'),
    ('IBMPlexMono-Medium.ttf', 'mono-500.woff2', False, 'Gunbbu Mono'),
    ('IBMPlexMono-Bold.ttf', 'mono-700.woff2', False, 'Gunbbu Mono'),
]


def rename(font, family):
    """패밀리 이름 계열(1·3·4·6·16·17)만 바꾸고 저작권(0)·라이선스(13·14)는 남긴다."""
    name = font['name']
    style = name.getDebugName(2) or 'Regular'
    ps = (family + '-' + style).replace(' ', '')
    for rec in list(name.names):
        if rec.nameID in (1, 16):
            rec.string = family
        elif rec.nameID == 4:
            rec.string = f'{family} {style}'
        elif rec.nameID in (3, 6):
            rec.string = ps
        elif rec.nameID == 17:
            rec.string = style


def source_chars():
    """src 아래 TS·JSON과 index.html에 나오는 비ASCII 글자 전부(주석 포함 — 상위집합이면 충분)."""
    files = glob.glob(os.path.join(ROOT, 'src', '**', '*.ts'), recursive=True)
    files += glob.glob(os.path.join(ROOT, 'src', '**', '*.json'), recursive=True)
    files.append(os.path.join(ROOT, 'index.html'))
    files += glob.glob(os.path.join(ROOT, 'public', '*.html'))  # 개인정보처리방침 등 앱 안에서 여는 문서
    chars = set()
    for f in files:
        if f.endswith('font-glyphs.json'):
            continue
        with open(f, encoding='utf-8') as fh:
            chars.update(c for c in fh.read() if ord(c) > 127)
    return chars


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    src_dir = sys.argv[1]
    out_dir = os.path.join(ROOT, 'public', 'fonts')
    os.makedirs(out_dir, exist_ok=True)
    used = source_chars()
    text = ''.join(sorted(set(BASE) | used))
    report = {}
    for name, out, korean, family in FONTS:
        path = os.path.join(src_dir, name)
        cmap = TTFont(path).getBestCmap()
        want = text if korean else BASE + '·×—…₩←→↑↓●★'
        have = ''.join(c for c in want if ord(c) in cmap)
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        opts.name_IDs = ['*']
        opts.notdef_outline = True
        font = subset.load_font(path, opts)
        sub = subset.Subsetter(opts)
        sub.populate(text=have)
        sub.subset(font)
        if family:
            rename(font, family)
        dest = os.path.join(out_dir, out)
        subset.save_font(font, dest, opts)
        report[out] = {'chars': len(have), 'bytes': os.path.getsize(dest)}
    glyphs = {'text': text, 'note': 'scripts/subset-fonts.py 가 만든다. 손으로 고치지 말 것.'}
    with open(os.path.join(ROOT, 'src', 'assets', 'font-glyphs.json'), 'w', encoding='utf-8') as fh:
        json.dump(glyphs, fh, ensure_ascii=False, indent=0)
        fh.write('\n')
    print(json.dumps(report, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
