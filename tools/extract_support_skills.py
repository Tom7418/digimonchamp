"""원본 종/성격별 SP 두 칸과 한글 이름·소비TP를 변환한다.
python tools/extract_support_skills.py <원본 root> [--check]
원본 실행 파일과 문장 본문은 배포하지 않는다. 효과 수치/AI와 공격 속성 대응은 별도 웹판 정책.
"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
import struct,json,hashlib
import argparse
parser=argparse.ArgumentParser()
parser.add_argument('root',type=Path)
parser.add_argument('--check',action='store_true')
args=parser.parse_args();root=args.root
repo=Path(__file__).resolve().parents[1]
arm=(root/'ftc/arm9.bin').read_bytes();ov=(root/'ftc/overlay9_19').read_bytes()
# 종 표 포인터는 영문 이름(+4)을 가리킨다. 실제 두 성격 비교/세 쌍 선택 코드를 대조한다.
checks={0x206b55c:0x020c0894,0x206af1c:0xe3a02084,0x206b2f0:0xe5923048,0x206b2fc:0xe5923050,0x206b304:0xe5922054,0x206b310:0xe592304c,0x206b31c:0xe5923058,0x206b324:0xe592205c,0x206b330:0xe5923060,0x206b338:0xe5922064}
for a,v in checks.items():assert struct.unpack_from('<I',arm,a-0x2000000)[0]==v,hex(a)
from extract_text import read_dat
texts=read_dat((root/'ui/txt/txt_list_txt.dat'))
natures=[s.replace('성급함','성급한') for s in texts[445:453]];assert natures==['솔직','제멋대로','성급한','게으름','열혈','쿨','대담','겁쟁이']
def write(name,content):
 path=repo/name
 if args.check:assert path.read_text(encoding='utf-8')==content,name
 else:path.write_text(content,encoding='utf-8',newline='\n')
skills=[]
for i in range(1,31):
 off=0xd02cc+i*104
 skills.append(dict(id=i,name=texts[1270+i],tpCost=struct.unpack_from('<H',arm,off+72)[0]))
species={}
for i,line in enumerate((repo/'src/data/species.txt').read_text(encoding='utf-8').splitlines()[2:]):
 row=arm[0xc0cb0+i*132:0xc0cb0+(i+1)*132];vals=struct.unpack_from('<8I',row,76)
 assert all(v<8 for v in vals[:2]);assert all(0<=v<=30 for v in vals[2:])
 species[line.split('|')[0]]=dict(personalities=[natures[v] for v in vals[:2]],pairs=[list(vals[2:4]),list(vals[4:6]),list(vals[6:8])])
write('src/data/support-skills.json',json.dumps(dict(skills=skills,species=species,elements={str(i):struct.unpack_from('<I',arm,0xd02cc+i*104+88)[0] for i in range(31,596)}),ensure_ascii=False,indent=2)+'\n')
write('docs/support-skills-audit.json',json.dumps(dict(arm9Sha256=hashlib.sha256(arm).hexdigest(),overlay19Sha256=hashlib.sha256(ov).hexdigest(),species=216,skills=30,personalityTextRange=[445,453],skillTextRange=[1271,1301],speciesOffsets=dict(conditions=[76,80],pairs=[[84,88],[92,96],[100,104]]),tpCostOffset=72,evidence=['ARM9 0x0206af18..0x0206af20 species pointer = 0x020c0894 + internalID*132','ARM9 0x0206b2ec..0x0206b33c selects first matching personality pair, otherwise default','overlay19 0x02117748..0x02117848 reads two support slots from actor+0x12c/+0x130'],instructionChecks={hex(a):hex(v) for a,v in checks.items()},unverified=['support AI frequency, durations and effect magnitudes; web policies explicitly documented','attack +88 element labels inferred from named fire/cold/thunder/light/dark skills; instruction-level enum mapping unverified']),ensure_ascii=False,indent=2)+'\n')
print('support data:',species['아구몬'],species['파닥몬'],skills[:3])
