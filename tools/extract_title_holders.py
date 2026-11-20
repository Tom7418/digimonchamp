"""원본 실행 코드(root/ftc/arm9.bin)에서 타이틀 홀더 팀을 뽑아 src/data/title-holders.txt로 만든다.

확인한 원본 코드
- 타이틀 표 0x020CC524(40바이트) +8 = 홀더 팀 번호 (overlay9_10 0x2115E84 → 0x2113B14)
- 팀 표 0x020EC0B4(20바이트): +0·+4·+8 NPC 번호(−1 없음), +12 팀 이름 글 번호
- NPC 표 0x020E27B4(68바이트, 프리 배틀과 같은 표): 종·별명·능력치 곡선 번호·내성 곡선 번호,
  +0x3C 성격 번호 — 홀더는 이 성격으로 만든다(0x2113BDC가 0x2061DA8에 넘김. 프리 배틀은 −1 = 무작위)

사용: python tools/extract_title_holders.py [root 폴더]
"""
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
arm9 = (ROOT / 'ftc/arm9.bin').read_bytes()
parts = (ROOT / 'ui/txt/txt_list_txt.dat').read_bytes().split(b'<>\n')
text = [p.decode('utf-16-le', 'replace').rstrip('\0').strip() for p in parts[2:]]
species = [l.split('|')[0] for l in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines() if l and not l.startswith('#')]

lines = ['# 원본 타이틀 홀더 팀 (tools/extract_title_holders.py). 손으로 고치지 말 것',
         '# title|타이틀 번호|팀 번호',
         '# team|팀 번호|팀 이름|NPC 번호들',
         '# npc|번호|별명|종|레벨|상금|TP·공격·방어·지능·속도 곡선 번호|내성 곡선 번호(열,추위,빛,어둠,천둥)|성격 번호(0 솔직~7 겁쟁이)']
teams, npcs = set(), set()
for i in range(61):
    team = struct.unpack_from('<i', arm9, 0xCC524 + i * 40 + 8)[0]
    lines.append(f'title|{i}|{team}')
    teams.add(team)
for t in sorted(teams):
    w = struct.unpack_from('<5i', arm9, 0xEC0B4 + t * 20)
    # 종 코드 0xE4는 빈 칸 (0x2113BC8)
    members = [m for m in w[:3] if m >= 0 and arm9[0xE27B4 + m * 68] != 0xE4]
    npcs.update(members)
    lines.append(f'team|{t}|{text[w[3]]}|{",".join(map(str, members))}')
for i in sorted(npcs):
    rec = arm9[0xE27B4 + i * 68: 0xE27B4 + (i + 1) * 68]
    code, _, name_id, = struct.unpack_from('<3I', rec, 0)
    prize = struct.unpack_from('<H', rec, 0xC)[0]
    curves = struct.unpack_from('<5I', rec, 0x14)
    resist = struct.unpack_from('<5I', rec, 0x28)
    lines.append(f'npc|{i}|{text[name_id]}|{species[code - 8]}|{rec[0x43]}|{prize}|{",".join(map(str, curves))}|{",".join(map(str, resist))}|{rec[0x3C]}')
out = REPO / 'src/data/title-holders.txt'
out.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
print(len(teams), 'teams', len(npcs), 'npcs →', out)
