"""건뿌 표식 생성기 — mark.svg(아이콘 원본)와 mark-fg.svg(어댑티브 전경, 투명 배경)를 만든다.
    python assets/brand/src/make-mark.py
기하: 건물 판(창 2줄)을 절단선으로 둘로 가르고 윗조각을 틈만큼 밀어낸다. 틈 한가운데 노랑 참격(양끝 뾰족).
"""
import math, os
HERE = os.path.dirname(os.path.abspath(__file__))
INK, IVORY, YEL = '#1A1A20', '#F4F1E8', '#FFD200'
# 판
X0, Y0, W, H = 196, 318, 632, 352
# 절단선: 판 중심을 지나고 기울기 각 ANG
ANG = math.radians(-31)
CX, CY = X0 + W / 2, Y0 + H / 2 + 10
dx, dy = math.cos(ANG), math.sin(ANG)          # 선 방향
nx, ny = -dy, dx                                # 법선(아래-오른쪽 → 위-왼쪽 반대)
if ny < 0: nx, ny = -nx, -ny                     # 법선은 아래쪽을 향하게
GAP = 66                                         # 틈 폭
SLIDE = 64                                       # 선 방향 미끄러짐(윗조각이 베인 쪽으로 밀려난다)
OFF = (-nx * GAP + dx * SLIDE, -ny * GAP + dy * SLIDE)  # 윗조각 이동


def line_pts(t0, t1, ox=0.0, oy=0.0):
    return (CX + dx * t0 + ox, CY + dy * t0 + oy), (CX + dx * t1 + ox, CY + dy * t1 + oy)


def half_plane(upper):
    # 절단선 위(upper) 또는 아래 반평면을 큰 다각형으로
    (ax, ay), (bx, by) = line_pts(-3000, 3000)
    s = -1 if upper else 1
    return f'{ax:.1f},{ay:.1f} {bx:.1f},{by:.1f} {bx + nx * s * 6000:.1f},{by + ny * s * 6000:.1f} {ax + nx * s * 6000:.1f},{ay + ny * s * 6000:.1f}'


def slab():
    win = []
    cols = [X0 + 92, X0 + W / 2 - 42, X0 + W - 92 - 84]
    for x in cols:
        win.append(f'<rect x="{x:.0f}" y="{Y0 + 46}" width="84" height="84"/>')
        by = Y0 + H - 40
        win.append(f'<path d="M{x:.0f} {by} v-62 a42 42 0 0 1 84 0 v62 z"/>')
    return (f'<rect x="{X0}" y="{Y0}" width="{W}" height="{H}" fill="#C9C2B4"/>'
            f'<rect x="{X0}" y="{Y0}" width="{W}" height="{H / 2}" fill="#BBB3A4"/>'
            f'<g fill="{IVORY}" stroke="{INK}" stroke-width="18">{"".join(win)}</g>'
            f'<line x1="{X0}" y1="{Y0 + H / 2}" x2="{X0 + W}" y2="{Y0 + H / 2}" stroke="{INK}" stroke-width="16"/>'
            f'<rect x="{X0}" y="{Y0}" width="{W}" height="{H}" fill="none" stroke="{INK}" stroke-width="30"/>')


def piece(upper):
    (ax, ay), (bx, by) = line_pts(-3000, 3000)
    cut = (f'<g clip-path="url(#slabclip)"><line x1="{ax:.1f}" y1="{ay:.1f}" x2="{bx:.1f}" y2="{by:.1f}" '
           f'stroke="{INK}" stroke-width="30"/></g>')
    return f'<g clip-path="url(#{"hi" if upper else "lo"})"><use href="#slab"/>{cut}</g>'


def slash(half_w=21, t0=-470, t1=470):
    mx, my = OFF[0] / 2, OFF[1] / 2
    (ax, ay), (bx, by) = line_pts(t0, t1, mx, my)
    cx, cy = (ax + bx) / 2, (ay + by) / 2
    p = [(ax, ay), (cx + nx * half_w, cy + ny * half_w), (bx, by), (cx - nx * half_w, cy - ny * half_w)]
    pts = ' '.join(f'{x:.1f},{y:.1f}' for x, y in p)
    return f'<polygon points="{pts}" fill="{YEL}" stroke="{INK}" stroke-width="8" stroke-linejoin="round"/>'


def svg(bg=True, scale=1.0):
    t = f'translate({512 * (1 - scale) - 10:.1f},{512 * (1 - scale) + 34 * scale:.1f}) scale({scale})'
    body = (piece(False)
            + f'<g transform="translate({OFF[0]:.1f},{OFF[1]:.1f})">{piece(True)}</g>'
            + slash())
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">'
            f'<defs><clipPath id="lo"><polygon points="{half_plane(False)}"/></clipPath>'
            f'<clipPath id="hi"><polygon points="{half_plane(True)}"/></clipPath>'
            f'<clipPath id="slabclip"><rect x="{X0 - 15}" y="{Y0 - 15}" width="{W + 30}" height="{H + 30}"/></clipPath>'
            f'<g id="slab">{slab()}</g></defs>'
            + (f'<rect width="1024" height="1024" fill="{IVORY}"/>' if bg else '')
            + f'<g transform="{t}">{body}</g></svg>')


open(os.path.join(HERE, 'mark.svg'), 'w', encoding='utf-8').write(svg(True, 0.96))
# 어댑티브 전경: 108dp 중 안전 지름 66dp(=61%) 안에 들어가게 축소
open(os.path.join(HERE, 'mark-fg.svg'), 'w', encoding='utf-8').write(svg(False, 0.62))
print('OFF', OFF)
