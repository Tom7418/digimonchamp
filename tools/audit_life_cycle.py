"""수면 상태의 표 참조를 재검증한다. 원본 바이너리나 디스어셈블은 출력하지 않는다.

사용: python tools/audit_life_cycle.py <원본 root>
"""
import hashlib
import json
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent
overlay = (ROOT / 'ftc/overlay9_18').read_bytes()
arm9 = (ROOT / 'ftc/arm9.bin').read_bytes()
BASE = 0x0210e8a0
checks = {
    0x021147c8: 0xe59f26a0,  # species pointer literal
    0x021147d0: 0xe3a00084,  # record stride
    0x021147d4: 0xe0202091,
    0x021147d8: 0xe5870118,  # actor species pointer
    0x0211b890: 0xe3a0100d,  # sleep sequence13
    0x0211b894: 0xebffe84a,  # actor sequence setter
    0x0211b8b8: 0xe1d152b4,  # sleep min
    0x0211b8bc: 0xe1d112b6,  # sleep max
    0x0211b8c0: 0xe0411005,  # range width
    0x0211b8d0: 0xe5810178,  # duration target
    0x0211b98c: 0xe1d152b0,  # awake min after waking
    0x0211b990: 0xe1d112b2,  # awake max
    0x0211b994: 0xe0411005,
    0x0211b9a8: 0xe5812178,
}
for address, expected in checks.items():
    assert struct.unpack_from('<I', overlay, address - BASE)[0] == expected, hex(address)
pointer = struct.unpack_from('<I', overlay, 0x02114e70 - BASE)[0]
# 종 번호 앞에 디지에그8개가 있고 표 포인터는 추출기 레코드의 +4를 가리킨다.
assert pointer + 8 * 132 == 0x020c0cb4
count = 0
for line in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines():
    if line.startswith('#') or not line:
        continue
    fields = line.split('|')
    raw = struct.unpack_from('<4H', arm9, 0xc0cb0 + count * 132 + 36)
    assert list(raw) == [int(n) for f in fields[9:11] for n in f.split(',')], fields[0]
    assert 0 < raw[0] <= raw[1] and 0 < raw[2] <= raw[3]
    count += 1
assert count == 216
report = {
    'species': count, 'instructionChecks': len(checks),
    'sha256': {'arm9': hashlib.sha256(arm9).hexdigest(), 'overlay18': hashlib.sha256(overlay).hexdigest()},
    'verified': {'sleepSequence': 13, 'recordOffsetAwake': [36, 38], 'recordOffsetSleep': [40, 42],
                 'sleepEntry': '0x0211b888', 'wakeExit': '0x0211b8fc', 'actorSpeciesPointerOffset': 4},
    'webPolicy': '게임 분 단위 진행. 야간 일괄 수면 유지, 다음 아침 새 각성 주기. 배고픔·훈련·이동 정지와 피로 회복량은 웹판 정책.',
    'unconfirmed': ['training aptitude14 values', 'original timer cadence and interruption penalties'],
}
(REPO / 'docs/life-cycle-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{count} species, {len(checks)} instructions verified')
