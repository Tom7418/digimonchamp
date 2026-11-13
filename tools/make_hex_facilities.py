"""원본 시설 그림(web/assets/facilities/cmNN.png)을 육각 점유 모양에 꼭 맞춘 전용 그림으로 만든다.

Codex가 만든 미니 양호실(clinic-hex)·미니 운동장(field-hex)과 같은 모양새로 통일한다:
  - 점유 칸 합집합(정육각 96x112, 줄 간격 84)을 빈틈없이 채우고 바깥은 투명
  - 외곽선을 따라 청록색 난간과 기둥
원작 그대로의 복원 그림이 아니라 팬게임용으로 다듬은 그림이다. 원본 cmNN.png는 그대로 둔다.
그림을 얻는 방법 (web/cage-layout.js의 hex 값):
  own  : 같은 번호의 원본 그림을 모양에 맞춰 넣는다
  crop : 큰 시설 그림에서 칸 몇 개를 잘라 쓴다 (미니 시설이 예전 크기 2칸을 유지하기 위해)
  tile : 한 칸짜리 원본 그림을 칸마다 깐다
사용법: python tools/make_hex_facilities.py   (PIL 필요)
결과: web/assets/facilities/<이름>-hex.png
"""
from pathlib import Path
from PIL import Image, ImageDraw

DIR = Path(__file__).resolve().parents[1] / 'web/assets/facilities'
W, H, PITCH, SRC_PITCH = 96, 112, 84, 88
RAIL_DARK, RAIL, RAIL_LIGHT, POST = (24, 62, 140, 255), (58, 160, 226, 255), (132, 222, 250, 255), (206, 246, 255, 255)

# 이름: (방법, 원본 번호, 이 그림의 칸, [crop일 때 원본 전체 칸, 그중 쓸 칸])
BIG = {2: [[0, 0], [1, 0], [0, 1]], 3: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]], 4: [[0, 0], [1, 0], [2, 0]],
       5: [[0, 0], [1, 0], [-1, 1], [0, 1]], 6: [[0, 0], [1, 0], [-2, 1], [-1, 1]], 7: [[0, 0], [1, 0], [0, 1], [1, 1]],
       8: [[0, 0], [0, 1], [1, 1]], 9: [[0, 0], [2, 0], [0, 1], [1, 1]], 10: [[0, 0], [2, 0], [0, 1], [1, 1]],
       11: [[0, 0], [-2, 1], [-1, 1]], 12: [[0, 0], [1, 0], [1, 1]], 14: [[0, 0], [1, 0], [1, 1]], 15: [[0, 0], [0, 1], [1, 1]],
       17: [[0, 0], [-1, 1], [0, 1]], 18: [[0, 0], [-1, 1]], 19: [[0, 0], [1, 0], [2, 0], [3, 0]], 23: [[0, 0], [0, 1]],
       25: [[0, 0], [1, 0]], 26: [[0, 0], [1, 0], [-1, 1], [0, 1]], 27: [[0, 0], [-1, 1], [0, 1]], 31: [[0, 0], [1, 0]]}
PAIR = [[0, 0], [1, 0]]
JOBS = {f'cm{n:02}': ('own', n, c) for n, c in BIG.items()}
JOBS.update({
    'cm24': ('own', 24, [[0, 0]]),
    'free': ('own', 1, [[0, 0]]),
    'cm01': ('tile', 1, PAIR),
    'gym': ('tile', 34, [[0, 0], [1, 0], [2, 0]]),
    'cm32': ('tile', 32, PAIR),
    'cm35': ('crop', 7, PAIR, [[0, 0], [1, 0]]),
    'cm39': ('crop', 9, PAIR, [[0, 1], [1, 1]]),
    'cm37': ('crop', 10, PAIR, [[0, 1], [1, 1]]),
    'cm33': ('crop', 11, PAIR, [[-2, 1], [-1, 1]]),
    'cm38': ('crop', 15, PAIR, [[0, 1], [1, 1]]),
})


def origin(cells):
    return min(q*W + r*W//2 for q, r in cells), min(r*PITCH for q, r in cells)


def corners(q, r, ox, oy):
    x, y = q*W + r*W//2 - ox, r*PITCH - oy
    return [(x+48, y), (x+96, y+28), (x+96, y+84), (x+48, y+112), (x, y+84), (x, y+28)]


def size(cells):
    ox, oy = origin(cells)
    return max(q*W + r*W//2 for q, r in cells) - ox + W, max(r*PITCH for q, r in cells) - oy + H


def mask_of(cells):
    ox, oy = origin(cells)
    m = Image.new('L', size(cells), 0)
    d = ImageDraw.Draw(m)
    for q, r in cells:
        d.polygon(corners(q, r, ox, oy), fill=255)
    return m


def source(number, cells):
    """원본 그림(줄 간격 88)을 정육각 격자(줄 간격 84) 크기로 맞춘다"""
    im = Image.open(DIR / f'cm{number:02}.png').convert('RGBA')
    return im.resize(size(cells), Image.NEAREST)


def fill_holes(im, mask):
    """모양 안쪽의 빈 픽셀을 가장 가까운 그림 색으로 채운다"""
    px, mk = im.load(), mask.load()
    w, h = im.size
    todo = {(x, y) for y in range(h) for x in range(w) if mk[x, y] and not px[x, y][3]}
    while todo:
        step = {}
        for x, y in todo:
            for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                nx, ny = x+dx, y+dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] and (nx, ny) not in todo:
                    step[(x, y)] = px[nx, ny]
                    break
        if not step:
            break
        for (x, y), c in step.items():
            px[x, y] = c
        todo -= set(step)


def outline(cells):
    ox, oy = origin(cells)
    edges = {}
    for q, r in cells:
        c = corners(q, r, ox, oy)
        for i in range(6):
            key = tuple(sorted((c[i], c[(i+1) % 6])))
            edges[key] = edges.get(key, 0) + 1
    return [e for e, n in edges.items() if n == 1]


def rail(im, cells, mask):
    art = Image.new('RGBA', im.size)
    d = ImageDraw.Draw(art)
    edges = outline(cells)
    for (a, b) in edges:
        d.line([a, b], fill=RAIL_DARK, width=7)
    for (a, b) in edges:
        d.line([a, b], fill=RAIL, width=3)
    for (a, b) in edges:
        d.line([a, b], fill=RAIL_LIGHT, width=1)
    posts = set()
    for a, b in edges:
        posts |= {a, b, ((a[0]+b[0])//2, (a[1]+b[1])//2)}
    cx, cy = im.size[0]/2, im.size[1]/2
    for x, y in posts:
        # 기둥은 경계 안쪽으로 조금 들여 놓는다
        x += 3 if x < cx else -3
        y += 3 if y < cy else -3
        d.rectangle([x-4, y-5, x+4, y+5], fill=RAIL_DARK)
        d.rectangle([x-3, y-4, x+3, y+4], fill=RAIL)
        d.rectangle([x-2, y-4, x+1, y-1], fill=POST)
    im.alpha_composite(art)
    im.putalpha(Image.composite(im.getchannel('A'), Image.new('L', im.size, 0), mask))


for name, job in JOBS.items():
    kind, number, cells = job[:3]
    mask = mask_of(cells)
    im = Image.new('RGBA', mask.size)
    if kind == 'own':
        im.alpha_composite(source(number, cells))
    elif kind == 'crop':
        whole, part = BIG[number], job[3]
        src = source(number, whole)
        wx, wy = origin(whole)
        px, py = origin(part)
        im.alpha_composite(src.crop((px-wx, py-wy, px-wx+mask.size[0], py-wy+mask.size[1])))
    else:
        one = Image.open(DIR / f'cm{number:02}.png').convert('RGBA')
        ox, oy = origin(cells)
        for q, r in cells:
            im.alpha_composite(one, (q*W + r*W//2 - ox, r*PITCH - oy))
    im.putalpha(Image.composite(im.getchannel('A'), Image.new('L', im.size, 0), mask))
    fill_holes(im, mask)
    rail(im, cells, mask)
    im.save(DIR / f'{name}-hex.png')
    print(name, kind, im.size)
