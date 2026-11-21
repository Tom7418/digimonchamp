"""216종의 도감 전용 셀0을 한 장의 무손실 atlas로 변환한다."""
import json,hashlib,contextlib,io,struct
from pathlib import Path
import extract_title as art
from extract_sprites import png
repo=Path(__file__).resolve().parents[1];out=repo/'web/assets/dex';out.mkdir(exist_ok=True)
names=json.loads((repo/'tools/sprite_names.json').read_text(encoding='utf-8'))
rows=[(stem,name) for stem,name in names.items() if stem.startswith('m')];assert len(rows)==216
W,H,columns=96,80,12;pixels=bytearray(W*columns*H*18*4);entries={};hashes={}
for i,(stem,name) in enumerate(rows):
 base=repo.parent/'db_digimon'/(stem+'_db_main');cap=[];art.png=lambda p,w,h,b:cap.append((w,h,b))
 with contextlib.redirect_stdout(io.StringIO()):art.cells(base,{0:'unused'})
 w,h,rgba=cap[0];assert w<=W and h<=H
 x=i%columns*W+(W-w)//2;y=i//columns*H+H-h-4
 for yy in range(h):
  d=((y+yy)*W*columns+x)*4;pixels[d:d+w*4]=rgba[yy*w*4:(yy+1)*w*4]
 entries[name]={'index':i,'width':w,'height':h,'sprite':stem}
 hashes[stem]={ext:hashlib.sha256(base.with_suffix(ext).read_bytes()).hexdigest() for ext in ['.ncer','.ncbr','.nclr']}
png(out/'portraits.png',W*columns,H*18,pixels)
art.png=png;art.OUT=out
art.screen(repo.parent/'database/zukan_bg_main','background')
(out/'portraits.js').write_text('window.DEX_ART='+json.dumps({'cellWidth':W,'cellHeight':H,'columns':columns,'entries':entries},ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')
(repo/'docs/dex-art-audit.json').write_text(json.dumps({'source':'db_digimon/*_db_main cell0; database/zukan_bg_main','species':216,'sha256':hashes,'policy':'Cell0 portraits; responsive card grid and enlarged detail are web layout. Unregistered portrait silhouette is not asserted as original.'},indent=2)+'\n',encoding='utf-8')
