"""원본 실행 코드(root/ftc/arm9.bin)의 아이템 표에서 사냥 물품의 가격·해금 조건을 뽑아 src/data/shop.txt로 만든다.

사용법 (Windows PowerShell):
    python tools/extract_shop.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"

표 위치와 형식:
  - arm9.bin 0xE067C부터 56바이트(i32 14개)씩. 이름 글 번호가 338(디지 로프α)부터 이어진다.
  - 한 물품의 값은 '앞 줄의 뒤쪽 9칸 + 자기 줄의 앞쪽 5칸'이다 (이름이 레코드 중간에 있다):
      분류, 분류 안 순서, (주소), 해금 종류, 해금 값, 처음 가진 수, (1), 최대 소지 수, 이름 글 번호, 설명 글 번호, 가격, 0, 0
  - 해금 종류: 0 처음부터, 1 테이머 랭크(값 1~8 = 블루~챔프), 2 타이틀(값 = 타이틀 매치 번호, 그 타이틀을 따면 해금)
    근거: 종류 2의 값이 모두 0~60 범위의 타이틀 번호이고, 종류 1의 값은 1~8이며 사냥터 표(0xC8A84)도 같은 형식을 쓴다.
  - 로프·샷·와이어·고기·미끼·라이트·폭탄·마인·함정·메모리카드(338~383, 430~432번)와
    이어지는 플러그인 30종(278~307번: 분류 1 애널라이저 9·2 체커 5·3 제너레이터·서치·레이더 15·4 메모리 체커)을 쓴다.
    플러그인 분류·순서는 사냥 준비 화면(overlay9_12 0x2117F40 이름 표, 0x2114318 목록)과 같다.
"""
import struct, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
TABLE, SIZE, COUNT = 0xE067C, 56, 79

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

# ---- 케이지 (같은 아이템 표의 분류 3) → src/data/cage-shop.txt ----
# 0xE0578부터 56바이트 레코드(분류, 0, 시설 종류 번호, 주소, 해금 종류, 해금 값, 처음 가진 수, 1, 최대, 이름 글, 설명 글, 사는 값, 레벨 업 값, 0).
# 레벨 업 값(+0x30)과 랭크별 최대 레벨(표 0xE214C, 랭크마다 36바이트의 첫 칸)은 상점 overlay9_17 0x2110D90~0x2110EA0에서 확인:
#   다음 레벨 n이 '최대 레벨 칸'보다 작아야 하고(같으면 '지금의 테이머 랭크로는 레벨 업 할 수 없습니다', n=3이면 더 못 올림),
#   값은 n × 레벨 업 값, n=2면 그 절반을 뺀다(1.5배). 산 레벨은 세이브의 시설 종류별 칸(+0x70)에 저장(0x2066994).
CAGE_TABLE, CAGE_FIRST, CAGE_LAST = 0xE0578, 83, 117
cage_lines = ['# 원본 아이템 표의 케이지 (tools/extract_shop.py). 손으로 고치지 말 것',
              '# 이름|시설 종류 번호|사는 값|레벨 업 값|해금 종류(0 처음, 1 랭크, 2 타이틀)|해금 값|처음 가진 수']
for i in range(CAGE_FIRST, CAGE_LAST + 1):
    r = struct.unpack_from('<14i', arm9, CAGE_TABLE + i*SIZE)
    assert r[0] == 3, i
    cage_lines.append('|'.join(map(str, [text[r[9]].strip(), r[2], r[11], r[12], r[4], r[5], r[6]])))
cage_lines.append('# 랭크별 최대 레벨 칸(랭크 0~8, 표 0xE214C 36바이트마다 첫 칸): 다음 레벨이 이 값보다 작아야 레벨 업')
cage_lines.append('#max|' + ','.join(str(struct.unpack_from('<i', arm9, 0xE214C + k*36)[0]) for k in range(9)))
cage_out = REPO / 'src/data/cage-shop.txt'
cage_out.write_text('\n'.join(cage_lines) + '\n', encoding='utf-8', newline='\n')
print(CAGE_LAST - CAGE_FIRST + 1, '개 케이지 →', cage_out)
