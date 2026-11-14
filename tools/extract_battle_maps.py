"""원본 배틀 맵11종과 타이틀별 선택 규칙을 변환한다.
python tools/extract_battle_maps.py <원본 root> [--check]
NBS/NCGR/NCLR와 BSAR 첫 프레임을 PNG로 변환. 원본 파일은 배포하지 않는다.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zlib

REPO = Path(__file__).resolve().parents[1]
BASE = 0x02000000
NAMES = ['일반 경기장','초원','화산','섬','설원','사막','사이버 공간','지옥','콜로세움','스타디움','돔 스타디움']


def png(w, h, pixels):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data))
    colors={}
    for i in range(0,len(pixels),3):
        color=bytes(pixels[i:i+3])
        if color not in colors:colors[color]=len(colors)
        if len(colors)>256:break
    if len(colors)<=256:
        indices=bytes(colors[bytes(pixels[i:i+3])] for i in range(0,len(pixels),3))
        raw=b''.join(b'\0'+indices[y*w:(y+1)*w] for y in range(h))
        kind,extra=3,chunk(b'PLTE',b''.join(colors))
    else:
        raw=b''.join(b'\0'+pixels[y*w*3:(y+1)*w*3] for y in range(h))
        kind,extra=2,b''
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,kind,0,0,0)) + extra + chunk(b'IDAT',zlib.compress(raw,9)) + chunk(b'IEND',b'')


def background(folder, stem):
    hashes = {}
    def read(suffix):
        path = folder / (stem + suffix)
        data = path.read_bytes(); hashes[path.name] = hashlib.sha256(data).hexdigest()
        return data
    def tiles(suffix):
        data = read(suffix + '.ncgr')
        assert struct.unpack_from('<I',data,28)[0] == 4
        return data[48:]
    def palette(suffix):
        return [bytes(((v&31)*255//31,((v>>5)&31)*255//31,((v>>10)&31)*255//31)) for v, in struct.iter_unpack('<H',read(suffix+'.nclr')[40:])]
    screen = read('.nbs'); assert screen[:4] == b'NBSR'
    tw, th, layers = struct.unpack_from('<3I',screen,8)
    assert (tw, th, layers) == (52,34,1)
    w,h = tw*8,th*8; out = bytearray(w*h*3)
    def draw(tx,ty,entry,data,colors,skip_zero):
        # NBS 배틀 맵: 하위14비트 타일, bit14 좌우/bit15 상하 반전 (NSCR의10비트 형식과 다름).
        tile=entry&0x3fff
        assert tile*64+64 <= len(data)
        for y in range(8):
            for x in range(8):
                sx=7-x if entry&0x4000 else x;sy=7-y if entry&0x8000 else y
                index=data[tile*64+sy*8+sx]
                if skip_zero and index==0: continue
                offset=((ty*8+y)*w+tx*8+x)*3
                out[offset:offset+3]=colors[index]
    if (folder/(stem+'_anim.bsa')).exists():
        anim=read('_anim.bsa'); assert anim[:4]==b'BSAR'
        frames=struct.unpack_from('<I',anim,12)[0]
        aw,ah=struct.unpack_from('<2I',anim,28)
        cells=struct.unpack_from(f'<{aw*ah}H',anim,36)
        count=struct.unpack_from('<I',anim,36+aw*ah*2)[0]
        table=struct.unpack_from(f'<{count*frames}H',anim,40+aw*ah*2)
        data,colors=tiles('_anim'),palette('_anim')
        for y in range(min(th,ah)):
            for x in range(min(tw,aw)):
                entry=cells[y*aw+x]
                if entry<count:draw(x,y,table[entry*frames],data,colors,False)
    data,colors=tiles(''),palette('')
    for y in range(th):
        for x in range(tw):draw(x,y,struct.unpack_from('<H',screen,20+2*(y*tw+x))[0],data,colors,True)
    return png(w,h,out),hashes


def extract(root):
    arm=(root/'ftc/arm9.bin').read_bytes()
    menu=(root/'ftc/overlay9_10').read_bytes()
    battle=(root/'ftc/overlay9_19').read_bytes()
    checks={0x2115CA0:0xE59F12D0,0x2115CB0:0xEBFDEF67,0x2115CD0:0xE59F22A0,
            0x2115CDC:0xE1510000,0x2115CE4:0x03A01009,0x2115CE8:0x058014FC,
            0x21164F8:0xE3510006,0x21164FC:0x13510008,0x2116500:0x13510009,
            0x2116504:0x1351000A,0x2116514:0xE351000B,0x2116598:0x05810C9C,0x21165A0:0x15812C9C,
            0x21155C4:0xE58014FC,0x2115640:0xE58014FC}
    for address, word in checks.items():assert struct.unpack_from('<I',menu,address-0x210E8A0)[0]==word
    for address,word in {0x210F4B8:0xE5923C9C,0x210F4E4:0xE3A02018,0x210F4E8:0xE0070293,0x210F4EC:0xE59F2D7C,0x210F4F4:0xE7922007}.items():
        assert struct.unpack_from('<I',battle,address-0x210E8A0)[0]==word
    # 타이틀 조건의 환경(+16)을 메뉴 조건(+16)에 복사하는 원본 코드도 확인한다.
    for address,word in {0x2091AAC:0xE7913000,0x2091AB4:0xE5853010}.items():
        assert struct.unpack_from('<I',arm,address-BASE)[0]==word
    def cstr(pointer):
        offset=pointer-BASE
        return arm[offset:arm.index(b'\0',offset)].decode('ascii')
    maps=[];images={};sources={}
    for index in range(11):
        name,stem,*_=struct.unpack_from('<6I',arm,0xCB668+index*24)
        name,stem=cstr(name),cstr(stem)
        assert stem==f'field_bm{index+1:02}_01'
        image,hashes=background(root/'field',stem)
        asset=f'assets/battle/maps/{index}.png';images[REPO/'web'/asset]=image
        maps.append({'id':index,'name':NAMES[index],'originalName':name,'stem':stem,'asset':asset,'width':416,'height':272})
        sources.update(hashes)
    titles={}
    for i in range(61):
        _,_,number,ref,*_=struct.unpack_from('<2I8i',arm,0xCC524+i*40)
        environment=struct.unpack_from('<i',arm,0xCBDF4+ref*40+16)[0] if ref>=0 else 9
        assert environment == -1 or 0<=environment<11
        titles[f'm{number}']=None if environment==-1 else environment
    data={'maps':maps,'randomPool':[0,1,2,3,4,5,7],'titles':titles}
    audit={'arm9Sha256':hashlib.sha256(arm).hexdigest(),'menuSha256':hashlib.sha256(menu).hexdigest(),
           'battleSha256':hashlib.sha256(battle).hexdigest(),'mapTable':'0x020cb668','stride':24,
           'instructionChecks':22,'sources':sources,'titleFixed':sum(v is not None for v in titles.values()),
           'titleRandom':sum(v is None for v in titles.values()),
           'evidence':'overlay10 0x02115c94..0x02115ce8 loads title condition; missing condition -> stadium9. ARM9 0x02091a54 copies condition environment. overlay10 0x021164dc..0x021165a0 uses specified environment or random IDs excluding6/8/9/10. overlay19 0x0210f4b8..0x0210f4fc loads 24-byte map row.',
           'webPolicy':'Static first BSAR frame. Map object decorations, animated water/lava and terrain effects remain future work. Korean map labels are web labels.'}
    return data,audit,images


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('root',type=Path);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    data,audit,images=extract(args.root)
    for path,value in [(REPO/'src/data/battle-maps.json',data),(REPO/'docs/battle-maps-audit.json',audit)]:
        images[path]=(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
    for path,content in images.items():
        if args.check:assert path.read_bytes().replace(b'\r\n',b'\n')==content if path.suffix=='.json' else path.read_bytes()==content,path
        else:path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(content)
    print(f"11 maps; {audit['titleFixed']} fixed titles / {audit['titleRandom']} original random titles verified")
