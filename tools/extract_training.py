"""원본 시설의 훈련 결과표·계절 보정·난수 폭·능력치 한계 곡선을 추출한다.

python tools/extract_training.py <원본 root>
실행 코드/원문은 출력하지 않는다. 주소 근거는 docs/design.md 참조.
"""
import hashlib
import json
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent
arm = (ROOT / 'ftc/arm9.bin').read_bytes()
farm = (ROOT / 'ftc/overlay9_18').read_bytes()
hunt = (ROOT / 'ftc/overlay9_0').read_bytes()
BASE = 0x0210e8a0
def word(data, addr):
    return struct.unpack_from('<I', data, addr - BASE)[0]
def branch(data, addr):
    value = word(data, addr) & 0xffffff
    if value & 0x800000:
        value -= 0x1000000
    return addr + 8 + value * 4
def ints(pointer, count):
    return list(struct.unpack_from(f'<{count}i', arm, pointer - 0x02000000))

# 훈련 완료가 시설 결과표를 얻고 각 (항목, 증감) 쌍을 실제 변경 함수에 전달한다.
assert branch(farm, 0x0211d7dc) == 0x02117274
assert word(farm, 0x021177c0) == 0xa2851005  # HP: +5 후 10 단위 반올림
assert word(farm, 0x021179e4) == 0xe5834064  # 방어 저장
# 적성 후보14개는 사냥에서 읽는다. 종 포인터는 레코드+4 → +0x70 == +116.
assert word(hunt, 0x0211267c) == 0xe5d03070
assert word(hunt, 0x02112688) == 0xe5d03072

facilities = {}
for i in range(37):
    resource = struct.unpack_from('<I', arm, 0xc81e0 + i * 40)[0] - 0x02000000
    name = arm[resource:arm.index(b'\0', resource)].decode('ascii')
    no = int(name.split('cm')[1].split('_')[0])
    pointers = struct.unpack_from('<4I', arm, 0xc87a4 + i * 16)
    outcomes = []
    for pointer in pointers[:3]:
        probability, count = ints(pointer, 2)
        assert 0 <= probability <= 100 and 0 <= count <= 22
        pairs = ints(pointer + 8, count * 2)
        changes = [pairs[j:j+2] for j in range(0, len(pairs), 2)]
        assert all(0 <= key <= 21 for key, _ in changes)
        outcomes.append({'weight': probability, 'changes': changes})
    assert sum(o['weight'] for o in outcomes) <= 100
    facilities[str(no)] = outcomes

def array_at_literal(address):
    return ints(word(farm, address), 22)
curves = [list(struct.unpack_from('<6H', arm, 0xc9528 + i * 16)) for i in range(25)]
for i in range(216):
    rec = arm[0xc0cb0 + i * 132:0xc0cb0 + (i + 1) * 132]
    assert all(0 <= index <= 24 for index in [*struct.unpack_from('<4H', rec, 52), *rec[60:62]])
out = {'facilities': facilities, 'summerAdd': array_at_literal(0x02117bc4),
       'winterAdd': array_at_literal(0x02117bc8), 'variance': array_at_literal(0x02117bd4),
       'curves': curves, 'rebirthBonus': list(arm[0x9ee7c:0x9ee7c + 20])}
(REPO / 'src/data/training.json').write_text(json.dumps(out, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
audit = {'facilityCount': len(facilities), 'curveCount': len(curves),
         'hashes': {name: hashlib.sha256(data).hexdigest() for name, data in [('arm9', arm), ('overlay18', farm), ('overlay0', hunt)]},
         'verified': {'resultTable': '0x020c87a4', 'curveTable': '0x020c9528', 'applyEffect': '0x02117274',
                      'huntResponseSelector': '0x02112618', 'huntResponseRecordBytes': [116, 129]},
         'limits': ['능력치 단위는 원본 곡선으로 이전. 이전값 별도 보존; 상세는 stats-code-audit.json',
                    'AP 0~99·내성 0~310은 웹 정책; 원작 AP 최종 정규화는 미확인',
                    '시설 모드1/2 배수·부가 생활 효과·표에 없는33/36/38 시설은 별도 후속']}
(REPO / 'docs/training-code-audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{len(facilities)} facility outcome tables, {len(curves)} stat curves')
