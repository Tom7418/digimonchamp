"""사냥 설치 장비 원본 셀/OAM/NANR를 변환한다. 원본은 배포하지 않는다."""
from pathlib import Path
import json,struct,hashlib
import extract_sprites as sprites
from extract_animations import decode
repo=Path(__file__).resolve().parents[1];out=repo/'web/assets/hunt';out.mkdir(exist_ok=True)
names=['bom_nomal','bom_sleep','bom_stun','bom_flash','smallmine','hugemine','digicach','digiprison','decoy','decoy2','digilight','digilight2','niku_nomal','niku_big','niku_poison','niku_stun','niku_sleep']
data={};audit={}
for name in names:
 stem='e002_hunt_'+name;base=sprites.ROOT/'common'/stem
 cap=[];write=sprites.png;sprites.png=lambda p,w,h,b:cap.append((w,h,b))
 try:meta=sprites.extract(stem,'common','')
 finally:sprites.png=write
 w,h,rgba=cap[0];write(out/(name+'.png'),w,h,rgba)
 raw=base.with_suffix('.ncer').read_bytes();count,kind,offset=struct.unpack_from('<HHI',raw,24);bank=24+offset;stride=16 if kind else 8;oams=bank+count*stride
 xy=[]
 for i in range(count):
  n,_,off=struct.unpack_from('<HHI',raw,bank+i*stride)
  for j in range(n):
   a,b,_=struct.unpack_from('<HHH',raw,oams+off+j*6)
   if a>>14==3:continue
   x=b&511;y=a&255;xy.append((x-512 if x>=256 else x,y-256 if y>=128 else y))
 data[name]={'width':meta['width'],'height':meta['height'],'left':min(x for x,y in xy),'top':min(y for x,y in xy),'sequences':decode(base.with_suffix('.nanr'),meta['frames'])}
 audit[name]={ext:hashlib.sha256(base.with_suffix(ext).read_bytes()).hexdigest() for ext in ['.ncer','.ncbr','.nclr','.nanr']}
(out/'equipment.js').write_text('window.HUNT_EQUIPMENT_ART='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf-8')
(repo/'docs/hunt-equipment-art-audit.json').write_text(json.dumps({'source':'common/e002_hunt_*','sha256':audit,'policy':'Floor display uses sequence0. Source pixel/sequence extraction only. Explosion dispatch/pools and decoy removal are checked separately by check_hunt_explosion_sources.py and check_hunt_decoy_sources.py. Trap layer/held dispatch is checked by check_hunt_trap_sources.py.'},indent=2)+'\n',encoding='utf-8')
