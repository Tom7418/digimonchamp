"""원본 자력 기상 분기·확률표를 검증한다. 실행 파일은 출력하지 않는다."""
import hashlib
import json
import struct
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
raw = (repo.parent / 'ftc/overlay9_19').read_bytes()
arm = (repo.parent / 'ftc/arm9.bin').read_bytes()
base = 0x210e8a0
checks = {
    0x2117104: 0xe2811001,  # 최종 전투 불능 수+1과 팀 정원 비교
    0x211710c: 0xaa000011,  # 마지막이면21(전투 불능 확정)
    0x2117138: 0xe3a010d8,
    0x211714c: 0xe3a01013,  # 기상 대기19
    0x2117268: 0xe2422001,  # 남은 시도 감소
    0x2117270: 0xe3a010d8,
    0x2117288: 0xe3a01014,  # 성공20
    0x211734c: 0xe3a01021,  # 기상 NANR33
    0x21173c0: 0xe350001d,  # 부활β29
    0x21173dc: 0xe3a0001e,  # HP30%
    0x2117a38: 0xe3a00002,  # 시도 초기2
    0x2117cd0: 0xe1530002,  # cost < TP (같으면 미소유 취급)
    0x2117cd4: 0xb8bd8010,
}
for address, expected in checks.items():
    actual = struct.unpack_from('<I', raw, address-base)[0]
    assert actual == expected, f'{address:#x}: {actual:#x} != {expected:#x}'
for address, expected in {0x20427c0:0xe1500004,0x20427c4:0xb3a00001}.items():
    assert struct.unpack_from('<I', arm, address-0x2000000)[0] == expected
tables = {name:list(struct.unpack_from('<3I', raw, address-base)) for name,address in {
    'entryWithoutSp':0x21337fc,'riseWithoutSp':0x2133808,
    'entryWithSp':0x2133814,'riseWithSp':0x2133820}.items()}
assert tables == {'entryWithoutSp':[0,0,50],'riseWithoutSp':[0,0,40],
                  'entryWithSp':[0,50,103],'riseWithSp':[0,45,90]}
assert struct.unpack_from('<I',raw,0x2117308-base)[0] == 310
audit = {'overlay19Sha256':hashlib.sha256(raw).hexdigest(),
         'arm9Sha256':hashlib.sha256(arm).hexdigest(),
         'instructionChecks':len(checks)+2,'tables':tables,'denominator':216,
         'waitFrames':310,'initialTries':2,'animation':33,
         'hpPercent':{'none':5,'alpha':5,'beta':30},
         'evidence':{'entry':'0x02117088..0x02117164','waiting':'0x02117174..0x021172fc',
                     'rise':'0x02117314..0x021174c0','skillTp':'0x02117c94..0x02117cec'},
         'webPolicy':['0.1-second simulation rounds wait upward to the next tick',
                      'existing 2-second action cooldown retained',
                      'native airborne transforms/shaking during waiting not ported',
                      'last active ally falling ends battle; pending units remain HP0']}
(repo/'docs/battle-revival-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'instructionChecks':len(checks)+2,'tables':tables,'waitFrames':310}))
