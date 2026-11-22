"""원본 공통 배틀 상태 효과의 NCER 픽셀/NANR 유지 시간을 변환한다.
overlay19 상태→모드와 ARM9 모드→NANR 선택 분기를 검사한다.
원본 픽셀·유지 시간·부착 높이를 보존하고 웹 화면 크기만 조절한다.
"""
from pathlib import Path
import struct,json,hashlib
import extract_title as art
from extract_animations import decode
R=Path(__file__).resolve().parents[1];base=R.parent/'common/e003_battle';out=R/'web/assets/battle'
sequences=decode(base.with_suffix('.nanr'),143)
roles={1:('anger',27,'head'),2:('fear',0,'head'),4:('passive',4,'head'),5:('confusion',24,'head'),6:('slow',1,'head'),7:('poison',23,'head'),8:('ice',22,'body'),9:('sleep',5,'head'),10:('paralysis',2,'body'),11:('blind',25,'head'),14:('down',26,'head')}
# actor.model=object+4이므로 model+0x6cc와 object+0x6d0는 같은 필드다.
raw=(R.parent/'ftc/overlay9_19').read_bytes();origin=0x210e8a0
arm=(R.parent/'ftc/arm9.bin').read_bytes();arm_origin=0x2000000
def word(data,base,address):return struct.unpack_from('<I',data,address-base)[0]
def branch(data,base,address):
 instruction=word(data,base,address);assert instruction&0x0e000000==0x0a000000,hex(address)
 offset=instruction&0xffffff
 if offset&0x800000:offset-=0x1000000
 return address+8+offset*4
assert word(raw,origin,0x2117544)==0x12811004
assert word(arm,arm_origin,0x20645f0)==0xe59916d0
# 상태 분기 시작·모드 대입·기록 주소를 지정하고 점프 표도 대조한다.
assignments={1:(0x2117e08,0x2117e0c,0x2117e18),2:(0x2117e24,0x2117e28,0x2117e2c),4:(0x2117e50,0x2117e54,0x2117e60),5:(0x2117e6c,0x2117e70,0x2117e78),6:(0x2117e84,0x2117e88,0x2117e8c),7:(0x2117e94,0x2117e98,0x2117e9c),8:(0x2117ea4,0x2117ea8,0x2117eb4),9:(0x2117ec0,0x2117ec4,0x2117ed0),10:(0x2117edc,0x2117ee0,0x2117eec),11:(0x2117ef8,0x2117efc,0x2117f00),12:(0x2117f08,0x2117f0c,0x2117f18),13:(0x2117f24,0x2117f28,0x2117f2c),14:(0x2117f34,0x2117f38,0x2117f3c)}
sequence_mov={6:0x20647d8,7:0x2064820,9:0x20648b0,10:0x20648f8,11:0x2064940,12:0x2064988,13:0x20649c4,14:0x2064a0c,15:0x2064a48,16:0x2064a90,17:0x2064ad8}
native={}
for status,(start,assign,store) in assignments.items():
 assert branch(raw,origin,0x2117dcc+status*4)==start
 instruction=word(raw,origin,assign);assert instruction&0xffff0000==0xe3a00000
 mode=instruction&255;store_word=word(raw,origin,store)
 assert store_word&0xfff==0x6cc and store_word&0x0ff00000==0x05800000
 assert (store_word>>12)&15==(instruction>>12)&15
 target=branch(arm,arm_origin,0x2064600+mode*4)
 sequence=None;anchor=None
 if mode:
  address=sequence_mov[mode];assert word(arm,arm_origin,address)&0xffffff00==0xe3a01000
  assert branch(arm,arm_origin,address+4)==0x2046e18
  sequence=word(arm,arm_origin,address)&255
  # 머리 쪽으로 옮기는 분기만 y -= (height/5*4)<<12를 실행한다.
  instructions=[word(arm,arm_origin,a) for a in range(target,address,4)]
  anchor='head' if 0xe0420600 in instructions else 'body'
  assert (sequence,anchor)==roles[status][1:]
 else:assert target==0x2064b04
 native[status]={'mode':mode,'sequence':sequence,'anchor':anchor,'statusBranch':hex(start),'modeInstruction':hex(assign),'modeStore':hex(store),'renderBranch':hex(target),'sequenceInstruction':hex(sequence_mov[mode]) if mode else None}
assert word(arm,arm_origin,0x2064b14)==0xcccccccd
checks={0x2118be4:0xe3a01005,0x2118bf4:0xe3a01007,0x2118c08:0xe3a0100a,0x2118c20:0xe3a01009,0x2118c48:0xe3a01008,0x2118c80:0xe3a0100d,0x2118ca0:0xe3a01001}
for address,value in checks.items():assert struct.unpack_from('<I',raw,address-origin)[0]==value,hex(address)
used=sorted({cell for _,seq,_ in roles.values() for cell,ticks in sequences[seq]['frames']})
images={};write=art.png;art.png=lambda p,w,h,b:images.update({int(p.stem):(w,h,b)})
try:art.cells(base,{cell:str(cell) for cell in used})
finally:art.png=write
c=base.with_suffix('.ncer').read_bytes();count,kind,offset=struct.unpack_from('<HHI',c,24);stride=16 if kind else 8;bank=24+offset;oams=bank+count*stride
W,H=256,((len(used)+7)//8)*32;pixels=bytearray(W*H*4);cells={}
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
data={'tickRate':60,'headHeightRatio':0.8,'cells':cells,'states':states}
(out/'status-effects.js').write_text('window.BATTLE_STATUS_ART='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
audit={'source':'common/e003_battle','sha256':{ext:hashlib.sha256(base.with_suffix(ext).read_bytes()).hexdigest() for ext in ['.ncer','.ncbr','.nclr','.nanr']},'codeSha256':{'arm9':hashlib.sha256(arm).hexdigest(),'overlay19':hashlib.sha256(raw).hexdigest()},'statusChecks':{hex(a):hex(v) for a,v in checks.items()},'nativeDispatch':native,'states':states,'mappingBasis':'Verified overlay19 status switch -> model+0x6cc (object+4 alias) -> ARM9 object+0x6d0 switch -> NANR setter 0x02046e18. Source pixels, offsets, sequence order, tick durations and loop modes retained.','headAnchor':'ARM9 0x020645b8..0x020645e8: floor(model height/5)*4 above feet; web projects the 0.8 ratio onto current sprite bounds. Ice/paralysis branches omit this subtraction.','webPolicy':'Effect scale fitted to rendered Digimon bounds; not a port of the NDS 3D camera. Existing battle art clock and delayed visual state; no additional status rules.','noAttachedSprite':[12,13],'unconnected':[3],'remaining':'Stone/curse select mode 0 in this attached-sprite dispatcher. Separate material/palette effects have not been traced; status 3 is unused by the web engine.'}
(R/'docs/status-effects-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
print(len(states),'source status effects,',len(cells),'cells; native dispatch verified')
