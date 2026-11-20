"""원본 실행 코드(root/ftc/arm9.bin)에서 도감 순서를 뽑아 src/data/dex.txt로 만든다.

확인한 원본 코드
- 도감 표 0x020EDE78(8바이트×216): +0 종 코드(디지몬 표 번호+8), +4 그림 이름 문자열 주소.
  도감 화면 overlay9_16 0x210F3D8~0x210F43C가 이 순서로 216칸을 만들고, 칸마다 테이머 +0x4EE+칸 번호의 등록 바이트를 읽는다.
- 등록: 육성 overlay9_18 0x211A0FC~0x211A16C가 진화한 종의 칸에 1을 쓴다(진화 전 종은 +0x5C6 칸에 1).
  사냥 포획(overlay9_14 0x210F63C)도 같은 칸에 쓴다.

사용: python tools/extract_dex.py [root 폴더]
"""
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
arm9 = (ROOT / 'ftc/arm9.bin').read_bytes()
species = [l.split('|')[0] for l in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines() if l and not l.startswith('#')]
codes = [struct.unpack_from('<I', arm9, 0xEDE78 + i * 8)[0] for i in range(216)]
assert sorted(codes) == list(range(8, 8 + len(species)))
out = REPO / 'src/data/dex.txt'
out.write_text('# 원본 도감 순서 (tools/extract_dex.py, arm9 0x020EDE78). 한 줄에 한 종, 줄 번호 = 도감 번호\n'
               + '\n'.join(species[c - 8] for c in codes) + '\n', encoding='utf-8', newline='\n')
print(len(codes), '→', out)
