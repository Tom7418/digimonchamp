"""원본 실행 코드(root/ftc/arm9.bin)의 진화표를 읽어 src/data/evolutions.txt의 진화 목록을 원본대로 바꾼다.

사용법 (Windows PowerShell):
    pip install capstone
    python tools/extract_evolutions.py "C:\\Users\\TEST OS\\OneDrive\\Desktop\\root"
    python tools/extract_evolutions.py "C:\\...\\root" --check   # 파일을 고치지 않고 차이만 확인

원본 구조 (overlay18 0x2115D80 진화 판정에서 확인):
  - 진화표는 RAM 0x020DF528, 종(디지몬 표 번호 - 8)마다 12바이트 {후보 수, 후보 배열 포인터, ?}.
    게임 시작 때 ARM9 0x02097EC4 초기화 함수가 상수 영역에서 한 칸씩 복사해 채운다(arm9.bin 안에는 0).
    그래서 초기화 함수를 디스어셈블해 '어느 상수 → 어느 칸' 복사를 그대로 따라간다.
  - 후보 하나는 0x3C바이트: +0 진화할 종 번호, +4 종류(1 = 수명이 다했을 때만 보는 후보), +6 이후 u16 조건.
    +6 백신 +8 데이터 +0A 바이러스 +0C 용 +0E 짐승 +10 물 +12 새 +14 벌레풀 +16 성 +18 암흑 +1A 기계 (속성·종족 수치)
    +1C~+30 능력치 조건(종별 곡선의 %) — 이 게임 원본에는 쓰인 후보가 없다
    +32 배틀 횟수, +34 승률(%), +36 디지에그화 횟수, +38 페널티 횟수
    값 0은 조건 없음. 종족·속성 이름은 위키 진화 목록과의 대조로 확인했다.
  - 후보는 위에서부터 검사해 처음 모든 조건을 채운 곳으로 진화한다.
줄 순서와 세대 칸은 기존 evolutions.txt를 유지하고 진화 목록만 바꾼다.
"""
import re
import struct
import sys
from pathlib import Path

from capstone import CS_ARCH_ARM, CS_MODE_ARM, Cs

REPO = Path(__file__).resolve().parents[1]
args = [a for a in sys.argv[1:] if not a.startswith('--')]
ROOT = Path(args[0]) if args else REPO.parent / 'root'
CHECK = '--check' in sys.argv

arm9 = (ROOT / 'ftc' / 'arm9.bin').read_bytes()
BASE = 0x02000000
INIT = 0x02097EC4
TABLE = 0x020DF528
KEYS = {1: '백신', 2: '데이터', 3: '바이러스', 4: '용', 5: '짐승', 6: '물', 7: '새', 8: '벌레풀', 9: '성', 10: '암흑', 11: '기계'}

# 초기화 함수: ldr rX,=상수 / ldm rX,{r0-r2} / stm rY,{r0-r2} 를 따라간다
md = Cs(CS_ARCH_ARM, CS_MODE_ARM)
md.skipdata = True
regs, copies, last = {}, {}, None
for ins in md.disasm(arm9[INIT - BASE:INIT - BASE + 0x6000], INIT):
    op, ops = ins.mnemonic, ins.op_str
    m = re.match(r'(\w+), \[pc, #(0x[0-9a-f]+)\]', ops)
    if op == 'ldr' and m:
        regs[m.group(1)] = struct.unpack_from('<I', arm9, ins.address + 8 + int(m.group(2), 16) - BASE)[0]
    elif op == 'ldm':
        last = regs.get(ops.split(',')[0].rstrip('!'))
        for r in ('r0', 'r1', 'r2'):
            regs.pop(r, None)
    elif op == 'stm':
        dst = regs.get(ops.split(',')[0].rstrip('!'))
        if dst is not None and last is not None:
            copies[dst] = last
    elif op == 'pop' and 'pc' in ops:
        break

names = [l.split('|')[0] for l in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines() if l and not l.startswith('#')]


def cond(raw):
    parts = ['시간'] if raw[0] == 1 else []
    parts += [f'{n}{raw[k]}' for k, n in KEYS.items() if raw[k]]
    if any(raw[12:23]):
        raise ValueError('능력치 조건이 있는 후보: 형식 확장 필요')
    for k, label in ((23, '배틀'), (24, '승률'), (25, '에그'), (26, '페널티')):
        if raw[k]:
            parts.append(f'{label}{raw[k]}')
    return '+'.join(parts)


evolutions = {}
for i, name in enumerate(names):
    src = copies.get(TABLE + i * 12)
    if src is None:
        continue
    count, ptr, _ = struct.unpack_from('<3I', arm9, src - BASE)
    opts = []
    for k in range(count):
        o = ptr - BASE + k * 0x3C
        to = struct.unpack_from('<I', arm9, o)[0]
        raw = struct.unpack_from('<28H', arm9, o + 4)
        opts.append(f'{names[to - 8]}:{cond(raw)}')
    if opts:
        evolutions[name] = ','.join(opts)

path = REPO / 'src/data/evolutions.txt'
lines = path.read_text(encoding='utf-8').splitlines()
out, changed = [], []
for line in lines:
    if line.startswith('# 출처'):
        out.append('# 출처: 원본 실행 코드 arm9.bin의 진화표(tools/extract_evolutions.py). 예전 위키 목록과 다른 곳은 docs/design.md에 적음')
        continue
    if not line or line.startswith('#'):
        out.append(line)
        continue
    stage, name, rest = line.split('|', 2)
    new = evolutions.pop(name, rest)
    if new != rest:
        changed.append((name, rest, new))
    out.append(f'{stage}|{name}|{new}')
if evolutions:
    raise SystemExit(f'evolutions.txt에 없는 종: {sorted(evolutions)}')
print(f'원본 진화표 {len(copies)}칸, 바뀐 종 {len(changed)}')
for name, old, new in changed:
    print(f'  {name}\n    이전: {old}\n    원본: {new}')
if not CHECK:
    path.write_text('\n'.join(out) + '\n', encoding='utf-8', newline='\n')
