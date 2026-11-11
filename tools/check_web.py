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
    assert (web / ref).exists(), f'Missing page dependency: {ref}'
sprites = json.loads((web / 'assets/sprites.json').read_text(encoding='utf-8'))
js = (web / 'assets/sprites.js').read_text(encoding='utf-8')
assert json.loads(js.removeprefix('window.SPRITES = ').removesuffix(';')) == sprites
for sp in sprites:
    raw = (web / 'assets' / (sp['id'] + '.png')).read_bytes()
    assert raw.startswith(b'\x89PNG\r\n\x1a\n')
    assert struct.unpack_from('>II', raw, 16) == (sp['width'] * sp['frames'], sp['height'])
for forbidden in ('*.nds', '*.sdat', '.openai', '.git'):
    assert not list(web.rglob(forbidden)), f'Unexpected deployment file: {forbidden}'
print(f'Pages check passed: {len(sprites)} sprite sheets, relative paths and all entrypoint files verified.')
