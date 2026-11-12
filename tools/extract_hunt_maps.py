"""원본 사냥 필드 지도(root/field/field_hmNN_MM)를 PNG로 복원한다.

사용법 (Windows PowerShell):
    python tools/extract_hunt_maps.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"
인자를 생략하면 저장소 옆의 root 폴더를 찾는다.

- 바탕: NBSR(.nbs) + 8bpp NCGR + NCLR. 128x128 타일 = 1024x1024px.
  사냥 지도는 타일이 1024개를 넘으므로 16비트 칸 값 전체가 타일 번호다(뒤집기 비트 없음).
- 물·용암처럼 움직이는 부분은 바탕에서 팔레트 0(투명)으로 비어 있고
  _anim.bsa(BSAR)가 따로 채운다. BSAR 헤더 36바이트 뒤에 128x128개의
  16비트 칸 번호, 그 뒤에 칸 수(4바이트)와 칸마다 프레임별 타일 번호 표가 온다.
  여기서는 프레임 0만 그려 바탕 아래에 깐다.
- _01은 낮, _02는 밤 버전이다(같은 지도, 어두운 팔레트).
결과: web/assets/fields/<번호>_<낮밤>.png (원본 파일은 저장소에 올리지 않는다)
"""
import struct, sys, zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
SRC = ROOT / 'field'
OUT = REPO / 'web/assets/fields'
OUT.mkdir(parents=True, exist_ok=True)


def png(path, w, h, rgb):
    """색이 256개 이하면 팔레트 PNG(무손실, 용량 작음), 넘으면 RGB PNG로 저장한다."""
    def chunk(t, b):
        return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b))
    px = [bytes(rgb[i:i+3]) for i in range(0, len(rgb), 3)]
    lut = {}
    for c in px:
        if c not in lut:
            lut[c] = len(lut)
            if len(lut) > 256:
                break
    if len(lut) <= 256:
        idx = bytes(lut[c] for c in px)
        raw = b''.join(b'\0' + idx[y*w:(y+1)*w] for y in range(h))
        head = struct.pack('>IIBBBBB', w, h, 8, 3, 0, 0, 0)
        extra = chunk(b'PLTE', b''.join(lut))
    else:
        raw = b''.join(b'\0' + rgb[y*w*3:(y+1)*w*3] for y in range(h))
        head = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
        extra = b''
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', head) + extra
                     + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def palette(path):
    return [bytes(((v & 31)*255//31, ((v >> 5) & 31)*255//31, ((v >> 10) & 31)*255//31))
            for v, in struct.iter_unpack('<H', path.read_bytes()[40:])]


def tiles(path):
    g = path.read_bytes()
    assert struct.unpack_from('<I', g, 28)[0] == 4, '8bpp만 지원'
    return g[48:]


def draw(out, w, x0, y0, data, tile, hflip, vflip, colors, skip_zero=True):
    base = tile*64
    if base + 64 > len(data):
        return
    for ty in range(8):
        sy = 7-ty if vflip else ty
        row = ((y0+ty)*w + x0)*3
        for tx in range(8):
            i = data[base + sy*8 + (7-tx if hflip else tx)]
            if skip_zero and not i:
                continue
            out[row+tx*3:row+tx*3+3] = colors[i]


def convert(stem):
    screen = (SRC/(stem+'.nbs')).read_bytes()
    assert screen[:4] == b'NBSR'
    tw, th, layers = struct.unpack_from('<III', screen, 8)
    w, h = tw*8, th*8
    out = bytearray(w*h*3)
    anim = SRC/(stem+'_anim.bsa')
    if anim.exists():
        b = anim.read_bytes()
        assert b[:4] == b'BSAR'
        frames = struct.unpack_from('<I', b, 12)[0]
        aw, ah = struct.unpack_from('<II', b, 28)
        cells = struct.unpack_from('<%dH' % (aw*ah), b, 36)
        count = struct.unpack_from('<I', b, 36+aw*ah*2)[0]
        table = struct.unpack_from('<%dH' % (count*frames), b, 40+aw*ah*2)
        adata = tiles(SRC/(stem+'_anim.ncgr'))
        acol = palette(SRC/(stem+'_anim.nclr'))
        for ty in range(min(ah, th)):
            for tx in range(min(aw, tw)):
                e = cells[ty*aw+tx]
                if e < count:
                    draw(out, w, tx*8, ty*8, adata, table[e*frames], False, False, acol, False)
    data = tiles(SRC/(stem+'.ncgr'))
    colors = palette(SRC/(stem+'.nclr'))
    for ty in range(th):
        for tx in range(tw):
            e = struct.unpack_from('<H', screen, 20+(ty*tw+tx)*2)[0]
            draw(out, w, tx*8, ty*8, data, e, False, False, colors)
    name = stem.replace('field_hm', '')  # 00_01
    png(OUT/(name+'.png'), w, h, out)
    print(stem, w, h, 'anim' if anim.exists() else '')


# 게임 필드 → 원본 지도 번호. 지형(풀밭·늪·숲·하수도·사막·용암·정글·눈·유적)을 보고
# 짝지은 추정값이다(design.md 참고). web/game.js의 HUNT_MAP과 맞춰야 한다.
USED = ['01', '03', '04', '05', '08', '11', '13', '14', '15', '18']

for nbs in sorted(SRC.glob('field_hm*.nbs')):
    if nbs.stem[8:10] in USED:
        convert(nbs.stem)
