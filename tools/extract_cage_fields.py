"""원본 케이지 시설 배경(root/training/field_cmNN_01)을 PNG로 복원한다.

사용법 (Windows PowerShell):
    python tools/extract_cage_fields.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"
인자를 생략하면 저장소 옆의 root 폴더를 찾는다.

- NBSR(.nbs) 헤더: magic/version/가로 타일 수/세로 타일 수/레이어 수(각 4바이트), 칸 값은 16비트
  (아래 10비트 타일 번호, 1024 좌우 뒤집기, 2048 상하 뒤집기).
- 물·용암처럼 움직이는 부분은 _anim.bsa(BSAR)가 따로 채운다. 프레임 0만 바탕 아래에 깐다
  (형식 설명은 tools/extract_hunt_maps.py).
- 분홍(255,0,255에 가까운 색)은 원본의 투명 표시라 지운다 (묘지).
- 육각 한 칸은 96x112px, 줄 간격 88px. 그림이 차지하는 칸을 찾아 축 좌표로 출력한다
  (web/cage-layout.js의 cells가 이 값이다).
번호는 원작 케이지 순서(txt_list 487~526번)와 같다. 28 대기실·29 덮개는 쓰지 않는다.
결과: web/assets/facilities/cmNN.png (+ 예전 이름 free·field·gym·clinic)
"""
import struct, sys
from pathlib import Path
from extract_sprites import png

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
SRC = ROOT / 'training'
OUT = REPO / 'web/assets/facilities'
OUT.mkdir(parents=True, exist_ok=True)
LEGACY = {1: 'free', 2: 'field', 4: 'gym', 16: 'clinic'}


def palette(path):
    return [bytes(((v & 31)*255//31, ((v >> 5) & 31)*255//31, ((v >> 10) & 31)*255//31, 255))
            for v, in struct.iter_unpack('<H', path.read_bytes()[40:])]


def render(number):
    base = SRC / f'field_cm{number:02}_01'
    screen = base.with_suffix('.nbs').read_bytes()
    assert screen[:4] == b'NBSR'
    tw, th, layers = struct.unpack_from('<III', screen, 8)
    assert layers == 1 and len(screen) == 20 + tw*th*2
    w, h = tw*8, th*8
    out = bytearray(w*h*4)

    def put(x, y, color):
        out[(y*w+x)*4:(y*w+x+1)*4] = color

    anim = SRC / f'field_cm{number:02}_01_anim.bsa'
    if anim.exists():
        b = anim.read_bytes()
        assert b[:4] == b'BSAR'
        frames = struct.unpack_from('<I', b, 12)[0]
        aw, ah = struct.unpack_from('<II', b, 28)
        cells = struct.unpack_from('<%dH' % (aw*ah), b, 36)
        count = struct.unpack_from('<I', b, 36+aw*ah*2)[0]
        table = struct.unpack_from('<%dH' % (count*frames), b, 40+aw*ah*2)
        adata = anim.with_name(anim.stem + '.ncgr').read_bytes()[48:]
        acol = palette(anim.with_name(anim.stem + '.nclr'))
        for ty in range(min(ah, th)):
            for tx in range(min(aw, tw)):
                e = cells[ty*aw+tx]
                if e >= count:
                    continue
                v = table[e*frames]  # 시설 그림은 여기에도 뒤집기 비트가 있다
                if (v & 1023)*64+64 > len(adata):
                    continue
                for k in range(64):
                    sx = 7-k % 8 if v & 1024 else k % 8
                    sy = 7-k//8 if v & 2048 else k//8
                    i = adata[(v & 1023)*64+sy*8+sx]
                    if i:
                        put(tx*8+k % 8, ty*8+k//8, acol[i])
    gfx = base.with_suffix('.ncgr').read_bytes()
    assert struct.unpack_from('<I', gfx, 28)[0] == 4, '8bpp만 지원'
    data = gfx[48:]
    colors = palette(base.with_suffix('.nclr'))
    for y in range(h):
        for x in range(w):
            entry = struct.unpack_from('<H', screen, 20+((y//8)*tw+x//8)*2)[0]
            tx = 7-x % 8 if entry & 1024 else x % 8
            ty = 7-y % 8 if entry & 2048 else y % 8
            n = (entry & 1023)*64+ty*8+tx
            index = data[n] if n < len(data) else 0
            c = colors[index]
            if index and not (c[0] > 230 and c[1] < 30 and c[2] > 230):
                put(x, y, c)
    return w, h, out


def hexes(w, h, out):
    """그림이 차지하는 육각 칸 → 축 좌표 (첫 칸이 [0,0])"""
    def op(x, y):
        return 0 <= x < w and 0 <= y < h and out[(y*w+x)*4+3] > 0

    def center(cx, cy):
        return sum(op(cx+dx, cy+dy) for dx, dy in [(0, 0), (20, 0), (-20, 0), (0, 20), (0, -20)]) >= 3
    cols = range((w-48)//48)
    if h <= 112:
        found = [(j, 0) for j in cols if j % 2 == 0 and center(48+48*j, 56)]
    else:
        # 아랫줄은 아래 모서리가 비어 있는 자리가 진짜 칸이다. 윗줄은 그 반 칸 옆
        low = [j for j in cols if center(48+48*j, 144) and not (op(48+48*j-44, 184) or op(48+48*j+44, 184))]
        par = low[0] % 2 if low else 1
        found = [(j, 0) for j in cols if j % 2 != par and center(48+48*j, 56)] + [(j, 1) for j in low]
    off = found[0][0] % 2
    axial = [((j-r-off)//2, r) for j, r in found]
    q0, r0 = axial[0]
    return [[q-q0, r-r0] for q, r in axial]


for number in [n for n in range(1, 41) if n not in (28, 29)]:
    w, h, out = render(number)
    png(OUT/f'cm{number:02}.png', w, h, out)
    if number in LEGACY:
        png(OUT/(LEGACY[number]+'.png'), w, h, out)
    print(f'cm{number:02}', w, h, hexes(w, h, out))
