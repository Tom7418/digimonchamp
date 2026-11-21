"""사냥 준비의 원본 플러그인 카트리지 그림을 변환한다."""
from pathlib import Path
import struct,json,hashlib
import extract_title as art
repo=Path(__file__).resolve().parents[1];base=repo.parent/'ui/hunt/setting/setting_obj_plug_main'
art.OUT=repo/'web/assets/hunt'
assert struct.unpack_from('<H',base.with_suffix('.ncer').read_bytes(),24)[0]==5
art.cells(base,{i:f'plugin_{i}' for i in range(4)})
audit={'source':'ui/hunt/setting/setting_obj_plug_main','cells':[0,1,2,3],
 'policy':'Original cartridge pixels. Category-to-color correspondence and responsive slots/cards are web layout policy; original screen mapping is not confirmed.',
 'sha256':{ext:hashlib.sha256(base.with_suffix(ext).read_bytes()).hexdigest() for ext in ['.ncer','.ncbr','.nclr','.nanr']}}
(repo/'docs/plugin-ui-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf-8')
