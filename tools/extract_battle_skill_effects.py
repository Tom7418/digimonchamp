"""원본 배틀 효과 선택 표와 확인된 직선 투사체 흐름을 변환한다. ROM/VM 본문은 배포하지 않는다."""
import struct,json,hashlib,contextlib,io
from pathlib import Path
import extract_title as art
def decode(path,cell_count):
 b=path.read_bytes();count,_,seq,frames,cells=struct.unpack_from('<HHIII',b,24);result=[]
 for i in range(count):
  n,start,kind,mode,off=struct.unpack_from('<HHIII',b,24+seq+i*16);assert kind==0x10000 and mode in (1,2)
  values=[];new_start=0
  for j in range(n):
   element,ticks=struct.unpack_from('<IH',b,24+frames+off+j*8);cell=struct.unpack_from('<H',b,24+cells+element)[0];assert cell<cell_count
   if ticks:
    if j<start:new_start+=1
    values.append([cell,ticks])
  assert values
  result.append({'frames':values,'loop':mode==2,'start':new_start})
 return result
R=Path(__file__).resolve().parents[1];root=R.parent;out=R/'web/assets/battle';arm=(root/'ftc/arm9.bin').read_bytes();ov=(root/'ftc/overlay9_19').read_bytes();base=0x210e8a0
# +44h impact resource; allocator high byte=bank, low byte-1=NANR; bank strings use index-1.
checks={0x211fc34:0xe1d1a4b4,0x211e3e0:0xe1a03441,0x211e3f0:0xe21150ff,0x211e494:0xe2451001,0x2120278:0xe1d183b6,0x2120338:0xe1d110b8,0x2120354:0xe1d113b8,0x21203f0:0xe5911028,0x2120cf8:0xe2411001}
# Check stable instructions against the local executable rather than shipping its contents.
for addr,word in checks.items():
 actual=struct.unpack_from('<I',ov,addr-base)[0]
 if actual!=word:raise ValueError(f'{addr:x}: expected {word:x}, got {actual:x}')
def bank(n):
 p=struct.unpack_from('<I',ov,0x2134ad4-base+(n-1)*4)[0]-base
 s=ov[p:ov.index(b'\0',p)].decode('ascii');assert s.startswith('e003_');return s
needed={};records={}
def ref(n):
 if not n:return None
 bid,seq=n>>8,(n&255)-1;assert bid in range(1,152) and seq>=0
 needed.setdefault(bid,set()).add(seq);return [bid,seq]
for species in json.loads((R/'src/data/battle-skills.json').read_text(encoding='utf8')).values():
 for skill in species['skills']:
  n=skill['record'];b=arm[0xd02cc+n*104:0xd02cc+(n+1)*104];script=struct.unpack_from('<I',b,40)[0]
  d={'impact':ref(struct.unpack_from('<H',b,68)[0])}
  if script==0x21285ee:
   first,flight,finish=struct.unpack_from('<H',b,48)[0],struct.unpack_from('<H',b,54)[0],struct.unpack_from('<H',b,56)[0]
   d.update(kind='projectile',muzzle=ref(first),flight=ref(flight),finish=ref((flight&0xff00)|(finish&255)),speed=struct.unpack_from('<H',b,8)[0]/100,
    muzzleOffset=list(struct.unpack_from('<bbH',b,44)),flightOffset=list(struct.unpack_from('<bbH',b,50)))
   for field in ['muzzleOffset','flightOffset']:d[field][2]/=100
  else:d['kind']='impactOnly'
  records[str(n)]=d
# Only required NANR cells are packed, preserving their original OAM origin and tick durations.
entries={};images=[];hashes={};art.OUT=out
for bid,seqs in needed.items():
 stem=bank(bid);p=root/'common'/stem;raw=p.with_suffix('.ncer').read_bytes();count,kind,off=struct.unpack_from('<HHI',raw,24);stride=16 if kind else 8;start=24+off;oams=start+stride*count
 sequences=decode(p.with_suffix('.nanr'),count);picks=sorted({cell for s in seqs for cell,t in sequences[s]['frames']});cells={}
 for ci in picks:
  n,_,off=struct.unpack_from('<HHI',raw,start+ci*stride);xy=[]
  for j in range(n):
   a,b,d=struct.unpack_from('<HHH',raw,oams+off+j*6)
   if a>>14!=3:
    x,y=b&511,a&255;xy.append((x-512 if x>=256 else x,y-256 if y>=128 else y))
  cap=[];write=art.png;art.png=lambda p,w,h,b:cap.append((w,h,b))
  try:
   with contextlib.redirect_stdout(io.StringIO()):art.cells(p,{ci:'unused'})
  finally:art.png=write
  w,h,b=cap[0];meta={'w':w,'h':h,'left':min(x for x,y in xy),'top':min(y for x,y in xy)};cells[str(ci)]=meta;images.append((meta,b))
 entries[str(bid)]={'name':stem,'sequences':{str(s):sequences[s] for s in sorted(seqs)},'cells':cells}
 hashes[stem]={ext:hashlib.sha256(p.with_suffix(ext).read_bytes()).hexdigest() for ext in ['.ncbr','.ncer','.nclr','.nanr']}
W=2048;x=y=row=0
for m,b in images:
 if x+m['w']+2>W:y+=row+2;x=row=0
 m['x'],m['y']=x,y;x+=m['w']+2;row=max(row,m['h'])
H=y+row;buf=bytearray(W*H*4)
for m,b in images:
 for yy in range(m['h']):
  d=((m['y']+yy)*W+m['x'])*4;src=yy*m['w']*4;buf[d:d+m['w']*4]=b[src:src+m['w']*4]
art.png(out/'skill-effects.png',W,H,buf)
data={'tickRate':60,'records':records,'banks':entries}
(out/'skill-effects.js').write_text('window.BATTLE_SKILL_EFFECTS='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
summary={'skills':len(records),'projectiles':sum(d['kind']=='projectile' for d in records.values()),'impactSelected':sum(bool(d['impact']) for d in records.values()),'banks':len(entries),'cells':len(images),'atlas':[W,H]}
(R/'docs/battle-skill-effects-audit.json').write_text(json.dumps({'summary':summary,'instructionChecks':{hex(k):hex(v) for k,v in checks.items()},'sha256':hashes,'arm9':hashlib.sha256(arm).hexdigest(),'overlay19':hashlib.sha256(ov).hexdigest(),'evidence':['0x211d994..d998: bank index-1 string lookup','0x211e3dc..e498: resource high byte bank; low byte-1 NANR','0x2120308..03fc: muzzle/flight/finish scale, origin, speed passed to script','VM 0x21285ee: direction, distance/speed, flight; 0x2128828..882c changes finish sequence after collision','0x211fc34 +0x44 is target-hit effect selected in hit collision path'], 'limits':['Other 30 action script families and true collision dispatch/hit timing remain to port.','Web projectile travels to the resolved target; engine damage already calculated.','Auxiliary hit art is selected by original table; web places it at visual target center.']},indent=2)+'\n',encoding='utf8')
print(summary)
