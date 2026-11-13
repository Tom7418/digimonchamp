"""216종의 원본 NANR와 웹 재생 데이터를 전수 대조한다. 원본 바이너리는 출력하지 않는다."""
import argparse,json,hashlib
from pathlib import Path
from extract_animations import decode
PROJECT=Path(__file__).resolve().parents[1]
ACTIONS={'idle':0,'walk':2,'eat':14,'hurt':5,'hurtAlt':6,'ko':15,'boundIdle':16,'boundRun':19}
def audit(root):
 meta=json.loads((PROJECT/'web/assets/sprites.json').read_text(encoding='utf-8'))
 raw=(PROJECT/'web/assets/animations.js').read_text(encoding='utf-8')
 web=json.loads(raw.removeprefix('window.DIGIMON_ANIMATIONS = ').strip().removesuffix(';'))
 rows=[]
 for sp in meta:
  source=root/(sp['source']+'.nanr')
  sequences=decode(source,sp['frames'])
  actual=web['banks'][web['sprites'][sp['id']]]
  if sequences!=actual:raise ValueError('Web/source mismatch: '+sp['id'])
  egg=sp['id']=='e000_digitama'
  if len(sequences)!=(2 if egg else 40):raise ValueError('Unexpected sequence layout: '+sp['id'])
  for state,index in ACTIONS.items():
   if web['states'][state]!=index:raise ValueError('Unexpected action mapping: '+state)
  rows.append({'id':sp['id'],'name':sp['name'],'frameCount':sp['frames'],'sequenceCount':len(sequences),
   'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),
   'actions':{} if egg else {state:sequences[index] for state,index in ACTIONS.items()}})
 creatures=[r for r in rows if r['actions']]
 report={'method':'Byte-decoded source NANR vs deployed data; role mapping from animation-code-audit.json; not visual approval of every pose',
  'digimonCount':len(creatures),'eggCount':len(rows)-len(creatures),
  'differentEatCellsFromAgumon':sum([f[0] for f in r['actions']['eat']['frames']]!=[24,25] for r in creatures),
  'species':rows}
 (PROJECT/'docs/animation-species-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(f"Verified {len(creatures)} Digimon / {len(rows)-len(creatures)} egg; source/web match for every sequence")
 return report
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source-root',type=Path,default=PROJECT.parent);audit(p.parse_args().source_root)
