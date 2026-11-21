"""Original title medals and day-change UI; responsive placement is web policy."""
from pathlib import Path
import struct, hashlib, json, contextlib, io
import extract_title as art
REPO=Path(__file__).resolve().parents[1]; ROOT=REPO.parent
OUT=REPO/'web/assets/day-result';OUT.mkdir(exist_ok=True)
art.OUT=OUT; hashes={}
def cell(stem,number,name,gfx='.ncbr'):
 base=ROOT/stem
 for ext in ['.ncer',gfx,'.nclr']:hashes[stem+ext]=hashlib.sha256(base.with_suffix(ext).read_bytes()).hexdigest()
 capture=[];write=art.png;art.png=lambda p,w,h,b:capture.append((w,h,b))
 try:
  with contextlib.redirect_stdout(io.StringIO()):art.cells(base,{number:name},gfx=gfx)
 finally:art.png=write
 w,h,b=capture[0];write(OUT/(name+'.png'),w,h,b);return w,h,b
def crop(w,h,b,x,y,cw,ch,name):
 out=b''.join(b[((y+yy)*w+x)*4:((y+yy)*w+x+cw)*4] for yy in range(ch));art.png(OUT/(name+'.png'),cw,ch,out)
for n in range(1,62):cell(f'database/item_badge{n:03}',0,f'medal-{n:02}')
# Title IDs are zero-based; item_badge files are one-based (m55 matches supplied beginner-chevron screenshot).
for n,name in [(0,'today'),(9,'checked'),(10,'unchecked')]:cell('today_window/today_window_obj_main',n,name)
for n in range(1,9):cell('today_window/today_window_obj_main',n,f'day-{n}')
cell('today_window/today_window_obj_sub',32,'date-card','.ncgr')
for n,name in [(15,'spring'),(16,'summer'),(17,'autumn'),(18,'winter')]:cell('today_window/today_window_obj_sub',n,name,'.ncgr')
# NBS uses 14-bit tile indices, unlike NSCR's 10-bit indices.
stem='today_window/today_window_bg_main';base=ROOT/stem
sc=base.with_suffix('.nbs').read_bytes();g=base.with_suffix('.ncgr').read_bytes()[48:];pal=art.palette(base.with_suffix('.nclr'))
for ext in ['.nbs','.ncgr','.nclr']:hashes[stem+ext]=hashlib.sha256(base.with_suffix(ext).read_bytes()).hexdigest()
tw,th=struct.unpack_from('<II',sc,8);w,h=tw*8,th*8;buf=bytearray(w*h*4)
for y in range(h):
 for x in range(w):
  e=struct.unpack_from('<H',sc,20+((y//8)*tw+x//8)*2)[0];sx=7-x%8 if e&0x4000 else x%8;sy=7-y%8 if e&0x8000 else y%8
  i=(y*w+x)*4;buf[i:i+4]=bytes((*pal[g[(e&0x3fff)*64+sy*8+sx]],255))
for x,y,name in [(32,24,'spring'),(288,24,'summer'),(32,280,'autumn'),(288,280,'winter')]:crop(w,h,buf,x,y,192,144,'calendar-'+name)
# Gold window: original nine frame pieces, tiled without repainting the source pixels.
parts=[cell('battle_result/result_obj_main',n,f'frame-{n}') for n in range(9)]
w,h=240,144;buf=bytearray(bytes((66,59,56,255))*w*h)
def paste(p,ox,oy):
 pw,ph,b=p
 for y in range(ph):
  for x in range(pw):
   if 0<=ox+x<w and 0<=oy+y<h:
    k=(y*pw+x)*4;i=((oy+y)*w+ox+x)*4
    if b[k+3]:buf[i:i+4]=b[k:k+4]
for x in range(0,w,8):paste(parts[1],x,0);paste(parts[7],x,h-16)
for y in range(0,h,8):paste(parts[3],0,y);paste(parts[5],w-16,y)
for n,x,y in [(0,0,0),(2,w-32,0),(6,0,h-24),(8,w-32,h-24)]:paste(parts[n],x,y)
art.png(OUT/'result-panel.png',w,h,buf)
for n in range(9):(OUT/f'frame-{n}.png').unlink()
cell('battle_result/result_obj_sub',0,'win','.ncgr')
cap=[];write=art.png;art.png=lambda p,w,h,b:cap.append((w,h,b))
try:
 with contextlib.redirect_stdout(io.StringIO()):art.screen(ROOT/'battle_result/result_bg_sub','unused')
finally:art.png=write
crop(*cap[0],0,24,256,104,'result-circuit')
(REPO/'docs/day-result-art-audit.json').write_text(json.dumps({'source_sha256':hashes,'policy':'Original pixels; four-column eight-day calendar and responsive gold-panel composition. Match mN uses item_badge(N+1); m55 verified against supplied screenshot. Counts show held/unheld eligible titles; no invented original animation timing.'},indent=2)+'\n',encoding='utf-8')
print('Exported 61 medals, seasonal calendars, date card, selection and result art')
