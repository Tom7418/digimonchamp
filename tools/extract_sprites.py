"""Decode local Nitro NCBR/NCER/NCLR cells into transparent PNG sheets.

No third-party packages. Original files are read only.
"""
import json
import argparse
import struct
import zlib
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parent
OUT = PROJECT / 'web' / 'assets'
SIZES = (((8,8),(16,16),(32,32),(64,64)),
         ((16,8),(32,8),(32,16),(64,32)),
         ((8,16),(8,32),(16,32),(32,64)))

def png(path, w, h, pixels):
    def chunk(t, b):
        return struct.pack('>I',len(b))+t+b+struct.pack('>I',zlib.crc32(t+b))
    raw = b''.join(b'\0'+pixels[y*w*4:(y+1)*w*4] for y in range(h))
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))

def extract(stem, folder='digimon'):
    # 디지몬과 UI 아이콘은 같은 Nitro 셀 형식을 사용하므로 폴더만 바꿔 재사용한다.
    p = ROOT / folder / (stem+'_main')
    c=p.with_suffix('.ncer').read_bytes()
    graphics=p.with_suffix('.ncbr').read_bytes()
    depth=8 if struct.unpack_from('<I',graphics,28)[0]==4 else 4
    g=graphics[48:]
    pal=p.with_suffix('.nclr').read_bytes()[40:]
    colors=[]
    for (v,) in struct.iter_unpack('<H',pal):
        colors.append(bytes(((v&31)*255//31,((v>>5)&31)*255//31,((v>>10)&31)*255//31,255)))
    count, kind, offset, mapping=struct.unpack_from('<HHII',c,24)
    stride=16 if kind else 8
    bank=24+offset
    oams=bank+count*stride
    transfer_offset=struct.unpack_from('<I',c,36)[0]
    transfer=24+transfer_offset if transfer_offset else None
    frames=[]
    for i in range(count):
        n,_,off=struct.unpack_from('<HHI',c,bank+i*stride)
        objs=[]
        for j in range(n):
            a,b,d=struct.unpack_from('<HHH',c,oams+off+j*6)
            shape=a>>14
            if shape==3: continue
            w,h=SIZES[shape][b>>14]
            x=b&511; y=a&255
            if x>=256:x-=512
            if y>=128:y-=256
            objs.append((x,y,w,h,d,b))
        frames.append(objs)
    # A shared origin preserves alignment across all cells.
    left=min(o[0] for f in frames for o in f); top=min(o[1] for f in frames for o in f)
    right=max(o[0]+o[2] for f in frames for o in f); bottom=max(o[1]+o[3] for f in frames for o in f)
    w,h=right-left,bottom-top
    pixels=bytearray(w*count*h*4)
    for i,objs in enumerate(frames):
        graphics_base=struct.unpack_from('<I',c,transfer+8+i*8)[0] if transfer else 0
        for x,y,ow,oh,d,b in reversed(objs):
            address=graphics_base+(d&1023)*(32<<mapping)
            for py in range(oh):
                for px in range(ow):
                    sx=ow-1-px if b&4096 else px
                    sy=oh-1-py if b&8192 else py
                    q=sy*ow+sx
                    byte_offset=address+(q if depth==8 else q//2)
                    if byte_offset>=len(g):raise ValueError('Sprite data exceeds graphics bank')
                    index=g[byte_offset] if depth==8 else (g[byte_offset]>>(4*(q%2)))&15
                    if not index:continue
                    color=colors[index if depth==8 else (d>>12)*16+index]
                    dest=((y-top+py)*w*count+i*w+x-left+px)*4
                    pixels[dest:dest+4]=color
    png(OUT/(stem+'.png'),w*count,h,pixels)
    # 모든 프레임이 같은 칸 크기를 쓰므로(공격·이펙트 프레임 포함) 칸 아래쪽에 빈 공간이 생긴다.
    # 가장 많은 프레임에서 발끝이 닿는 줄을 baseline으로 기록해 화면에서 그 줄을 땅에 맞춘다.
    bottoms=[]
    for i in range(count):
        low=0
        for yy in range(h):
            row=yy*w*count+i*w
            if any(pixels[(row+xx)*4+3] for xx in range(w)): low=yy+1
        if low: bottoms.append(low)
    baseline=max(set(bottoms),key=bottoms.count) if bottoms else h
    return dict(id=stem,width=w,height=h,frames=count,baseline=baseline,source=str(p.relative_to(ROOT)).replace('\\','/'))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-root', type=Path, default=ROOT, help='Directory containing the original digimon folder')
    parser.add_argument('--output', type=Path, default=OUT)
    args=parser.parse_args()
    ROOT=args.source_root.resolve()
    OUT=args.output.resolve()
    OUT.mkdir(parents=True,exist_ok=True)
    # tools/sprite_names.json: 원본 파일명 → 진화표 한글 이름 (디지에그 + 216종)
    names=json.loads((PROJECT/'tools'/'sprite_names.json').read_text(encoding='utf-8'))
    names.pop('_note',None)
    data=[]
    for stem,name in names.items():
        try:
            data.append(dict(extract(stem),name=name))
        except FileNotFoundError:
            print('원본 없음, 건너뜀:',stem)
    (OUT/'sprites.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
    # JS also works when index.html is opened directly without a server.
    (OUT/'sprites.js').write_text('window.SPRITES = '+json.dumps(data)+';',encoding='utf-8')
    print(f'{len(data)}종 변환 완료 → {OUT}')
