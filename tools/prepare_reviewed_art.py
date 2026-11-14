"""이미지 생성으로 확인한 소재를 게임용 크기/형식으로 정리한다.
python tools/prepare_reviewed_art.py --inputs <local JSON> | --check
입력 JSON: {clinic: <generated PNG path>, battle: {<map ID>: <generated PNG path>}}
원본은 보존. 배경은 지정한 캡슐 주변만 합성하고 나머지 픽셀은 유지한다.
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[1]
try:
    from PIL import Image, ImageChops, ImageDraw
except ImportError:
    sys.path.insert(0, str(REPO / '.analysis-deps'))
    from PIL import Image, ImageChops, ImageDraw

# 캡슐과 받침/그림자가 있는 작은 영역. 섬/사이버에는 캡슐이 없어 원본을 그대로 쓴다.
BOXES = [(12, 50, 36, 81), (196, 23, 221, 55), (380, 50, 405, 81),
         (12, 241, 36, 272), (380, 241, 405, 272)]
EDITED = {0, 1, 2, 4, 5, 7, 8, 9, 10}
sha = lambda data: hashlib.sha256(data).hexdigest()

def mask():
    im = Image.new('L', (416, 272)); d = ImageDraw.Draw(im)
    for x0, y0, x1, y1 in BOXES:
        d.rectangle((x0, y0, x1-1, y1-1), fill=255)
    return im

def run(inputs=None):
    folder = REPO / 'web/assets/battle/maps'
    target = folder / 'clean'
    if inputs: target.mkdir(exist_ok=True)
    report = {'policy': 'AI-edited capsule footprints only; all pixels outside boxes preserved. Originals retained.',
              'boxes': BOXES, 'maps': {}}
    for i in range(11):
        original = Image.open(folder / f'{i}.png').convert('RGB')
        png, webp = target / f'{i}.png', target / f'{i}.webp'
        if inputs:
            if i in EDITED:
                edited = Image.open(inputs['battle'][str(i)]).convert('RGB').resize((416, 272), Image.Resampling.LANCZOS)
                output = Image.composite(edited, original, mask())
            else: output = original
            output.save(png, optimize=True)
            output.save(webp, lossless=True, method=6)
        output = Image.open(png).convert('RGB')
        assert output.size == (416, 272)
        assert ImageChops.multiply(ImageChops.difference(original, output), ImageChops.invert(mask()).convert('RGB')).getbbox() is None
        if i not in EDITED: assert output.tobytes() == original.tobytes()
        assert Image.open(webp).convert('RGB').tobytes() == output.tobytes()
        report['maps'][str(i)] = {'edited': i in EDITED, 'pngSha256': sha(png.read_bytes()),
                                'webpSha256': sha(webp.read_bytes()), 'rgbSha256': sha(output.tobytes())}
    clinic = REPO / 'web/assets/facilities/clinic-polished.png'
    if inputs:
        im = Image.open(inputs['clinic']).convert('RGBA').resize((416, 480), Image.Resampling.LANCZOS)
        im.save(clinic, optimize=True)
    im = Image.open(clinic)
    assert im.size == (416, 480) and im.mode == 'RGBA'
    assert all(im.getpixel(p)[3] == 0 for p in [(0, 0), (415, 0), (0, 479), (415, 479)])
    report['clinic'] = {'pngSha256': sha(clinic.read_bytes()), 'size': [416, 480],
                        'policy': 'AI-polished original-inspired fan-game artwork; not an original ROM sprite.'}
    path = REPO / 'docs/art-refresh.json'
    text = json.dumps(report, indent=2) + '\n'
    if inputs: path.write_text(text, encoding='utf-8')
    else: assert path.read_text(encoding='utf-8') == text
    print('11 backgrounds verified; original pixels outside capsule footprints retained; clinic alpha verified.')

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--inputs', type=Path)
    p.add_argument('--check', action='store_true')
    args = p.parse_args()
    assert bool(args.inputs) != args.check, 'Choose --inputs or --check'
    run(json.loads(args.inputs.read_text(encoding='utf-8-sig')) if args.inputs else None)
