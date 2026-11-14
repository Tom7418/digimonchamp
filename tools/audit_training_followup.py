"""훈련 배수·부가 명령 표의 확인 범위를 재현한다. 원본 코드/원문은 출력하지 않는다.
사용: python tools/audit_training_followup.py <원본 root>
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
BASE = 0x0210e8a0

def word(data, address, base):
    return struct.unpack_from('<I', data, address-base)[0]

def branch(address):
    op = word(farm, address, BASE)
    assert op >> 24 == 0xeb
    n = op & 0xffffff
    return address + 8 + (n-0x1000000 if n & 0x800000 else n)*4

assert word(arm, 0x0204f6b8, 0x02000000) == 0xe5c01061
assert word(arm, 0x0204f6c0, 0x02000000) == 0xe5d00061
assert branch(0x021172dc) == 0x0204f6c0
assert branch(0x02117c6c) == 0x0204f6c0
assert word(farm, 0x021172e0, BASE) == 0xe3500001
assert word(farm, 0x021172fc, BASE) == 0xe3500002
# 계절 보정 뒤, 난수 보정 전에22개 항목에 같은 배수를 적용한다.
multipliers = []
for literal, factor in [(0x02117bcc, 2), (0x02117bd0, 3)]:
    pointer = word(farm, literal, BASE)
    values = list(struct.unpack_from('<22i', arm, pointer-0x02000000))
    assert values == [factor]*22
    multipliers.append({'mode':factor-1,'factor':factor,'tableAddress':hex(pointer)})

supplementary = {}
for i in range(37):
    resource = word(arm, 0x020c81e0+i*40, 0x02000000)-0x02000000
    name = arm[resource:arm.index(b'\0', resource)].decode('ascii')
    no = int(name.split('cm')[1].split('_')[0])
    pointer = word(arm, 0x020c87a4+i*16+12, 0x02000000)
    count = word(arm, pointer, 0x02000000)
    assert count <= 16
    pos = pointer+4
    commands = []
    for _ in range(count):
        command = word(arm, pos, 0x02000000)
        assert command <= 6
        # 명령6은4워드, 나머지는2워드. 인자의 뜻은 미확정이므로 수치로만 보관한다.
        width = 4 if command == 6 else 2
        values = list(struct.unpack_from(f'<{width}i', arm, pos-0x02000000))
        commands.append({'command':values[0],'args':values[1:]})
        pos += width*4
    supplementary[str(no)] = commands

report = {
    'hashes':{'arm9':hashlib.sha256(arm).hexdigest(),'overlay18':hashlib.sha256(farm).hexdigest()},
    'modeField':'facility+0x61', 'multipliers':multipliers,
    'supplementaryTable':'0x020c87a4+12 (16-byte records)',
    'supplementary':supplementary,
    'limits':[
        '모드 필드의 실제 변경 조건/화면 대응은 미확인: 배수를 게임에 적용하지 않음',
        '부가 명령6은4워드, 나머지0~5는2워드임을 확인. 인자의 의미와 시간 단위는 미확정',
        'AP 11개 항목의 훈련 경로는 단순 가산. 전체 게임의 최종 정규화/상한은 별도 추적 필요',
        '웹판 AP 0~99·내성0~310 정책은 유지. 원작으로 확정하지 않음'
    ]
}
(REPO/'docs/training-followup-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'{len(supplementary)} supplementary tables; modes1/2 factors2/3 verified; AP normalization unresolved')
