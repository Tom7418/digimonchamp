"""원본 NFTR 글자의 윤곽을 정돈해 확대 가능한 HD WOFF2를 만든다.
python tools/build_hd_font.py  (fonttools, brotli 필요; 원본 NFTR는 배포하지 않는다)
기하 보정은 웹판 미술 정책이며 원본에 없던 글자는 시스템 글꼴로 대체한다.
"""
from pathlib import Path
import sys,struct,json,hashlib,math
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'.analysis-deps'))
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
SOURCE=R.parent/'common/font/digi_font_11_u.NFTR';b=SOURCE.read_bytes();assert b[:4]==b'RTFN'
blocks=[];p=16
while p+8<=len(b):
 n=struct.unpack_from('<I',b,p+4)[0];assert n>=8;blocks.append((b[p:p+4],p,n));p+=n
cglp=next(p for magic,p,n in blocks if magic==b'PLGC');w,h,size,baseline,_,depth,rotation=struct.unpack_from('<BBHBBBB',b,cglp+8);assert depth==2 and rotation==0
maps={};widths={}
for magic,p,n in blocks:
 if magic==b'HDWC':
  lo,hi=struct.unpack_from('<HH',b,p+8)
  for gi in range(lo,hi+1):widths[gi]=struct.unpack_from('<bBB',b,p+16+(gi-lo)*3)
 if magic==b'PAMC':
  lo,hi,kind=struct.unpack_from('<HHH',b,p+8);d=p+20
  if kind==0:
   first=struct.unpack_from('<H',b,d)[0];maps.update({c:first+c-lo for c in range(lo,hi+1)})
  elif kind==1:
   for c in range(lo,hi+1):
    gi=struct.unpack_from('<H',b,d+(c-lo)*2)[0]
    if gi!=65535:maps[c]=gi
  else:
   count=struct.unpack_from('<H',b,d)[0]
   for j in range(count):c,gi=struct.unpack_from('<HH',b,d+2+j*4);maps[c]=gi
assert len(maps)==1137 and sum(0xac00<=c<=0xd7a3 for c in maps)==913

def bitmap(gi):
 raw=b[cglp+16+gi*size:cglp+16+(gi+1)*size]
 return [[bool((raw[(y*w+x)//4]>>(6-2*((y*w+x)%4)))&3) for x in range(w)] for y in range(h)]

def contours(pixels,level):
 # Marching squares, saddle cases join touching diagonal strokes instead of breaking them.
 cases={1:[(3,0)],2:[(0,1)],3:[(3,1)],4:[(1,2)],5:[(0,1),(2,3)],6:[(0,2)],7:[(3,2)],8:[(2,3)],9:[(0,2)],10:[(3,0),(1,2)],11:[(1,2)],12:[(3,1)],13:[(0,1)],14:[(3,0)]}
 # Work at4x subpixels so original square corners are preserved; smoothing is only a small fraction of a source pixel.
 grid=4;pw,ph=w*grid,h*grid;adj={}
 def sample(x,y):return int(0<=x-1<pw and 0<=y-1<ph and pixels[(y-1)//grid][(x-1)//grid])
 for y in range(ph+1):
  for x in range(pw+1):
   corners=[(x,y),(x+1,y),(x+1,y+1),(x,y+1)];v=[sample(*p) for p in corners];case=sum(c<<i for i,c in enumerate(v))
   for aa,bb in cases.get(case,[]):
    pts=[]
    for edge in [aa,bb]:
     i,j=edge,(edge+1)%4;t=(level-v[i])/(v[j]-v[i]);pts.append(tuple(round((corners[i][k]+t*(corners[j][k]-corners[i][k])-.5)/grid,6) for k in [0,1]))
    a,z=pts;adj.setdefault(a,[]).append(z);adj.setdefault(z,[]).append(a)
 loops=[];seen=set()
 for start in adj:
  if start in seen:continue
  loop=[];p=start;previous=None
  while p not in seen:
   seen.add(p);loop.append(p);nxt=next(q for q in adj[p] if q!=previous);previous,p=p,nxt
  assert p==start and len(loop)>=3
  # Collinear contour segments are merged; small corner radii keep the original angular silhouette.
  changed=True
  while changed and len(loop)>3:
   changed=False
   for i,p in enumerate(loop):
    a,z=loop[i-1],loop[(i+1)%len(loop)]
    if abs((p[0]-a[0])*(z[1]-p[1])-(p[1]-a[1])*(z[0]-p[0]))<1e-6:
     loop.pop(i);changed=True;break
  loops.append(loop)
 return loops

def inside(point,poly):
 x,y=point;hit=False
 for i,a in enumerate(poly):
  z=poly[i-1]
  if (a[1]>y)!=(z[1]>y) and x<(z[0]-a[0])*(y-a[1])/(z[1]-a[1])+a[0]:hit=not hit
 return hit

def glyph(gi,hd=True):
 left,_,advance=widths[gi];pen=TTGlyphPen(None);loops=contours(bitmap(gi),.44 if hd else .5)
 for loop in loops:
  # Outer/hole windings are opposite after flipping the y axis for TrueType.
  nesting=sum(inside(loop[0],other) for other in loops if other is not loop)
  area=sum(loop[i-1][0]*p[1]-p[0]*loop[i-1][1] for i,p in enumerate(loop))
  if (area>0)!=(nesting%2==0):loop.reverse()
  xy=[((left+x)*100,(baseline-y)*100) for x,y in loop]
  if not hd:
   pen.moveTo(xy[0]);[pen.lineTo(p) for p in xy[1:]];pen.closePath();continue
  segments=[]
  for i,p in enumerate(xy):
   a,z=xy[i-1],xy[(i+1)%len(xy)];da=math.dist(p,a);dz=math.dist(p,z);r=min(10,da/4,dz/4)
   segments.append(((p[0]+(a[0]-p[0])*r/da,p[1]+(a[1]-p[1])*r/da),p,(p[0]+(z[0]-p[0])*r/dz,p[1]+(z[1]-p[1])*r/dz)))
  pen.moveTo(segments[0][0])
  for i,(a,p,z) in enumerate(segments):
   if i:pen.lineTo(a)
   pen.qCurveTo(p,z)
  pen.closePath()
 return pen.glyph(),advance*100

check='--check' in sys.argv
out=R/'web/assets/fonts';out.mkdir(exist_ok=True)
build_path=R/'.analysis-deps/font-review/check.woff2' if check else out/'championship-hd.woff2'
build_path.parent.mkdir(exist_ok=True)
fb=FontBuilder(1100,isTTF=True);ids=sorted(set(maps.values()));order=['.notdef']+[f'g{gi}' for gi in ids];fb.setupGlyphOrder(order);fb.setupCharacterMap({cp:f'g{gi}' for cp,gi in maps.items()})
glyphs={};metrics={}
for gi in ids:
 g,advance=glyph(gi);glyphs[f'g{gi}']=g;metrics[f'g{gi}']=(advance,getattr(g,'xMin',widths[gi][0]*100))
g,advance=glyph(maps[ord('?')]);glyphs['.notdef']=g;metrics['.notdef']=(advance,0)
fb.setupGlyf(glyphs);fb.setupHorizontalMetrics(metrics);fb.setupHorizontalHeader(ascent=950,descent=-150,lineGap=0)
fb.setupNameTable({'familyName':'Championship HD','styleName':'Regular','uniqueFontIdentifier':'ChampionshipHD-1','fullName':'Championship HD Regular','psName':'ChampionshipHD-Regular','version':'Version 1.0'})
fb.setupOS2(sTypoAscender=950,sTypoDescender=-150,sTypoLineGap=0,usWinAscent=1000,usWinDescent=200,fsType=0);fb.setupPost()
fb.font['head'].created=fb.font['head'].modified=2082844800;fb.font.recalcTimestamp=False;fb.font.flavor='woff2';fb.save(build_path)
font=TTFont(build_path);assert font.getBestCmap().keys()==maps.keys();assert len(font['glyf'])==1138
# Original bitmap contact atlas, only for local comparison, never copied into the released site.
from extract_title import png
chars='디지몬 챔피언십 헤비 버너 아구몬 배틀 육성 사냥 도감 양호실 다음 날'
preview=R/'.analysis-deps/font-review';preview.mkdir(exist_ok=True);atlas=bytearray(12*len(chars)*14*4)
for i,ch in enumerate(chars):
 if ord(ch) not in maps:continue
 for y,row in enumerate(bitmap(maps[ord(ch)])):
  for x,on in enumerate(row):
   if on:
    p=((y+2)*12*len(chars)+i*12+x)*4;atlas[p:p+4]=bytes((235,244,251,255))
png(preview/'original.png',12*len(chars),14,atlas)
audit={'source':'common/font/digi_font_11_u.NFTR','sourceSha256':hashlib.sha256(b).hexdigest(),'characters':len(maps),'hangul':913,'unitsPerEm':1100,'policy':'Source glyph geometry, Unicode cmap and advances retained; diagonal joins and tiny quadratic corners rebuilt as web art policy. Unsupported characters use system fallback. This is an outline reconstruction, not recovered high-resolution source artwork.','contourLevel':.44,'cornerRadiusPixels':.1}
audit['subpixelGrid']=4
audit_text=json.dumps(audit,indent=2)+'\n'
if check:
 assert build_path.read_bytes()==(out/'championship-hd.woff2').read_bytes(),'HD font differs; regenerate'
 assert (R/'docs/hd-font-audit.json').read_text(encoding='utf8')==audit_text,'Font audit differs'
 build_path.unlink()
else:(R/'docs/hd-font-audit.json').write_text(audit_text,encoding='utf8')
print('HD WOFF2:',len(maps),'characters,', (out/'championship-hd.woff2').stat().st_size,'bytes')
