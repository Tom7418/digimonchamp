"""원본 사냥 HUD의 레이더·속성·메모리 체커 그림과 씬 연결을 변환한다."""
from pathlib import Path
import json,struct,hashlib,contextlib,io
import extract_title as art
from extract_animations import decode

repo=Path(__file__).resolve().parents[1];base=repo.parent/'ui/hunt/hunting';out=repo/'web/assets/hunt'
stem=base/'hunting_obj_sub';scene=(base/'hunt_sub_scene.nxr').read_bytes()
def node(name):
    p=scene.index(name.encode())+len(name);p=(p+3)//4*4
    resource,sequence,x,y,z,rotation,sx,sy,parent=struct.unpack_from('<II6fi',scene,p)
    return {'resource':resource,'sequence':sequence,'x':x,'y':y,'scale':[sx,sy]}
nodes={n:node(n) for n in ['map_marker0','map_inner_frame','align_node','mc_cur0','mc_div','mc_max0','mc_cur_g','digimon_name','gen_title']}
assert nodes['map_marker0']['sequence']==1 and nodes['align_node']['sequence']==12
assert nodes['mc_cur0']['sequence']==3 and nodes['mc_div']['sequence']==10 and nodes['mc_cur_g']['sequence']==2
sequences=decode(stem.with_suffix('.nanr'),28)
used=[0,1,2,3,*range(4,14),20,*range(23,27)]
capture={};write=art.png;art.png=lambda p,w,h,b:capture.update({int(p.stem):(w,h,b)})
try:
    with contextlib.redirect_stdout(io.StringIO()):art.cells(stem,{i:str(i) for i in used},gfx='.ncgr')
finally:art.png=write
W,H=256,96;pixels=bytearray(W*H*4);cells={}
for i,cell in enumerate(used):
    w,h,rgba=capture[cell]
    points=[(x,y) for y in range(h) for x in range(w) if rgba[(y*w+x)*4+3]]
    left,top=min(x for x,y in points),min(y for x,y in points)
    cw,ch=max(x for x,y in points)-left+1,max(y for x,y in points)-top+1
    x,y=i%8*32,i//8*32
    for row in range(ch):pixels[((y+row)*W+x)*4:((y+row)*W+x+cw)*4]=rgba[((top+row)*w+left)*4:((top+row)*w+left+cw)*4]
    cells[cell]={'x':x,'y':y,'w':cw,'h':ch}
write(out/'plugin-hud.png',W,H,pixels)
# 원본 사냥 전용 배경의 레이더 금색 틀. 전체 공용 파란 배경을 재사용하지 않는다.
captured=[];art.png=lambda p,w,h,b:captured.append((w,h,b))
try:
    with contextlib.redirect_stdout(io.StringIO()):art.screen(base/'hunting_bg_sub','unused')
finally:art.png=write
w,h,rgba=captured[0];crop=(0,46,68,62);frame=bytearray()
for y in range(crop[1],crop[1]+crop[3]):frame.extend(rgba[(y*w+crop[0])*4:(y*w+crop[0]+crop[2])*4])
write(out/'radar-frame.png',crop[2],crop[3],frame)
data={'tickRate':60,'cells':cells,'marker':sequences[1],'attributes':{'백신':23,'바이러스':24,'데이터':25,'프리':26},'digits':list(range(4,14)),'g':3,'divider':20,'viewport':0}
(out/'plugin-hud.js').write_text('window.HUNT_PLUGIN_ART='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
audit={'source':'ui/hunt/hunting/hunting_obj_sub + hunt_sub_scene + hunting_bg_sub',
       'sha256':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [*(stem.with_suffix(e) for e in ['.ncer','.ncgr','.nclr','.nanr']),base/'hunt_sub_scene.nxr',*( (base/'hunting_bg_sub').with_suffix(e) for e in ['.ncgr','.nclr','.nscr'])]},
       'sceneNodes':nodes,'usedCells':used,'markerSequence':sequences[1],'radarFrameCrop':crop,
       'mappingBasis':'Named NXR map_marker0/align_node/mc_* nodes identify marker/attribute/number/G/divider NANR roles. Va/Vi/Da/Fr cells identify attribute labels visually.',
       'webPolicy':'Radar gated by existing equipped category3 plugins; existing onRadar/bound filtering retained. Source yellow/pink marker cells retain the web bound/detected distinction; nonloop NANR is not forced to blink. World map thumbnail and camera viewport use the web camera. Gold frame cropped from hunt-only background; corners retained with a 9-slice fit (source inset left3/top2/right9/bottom4). Analyzer gains native icon beside permitted Korean text for one visible target (pointer/rope, otherwise nearest screen center); this selection policy is web input mapping. Memory checker uses source number/G/divider cells in a web top-right strip. Native secondary-screen layout and native live selector code are not fully ported.'}
(repo/'docs/hunt-plugin-hud-audit.json').write_text(json.dumps(audit,indent=2)+'\n',encoding='utf8')
print('Hunt plugin HUD source scene roles verified;',len(used),'cells extracted')
