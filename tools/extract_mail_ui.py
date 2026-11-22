"""원본 메일 창의 봉투와 열기/닫기 NANR를 변환한다. 원문·실행 파일은 배포하지 않는다."""
from pathlib import Path
import struct,json,hashlib,contextlib,io
import extract_title as art
from extract_animations import decode

repo=Path(__file__).resolve().parents[1];base=repo.parent/'ui/menu_main';out=repo/'web/assets/ui'
scene=(repo.parent/'ui/mailer_scene.nxr').read_bytes()
def node(name):
    p=scene.index(name.encode())+len(name);p=(p+3)//4*4
    resource,sequence,x,y,z,rotation,sx,sy,parent=struct.unpack_from('<II6fi',scene,p)
    return {'resource':resource,'sequence':sequence,'x':x,'y':y,'scale':[sx,sy]}
nodes={name:node(name) for name in ['window','text','icon']}
assert struct.unpack_from('<I',scene,8)[0]==3
assert nodes['window']['sequence']==35 and nodes['icon']['sequence']==39
arm=(repo.parent/'ftc/arm9.bin').read_bytes()
for address,expected in {0x208bf08:0xe3a01023,0x208c124:0xe3a01024}.items():
    assert struct.unpack_from('<I',arm,address-0x2000000)[0]==expected,hex(address)
seq=decode(base.with_suffix('.nanr'),89)
assert sum(t for _,t in seq[35]['frames'])==12 and sum(t for _,t in seq[36]['frames'])==12
capture={};write=art.png;art.png=lambda p,w,h,b:capture.update({int(p.stem):(w,h,b)})
try:
    with contextlib.redirect_stdout(io.StringIO()):
        art.cells(base,{i:str(i) for i in range(62,71)},box=(-4,-8,8,16))
        art.cells(base,{73:'73'})
finally:art.png=write
W,H=72,16;rgba=bytearray(W*H*4);cells={}
for i in range(62,71):
    w,h,pixels=capture[i];x=(i-62)*8
    for row in range(h):rgba[(row*W+x)*4:(row*W+x+w)*4]=pixels[row*w*4:(row+1)*w*4]
    points=[(a,b) for b in range(h) for a in range(w) if pixels[(b*w+a)*4+3]]
    left,top=min(a for a,b in points),min(b for a,b in points)
    cells[i]={'x':x,'y':0,'w':8,'h':16,'bounds':[left,top,max(a for a,b in points)-left+1,max(b for a,b in points)-top+1]}
write(out/'mail-window.png',W,H,rgba)
w,h,rgba=capture[73];write(out/'mail-envelope.png',w,h,rgba)
data={'tickRate':60,'width':8,'height':16,'cells':cells,'open':seq[35],'close':seq[36]}
(out/'mail-art.js').write_text('window.MAIL_ART='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
audit={'source':'ui/menu_main + ui/mailer_scene.nxr',
       'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [*(base.with_suffix(e) for e in ['.ncer','.ncbr','.nclr','.nanr']),repo.parent/'ui/mailer_scene.nxr']},
       'codeSha256':hashlib.sha256(arm).hexdigest(),'sceneNodes':nodes,
       'codeChecks':{'0x0208bf08':'select sequence35 (open)','0x0208c124':'select sequence36 (close)'},
       'open':seq[35],'close':seq[36],'envelopeCell':73,'fixedSourceBox':[-4,-8,8,16],
       'senderPortrait':'No portrait node in the verified three-node base mail scene (window/text/envelope). This does not prove no portrait exists in every event-specific screen.',
       'webPolicy':'Source monochrome strip stretched to a responsive bottom message panel; source frame order/60Hz timing retained. Envelope is the native scene icon. Existing sender/body text retained. Long text scrolls; click/Enter/Space closes once after animation; early opening input only completes opening. Gift/read/offer callbacks remain in the existing mail queue and run after close completion.'}
(repo/'docs/mail-ui-art-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
print('Original mail scene, open/close selectors and envelope verified')
