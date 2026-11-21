"""원본 필살기 속도선 시퀀스2 변환. 원본 바이너리는 배포하지 않는다."""
import json,struct,hashlib
from pathlib import Path
import extract_sprites as sprites
from extract_animations import decode
repo=Path(__file__).resolve().parents[1]
ov=(sprites.ROOT/'ftc/overlay9_19').read_bytes();base=0x210e8a0
for a,w in {0x211ed10:0x503,0x211ec18:0xe3a01002,0x211ec9c:0xe2899002,0x211eca0:0xe28aa080}.items():
 assert struct.unpack_from('<I',ov,a-base)[0]==w,hex(a)
table=struct.unpack_from('<I',ov,0x211dbcc-base)[0];ptr=struct.unpack_from('<I',ov,table-base+16)[0]
assert ov[ptr-base:ptr-base+17].split(b'\0')[0]==b'e003_specialtime'
capture=[];write=sprites.png
sprites.png=lambda p,w,h,b:capture.append((w,h,b))
try:meta=sprites.extract('e003_specialtime','common','')
finally:sprites.png=write
w,h,pixels=capture[0];write(repo/'web/assets/battle/speedlines.png',w,h,pixels)
seq=decode(sprites.ROOT/'common/e003_specialtime.nanr',meta['frames'])[2]
assert seq['frames']==[[2,2]]
data={'width':meta['width'],'height':meta['height'],'cell':2,'scale':2,'spacing':128,'wrap':384,'bands':4,'tickRate':60}
(repo/'web/assets/battle/speedlines.js').write_text('window.BATTLE_SPEEDLINE_DATA='+json.dumps(data)+';\n',encoding='utf-8')
print('Verified bank5 e003_specialtime, sequence2; 24 sprites, scale2')

