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
# 개선 케이지와 구조물 포함 참고 그림은 해시/크기를 확인한다. 원본 바이너리는 배포하지 않는다.
import hashlib
cages=json.loads((web.parent/'docs/cage-art-refresh.json').read_text(encoding='utf-8'))['facilities']
assert len(cages)==33
for code,row in cages.items():
    raw=(web/row['asset']).read_bytes()
    assert struct.unpack_from('>II',raw,16)==tuple(row['size']),code
    assert hashlib.sha256(raw).hexdigest()==row['sha256'],code
    assert hashlib.sha256((web/row['webpAsset']).read_bytes()).hexdigest()==row['webpSha256'],code
    assert (web.parent/row['originalReference']).is_file(),code
fences=json.loads((web.parent/'docs/cage-fence-audit.json').read_text(encoding='utf-8'))
assert fences['style']=='mini-forest-fence-v1' and len(fences['facilities'])==33
for code,row in cages.items():
    assert row.get('fenceStyle')==fences['style']
    source=fences['facilities'][code]
    assert hashlib.sha256((web/source['baseAsset']).read_bytes()).hexdigest()==source['baseSha256'],code
# 이전 베이크 펜스 보고서는 원본 이력이며 최종 펜스는 공통 렌더러에서 그린다.
assert all(row.get('fenceLayer')=='shared-vector-v4' for row in cages.values())
scene_audit=json.loads((web.parent/'docs/cage-scene-audit.json').read_text(encoding='utf-8'))
assert set(scene_audit['facilities'])=={'C00','C05','C16','C31'}
for code,source in scene_audit['facilities'].items():
    assert hashlib.sha256((web/source['baseAsset']).read_bytes()).hexdigest()==source['baseSha256'],code
assert 'cage-fence.js' in html and 'CageFence?.draw' in (web/'cage-editor.js').read_text(encoding='utf-8')
objects=json.loads((web.parent/'docs/cage-object-audit.json').read_text(encoding='utf-8'))['facilities']
assert len(objects)==38
for stem,row in objects.items():
    raw=(web/'assets/facilities/original'/f'{stem}-complete.png').read_bytes()
    assert hashlib.sha256(raw).hexdigest()==row['pngSha256'],stem
gallery=(web/'cage-gallery.html').read_text(encoding='utf-8')
assert 'cage-fence.js' in gallery and 'CageFence.preview' in gallery
assert gallery.count('<article ')==33 and all(f'id="{code}"' in gallery for code in cages)

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
maps=json.loads((web.parent/'src/data/battle-maps.json').read_text(encoding='utf-8'))
assert len(maps['maps'])==11 and len(maps['titles'])==61
for battle_map in maps['maps']:
    image=web/battle_map['asset']
    assert struct.unpack_from('>II',image.read_bytes(),16)==(416,272), f'Invalid battle map: {image}'
optimization=json.loads((web.parent/'docs/battle-image-optimization.json').read_text(encoding='utf-8'))
import hashlib
for battle_map in maps['maps']:
    path=(web/battle_map['asset']).with_suffix('.webp');raw=path.read_bytes()
    assert raw[:4]==b'RIFF' and raw[8:16]==b'WEBPVP8L' and raw[20]==0x2f,path
    size=struct.unpack_from('<I',raw,21)[0]
    assert ((size&0x3fff)+1,((size>>14)&0x3fff)+1)==(416,272),path
    record=optimization['maps'][str(battle_map['id'])]
    assert hashlib.sha256(raw).hexdigest()==record['webpSha256'] and len(raw)==record['webpBytes']<=record['pngBytes'],path
# 사용자 요청 수정본은 원본 복원 그림과 분리해 검사한다.
art=json.loads((web.parent/'docs/art-refresh.json').read_text(encoding='utf-8'))
for i in range(11):
    folder=web/'assets/battle/maps/clean'
    png=(folder/f'{i}.png').read_bytes();packed=(folder/f'{i}.webp').read_bytes()
    assert struct.unpack_from('>II',png,16)==(416,272)
    assert hashlib.sha256(png).hexdigest()==art['maps'][str(i)]['pngSha256']
    assert hashlib.sha256(packed).hexdigest()==art['maps'][str(i)]['webpSha256']
clinic=(web/'assets/facilities/clinic-polished.png').read_bytes()
assert struct.unpack_from('>II',clinic,16)==(416,480)
assert hashlib.sha256(clinic).hexdigest()==art['clinic']['pngSha256']
assert 'bg_top.png' not in (web/'championship.css').read_text(encoding='utf-8')

assert all(value is None or 0<=value<11 for value in maps['titles'].values())
evolution_js=(web/'assets/evolution/effects.js').read_text(encoding='utf-8')
evolution=json.loads(evolution_js.removeprefix('window.EVOLUTION_DATA=').removesuffix(';\n'))
assert evolution['cells']==22 and evolution['silhouetteSequence']==39
assert struct.unpack_from('>II',(web/'assets/evolution/effects.png').read_bytes(),16)==(evolution['width']*evolution['cells'],evolution['height'])
print(f'Pages check passed: {len(sprites)} sprite sheets, 11 battle maps, relative paths and all entrypoint files verified.')
