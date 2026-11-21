"""배틀 애니메이션 연결의 원본 명령을 검증한다. ROM/문장 본문은 출력하지 않는다.
python tools/check_battle_animation_sources.py <원본 root>
"""
import argparse
import hashlib
import json
import struct
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('root', type=Path)
args = parser.parse_args()
raw = (args.root / 'ftc/overlay9_19').read_bytes()
base = 0x0210e8a0
# 피해0 분기 -> 반응13 -> 방어34, 지원 배우12 ->35, 부활 배우20 ->33.
checks = {
    0x2118910: 0xe3580000, 0x2118914: 0x1a000038,
    0x21189fc: 0xe3a0000d, 0x2118a00: 0xe5870084,
    0x2116b90: 0xe3a01022,
    0x211a6c0: 0xe3a0100c, 0x2116874: 0xe3a01023,
    0x211734c: 0xe3a01021,
    # 반응12의 착지 후 기본15, 상태9이면13, 상태10이면1.
    0x2116e38: 0xe3a0100f, 0x2116e44: 0xe350000c,
    0x2116e50: 0xe3500009, 0x2116e58: 0xe350000a,
    0x2116e64: 0xe3a01001, 0x2116e74: 0xe3a0100d,
}
for address, expected in checks.items():
    actual = struct.unpack_from('<I', raw, address-base)[0]
    assert actual == expected, f'{address:#x}: {actual:#x} != {expected:#x}'
for state, handler in [(12, 0x2116860), (15, 0x2116890), (20, 0x2117314)]:
    assert struct.unpack_from('<2I', raw, 0x212310c-base+state*8) == (handler, 0)
# 준비 셀을 벗어났는지 검사하는 공통 전투 VM: actor -> sprite -> NANR frame index != 0.
arm=(args.root/'ftc/arm9.bin').read_bytes()
for address,expected in {0x20470f0:0xe59fc004,0x20470fc:0x202d7f8,0x202d7f8:0xe590101c,0x202d800:0xe591000c}.items():
 assert struct.unpack_from('<I',arm,address-0x2000000)[0]==expected,hex(address)
assert raw[0x2123f8d-base:0x2123f8d-base+5]==bytes([50,0x90,0x0b,0x12,0x02])
print(json.dumps({'instructionChecks':len(checks), 'dispatchChecks':3,'windupChecks':5,
    'overlay19Sha256': hashlib.sha256(raw).hexdigest()}, indent=2))
