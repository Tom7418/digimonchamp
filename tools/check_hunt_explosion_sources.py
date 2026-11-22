"""폭탄·마인의 원본 입자 선택/풀/간격 검사. 실행 파일은 배포하지 않는다."""
from pathlib import Path
import struct,json,hashlib
from extract_animations import decode

repo=Path(__file__).resolve().parents[1];root=repo.parent
arm=(root/'ftc/arm9.bin').read_bytes();ov=(root/'ftc/overlay9_0').read_bytes()
def word(data,base,address):return struct.unpack_from('<I',data,address-base)[0]
checks={0x21252b0:0xe3a04002,0x21252e0:0xe3a0b003,0x2125420:0xe3a0b004,
        0x212540c:0xe3580005,0x2125520:0xe3580003,
        0x2124bd4:0xe3a02005,0x2124c48:0xe3a03003,
        0x2124e50:0xe355000a,0x2124e48:0xea000003,0x2124f1c:0xe3500028,
        0x2124af4:0xe3500003,0x2124b00:0xe58420e8,
        0x21250ac:0xe3a00001,0x2128130:0xe3a02005,0x21281a4:0xe3a03003}
for address,expected in checks.items():assert word(ov,0x210e8a0,address)==expected,hex(address)
assert word(arm,0x2000000,0x20661a0)==0x20c9228
assert word(arm,0x2000000,0x20661a4)==0x20c93f0
resources=[]
for table,count in [(0x20c9228,4),(0x20c93f0,2)]:
    for i in range(count):
        offset=table-0x2000000+i*20
        p=struct.unpack_from('<I',arm,offset)[0]-0x2000000
        name=arm[p:arm.index(b'\0',p)].decode();resources.append(name)
        seq=decode(root/f'common/{name}.nanr',100)
        for n in [2,3,4]:assert sum(t for _,t in seq[n]['frames'])==36 and not seq[n]['loop']
        if name.endswith('bom_flash'):assert arm[offset+7]==3
audit={'source':'overlay9_0 bomb/mine managers + common/e002_hunt_*',
       'codeSha256':{'arm9':hashlib.sha256(arm).hexdigest(),'overlay0':hashlib.sha256(ov).hexdigest()},
       'instructionChecks':{hex(a):hex(w) for a,w in checks.items()},'resources':resources,
       'sequences':{'smoke':2,'flame':3,'sparks':4},'tickRate':60,
       'nativePools':{'flame':5,'sparks':3,'smokeAllocated':20,'smokeInitialBurst':10},
       'spawnIntervalsTicks':{'flame':5,'sparks':3,'smoke':1},'spawnWindowTicks':40,
       'flash':'Bomb table byte7=3 disables the flame/smoke layers and follows brightness call 0x02042d44.',
       'webPolicy':'Visual burst starts at the existing blast event; preparatory NDS actor phases and damage timing are not moved. Pools are scheduled on 60Hz boundaries using NANR lifetimes. Signed 16..31 offsets retained; smoke directions use a web radial projection instead of NDS fixed-point trigonometry. Flash is limited to hunt canvas, opacity 0.55 over 0.45s; strength/easing are web presentation values. No damage/range/status rule changes.'}
(repo/'docs/hunt-explosion-art-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
print('Bomb/mine source sequences, pools, spawn intervals and flash branch verified')
