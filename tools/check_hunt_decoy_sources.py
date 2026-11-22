"""미끼 소멸 분기·원본 NANR 대응 검사. 원본 실행 파일은 배포하지 않는다."""
from pathlib import Path
import hashlib
import json
import struct
from extract_animations import decode

repo=Path(__file__).resolve().parents[1]
root=repo.parent
arm=(root/'ftc/arm9.bin').read_bytes()
overlay=(root/'ftc/overlay9_0').read_bytes()
def word(data,base,address):return struct.unpack_from('<I',data,address-base)[0]
checks={0x212afdc:0xe3a00005,0x212b3a0:0xe3a01000,
        0x212b760:0xe3a01001,0x212b6b8:0xe3a01002,
        0x212b774:0xe3a02014,0x212b70c:0xe2422002,
        0x212b744:0x03a00000,0x212b720:0x08bd8038}
for address,expected in checks.items():
    assert word(overlay,0x210e8a0,address)==expected,hex(address)
# ARM9 아이템 분류5는 decoy/decoy2의 20바이트 레코드를 선택한다.
assert word(arm,0x2000000,0x2066198)==0x20c929c
for index,name in enumerate(['decoy','decoy2']):
    pointer=word(arm,0x2000000,0x20c929c+index*20)-0x2000000
    assert arm[pointer:arm.index(b'\0',pointer)].decode()=='e002_hunt_'+name
    seq=decode(root/f'common/e002_hunt_{name}.nanr',5)
    assert seq[1]=={'frames':[[2,15],[3,15]],'loop':False,'start':0}
    assert seq[2]=={'frames':[[4,15]],'loop':False,'start':0}
audit={'source':'overlay9_0 + common/e002_hunt_decoy/decoy2',
       'codeSha256':{'arm9':hashlib.sha256(arm).hexdigest(),'overlay0':hashlib.sha256(overlay).hexdigest()},
       'instructionChecks':{hex(a):hex(w) for a,w in checks.items()},
       'idleSequence':0,'retireSequence':1,'blinkSequence':2,
       'blinkPeriodsTicks':list(range(20,0,-2)),'tickRate':60,
       'policy':'Original removal poses and accelerating blink timing. Web keeps a non-interactive visual copy after the active lure is removed. Movement, attraction, mine damage and replacement rules are unchanged. This does not verify the separate explosion particle composition.'}
(repo/'docs/hunt-decoy-art-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
print('Decoy/EV source dispatch, removal sequences and accelerating blink verified')
