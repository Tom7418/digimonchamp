"""원본 진화 이펙트와 NANR 시간, 코드 근거를 웹용으로 변환한다.
python tools/extract_evolution.py <원본 root> [--check]
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import extract_sprites as sprites
from extract_animations import decode

REPO=Path(__file__).resolve().parents[1]


def extract(root):
    sprites.ROOT=root.resolve()
    capture=[];write=sprites.png
    try:
        sprites.png=lambda p,w,h,b:capture.append((w,h,b))
        meta=sprites.extract('e001_evolution_all','common','')
    finally:
        sprites.png=write
    width,height,pixels=capture[0]
    sequences=decode(root/'common/e001_evolution_all.nanr',meta['frames'])
    assert meta['frames']==22 and len(sequences)==2
    # 표시용 셀은 원점이 제각각이라 실제 불투명 영역을 따로 기록한다.
    bounds=[]
    for cell in range(meta['frames']):
        points=[(x,y) for y in range(height) for x in range(meta['width']) if pixels[(y*width+cell*meta['width']+x)*4+3]]
        if not points:bounds.append([0,0,1,1]);continue
        x0=min(x for x,y in points);y0=min(y for x,y in points)
        bounds.append([x0,y0,max(x for x,y in points)+1-x0,max(y for x,y in points)+1-y0])
    overlay=(root/'ftc/overlay9_18').read_bytes();arm=(root/'ftc/arm9.bin').read_bytes()
    checks={0x211E08C:0xE594003C,0x211E090:0xE3A01027,0x211E094:0xEBFCA33F,
            0x211E0E8:0xE2400002,0x211E0F8:0xE3500000,0x211E104:0xE3A00019,
            0x211E198:0xE3A01027,0x211E19C:0xEBFCA2FD,
            0x211DB90:0xE3A01001,0x211DB94:0xE3A02002,
            0x2120450:0xE3A01001,0x2120454:0xE3A02005}
    for address,expected in checks.items():assert struct.unpack_from('<I',overlay,address-0x210E8A0)[0]==expected,hex(address)
    pointer=struct.unpack_from('<I',arm,0x65158)[0]-0x2000000
    assert arm[pointer:arm.index(b'\0',pointer)]==b'e001_evolution_all'
    assert sequences[1]['frames'][2][0]==15 and sequences[1]['frames'][5][0]==18
    data={'width':meta['width'],'height':meta['height'],'cells':meta['frames'],'bounds':bounds,
          'sequences':sequences,'tickRate':60,'silhouetteSequence':39,'labelCell':15,'platformCell':18,
          'phases':{'intro':15,'gather':20,'morph':110,'hold':25,'whiteout':4,'flash':8,'reveal':60}}
    audit={'source':meta['source'],'sha256':{suffix:hashlib.sha256((root/'common'/('e001_evolution_all.'+suffix)).read_bytes()).hexdigest() for suffix in ['ncbr','ncer','nclr','nanr']},
           'overlay18Sha256':hashlib.sha256(overlay).hexdigest(),'instructionChecks':len(checks),
           'evidence':'ARM9 0x02065108..0x02065158 loads e001_evolution_all; overlay18 0x0211db90/94 selects sequence1 frame2(label); 0x02120450/54 selects sequence1 frame5(platform); 0x0211e08c..94 and 0x0211e198..19c select Digimon sequence39 during evolution; 0x0211e0c0..0x0211e1a0 alternates species with period20 down by2.',
           'webPolicy':'Original NANR at60Hz. Counter phases interpreted at60Hz; centering, 12 particle orbits/stagger, background and flash opacity are web presentation, not a frame-perfect original cutscene. Rules/results stay in core; animation does not evolve twice.'}
    return data,audit,(width,height,pixels)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('root',type=Path);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    data,audit,(w,h,pixels)=extract(args.root)
    out=REPO/'web/assets/evolution';out.mkdir(parents=True,exist_ok=True)
    write=sprites.png
    # 재검증할 때는 배포 파일을 덮어쓰지 않고 PNG 생성 결과를 비교한다.
    if args.check:
        class MemoryPNG:
            def write_bytes(self,content):self.content=content
        image=MemoryPNG();write(image,w,h,pixels)
        assert image.content==(out/'effects.png').read_bytes()
    else:write(out/'effects.png',w,h,pixels)
    for path,content in [(out/'effects.js','window.EVOLUTION_DATA='+json.dumps(data,separators=(',',':'))+';\n'),(REPO/'docs/evolution-animation-audit.json',json.dumps(audit,ensure_ascii=False,indent=2)+'\n')]:
        if args.check:assert path.read_text(encoding='utf-8')==content,path
        else:path.write_text(content,encoding='utf-8',newline='\n')
    print('22 original effect cells / 2 sequences / evolution silhouette39 verified')
