"""투척 기술 7종의 비행·도착 효과를 원본에서 변환한다 (원본 파일은 배포하지 않고 PNG와 표만 만든다).

사용: python tools/extract_throw_effects.py [e003 파일 폴더] [ftc 폴더]
  기본값은 저장소 옆의 root/common, root/ftc (다른 추출 도구와 같은 배치).
  e003_{cherrybomb,bitbomb,rock,icerock,hart,banana}00.{ncer,ncbr,nclr,nanr} 24개가 필요하다.

기술 레코드(ARM9 0x20D02CC + 번호×104): +0x08 속도(÷100), +0x32 발사 오프셋 x·y(부호 있음)·배율(%),
+0x36 비행 / +0x38 도착 리소스(상위 바이트 = e003 뱅크 번호, 하위 바이트 − 1 = NANR 시퀀스),
+0x28 스크립트 = 투척 계열 0x2129094 (tools/identify_lob_effects.py와 같은 판정).
"""
import contextlib
import hashlib
import io
import json
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'tools'))
argv, sys.argv = sys.argv, sys.argv[:1]  # extract_title이 인자를 ROM 경로로 읽지 않게 한다
import extract_title as art  # noqa: E402
sys.argv = argv

common = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'common'
ftc = Path(sys.argv[2]) if len(sys.argv) > 2 else REPO.parent / 'ftc'
arm = (ftc / 'arm9.bin').read_bytes()
overlay = (ftc / 'overlay9_19').read_bytes()
BASE = 0x0210E8A0
LOB_SCRIPT = 0x02129094
OUT = REPO / 'web/assets/battle'

# 기술 번호 → 기대하는 뱅크 (원본 표에서 읽은 값과 맞는지 확인한다)
THROWS = {346: 'cherrybomb', 385: 'bitbomb', 88: 'rock', 310: 'icerock', 391: 'hart', 425: 'hart', 552: 'banana'}


def bank_name(n):
    p = struct.unpack_from('<I', overlay, 0x2134AD4 - BASE + (n - 1) * 4)[0] - BASE
    return overlay[p:overlay.index(b'\0', p)].decode('ascii')


def decode(path, cell_count):
    """NANR 시퀀스: 유지 0틱 프레임은 빼고 반복 시작점을 그만큼 당긴다 (skill-effects.js와 같은 형식)."""
    b = path.read_bytes()
    count, _, seq, frames, cells = struct.unpack_from('<HHIII', b, 24)
    result = []
    for i in range(count):
        n, start, kind, mode, off = struct.unpack_from('<HHIII', b, 24 + seq + i * 16)
        assert kind == 0x10000 and mode in (1, 2)
        values, new_start = [], 0
        for j in range(n):
            element, ticks = struct.unpack_from('<IH', b, 24 + frames + off + j * 8)
            cell = struct.unpack_from('<H', b, 24 + cells + element)[0]
            assert cell < cell_count
            if ticks:
                if j < start:
                    new_start += 1
                values.append([cell, ticks])
        assert values
        result.append({'frames': values, 'loop': mode == 2, 'start': new_start})
    return result


def render(stem, cell):
    """셀 하나를 NCER 원점 기준 경계 상자로 그린다 (extract_title.cells 재사용)."""
    raw = stem.with_suffix('.ncer').read_bytes()
    count, kind, off = struct.unpack_from('<HHI', raw, 24)
    stride = 16 if kind else 8
    start = 24 + off
    n, _, oo = struct.unpack_from('<HHI', raw, start + cell * stride)
    xy = []
    for j in range(n):
        a, b, _ = struct.unpack_from('<HHH', raw, start + stride * count + oo + j * 6)
        if a >> 14 != 3:
            x, y = b & 511, a & 255
            xy.append((x - 512 if x >= 256 else x, y - 256 if y >= 128 else y))
    cap, write = [], art.png
    art.png = lambda _p, w, h, buf: cap.append((w, h, buf))
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            art.cells(stem, {cell: 'unused'})
    finally:
        art.png = write
    w, h, buf = cap[0]
    return {'w': w, 'h': h, 'left': min(x for x, _ in xy), 'top': min(y for _, y in xy)}, buf


records, needed = {}, {}
for number, expected in THROWS.items():
    row = 0xD02CC + number * 104
    assert struct.unpack_from('<I', arm, row + 40)[0] == LOB_SCRIPT, number
    speed = struct.unpack_from('<H', arm, row + 8)[0] / 100
    x, y, percent, flight, finish = struct.unpack_from('<bbHHH', arm, row + 50)
    bid = flight >> 8
    assert finish >> 8 == bid, number
    name = bank_name(bid)
    assert name == f'e003_{expected}00', (number, name)
    key = 't' + str(bid)  # 기존 skill-effects 뱅크 번호와 겹치지 않는 키
    fseq, eseq = (flight & 255) - 1, (finish & 255) - 1
    needed.setdefault(key, (name, set()))[1].update({fseq, eseq})
    records[str(number)] = {'kind': 'lob', 'speed': speed, 'flightOffset': [x, y, percent / 100],
                            'flight': [key, fseq], 'finish': [key, eseq]}

banks, images, hashes = {}, [], {}
for key, (name, seqs) in sorted(needed.items()):
    stem = common / name
    cell_count = struct.unpack_from('<H', stem.with_suffix('.ncer').read_bytes(), 24)[0]
    sequences = decode(stem.with_suffix('.nanr'), cell_count)
    cells = {}
    for cell in sorted({c for s in seqs for c, _ in sequences[s]['frames']}):
        meta, buf = render(stem, cell)
        cells[str(cell)] = meta
        images.append((meta, buf))
    banks[key] = {'name': name, 'sequences': {str(s): sequences[s] for s in sorted(seqs)}, 'cells': cells}
    hashes[name] = {ext: hashlib.sha256(stem.with_suffix(ext).read_bytes()).hexdigest()
                    for ext in ('.ncer', '.ncbr', '.nclr', '.nanr')}

W, x, y, row = 512, 0, 0, 0
for meta, _ in images:
    if x + meta['w'] + 2 > W:
        y, x, row = y + row + 2, 0, 0
    meta['x'], meta['y'] = x, y
    x += meta['w'] + 2
    row = max(row, meta['h'])
H = y + row
pixels = bytearray(W * H * 4)
for meta, buf in images:
    for yy in range(meta['h']):
        d = ((meta['y'] + yy) * W + meta['x']) * 4
        pixels[d:d + meta['w'] * 4] = buf[yy * meta['w'] * 4:(yy + 1) * meta['w'] * 4]
art.png(OUT / 'throw-effects.png', W, H, pixels)
data = {'tickRate': 60, 'image': 'assets/battle/throw-effects.png', 'records': records, 'banks': banks}
(OUT / 'throw-effects.js').write_text('window.BATTLE_THROW_EFFECTS=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8')
audit = {'records': records, 'cells': len(images), 'atlas': [W, H], 'sha256': hashes,
         'arm9': hashlib.sha256(arm).hexdigest(), 'overlay19': hashlib.sha256(overlay).hexdigest()}
(REPO / 'docs/battle-throw-effects-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
print({'records': len(records), 'banks': len(banks), 'cells': len(images), 'atlas': [W, H]})
