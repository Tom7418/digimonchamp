"""원본 실행 코드(root/ftc/arm9.bin)의 아이템 표에서 사냥 물품의 가격·해금 조건을 뽑아 src/data/shop.txt로 만든다.

사용법 (Windows PowerShell):
    python tools/extract_shop.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"

표 위치와 형식:
  - arm9.bin 0xE067C부터 56바이트(i32 14개)씩. 이름 글 번호가 338(디지 로프α)부터 이어진다.
  - 한 물품의 값은 '앞 줄의 뒤쪽 9칸 + 자기 줄의 앞쪽 5칸'이다 (이름이 레코드 중간에 있다):
      분류, 분류 안 순서, (주소), 해금 종류, 해금 값, 처음 가진 수, (1), 최대 소지 수, 이름 글 번호, 설명 글 번호, 가격, 0, 0
  - 해금 종류: 0 처음부터, 1 테이머 랭크(값 1~8 = 블루~챔프), 2 타이틀(값 = 타이틀 매치 번호, 그 타이틀을 따면 해금)
    근거: 종류 2의 값이 모두 0~60 범위의 타이틀 번호이고, 종류 1의 값은 1~8이며 사냥터 표(0xC8A84)도 같은 형식을 쓴다.
  - 로프·샷·와이어·고기·미끼·라이트·폭탄·마인·함정·메모리카드(338~383, 430~432번)만 쓴다.
    뒤에 이어지는 애널라이저·체커·제너레이터·서치·레이더(플러그인)는 아직 게임에 없어 뺀다.
"""
import struct, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
TABLE, SIZE, COUNT = 0xE067C, 56, 49

arm9 = (ROOT / 'ftc/arm9.bin').read_bytes()
parts = (ROOT / 'ui/txt/txt_list_txt.dat').read_bytes().split(b'<>\n')
text = [p.decode('utf-16-le', 'replace').rstrip('\0') for p in parts[2:]]

lines = ['# 원본 실행 코드의 아이템 표 (tools/extract_shop.py). 손으로 고치지 말 것',
         '# 이름|가격|해금 종류(0 처음, 1 랭크, 2 타이틀)|해금 값|처음 가진 수|최대 소지 수']
for i in range(COUNT):
    name, _, price = struct.unpack_from('<3i', arm9, TABLE + i*SIZE)
    kind, value, start, _, most = struct.unpack_from('<5i', arm9, TABLE + i*SIZE - 20)
    lines.append('|'.join(map(str, [text[name].strip(), price, kind, value, start, most])))
out = REPO / 'src/data/shop.txt'
out.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
print(COUNT, '개 →', out)
