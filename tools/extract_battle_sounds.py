"""배틀 기술 레코드별 원작 효과음 이름을 뽑는다 (이름·번호만, 음원은 만들지 않는다).

사용: python tools/extract_battle_sounds.py [ftc 폴더] [sound-inventory.csv]
- 명중음: 기술 레코드(ARM9 0x20D02CC + 번호×104) +0x64 → overlay9_19 표 0x0213388C (u16 재생 인자).
  overlay9_19 0x02118540~0x0211859C가 피해를 줄 때 재생한다. 회피·막기(r8 = 1)면 대신 0x0211 BATTLE_SE_067_2 (0x021185C8).
- 연출음: +0x60 → 표 0x02133918, 기술 연출 중 0x02121D40~0x02121DB8에서 재생(스트림이 많다).
"""
import csv, json, struct, sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ftc = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO.parent / 'ftc'
inv = Path(sys.argv[2]) if len(sys.argv) > 2 else REPO / 'docs/sound-handoff/sound-inventory.csv'
arm = (ftc / 'arm9.bin').read_bytes()
ov = (ftc / 'overlay9_19').read_bytes()
BASE = 0x0210E8A0
names = {int(r[3], 16): r[4] for r in csv.reader(inv.open(encoding='utf-8-sig')) if len(r) > 4 and r[3].startswith('0x')}
HIT_TABLE, HIT_COUNT = 0x0213388C, 21   # 21번째부터는 다른 표(값이 사운드 번호가 아님)
CAST_TABLE, CAST_COUNT = 0x02133918, 29
hit_table = [struct.unpack_from('<H', ov, HIT_TABLE - BASE + 2 * i)[0] for i in range(HIT_COUNT)]
cast_table = [struct.unpack_from('<H', ov, CAST_TABLE - BASE + 2 * i)[0] for i in range(CAST_COUNT)]
formula = json.loads((REPO / 'src/data/battle-formula.json').read_text(encoding='utf8'))
records = sorted(int(k) for k in formula['records'])
hit, cast = {}, {}
for n in records:
    row = 0xD02CC + n * 104
    c, h = struct.unpack_from('<II', arm, row + 0x60)
    if 0 < h < HIT_COUNT and hit_table[h] and hit_table[h] in names:
        hit[str(n)] = names[hit_table[h]]
    if 0 < c < CAST_COUNT and cast_table[c] not in (0, 0xFF00) and cast_table[c] in names:
        cast[str(n)] = names[cast_table[c]]
data = {'guard': names[0x0211], 'hit': hit, 'cast': cast}
(REPO / 'web/assets/battle/skill-sounds.js').write_text('window.BATTLE_SKILL_SOUNDS=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf8')
print({'records': len(records), 'hit': len(hit), 'cast': len(cast)})
