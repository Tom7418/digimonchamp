"""원본 NBSR 타일 지도를 읽어 케이지 시설 배경을 복원한다.

NBSR 헤더: magic/version/가로 타일 수/세로 타일 수/레이어 수(각 4바이트).
현재 사용하는 파일은 단일 레이어이며 타일 번호는 16비트이다.
"""
import struct
from pathlib import Path
from extract_sprites import png

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parents[1]/'web/assets/facilities'
OUT.mkdir(parents=True,exist_ok=True)
for kind,number in [('free',1),('field',2),('gym',4),('clinic',16)]:
    base=ROOT/'training'/f'field_cm{number:02}_01'
    screen=base.with_suffix('.nbs').read_bytes()
    assert screen[:4]==b'NBSR'
    tw,th,layers=struct.unpack_from('<III',screen,8)
    assert layers==1 and len(screen)==20+tw*th*2
    gfx=base.with_suffix('.ncgr').read_bytes()
    depth=8 if struct.unpack_from('<I',gfx,28)[0]==4 else 4
    data=gfx[48:];pal=base.with_suffix('.nclr').read_bytes()[40:]
    colors=[bytes(((v&31)*255//31,((v>>5)&31)*255//31,((v>>10)&31)*255//31,255)) for v, in struct.iter_unpack('<H',pal)]
    w,h=tw*8,th*8;out=bytearray(w*h*4)
    for y in range(h):
        for x in range(w):
            entry=struct.unpack_from('<H',screen,20+((y//8)*tw+x//8)*2)[0]
            tx=7-x%8 if entry&1024 else x%8;ty=7-y%8 if entry&2048 else y%8
            n=(entry&1023)*64+ty*8+tx
            index=data[n] if depth==8 else (data[n//2]>>(4*(n%2)))&15
            if not index:continue
            out[(y*w+x)*4:(y*w+x+1)*4]=colors[index if depth==8 else (entry>>12)*16+index]
    png(OUT/(kind+'.png'),w,h,out)
    print(kind,w,h)
