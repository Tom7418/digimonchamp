"""원본 실행 코드(root/ftc/arm9.bin)의 디지몬 표에서 속성·종족을 뽑아 src/data/species.txt로 만든다.

사용법 (Windows PowerShell):
    python tools/extract_species.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"

표 위치와 형식 (확인한 것만):
  - arm9.bin 0xC0CB0부터 132바이트씩 216종. 순서는 root/ui/txt/db_txt_list_txt.dat의 이름 순서와 같다.
  - +0  u32  (미확인)
  - +4  포인터 3개: 영문 이름(AGUMON), 그림 파일 이름(m201_agumon), 일본어 이름. 주소 - 0x02000000 = 파일 위치
  - +16 u32 세대 (1 유년기1 ~ 6 궁극체)
  - +20 u32 속성: 0 없음(유년기), 1 백신, 2 바이러스, 3 데이터, 4 프리
  - +28 u32 종족 비트: 1 짐승, 2 기계, 4 벌레풀, 8 새, 16 용, 32 물, 64 성, 128 암흑 (0은 유년기1)
  나머지 칸(크기·수명으로 보이는 값 등)은 아직 뜻을 확인하지 못해 쓰지 않는다.
원본 글은 저장소에 옮기지 않는다. 이 파일에는 이름과 분류 값만 쓴다.
"""
import struct, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
TABLE, SIZE, COUNT, BASE = 0xC0CB0, 132, 216, 0x02000000
ATTR = {0: '없음', 1: '백신', 2: '바이러스', 3: '데이터', 4: '프리'}
FAMILY = {0: '없음', 1: '짐승', 2: '기계', 4: '벌레풀', 8: '새', 16: '용', 32: '물', 64: '성', 128: '암흑'}
# 같은 이름이 둘인 종과 표기가 다른 종 → 이 저장소(src/data/evolutions.txt)의 이름
RENAME = {
    'GARURUMON_VI': '가루몬(흑)', 'WEREGARURUMON_VI': '워가루몬(흑)', 'METALGARURUMON_VI': '메탈가루몬(흑)',
    'METALGREYMON_VI': '메탈그레이몬(청)', 'COREDRAMON_TEN': '코어드라몬(청)', 'COREDRAMON_TI': '코어드라몬(녹)',
    'DELUMON': '뿌띠몬', 'HOUOUMON': '페닉스몬',
}

arm9 = (ROOT / 'ftc/arm9.bin').read_bytes()
# 글 파일 형식: 'utf-16<>\n' + 개수 + '<>\n' 뒤에 UTF-16LE 문자열이 1바이트 '<>\n'으로 이어진다 (tools/extract_text.py)
parts = (ROOT / 'ui/txt/db_txt_list_txt.dat').read_bytes().split(b'<>\n')
names = [p.decode('utf-16-le', 'replace').rstrip('\0').strip() for p in parts[2:2 + COUNT]]

def cstr(pointer):
    o = pointer - BASE
    return arm9[o:arm9.index(b'\0', o)].decode('ascii')


lines = ['# 원본 실행 코드의 디지몬 표에서 뽑은 속성·종족 (tools/extract_species.py). 손으로 고치지 말 것',
         '# 이름|속성|종족|세대|원본 영문 이름']
for i in range(COUNT):
    rec = arm9[TABLE + i*SIZE: TABLE + (i+1)*SIZE]
    english = cstr(struct.unpack_from('<I', rec, 4)[0])
    stage, attr, _, family = struct.unpack_from('<4I', rec, 16)
    lines.append('|'.join([RENAME.get(english, names[i]), ATTR[attr], FAMILY[family], str(stage), english]))
out = REPO / 'src/data/species.txt'
out.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
print(len(lines) - 2, '종 →', out)
