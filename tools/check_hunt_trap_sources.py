"""함정의 원본 레이어·포획 시퀀스·포획 유지 전환을 검사한다."""
from pathlib import Path
import struct,json,hashlib
from extract_animations import decode

repo=Path(__file__).resolve().parents[1];root=repo.parent
arm=(root/'ftc/arm9.bin').read_bytes();ov=(root/'ftc/overlay9_0').read_bytes()
def word(data,base,address):return struct.unpack_from('<I',data,address-base)[0]
checks={0x2128c04:0xe3a00002,0x2128bf8:0x03a00004,0x2128c40:0xe3a05009,
        0x2129148:0xe3a01001,0x2129154:0xe3a01002,
        0x2129168:0xe3a01001,0x2129174:0xe3a01002,0x2129184:0xe3a01003,0x2129194:0xe3a01007,
        0x21290f8:0x05910150,0x2129108:0xe3a01004,
        0x2128fc4:0xe2800902,0x2128fe8:0xe2800801,0x2129008:0xe2400801,0x2129028:0xe2800902}
for address,expected in checks.items():assert word(ov,0x210e8a0,address)==expected,hex(address)
assert word(arm,0x2000000,0x20661a8)==0x20c91b8
states={}
for i,name in enumerate(['digicach','digiprison']):
    pointer=word(arm,0x2000000,0x20c91b8+i*16)-0x2000000
    assert arm[pointer:arm.index(b'\0',pointer)].decode()=='e002_hunt_'+name
    sequences=decode(root/f'common/e002_hunt_{name}.nanr',100)
    chosen=[1,2,4] if i==0 else [1,2,3,7]
    states[name]={str(n):sequences[n] for n in chosen}
assert states['digicach']['4']['loop']
assert sum(t for _,t in states['digicach']['2']['frames'])==31
audit={'source':'overlay9_0 + common/e002_hunt_digicach/digiprison',
       'codeSha256':{'arm9':hashlib.sha256(arm).hexdigest(),'overlay0':hashlib.sha256(ov).hexdigest()},
       'instructionChecks':{hex(a):hex(w) for a,w in checks.items()},
       'captureLayers':{'digicach':[1,2],'digiprison':[1,2,3,7]},
       'heldTransition':{'digicach':'Auxiliary sequence2 completion -> sequence4 loop; base sequence1 holds its last cell.',
                         'digiprison':'All four capture sequences hold their last cell; no return to idle until reset.'},
       'states':states,
       'webPolicy':'Original pixels, per-cell timing and sequence selection retained. NDS depth offsets are projected into back/front passes around the held Digimon: catch 1/back + 2-or-4/front; prison 1,3/back + 7,2/front. Fixed source size and common source origin retained; not a full NDS 3D projection. Capture/lure/movement rules and held positions are unchanged.'}
(repo/'docs/hunt-trap-art-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
print('Trap resources, layer counts, capture sequences and held transition verified')
