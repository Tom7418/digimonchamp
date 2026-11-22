"""원본 사냥 준비 아이템 아이콘과 창 테두리를 웹 PNG로 변환한다.
원본 표의 분류/순서와 itemicon NANR의 셀을 대조한다. 원본 파일은 배포하지 않는다.
"""
from pathlib import Path
import struct,json,hashlib
import extract_title as art
from extract_animations import decode
R=Path(__file__).resolve().parents[1];source=R.parent;out=R/'web/assets/hunt';out.mkdir(exist_ok=True)
base=source/'ui/itemicon_main';seq=decode(base.with_suffix('.nanr'),46)
# 원본 아이템 표와 같은 순서. 기본 로프/노멀 와이어α는 기존처럼 별도로 가져간다.
groups={2:[f'{family}{tier}' for family in ['hand','rapid','sleep','stun','shotgun','stunshot'] for tier in [1,2]],
 3:[None,'wire2','magnet1','magnet2','spark1','spark2'],4:['bait1','bait2','bait3','bait4'],
 5:['toy1','toy2'],6:['light1','light2'],7:['bomb1','bomb2','bomb3','bomb4'],8:['mine1','mine2'],9:['trap1','trap2']}
arm=(source/'ftc/arm9.bin').read_bytes();icons={};record=12
for category,ids in groups.items():
 for index,id in enumerate(ids):
  kind,order=struct.unpack_from('<2i',arm,0xe067c+record*56-32)
  assert (kind,order)==(category,index),(category,index,kind,order)
  cell=seq[category-1]['frames'][index][0]
  if id:icons[id]={'cell':cell,'category':category,'index':index}
  record+=1
assert len(icons)==33
# 16×32 고정 틀에 원본 셀을 중앙 배치해 긴 라이플도 잘리지 않게 한다.
cols=16;W=256;H=96;rgba=bytearray(W*H*4);captured={};write=art.png
art.png=lambda p,w,h,b:captured.update({int(p.stem):(w,h,b)})
try:art.cells(base,{v['cell']:str(v['cell']) for v in icons.values()})
finally:art.png=write
for v in icons.values():
 cell=v['cell'];w,h,b=captured[cell];x=cell%cols*16;y=cell//cols*32
 assert w<=16 and h<=32
 for row in range(h):
  dst=((y+(32-h)//2+row)*W+x)*4;rgba[dst:dst+w*4]=b[row*w*4:(row+1)*w*4]
 v.update(x=x,y=y,width=w,height=h)
write(out/'item-icons.png',W,H,rgba)
art.OUT=out
art.cells(source/'ui/hunt/setting/setting_obj_main',{0:'item-panel',11:'item-selected'})
art.cells(source/'ui/hunt/setting/setting_obj_sub',{0:'item-empty'},gfx='.ncgr')
# 첨부 화면과 같은 양옆 셔터의 보이는 닫힘 단계만 원본 좌표로 추출한다.
# NANR1 첫 셀1(8×8 별도 표시)은 제외하며 셀2~6의 원점/크기를 유지한다.
shutter_base=source/'ui/hunt/setting/setting_obj_sub'
closing=decode(shutter_base.with_suffix('.nanr'),11)[1]['frames'][1:]
assert closing==[[2,2],[3,2],[4,2],[5,2],[6,2]]
frames=[];art.png=lambda p,w,h,b:frames.append((w,h,b))
try:art.cells(shutter_base,{cell:str(cell) for cell,ticks in closing},gfx='.ncgr',box=(-12,-8,24,16))
finally:art.png=write
strip=bytearray(120*16*4)
for i,(w,h,b) in enumerate(frames):
 for row in range(h):
  dst=(row*120+i*24)*4;strip[dst:dst+24*4]=b[row*24*4:(row+1)*24*4]
write(out/'item-shutter.png',120,16,strip)
shutter={'cells':[cell for cell,ticks in closing],'sourceTicks':[ticks for cell,ticks in closing],'frameWidth':24,'frameHeight':16,'durationMs':500}

(out/'item-ui.js').write_text('window.HUNT_ITEM_UI='+json.dumps({'icons':icons,'sheet':{'width':W,'height':H,'tileWidth':16,'tileHeight':32},'shutter':shutter},separators=(',',':'))+';\n',encoding='utf8')
# 변환 자산의 대응과 해시만 기록하며 원본 파일은 포함하지 않는다.
audit={'sources':{str(b.relative_to(source)): {ext:hashlib.sha256(b.with_suffix(ext).read_bytes()).hexdigest() for ext in ['.ncer','.nclr','.nanr',('.ncgr' if b.with_suffix('.ncgr').exists() else '.ncbr')]} for b in [base,source/'ui/hunt/setting/setting_obj_main',source/'ui/hunt/setting/setting_obj_sub']},'icons':icons,'shutter':shutter,'shutterPolicy':'Visible source cells2-6 in their original order. Cell1 is excluded. Display duration500ms is web presentation policy for readability, not original playback speed.','policy':'Original item table category/index selects NANR category-1 and frame index. Original pixels and aspect ratios retained. Responsive five-slot rack, grouping, badges and focus styles are web layout policy.'}
(R/'docs/hunt-item-ui-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
print('33 original item icons, panel/slot art and five shutter stages extracted')
