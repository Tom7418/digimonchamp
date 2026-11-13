"""원본 초기화·진화 이월·재탄생 보정·전투 HP/TP 참조를 검증한다. 원본은 출력하지 않는다."""
import hashlib
import json
import struct
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent
arm = (ROOT / 'ftc/arm9.bin').read_bytes()
farm = (ROOT / 'ftc/overlay9_18').read_bytes()
battle = (ROOT / 'ftc/overlay9_19').read_bytes()
def verify(data, base, checks):
    for address, expected in checks.items():
        assert struct.unpack_from('<I', data, address - base)[0] == expected, hex(address)

verify(arm, 0x02000000, {
    0x02061794: 0xe1dd23b0,  # HP curve index
    0x020617a0: 0xe19000f1,  # lookup
    0x020617f0: 0xe1a050c1,  # half next gap
    0x02061814: 0xe0202091,  # HP random steps *10 + baseline
    0x02062698: 0xe3590000,  # counter0 skips rebirth bonus
    0x0206299c: 0xebff2014,  # old training fraction division
    0x020629a8: 0xe1a00140,  # divide by4
    0x020629e4: 0xe59d1080,  # new HP plus carry
    0x02062d14: 0xe59d20d0,  # new maximum
    0x02062d34: 0xe59d10d8,  # clamp series
})
verify(farm, 0x0210e8a0, {0x02119bd4: 0xe5d1003c, 0x02119bd8: 0xe3500064})
verify(battle, 0x0210e8a0, {
    0x021179e8: 0xe5910058, 0x021179ec: 0xe5810050,  # maximum HP -> current HP
    0x021179f4: 0xe591005c, 0x021179f8: 0xe5810054,  # maximum TP -> current TP
})
table = json.loads((REPO / 'src/data/training.json').read_text(encoding='utf-8'))
assert table['rebirthBonus'] == list(arm[0x9ee7c:0x9ee7c + 20])
assert struct.unpack_from('<I', arm, 0x63374)[0] == 0x0209ee7c
count = 0
for line in (REPO / 'src/data/species.txt').read_text(encoding='utf-8').splitlines():
    if not line or line.startswith('#'):
        continue
    fields = line.split('|')
    for column, index in enumerate(map(int, fields[7].split(','))):
        step = 10 if column == 0 else 1
        lo = table['curves'][index][column]
        hi = table['curves'][min(24, index + 3)][column] - step
        slots = (table['curves'][min(24, index + 1)][column] - lo) // 2 // step
        assert lo <= lo + max(0, slots - 1) * step <= hi, fields[0]
    count += 1
report = {'species': count, 'instructionChecks': 16,
          'hashes': {name: hashlib.sha256(data).hexdigest() for name, data in [('arm9', arm), ('overlay18', farm), ('overlay19', battle)]},
          'verified': {'initial': '0x0206159c', 'evolution': '0x02062258',
                       'rebirthTable': '0x0209ee7c', 'battleRefill': '0x021179e4'},
          'webPolicy': ['이전 저장 능력치는 별도 보관하고 초기 중앙값~상한으로 한 번만 이전',
                        '상대 배율·피해 공식·진화 조건/AP 이월은 기존 웹판 정책',
                        '알 내부 능력치는0. 부화 시 재탄생 횟수 보정을 적용하며 알 내부 훈련 이월은 미재현']}
(REPO / 'docs/stats-code-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'{count} species ranges and16 instruction references verified')
