"""사육 선물 먹이의 원본 NANR36~39/41~44를 PNG로 변환한다."""
from pathlib import Path
import struct,json,hashlib
import extract_title as art
from extract_animations import decode
repo=Path(__file__).resolve().parents[1];root=repo.parent
base=root/'common/e001_ikusei'
count=struct.unpack_from('<H',base.with_suffix('.ncer').read_bytes(),24)[0]
seq=decode(base.with_suffix('.nanr'),count)
art.OUT=repo/'web/assets/items'
picks={}
for gift,start in [('big',36),('cake',41)]:
 for stage in range(4):
  frames=seq[start+stage]['frames'];assert len(frames)==1
  picks[frames[0][0]]=f'{gift}_{stage}'
# 모든단계를 같은원점과틀에 그려 먹는중 위치가 흔들리지 않는다.
art.cells(base,picks,box=(-32,-48,64,56))
audit={'source':'common/e001_ikusei','sequences':{'big':[36,37,38,39],'cake':[41,42,43,44]},
 'cells':picks,'evidence':'overlay18 0x210f55c selects sequence36/41; 0x210f4e0 selects +0..3 by remaining quarters; 0x95/0x96 are object state IDs, not ROM file IDs',
 'sha256':{ext:hashlib.sha256(base.with_suffix(ext).read_bytes()).hexdigest() for ext in ['.ncer','.ncbr','.nclr','.nanr']}}
(repo/'docs/gift-food-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
