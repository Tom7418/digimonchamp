"""Match locally verified throwing effects to frames already shipped in the web atlas."""
import json
import struct
from pathlib import Path

repo = Path(__file__).resolve().parents[1]
arm = (repo.parent / 'ftc/arm9.bin').read_bytes()
overlay = (repo.parent / 'ftc/overlay9_19').read_bytes()
base = 0x0210E8A0
family = 0x02129094
out = repo / 'web/assets/battle'
assets = json.loads((out / 'skill-effects.js').read_text(encoding='utf-8').split('=', 1)[1].rstrip().rstrip(';'))

# 10배 속도/비행시간 제곱근과 60틱 상수, 도착 시 마무리 동작 변경.
assert overlay[0x212921f-base:0x2129224-base] == bytes([1, 0, 0xc0, 3, 0])
assert overlay[0x2129227-base:0x212922c-base] == bytes([1, 0, 0xa0, 0, 0])
assert struct.unpack_from('<I', overlay, 0x2129489-base)[0] == 0x2120F84
assert struct.unpack_from('<I', overlay, 0x21294aa-base)[0] == 0x2120CC4

links = {}
# 투명 여백·색·기준 위치를 대조했다. 각각 세 장의 보이는 도착 셀이 일치한다.
matching_finishes = {'346': (0x3903, [34, 2]), '385': (0x3E03, [54, 2])}
for number, current in assets['records'].items():
    row = 0xD02CC + int(number) * 104
    if struct.unpack_from('<I', arm, row+40)[0] != family:
        continue
    assert current['kind'] == 'impactOnly'
    x, y, percent, flight, finish = struct.unpack_from('<bbHHH', arm, row+50)
    bank = flight >> 8
    flight_seq, finish_seq = (flight & 255)-1, (finish & 255)-1
    sequences = assets['banks'].get(str(bank), {}).get('sequences', {})
    if str(flight_seq) not in sequences or str(finish_seq) not in sequences:
        if number in matching_finishes:
            resource, alias = matching_finishes[number]
            assert finish == resource
            assert str(alias[1]) in assets['banks'][str(alias[0])]['sequences']
            links[number] = {
                'kind': 'impactOnly', 'finish': alias, 'finishFrameTicks': 6,
                'flightOffset': [x, y, percent/100], 'impact': current['impact'],
            }
        continue
    links[number] = {
        'kind': 'lob', 'speed': struct.unpack_from('<H', arm, row+8)[0]/100,
        'flightOffset': [x, y, percent/100],
        'flight': [bank, flight_seq], 'finish': [bank, finish_seq],
        'impact': current['impact'],
    }

assert set(links) == {'90', '221', '242', '249', '300', '340', *matching_finishes}
data = json.dumps(links, ensure_ascii=False, separators=(',', ':'))
(out / 'lob-effects.js').write_text(f'window.BATTLE_LOB_EFFECTS={data};\n', encoding='utf-8')
print(f'Linked {len(links)-len(matching_finishes)} flights and {len(matching_finishes)} extra finishes.')
