"""원본 실행 코드(root/ftc/arm9.bin)에서 프리 배틀 상대와 상금을 뽑아 src/data/free-battles.txt로 만든다.

확인한 원본 코드
- NPC 디지몬 표 0x020E27B4 (68바이트 × 578). +0 종 코드(-8 = species.txt 순서), +8 별명 글 번호,
  +0xC 상금(halfword), +0x40 최상위 바이트 = 레벨 1~10. 프리 배틀 상대는 456~575번.
- 하루 대진 생성 0x02067F04: 1:1·3:3 각각 레벨 슬롯 0·2·4·6·8에 무작위 0~4칸(0~9)을 더해 정렬.
  슬롯마다 후보표 0x020C7E24[레벨][계절 0~3, 4=공통]에서 아직 고르지 않은 상대를 고른다(0x20680DC).
  3:3은 대표 1명을 같은 레벨에서, 나머지 2명은 레벨+1(레벨 9는 레벨 8) 후보에서 고른다(0x206818C).
- 상금 = 상대 디지몬 상금의 합(0x02088334). 모든 배틀에 이겼을 때만 받는다(overlay9_8 0x2110668·0x2111fd4).

사용: python tools/extract_free_battles.py [root 폴더]
"""
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
BASE = 0x02000000
NPC, NPC_SIZE, FIRST, LAST = 0xE27B4, 68, 456, 575
POOLS = 0xC7E24

arm9 = (ROOT / 'ftc/arm9.bin').read_bytes()
parts = (ROOT / 'ui/txt/txt_list_txt.dat').read_bytes().split(b'<>\n')
text = [p.decode('utf-16-le', 'replace').rstrip('\0').strip() for p in parts[2:]]
species = [l.split('|')[0] for l in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines() if l and not l.startswith('#')]

lines = ['# 원본 프리 배틀 상대 (tools/extract_free_battles.py). 손으로 고치지 말 것',
         '# 번호|별명|종|레벨(1~10)|상금',
         '# pool|레벨(0~9)|계절(0봄~3겨울, 4공통)|후보 번호']
for i in range(FIRST, LAST + 1):
    rec = arm9[NPC + i * NPC_SIZE: NPC + (i + 1) * NPC_SIZE]
    code, _, name_id = struct.unpack_from('<3I', rec, 0)
    prize = struct.unpack_from('<H', rec, 0xC)[0]
    level = rec[0x43]
    lines.append(f'{i}|{text[name_id]}|{species[code - 8]}|{level}|{prize}')
for lv in range(10):
    for season in range(5):
        p = struct.unpack_from('<I', arm9, POOLS + lv * 0x14 + season * 4)[0] - BASE
        n, lst = arm9[p], struct.unpack_from('<I', arm9, p + 4)[0] - BASE
        ids = struct.unpack_from(f'<{n}I', arm9, lst)
        lines.append(f'pool|{lv}|{season}|{",".join(map(str, ids))}')
out = REPO / 'src/data/free-battles.txt'
out.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
print(LAST - FIRST + 1, '명 →', out)
