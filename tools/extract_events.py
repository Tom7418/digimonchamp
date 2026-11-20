"""원본 실행 코드(root/ftc/arm9.bin)에서 메일 이벤트 표와 선물 표를 뽑아 src/data/events.txt로 만든다.
원작 글은 옮기지 않고 글 번호(root/ui/txt/mail_text_txt.dat)와 값만 쓴다. 보낸 사람은 이름만 쓴다.

확인한 원본 코드
- 이벤트 표 0x020EEDE0(24바이트): +0 보낸 사람 글 번호, +4 본문 글 번호, +8 종류(0 일반, 1 선물 즉시?),
  +12 값(대부분 360), +16 선물 번호(0x020F00C8 표), +20 0.
  육성 overlay9_18 0x2129818이 이 줄을 메일함(최대 4통, 0x0208B43C)에 넣는다. 테이머 +0xF60에 예약한 이벤트를
  0x2121240에서 꺼내 보낸다.
- 예약하는 곳: 랭크가 오를 때 결과 화면 overlay9_8 0x2111978(새 랭크 번호 2·4·6·8 → 0x75~0x78),
  배틀 overlay9_19 0x2111E9C 등(특정 종 조합으로 이기면 0x6D 등).
- 선물 표 0x020F00B8(28바이트): +0 종류, +12 받았을 때 글 번호, +16 값, +20 값2.
  메일을 열 때 arm9 0x0208C2D8이 읽고 0x0208CA9C가 종류별로 처리한다.
  종류 1 배틀 신청(값 NPC 번호, 값2 상금) · 2 디지몬·디지에그(값 종 코드, 0이면 값2) · 3 아이템(값 아이템 표 0x020E0578 번호, 값2 개수, 최대 소지 수까지)
  · 4 비트(값, 값2가 있으면 값~값2 무작위, 상한 9,999,999) · 5 사육장 먹이(값을 상태 +0xC8에 두면 육성 화면 overlay9_18 0x21108C4가
  지금 케이지에 먹이를 놓는다: 1 고기1, 2 고기3, 3 고기·케이크·고기·케이크·고기, 4 케이크1, 5 케이크2. x=100·150·200·250·300).

사용: python tools/extract_events.py [root 폴더]
"""
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
arm9 = (ROOT / 'ftc/arm9.bin').read_bytes()
parts = (ROOT / 'ui/txt/mail_text_txt.dat').read_bytes().split(b'<>\n')
mail = [p.decode('utf-16-le', 'replace').rstrip('\0').strip() for p in parts[2:]]
EVENTS, GIFTS = 0xEEDE0, 0xF00B8
lines = ['# 원본 메일 이벤트·선물 표 (tools/extract_events.py). 손으로 고치지 말 것. 원작 글은 글 번호만 둔다',
         '# event|번호|보낸 사람|본문 글 번호|종류|값|선물 번호',
         '# gift|번호|종류(1 배틀 신청, 2 디지몬·디지에그, 3 아이템, 4 비트, 5 사육장 먹이)|값|값2|받을 때 글 번호']
count = 0
while True:
    sender, body, kind, value, gift, _ = struct.unpack_from('<6i', arm9, EVENTS + count * 24)
    # 0xC8(200)번 생일 메일이 마지막 줄이다. 그 뒤는 다른 표(선물 받기 안내 글)가 이어진다
    if count > 0xC8:
        break
    lines.append(f'event|{count}|{mail[sender]}|{body}|{kind}|{value}|{gift}')
    count += 1
gifts = sorted({int(l.split('|')[6]) for l in lines if l.startswith('event|') and int(l.split('|')[6]) >= 0})
for g in gifts:
    kind, _, _, msg, value, value2, _ = struct.unpack_from('<7i', arm9, GIFTS + g * 28)
    lines.append(f'gift|{g}|{kind}|{value}|{value2}|{msg}')
out = REPO / 'src/data/events.txt'
out.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
print(count, 'events', len(gifts), 'gifts used →', out)
