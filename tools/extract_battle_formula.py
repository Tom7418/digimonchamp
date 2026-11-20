"""원본 배틀 피해 계산에 쓰는 표를 뽑아 src/data/battle-formula.json으로 만든다.

확인한 원본 코드 (overlay9_19 피해 계산 0x2118218~0x21184EC)
- 공격 기록 표 arm9 0x020D02CC (104바이트): +0x48 TP, +0x4A 위력, +0x50 종류(0 일반·1 필살기·2 지원), +0x58 속성(0 없음, 1 열·2 추위·3 빛·4 어둠·5 천둥)
- 지형 상성 표 overlay19 0x021339DC: [종의 지형 번호(종 표 +72)][배틀 맵 번호] = +1 유리 / -1 불리 (11바이트 줄)
- 작전 표·TP 예산 표 (AI 행동 선택 0x211919C)
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
    base, var = struct.unpack_from('<HH', rec, 0x4C)
    effect = struct.unpack_from('<I', rec, 0x5C)[0]  # 공격: 상태이상 1~13, 지원: 효과 번호
    if power or kind or element:
        records[str(i)] = {'power': power, 'kind': kind, 'element': element, 'time': [base, var], 'effect': effect}
terrain = [list(struct.unpack_from('<11b', ov19, 0x021339DC - OV + r * 11)) for r in range(12)]
crit = list(struct.unpack_from('<4I', ov19, 0x021337C4 - OV))
habitat = [struct.unpack_from('<I', arm9, 0xC0CB0 + i * 132 + 72)[0] for i in range(216)]
# 맞는 쪽 종의 크리티컬 단계: 종 표 +63 바이트 (피해 계산이 대상 배우+0x14 → +0x3B로 읽는다, 0x2118460)
crit_level = [arm9[0xC0CB0 + i * 132 + 63] for i in range(216)]
names = [l.split('|')[0] for l in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines() if l and not l.startswith('#')]
# 작전 표 overlay19 0x021338E8 (작전마다 216분의 누적 경계: 필살기A·필살기B·일반 공격·?·지원·?) — 0 특수, 1 일반, 2 지원
tactics = [list(struct.unpack_from('<6H', ov19, 0x021338E8 - OV + r * 12)) for r in range(3)]
# 작전별 TP 예산 표 overlay19 0x02133954 [작전][단계 0~7] = 최대 TP의 %. 단계 = 배틀 경과 900프레임(15초)마다 +1 (0x2110F90)
budget = [list(struct.unpack_from('<8H', ov19, 0x02133954 - OV + r * 16)) for r in range(3)]
# 상태이상 걸릴 확률 (216분의): 일반 0x02133998, 다운(효과 13) 0x02133994, 8바이트 간격 9칸 [공격 곡선 번호 − 막는 번호 −4~+4]
status_chance = [struct.unpack_from('<i', ov19, 0x02133998 - OV + k * 8)[0] for k in range(9)]
down_chance = [struct.unpack_from('<i', ov19, 0x02133994 - OV + k * 8)[0] for k in range(9)]
status_frames = list(struct.unpack_from('<15H', ov19, 0x0213382C - OV))  # 상태 번호별 지속 프레임
rage_limit = list(struct.unpack_from('<8H', ov19, 0x021337D4 - OV))      # 성격별 분노 게이지 한도
fear_action = list(struct.unpack_from('<6H', ov19, 0x021337A0 - OV))     # 공포 중 행동 표
out = {'records': records, 'statusChance': status_chance, 'downChance': down_chance, 'statusFrames': status_frames,
       'rageLimit': rage_limit, 'fearAction': fear_action, 'tactics': tactics, 'tpBudget': budget, 'terrain': terrain, 'critTable': crit, 'critRoll': 216,
       'habitat': dict(zip(names, habitat)), 'critLevel': dict(zip(names, crit_level))}
(REPO / 'src/data/battle-formula.json').write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print(len(records), 'records')
