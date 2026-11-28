"""야생 디지몬 발소리 종류(무거운 발소리 여부)를 원본 NCER 셀 경계에서 뽑는다.

원본 근거 (overlay9_0, 사냥):
- 0x0210EEC4: 야생 생성 때 동작 0번을 걸고(0x02046D98), 현재 셀 경계로
  +0x508 = 높이(0x0204722C: yMax-yMin) * ((너비 0x02047260: xMax-xMin) >> 1) * 2 를 저장한다.
- 0x02111790: 발소리 때 +0x508 > 0x400 이면 DIGI_SE_107M(무거운 발소리), 아니면 DIGI_SE_036_3.
셀 경계는 NCER 셀 속성(16바이트형) +8 xMax, +10 yMax, +12 xMin, +14 yMin (s16).
동작 0번 첫 프레임의 셀 번호는 web/assets/animations.js(원본 NANR 변환)에서 읽는다.

사용: python tools/extract_hunt_footsteps.py [원본 루트(기본: 저장소의 상위 폴더)]
결과: web/assets/hunt/footsteps.js (window.HUNT_FOOTSTEP_AREA = { 스프라이트 id: 넓이 })
"""
import json, struct, sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else PROJECT.parent
HEAVY_AREA = 0x400


def cell_bounds(ncer, cell):
    count, kind, offset, _ = struct.unpack_from('<HHII', ncer, 24)
    if not kind:
        raise ValueError('셀 경계가 없는 NCER')
    if cell >= count:
        raise ValueError('셀 번호가 범위를 넘음')
    return struct.unpack_from('<4h', ncer, 24 + offset + cell * 16 + 8)


def main():
    sprites = json.loads((PROJECT / 'web/assets/sprites.json').read_text(encoding='utf-8'))
    src = (PROJECT / 'web/assets/animations.js').read_text(encoding='utf-8')
    anims, _ = json.JSONDecoder().raw_decode(src[src.index('{'):])
    area = {}
    for sp in sprites:
        if sp['id'].endswith('_digitama'):
            continue
        bank = anims['banks'][anims['sprites'][sp['id']]]
        cell = bank[0]['frames'][0][0]
        x_max, y_max, x_min, y_min = cell_bounds((ROOT / (sp['source'] + '.ncer')).read_bytes(), cell)
        area[sp['id']] = (y_max - y_min) * (((x_max - x_min) >> 1) * 2)
    out = PROJECT / 'web/assets/hunt/footsteps.js'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("'use strict';\n"
                   '// tools/extract_hunt_footsteps.py가 만든다. 야생 생성 때 원본이 저장하는 셀 넓이(+0x508).\n'
                   f'// {HEAVY_AREA}(0x400)를 넘으면 무거운 발소리 DIGI_SE_107M (overlay9_0 0x02111790)\n'
                   'window.HUNT_FOOTSTEP_AREA = ' + json.dumps(area, separators=(',', ':')) + ';\n', encoding='utf-8')
    heavy = sum(v > HEAVY_AREA for v in area.values())
    print(f'{len(area)}종, 무거운 발소리 {heavy}종')


if __name__ == '__main__':
    main()
