"""원본 DATR의 사냥 지형을 압축 수치 JSON으로 변환하고 코드 근거를 검사한다.
python tools/extract_hunt_terrain.py [원본 root] [--check]
원본 ATR/실행 코드는 저장소에 복사하지 않는다.
"""
import argparse
from collections import Counter
from itertools import groupby
import hashlib
import json
from pathlib import Path
import struct

REPO = Path(__file__).resolve().parents[1]
FIELDS = {'다이나 초원':'01','대초원':'02','모쥬라의 숲':'03','부츠 정글':'04','미끌미끌 늪':'05','파도치는 해변':'06',
          '바위산':'08','크롬 광산':'09','기계 공장':'10','하수도':'11','눈의 왕국':'13','암반 계곡':'14',
          '용암지대':'15','이글이글 사막':'16','오아시스':'17','잉카 유적':'18'}

def extract(root):
    maps, audit = {}, {}
    for no in FIELDS.values():
        stem=f'field_hm{no}_01'
        raw=(root/'field'/f'{stem}.atr').read_bytes()
        assert raw[:4]==b'DATR'
        version,width,height=struct.unpack_from('<3I',raw,4)
        assert version==2 and len(raw)==16+width*height
        assert (width,height)==(128,128)
        png=(REPO/'web/assets/fields'/f'{no}_01.png').read_bytes()
        assert struct.unpack_from('>II',png,16)==(width*8,height*8)
        cells=raw[16:];assert set(cells)<=set(range(6))
        runs=[]
        for value,group in groupby(cells):runs.extend([value,sum(1 for _ in group)])
        maps[no]={'width':width,'height':height,'runs':runs}
        night=root/'field'/f'field_hm{no}_02.atr'
        if night.exists():assert night.read_bytes()==raw, no
        audit[no]={'sha256':hashlib.sha256(raw).hexdigest(),'counts':dict(sorted(Counter(cells).items())),
                   'nightIdentical':night.exists(),'solidCells':sum(v for k,v in Counter(cells).items() if k&1)}
    arm=(root/'ftc/arm9.bin').read_bytes();hunt=(root/'ftc/overlay9_0').read_bytes()
    checks={0x0207bcf0:0xe5860000,0x0207bcfc:0xe5860004,0x0207bd08:0xe5861008,
            0x0207bde8:0xe7d10000,0x0207bdec:0xe2000001,
            0x0207bec4:0xe3100001,0x0207bed0:0xe3100002,0x0207bedc:0xe3100004}
    for address,word in checks.items():assert struct.unpack_from('<I',arm,address-0x02000000)[0]==word,hex(address)
    assert struct.unpack_from('<I',hunt,0x0210f7d4-0x0210e8a0)[0]==0xe1a011c1
    branch=struct.unpack_from('<I',hunt,0x0210f7e0-0x0210e8a0)[0]
    offset=branch&0xffffff
    if offset&0x800000:offset-=0x1000000
    assert branch>>24==0xeb and 0x0210f7e0+8+offset*4==0x0207bd60
    data={'tileSize':8,'fields':FIELDS,'maps':maps}
    report={'maps':audit,'instructionChecks':len(checks)+2,'verified':{
       'loader':'0x0207bc88: 16-byte header, width/height, byte cells',
       'solidQuery':'0x0207bd60..0x0207bdf0: out of bounds=1, cell & 1',
       'terrainQuery':'0x0207bea4: solid bit0, terrain bit1/bit2',
       'huntMovement':'overlay0 0x0210f7d4..0x0210f7e8: /8 tile lookup; solid rejects movement'},
       'limits':['차단 비트0만 통행을 막는다. 물/눈 속성 비트 자체는 차단으로 해석하지 않는다',
                 '웹판 이동 경로의 작은 보폭 검사/벽 미끄러짐과 발 반경은 웹 구현 정책. 원작 전체 경로 탐색은 후속']}
    return {REPO/'src/data/hunt-terrain.json':json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',
            REPO/'docs/hunt-terrain-audit.json':json.dumps(report,ensure_ascii=False,indent=2)+'\n'}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root',nargs='?',type=Path,default=REPO.parent)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    for path,content in extract(args.root).items():
        if args.check:assert path.read_text(encoding='utf-8')==content,path
        else:path.write_text(content,encoding='utf-8',newline='\n')
    print('16 terrain maps, day/night equality, 11 original instruction checks passed')
