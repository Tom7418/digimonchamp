"""원본 육성 상태창의 HP 게이지를 변환한다. 원본 파일은 배포하지 않는다."""
from pathlib import Path
import hashlib,json
import extract_title as art
R=Path(__file__).resolve().parents[1];base=R.parent/'training/training_sub';art.OUT=R/'web/assets/ui'
# 원본 HP 글자는 셀20, 녹색 채움은1. 틀의 실제 픽셀과 채움만 자른다.
for cell,name,crop in [(0,'hp-frame',(6,0,58,8)),(1,'hp-green',(0,0,50,3)),(3,'hp-red',(7,0,50,3))]:
 art.cells(base,{cell:name},gfx='.ncgr',crop=crop)
audit={'source':'training/training_sub','cells':{'frame':0,'green':1,'red':3,'hpLabel':20},'frameCrop':[6,0,58,8],'fillCrops':{'green':[0,0,50,3],'red':[7,0,50,3]},'fillInset':[4,2,50,3],'sha256':{ext:hashlib.sha256(base.with_suffix(ext).read_bytes()).hexdigest() for ext in ['.ncer','.ncgr','.nclr','.nanr']},'policy':'Original gauge pixels. Shared use in farm/hunt/battle, enemy red color and 350ms interpolation are web display policy. Engine HP and impact timing are unchanged.'}
(R/'docs/hp-bar-art-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
