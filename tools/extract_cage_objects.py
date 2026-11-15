"""시설 바닥 + 별도 OBJ를 OPM 배치/NANR 첫 셀로 합친 참고 PNG를 만든다.
python tools/extract_cage_objects.py <원본 root> [--check]
원본은 읽기만 하며, 원본 파일 대신 합성 PNG와 근거/해시만 저장한다.
"""
import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
import extract_sprites as decoder
from extract_animations import decode

REPO = Path(__file__).resolve().parents[1]
try:
    from PIL import Image
except ImportError:
    sys.path.insert(0, str(REPO / '.analysis-deps'))
    from PIL import Image

def original(root, n):
    stem = f'field_cm{n:02}_01'
    base = root / 'training' / (stem + '_obj')
    decoder.ROOT = root
    decoder.OUT = REPO / '.analysis-deps/cage-original-objects'
    decoder.OUT.mkdir(parents=True, exist_ok=True)
    meta = decoder.extract(stem + '_obj', 'training', '')
    c = base.with_suffix('.ncer').read_bytes()
    count, kind, offset, mapping = struct.unpack_from('<HHII', c, 24)
    stride = 16 if kind else 8
    bank, oams = 24 + offset, 24 + offset + count * stride
    origins = []
    for i in range(count):
        size, _, off = struct.unpack_from('<HHI', c, bank + i * stride)
        for j in range(size):
            a, b, d = struct.unpack_from('<HHH', c, oams + off + j * 6)
            if a >> 14 == 3: continue
            x, y = b & 511, a & 255
            origins.append((x - (512 if x >= 256 else 0), y - (256 if y >= 128 else 0)))
    left, top = min(p[0] for p in origins), min(p[1] for p in origins)
    sequences = decode(base.with_suffix('.nanr'), count)
    sheet = Image.open(decoder.OUT / (stem + '_obj.png')).convert('RGBA')
    opm = (root / 'training' / (stem + '.opm')).read_bytes()
    assert opm[:4] == b'OPMD'
    start = (9 + opm[8] + 3) & ~3
    number = struct.unpack_from('<I', opm, start)[0]
    assert len(opm) == start + 4 + number * 16
    objects, records = [], []
    for i in range(number):
        flags, x, y, z, scale, rotation = struct.unpack_from('<Hhhhff', opm, start + 4 + i * 16)
        seq = flags & 0x3fff
        assert seq < len(sequences) and scale == 1 and rotation == 0
        cell = sequences[seq]['frames'][0][0]
        image = sheet.crop((cell * meta['width'], 0, (cell + 1) * meta['width'], meta['height']))
        if flags & 0x4000: image = image.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        if flags & 0x8000: image = image.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
        objects.append((x + left, y + top, y, image))
        records.append(dict(sequence=seq, firstCell=cell, x=x, y=y, z=z, flags=flags))
    floor = Image.open(REPO / f'web/assets/facilities/cm{n:02}.png').convert('RGBA')
    bounds = (min([0] + [o[0] for o in objects]), min([0] + [o[1] for o in objects]),
              max([floor.width] + [o[0] + o[3].width for o in objects]),
              max([floor.height] + [o[1] + o[3].height for o in objects]))
    im = Image.new('RGBA', (bounds[2] - bounds[0], bounds[3] - bounds[1]))
    im.alpha_composite(floor, (-bounds[0], -bounds[1]))
    for x, y, depth, image in sorted(objects, key=lambda o: o[2]):
        im.alpha_composite(image, (x - bounds[0], y - bounds[1]))
    hashes = {}
    for p in [base.with_suffix(ext) for ext in ['.ncbr', '.ncer', '.nclr', '.nanr']] + [root / 'training' / (stem + '.opm')]:
        hashes[p.name] = hashlib.sha256(p.read_bytes()).hexdigest()
    return im, dict(objects=records, bounds=bounds, sourceHashes=hashes)

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('root', type=Path); p.add_argument('--check', action='store_true'); args = p.parse_args()
    out = REPO / 'web/assets/facilities/original'; out.mkdir(exist_ok=True)
    report = {'method': 'OPMD positions; NANR first cell; y-depth sorted; flip flags inferred; static design reference, not original runtime animation.', 'facilities': {}}
    for n in [i for i in range(1, 41) if i not in (28, 29)]:
        im, record = original(args.root, n)
        path = out / f'cm{n:02}-complete.png'
        record['rgbaSha256'] = hashlib.sha256(im.tobytes()).hexdigest()
        if args.check:
            existing = Image.open(path).convert('RGBA')
            assert existing.size == im.size and existing.tobytes() == im.tobytes(), path
        else: im.save(path, optimize=True)
        record['pngSha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        report['facilities'][f'cm{n:02}'] = record
    path = REPO / 'docs/cage-object-audit.json'
    text = json.dumps(report, indent=2) + '\n'
    if args.check: assert path.read_text(encoding='utf-8') == text
    else: path.write_text(text, encoding='utf-8')
    print('38 original facility floors + OPM objects composed and verified.')
