"""원본 타이틀 화면·공통 배경 그림을 PNG로 복원한다 (web/assets/ui).

사용법 (Windows PowerShell):
    python tools/extract_title.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"

- NSCR(.nscr) 배경: 머리말 0x18에 가로·세로 픽셀, 0x20에 데이터 크기, 0x24부터 16비트 칸
  (타일 번호 10비트, 좌우·상하 뒤집기, 4bpp면 위 4비트가 팔레트 번호). DS 화면 크기 256x192만 자른다.
- NCER 셀(버튼·글자): extract_sprites.py와 같은 OAM 해석, 셀 하나씩 따로 저장한다.
"""
import struct
import sys
import zlib
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
OUT = REPO / 'web/assets/ui'
OUT.mkdir(parents=True, exist_ok=True)
SIZES = [[(8, 8), (16, 16), (32, 32), (64, 64)], [(16, 8), (32, 8), (32, 16), (64, 32)], [(8, 16), (8, 32), (16, 32), (32, 64)]]


def png(path, w, h, rgba):
    def chunk(t, b):
        return struct.pack('>I', len(b)) + t + b + struct.pack('>I', zlib.crc32(t + b))
    raw = b''.join(b'\0' + bytes(rgba[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
                     + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def palette(path):
    return [(((v & 31) * 255 // 31), ((v >> 5) & 31) * 255 // 31, ((v >> 10) & 31) * 255 // 31)
            for v, in struct.iter_unpack('<H', path.read_bytes()[40:])]


def screen(base: Path, name: str, height=192):
    sc = base.with_suffix('.nscr').read_bytes()
    g = base.with_suffix('.ncgr').read_bytes()
    w, h = struct.unpack_from('<HH', sc, 0x18)
    size = struct.unpack_from('<I', sc, 0x20)[0]
    ents = struct.unpack_from('<%dH' % (size // 2), sc, 0x24)
    depth = 8 if struct.unpack_from('<I', g, 28)[0] == 4 else 4
    data, pal = g[48:], palette(base.with_suffix('.nclr'))
    h = min(h, height)
    out = bytearray(w * h * 4)
    tw = w // 8
    for i, e in enumerate(ents):
        tx, ty = (i % tw) * 8, (i // tw) * 8
        if ty >= h:
            break
        t, hf, vf, pl = e & 1023, e & 1024, e & 2048, e >> 12
        for y in range(8):
            for x in range(8):
                sx, sy = (7 - x if hf else x), (7 - y if vf else y)
                if depth == 8:
                    n = t * 64 + sy * 8 + sx
                    c = pal[data[n]] if n < len(data) else (0, 0, 0)
                else:
                    n = t * 32 + sy * 4 + sx // 2
                    idx = (data[n] >> (4 * (sx % 2))) & 15 if n < len(data) else 0
                    c = pal[pl * 16 + idx]
                o = ((ty + y) * w + tx + x) * 4
                out[o:o + 4] = bytes((*c, 255))
    png(OUT / f'{name}.png', w, h, out)
    print(name, w, h)


def cells(base: Path, picks: dict):
    c = base.with_suffix('.ncer').read_bytes()
    graphics = base.with_suffix('.ncbr').read_bytes()
    depth = 8 if struct.unpack_from('<I', graphics, 28)[0] == 4 else 4
    g, pal = graphics[48:], palette(base.with_suffix('.nclr'))
    count, kind, offset, mapping = struct.unpack_from('<HHII', c, 24)
    stride = 16 if kind else 8
    bank = 24 + offset
    oams = bank + count * stride
    to = struct.unpack_from('<I', c, 36)[0]
    transfer = 24 + to if to else None
    for i, name in picks.items():
        n, _, off = struct.unpack_from('<HHI', c, bank + i * stride)
        objs = []
        for j in range(n):
            a, b, d = struct.unpack_from('<HHH', c, oams + off + j * 6)
            if a >> 14 == 3:
                continue
            w, h = SIZES[a >> 14][b >> 14]
            x, y = b & 511, a & 255
            x -= 512 if x >= 256 else 0
            y -= 256 if y >= 128 else 0
            objs.append((x, y, w, h, d, b))
        left, top = min(o[0] for o in objs), min(o[1] for o in objs)
        W, H = max(o[0] + o[2] for o in objs) - left, max(o[1] + o[3] for o in objs) - top
        out = bytearray(W * H * 4)
        base_addr = struct.unpack_from('<I', c, transfer + 8 + i * 8)[0] if transfer else 0
        for x, y, ow, oh, d, b in reversed(objs):
            addr = base_addr + (d & 1023) * (32 << mapping)
            for py in range(oh):
                for px in range(ow):
                    sx, sy = (ow - 1 - px if b & 4096 else px), (oh - 1 - py if b & 8192 else py)
                    q = sy * ow + sx
                    bo = addr + (q if depth == 8 else q // 2)
                    idx = g[bo] if depth == 8 else (g[bo] >> (4 * (q % 2))) & 15
                    if not idx:
                        continue
                    col = pal[idx if depth == 8 else (d >> 12) * 16 + idx]
                    o = ((y - top + py) * W + x - left + px) * 4
                    out[o:o + 4] = bytes((*col, 255))
        png(OUT / f'{name}.png', W, H, out)
        print(name, W, H)


# 높이: 맨 아래 줄이 비어 있는(검정·분홍) 그림은 그만큼 잘라 이어 붙일 때 줄무늬가 생기지 않게 한다
screen(ROOT / 'title_menu/title_top', 'title_top', 191)     # 로고 (위 화면)
screen(ROOT / 'title_menu/title_bg_main', 'title_bottom')   # 디지털 월드 (아래 화면)
screen(ROOT / 'ui/common_bg_top', 'bg_top', 184)            # 육각 무늬 공통 배경 (페이지 배경으로 타일)
screen(ROOT / 'ui/common_bg_bottom', 'bg_bottom', 184)
cells(ROOT / 'title_menu/title_obj', {
    25: 'btn_frame', 1: 'btn_frame_on',
    31: 'txt_new', 32: 'txt_new_on', 33: 'txt_continue', 34: 'txt_continue_on',
    46: 'welcome',
})
