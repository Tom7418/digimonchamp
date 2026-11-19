"""원본 배틀 피해 계산에 쓰는 표를 뽑아 src/data/battle-formula.json으로 만든다.

확인한 원본 코드 (overlay9_19 피해 계산 0x2118218~0x21184EC)
- 공격 기록 표 arm9 0x020D02CC (104바이트): +0x48 TP, +0x4A 위력, +0x50 종류(0 일반·1 필살기·2 지원), +0x58 속성(0 없음, 1 열·2 추위·3 빛·4 어둠·5 천둥)
- 지형 상성 표 overlay19 0x021339DC: [종의 지형 번호(종 표 +72)][배틀 맵 번호] = +1 유리 / -1 불리 (11바이트 줄)
- 크리티컬 확률 표 overlay19 0x021337C4: 단계 0~3 → 216분의 2·3·5·7

사용: python tools/extract_battle_formula.py [root 폴더]
"""
import json
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
arm9 = (ROOT / 'ftc/arm9.bin').read_bytes()
ov19 = (ROOT / 'ftc/overlay9_19').read_bytes()
OV = 0x0210E8A0

records = {}
for i in range(600):
    rec = arm9[0xD02CC + i * 104: 0xD02CC + (i + 1) * 104]
    if len(rec) < 104:
        break
    power = struct.unpack_from('<H', rec, 0x4A)[0]
    kind = struct.unpack_from('<I', rec, 0x50)[0]
    element = struct.unpack_from('<I', rec, 0x58)[0]
    if power or kind or element:
        records[str(i)] = {'power': power, 'kind': kind, 'element': element}
terrain = [list(struct.unpack_from('<11b', ov19, 0x021339DC - OV + r * 11)) for r in range(12)]
crit = list(struct.unpack_from('<4I', ov19, 0x021337C4 - OV))
habitat = [struct.unpack_from('<I', arm9, 0xC0CB0 + i * 132 + 72)[0] for i in range(216)]
names = [l.split('|')[0] for l in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines() if l and not l.startswith('#')]
out = {'records': records, 'terrain': terrain, 'critTable': crit, 'critRoll': 216,
       'habitat': dict(zip(names, habitat))}
(REPO / 'src/data/battle-formula.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(len(records), 'records')
