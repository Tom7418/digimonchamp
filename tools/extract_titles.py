"""원본 실행 코드(root/ftc/arm9.bin)의 타이틀 매치 표에서 61개 타이틀을 뽑아 src/data/titles.txt로 만든다.

사용법 (Windows PowerShell):
    python tools/extract_titles.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"

표 위치와 형식:
  - arm9.bin 0xCC524부터 40바이트(u32 10개)씩 62개 (마지막은 튜토리얼 매치라 뺀다).
  - +0 이름 글 번호, +4 설명 글 번호 (root/ui/txt/txt_list_txt.dat), +8 매치 번호
  - +12 참가 조건 번호 (-1 없음). 조건 표는 타이틀 표 바로 앞 0xCBDF4부터 40바이트(i32 10개)씩 46개:
      +0 내 인원(1·3), +4 종족 비트(디지몬 표와 같은 비트, 여러 개면 그중 하나), +8 세대(7이면 제한 없음, 3 성장기~6 궁극체),
      +12 속성(1 백신, 2 바이러스, 3 데이터), +16 배틀 환경(화산·사막 등, 참가 제한 아님), +20 디지에그화 횟수(24회는 24<<8로 들어 있다),
      +24 성격 번호, +28 타입 번호(디지몬 표 +24와 같은 값), +32 조건 미달 안내 글 번호, +36 미해석(1·2)
    뜻의 근거: 설명 글의 '성숙기 한정'·'용 종족 한정'·'디지에그화가 10이상' 등과 값이 맞는다.
  - +16 등급 0~4 (4는 설명에 '빅7'이라고 나오는 최강 타이틀들)
  - +20 계절 0~3, +24 날짜 0~7 (0이 1일)
  - +28 필요한 테이머 랭크 0~7
  - +32 상금, +36 또 다른 보상 값 (미해석)
  뜻을 확인한 근거: 원작 편지(mail_text 13번)의 '봄의 3일째에 열리는 첫 타이틀 매치'가 '봄의 시작'(계절 0, 날짜 2)과 맞고,
  '봄의 시작·여름의 신기루·가을의 전쟁·겨울의 제왕'의 계절 값이 0·1·2·3이다. 등급·랭크·상금의 뜻은 값의 경향으로 추정했다.
  인원(N VS M)·참가 세대 제한·디지에그화 조건·타이틀 홀더 세대는 설명 글에서 읽는다 (글 자체는 저장소에 옮기지 않는다).
"""
import re, struct, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'root'
TABLE, SIZE, COUNT = 0xCC524, 40, 61
CONDS = 0xCBDF4
FAMILY = {1: '짐승', 2: '기계', 4: '벌레풀', 8: '새', 16: '용', 32: '물', 64: '성', 128: '암흑'}
ATTR = {0: '', 1: '백신', 2: '바이러스', 3: '데이터'}
STAGES = ['유년기', '성장기', '성숙기', '완전체', '궁극체']

arm9 = (ROOT / 'ftc/arm9.bin').read_bytes()
parts = (ROOT / 'ui/txt/txt_list_txt.dat').read_bytes().split(b'<>\n')
text = [p.decode('utf-16-le', 'replace').rstrip('\0') for p in parts[2:]]

lines = ['# 원본 실행 코드의 타이틀 매치 표 (tools/extract_titles.py). 손으로 고치지 말 것',
         '# 번호|이름|계절(0봄)|날짜|필요 랭크|등급|상금|보상2|내 인원|상대 인원|참가 세대 제한|디지에그화 조건|홀더 세대|한정 표시(설명 글)|종족 한정|속성 한정|성격 번호|타입 번호|미해석']
for i in range(COUNT):
    name, desc, number, ref, grade, season, day, rank, prize, extra = struct.unpack_from('<2I8i', arm9, TABLE + i*SIZE)
    d = re.sub(r'[^0-9A-Za-z가-힣 \n]', ' ', text[desc].replace('\\n', ' '))
    vs = re.search(r'(\d)\s*VS\s*(\d)', d)
    mine, foes = (vs.group(1), vs.group(2)) if vs else ('3', '3')
    limits = re.findall(r'(\S+)\s+(?:속성|종족|타입)?\s*한정', d)
    stage_limit = next((s for s in limits if s in STAGES), '')
    other = ','.join(s for s in limits if s not in STAGES and '이상' not in s)
    eggs = re.search(r'디지에그화가?\s*(\d+)\s*이상', d)
    rest = re.sub(r'\S+\s+한정', '', d)
    holder = next((s for s in STAGES if s in rest), '')
    eggs = eggs.group(1) if eggs else ''
    families = attr = person = kind = flag = ''
    if ref >= 0:  # 참가 조건은 설명 글이 아니라 조건 표 값을 쓴다
        team, mask, stage, a, _, egg, p, k, _, f = struct.unpack_from('<10i', arm9, CONDS + ref*40)
        mine = str(team)
        stage_limit = STAGES[stage - 2] if stage < 7 else ''
        families = ','.join(n for bit, n in FAMILY.items() if mask & bit)
        attr = ATTR[a]
        egg = egg >> 8 if egg > 255 else egg
        eggs = str(egg) if egg else ''
        person = str(p) if p >= 0 else ''
        kind = str(k) if k else ''
        flag = str(f) if f else ''
    lines.append('|'.join(map(str, [number, text[name].strip(), season, day + 1, rank + 1, grade, prize, extra,
                                    mine, foes, stage_limit, eggs, holder, other, families, attr, person, kind, flag])))
out = REPO / 'src/data/titles.txt'
out.write_text('\n'.join(lines) + '\n', encoding='utf-8', newline='\n')
print(COUNT, '개 →', out)
