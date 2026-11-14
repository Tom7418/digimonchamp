"""사용자 제공 GIF와 배포 셀의 그림을 비교한다. GIF는 저장소에 복사하지 않는다.
python tools/audit_gif_animations.py <zip>
Pillow 필요. GIF의8배 색상과 PNG의255/31 색상 확장을5비트로 정규화한다.
"""
import hashlib,io,json,sys,zipfile
from pathlib import Path
from PIL import Image
REPO=Path(__file__).resolve().parents[1]
zpath=Path(sys.argv[1]);z=zipfile.ZipFile(zpath)
paths={Path(p).name:p for p in z.namelist() if p.endswith('.gif')}
meta=json.loads((REPO/'web/assets/sprites.json').read_text(encoding='utf-8'))
data=json.loads((REPO/'web/assets/animations.js').read_text().split(' = ',1)[1].rstrip(';\n'))
def pixels(im,gif):
 im=im.convert('RGBA');im=im.crop(im.getbbox())
 values=[]
 for r,g,b,a in im.get_flattened_data():
  values.append((r//8,g//8,b//8,1) if gif and a else (round(r*31/255),round(g*31/255),round(b*31/255),1) if a else (0,0,0,0))
 return (im.size,tuple(values))
def compact(frames):
 out=[]
 for f in frames:
  if not out or out[-1]!=f:out.append(f)
 return out
matched=0;missing=[];mismatches=[];frameChecks=0
for sp in meta:
 if sp['id']=='e000_digitama':continue
 sheet=Image.open(REPO/'web/assets'/f"{sp['id']}.png").convert('RGBA')
 for n,seq in enumerate(data['banks'][data['sprites'][sp['id']]]):
  name=f"{sp['id']}_main_{n}.gif"
  # 같은 종/동작이 ZIP에서 다른 철자나 접미사로 저장된 경우를 명시적으로 대응한다.
  sourceName=name
  if sourceName not in paths:sourceName=name.replace('m326_cockatrimon','m326_kokatorimon')
  if sourceName not in paths and name=='m357_unimon_main_5.gif':sourceName='m357_unimon_main_5_1.gif'
  if sourceName not in paths:missing.append(name);continue
  gif=Image.open(io.BytesIO(z.read(paths[sourceName])));gf=[]
  for j in range(gif.n_frames):gif.seek(j);gf.append(pixels(gif,True))
  expected=[]
  for cell,ticks in seq['frames']:
   expected.append(pixels(sheet.crop((cell*sp['width'],0,(cell+1)*sp['width'],sp['height'])),False))
  frameChecks+=len(expected)
  if compact(gf)==compact(expected):matched+=1
  else:mismatches.append(name)
report={'zipSha256':hashlib.sha256(zpath.read_bytes()).hexdigest(),'gifFiles':len(paths),'matchedSequences':matched,'frameChecks':frameChecks,'missing':missing,'mismatches':mismatches,'method':'trim transparent padding; compare ordered frames after5-bit color normalization and adjacent duplicate collapse; GIF timing not authoritative'}
(REPO/'docs/gif-animation-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v if not isinstance(v,list) else len(v) for k,v in report.items()}))
