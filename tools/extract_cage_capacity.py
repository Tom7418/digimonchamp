"""원작 실행 코드의 시설 마스크→정원 계산을 재현한다. 원본 바이너리/문장은 저장하지 않는다."""
from pathlib import Path
import re,json,hashlib,struct,argparse
from extract_text import read_dat
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
repo=Path(__file__).resolve().parents[1];root=repo.parent
arm=(root/'ftc/arm9.bin').read_bytes();farm=(root/'ftc/overlay9_18').read_bytes();raw=root/'ui/txt/txt_list_txt.dat';texts=read_dat(raw)
def word(a):return struct.unpack_from('<I',arm,a-0x2000000)[0]
def target(a):
 v=struct.unpack_from('<I',farm,a-0x210e8a0)[0]&0xffffff
 if v&0x800000:v-=0x1000000
 return a+8+v*4
# Constructor: type *40 -> shape byte -> shape mask -> popcount -> *2 -> object+9.
checks={0x204f31c:0xe3a02028,0x204f374:0xe7d00001,0x204f37c:0xe1a00080,0x204f380:0xe5c40009,0x204f260:0xe5d00009}
for a,w in checks.items():assert word(a)==w,hex(a)
# Runtime animal count - this capacity -> +0x410 excess count.
assert target(0x211a1c4)==0x204f2f8 and target(0x211a1c8)==0x204f05c
assert target(0x211a1d4)==0x204f260
assert struct.unpack_from('<I',farm,0x211a1e0-0x210e8a0)[0]==0xe0422000
assert word(0x204f388)==0x20c81dc and word(0x204f390)==0x209ede0
# popcount implementation uses the standard 0x55555555/0x33333333/0x0f0f0f0f masks.
assert [word(a) for a in [0x201a9f0,0x201a9f4,0x201a9f8]]==[0x55555555,0x33333333,0x0f0f0f0f]
help_values={}
for no in range(1,41):
 clean=re.sub(r'⎋.','',texts[526+no]);match=re.search(r'수용수\s*(\d+)',clean)
 if match:help_values[str(no)]=int(match[1])
result=dict(help_values);rows=[];differences=[]
for index in range(37):
 offset=0xc81dc+40*index;shape=arm[offset];mask=arm[0x9ede0+shape]
 ptr=struct.unpack_from('<I',arm,offset+4)[0]-0x2000000
 resource=arm[ptr:arm.index(b'\0',ptr)].decode('ascii');no=int(re.search(r'cm(\d+)',resource)[1]);assert no!=0
 capacity=mask.bit_count()*2;assert capacity>0
 result[str(no)]=capacity
 rows.append(dict(facilityNo=no,tableIndex=index,shape=shape,mask=mask,capacity=capacity))
 if str(no) in help_values and help_values[str(no)]!=capacity:differences.append(dict(facilityNo=no,help=help_values[str(no)],code=capacity))
assert differences==[{'facilityNo':25,'help':2,'code':4},{'facilityNo':31,'help':6,'code':4}]
assert result['16']==2 and result['31']==4 and result['25']==4
code_numbers={r['facilityNo'] for r in rows}
audit={'source':'arm9 0x0204F318..0x0204F384; table0x020C81DC stride40; shapeMask0x0209EDE0; capacity=popcount(mask)*2',
 'runtime':'overlay18 0x0211A1C0..0x0211A1E8 counts occupants and subtracts getter0x0204F260 (object byte+9)',
 'instructionChecks':len(checks)+3,'codeFacilities':rows,'helpDifferences':differences,
 'helpOnlyFacilities':[int(n) for n in help_values if int(n) not in code_numbers],
 'sha256':{'arm9':hashlib.sha256(arm).hexdigest(),'overlay18':hashlib.sha256(farm).hexdigest(),'help':hashlib.sha256(raw.read_bytes()).hexdigest()},
 'scope':'Basic cage no0 excluded. Facilities33/36/38 absent from the runtime table retain help capacity2; not claimed as code-confirmed.'}
for name,data in [('src/data/cage-capacity.json',result),('docs/cage-capacity-audit.json',audit)]:
 content=json.dumps(data,indent=2)+'\n';path=repo/name
 if args.check:assert path.read_text(encoding='utf-8')==content,name
 else:path.write_text(content,encoding='utf-8',newline='\n')
print('Verified 37 executable entries; corrected zoo25 and clinic31 to4; basic excluded')
