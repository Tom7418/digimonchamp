"""원본 공통 배틀 상태 효과의 NCER 픽셀/NANR 유지 시간을 변환한다.
원본 상태 번호는 overlay19, 그림 역할은 해당 원본 셀을 대조했다.
네이티브 상태→효과 디스패치 전체 이식은 아니며 웹 배치 정책은 별도로 기록한다.
"""
from pathlib import Path
import struct,json,hashlib
import extract_title as art
from extract_animations import decode
R=Path(__file__).resolve().parents[1];base=R.parent/'common/e003_battle';out=R/'web/assets/battle'
sequences=decode(base.with_suffix('.nanr'),143)
roles={1:('anger',27,'head'),5:('confusion',6,'head'),7:('poison',23,'body'),8:('ice',22,'body'),9:('sleep',4,'head'),10:('paralysis',2,'body'),13:('curse',26,'head')}
# 원본에서 상태 번호를 설정하는 명령을 검사한다. 시각 효과의 화면 배치는 웹판이다.
raw=(R.parent/'ftc/overlay9_19').read_bytes();origin=0x210e8a0
checks={0x2118be4:0xe3a01005,0x2118bf4:0xe3a01007,0x2118c08:0xe3a0100a,0x2118c20:0xe3a01009,0x2118c48:0xe3a01008,0x2118c80:0xe3a0100d,0x2118ca0:0xe3a01001}
for address,value in checks.items():assert struct.unpack_from('<I',raw,address-origin)[0]==value,hex(address)
used=sorted({cell for _,seq,_ in roles.values() for cell,ticks in sequences[seq]['frames']})
images={};write=art.png;art.png=lambda p,w,h,b:images.update({int(p.stem):(w,h,b)})
try:art.cells(base,{cell:str(cell) for cell in used})
finally:art.png=write
c=base.with_suffix('.ncer').read_bytes();count,kind,offset=struct.unpack_from('<HHI',c,24);stride=16 if kind else 8;bank=24+offset;oams=bank+count*stride
W,H=256,128;pixels=bytearray(W*H*4);cells={}
for i,cell in enumerate(used):
 n,_,off=struct.unpack_from('<HHI',c,bank+cell*stride);xy=[]
 for j in range(n):
  a,b,d=struct.unpack_from('<HHH',c,oams+off+j*6);x=b&511;y=a&255;xy.append((x-512 if x>=256 else x,y-256 if y>=128 else y))
 w,h,rgba=images[cell];assert w<=32 and h<=32;x=i%8*32;y=i//8*32
 for row in range(h):
  dst=((y+row)*W+x)*4;pixels[dst:dst+w*4]=rgba[row*w*4:(row+1)*w*4]
 cells[cell]={'x':x,'y':y,'w':w,'h':h,'left':min(a for a,b in xy),'top':min(b for a,b in xy)}
write(out/'status-effects.png',W,H,pixels)
states={id:{'name':name,'sequence':seq,'anchor':anchor,**sequences[seq]} for id,(name,seq,anchor) in roles.items()}
data={'tickRate':60,'cells':cells,'states':states}
(out/'status-effects.js').write_text('window.BATTLE_STATUS_ART='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
audit={'source':'common/e003_battle','sha256':{ext:hashlib.sha256(base.with_suffix(ext).read_bytes()).hexdigest() for ext in ['.ncer','.ncbr','.nclr','.nanr']},'statusChecks':{hex(a):hex(v) for a,v in checks.items()},'states':states,'mappingBasis':'Original engine status IDs checked in overlay19; visual roles classified from source cells. Native status-to-effect dispatch is not fully traced. Source pixels, offsets, sequence order, tick durations and loop modes retained.','webPolicy':'Head/body anchor and size fitted to actual rendered Digimon bounds. Effect playback follows the existing battle art clock and delayed visual state; no additional status rules.','unconnected':[2,4,6,11,12,14]}
(R/'docs/status-effects-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
print('7 source status effects,',len(cells),'cells')
