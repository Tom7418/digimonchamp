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
for forbidden in ('*.nds', '*.sdat', '.openai', '.git'):
    assert not list(web.rglob(forbidden)), f'Unexpected deployment file: {forbidden}'
icon = (web / 'assets/cage_shop_icon.png').read_bytes()
for name in ('meat', 'meat_1', 'meat_2', 'meat_3', 'pill', 'rotten'):
    raw = (web / 'assets/items' / f'{name}.png').read_bytes()
    assert struct.unpack_from('>II', raw, 16) == (32, 35), f'Invalid item sprite: {name}'
assert struct.unpack_from('>II', icon, 16) == (64 * 36, 48), 'Invalid cage icon sheet'
for kind, size in {'free': (96,112), 'clinic': (96,112), 'gym': (288,112), 'field': (192,200), 'clinic-hex': (104,120), 'field-hex': (208,210)}.items():
    raw=(web/'assets/facilities'/f'{kind}.png').read_bytes()
    assert struct.unpack_from('>II',raw,16)==size, f'Invalid facility background: {kind}'
import re
for img in set(re.findall(r"img:'([^']+)'", (web/'cage-layout.js').read_text(encoding='utf-8'))):
    assert (web/'assets/facilities'/f'{img}.png').exists(), f'Missing facility art: {img}'
print(f'Pages check passed: {len(sprites)} sprite sheets, relative paths and all entrypoint files verified.')
