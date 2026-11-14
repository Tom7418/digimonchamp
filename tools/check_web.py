"""Check Pages entrypoint references and sprite metadata without dependencies."""
import json
import re
import struct
from pathlib import Path

web = Path(__file__).resolve().parents[1] / 'web'
html = (web / 'index.html').read_text(encoding='utf-8')
for ref in re.findall(r'(?:src|href)="([^"]+)"', html):
    if ref.startswith(('http:', 'https:', '#', 'data:')):
        continue
    assert not ref.startswith('/'), f'Absolute path breaks project Pages: {ref}'
    assert (web / ref.split('?', 1)[0]).exists(), f'Missing page dependency: {ref}'
sprites = json.loads((web / 'assets/sprites.json').read_text(encoding='utf-8'))
js = (web / 'assets/sprites.js').read_text(encoding='utf-8')
assert json.loads(js.removeprefix('window.SPRITES = ').removesuffix(';')) == sprites
for sp in sprites:
    raw = (web / 'assets' / (sp['id'] + '.png')).read_bytes()
    assert raw.startswith(b'\x89PNG\r\n\x1a\n')
    assert struct.unpack_from('>II', raw, 16) == (sp['width'] * sp['frames'], sp['height'])
for forbidden in ('*.nds', '*.sdat', '*.atr', '.openai', '.git'):
    assert not list(web.rglob(forbidden)), f'Unexpected deployment file: {forbidden}'
icon = (web / 'assets/cage_shop_icon.png').read_bytes()
for name in ('meat', 'meat_1', 'meat_2', 'meat_3', 'pill', 'rotten'):
    raw = (web / 'assets/items' / f'{name}.png').read_bytes()
    assert struct.unpack_from('>II', raw, 16) == (32, 35), f'Invalid item sprite: {name}'
assert struct.unpack_from('>II', icon, 16) == (64 * 36, 48), 'Invalid cage icon sheet'
for kind, size in {'free': (96,112), 'clinic': (96,112), 'gym': (288,112), 'field': (192,200), 'clinic-hex': (208,240), 'field-hex': (416,420)}.items():
    raw=(web/'assets/facilities'/f'{kind}.png').read_bytes()
    assert struct.unpack_from('>II',raw,16)==size, f'Invalid facility background: {kind}'
import re
for img in set(re.findall(r"img:'([^']+)'", (web/'cage-layout.js').read_text(encoding='utf-8'))):
    assert (web/'assets/facilities'/f'{img}.png').exists(), f'Missing facility art: {img}'
# 지형은 원본 ATR 대신 변환된 수치만 배포하며 배경 PNG와 같은8px 칸을 사용한다.
terrain=json.loads((web.parent/'src/data/hunt-terrain.json').read_text(encoding='utf-8'))
assert terrain['tileSize']==8 and len(terrain['maps'])==16
assert set(terrain['fields'].values())==set(terrain['maps'])
for no,grid in terrain['maps'].items():
    runs=grid['runs']
    assert len(runs)%2==0 and sum(runs[1::2])==grid['width']*grid['height']
    assert all(0<=v<=5 and n>0 for v,n in zip(runs[::2],runs[1::2]))
    for suffix in ['01','02']:
        path=web/'assets/fields'/f'{no}_{suffix}.png'
        if suffix=='02' and not path.exists():continue
        assert struct.unpack_from('>II',path.read_bytes(),16)==(grid['width']*8,grid['height']*8)
print(f'Pages check passed: {len(sprites)} sprite sheets, relative paths and all entrypoint files verified.')
