"""원본 필살기 확대 스크립트와 전환 프레임을 추출한다. ROM은 저장하지 않는다.
python tools/extract_battle_presentation.py <원본 root> [--check]
"""
import argparse, collections, hashlib, json, struct
from pathlib import Path
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('root',type=Path);parser.add_argument('--check',action='store_true')
a=parser.parse_args();repo=Path(__file__).resolve().parents[1]
arm=(a.root/'ftc/arm9.bin').read_bytes();ov=(a.root/'ftc/overlay9_19').read_bytes();base=0x210e8a0
# 줌 변수 -> 공통 연출 배율 +0x47558 및 카메라 +0x482c4.
checks={0x21209c4:0xe5810558,0x2120a10:0xe58012c4,0x211ed2c:0xe3500a01,
 0x211ed34:0xe3500a02,0x211f10c:0x55555556,0x2121b44:0xebfb8305}
for addr,expected in checks.items():
 actual=struct.unpack_from('<I',ov,addr-base)[0]
 assert actual==expected,f'{addr:#x}: {actual:#x}'
# 1 + sqrt((i+1)/전환프레임), 2 - sqrt((i+1)/전환프레임).
for addr,hexbytes in [
 (0x21242a9,'0100100000020801001000001302fa1632381b12020a81130602'),
 (0x21244a8,'0100200000020801001000001302fa1632381b12020a81140602')]:
 expected=bytes.fromhex(hexbytes);assert ov[addr-base:addr-base+len(expected)]==expected,hex(addr)
# VM 연산: 덧셈/뺄셈/고정소수 나눗셈, 제곱근 하드웨어 사용.
for addr,word in {0x2054354:0xe0821001,0x2054388:0xe0421001,0x2002778:0xe1c210b0}.items():
 assert struct.unpack_from('<I',arm,addr-0x2000000)[0]==word,hex(addr)
skills=json.loads((repo/'src/data/battle-skills.json').read_text(encoding='utf-8'))
records={};counts=collections.Counter();frames=collections.Counter()
for v in skills.values():
 for skill in v['skills']:
  off=0xd02cc+skill['record']*104;script=struct.unpack_from('<I',arm,off+28)[0]
  assert script in (0x212416c,0x2123ee0)
  counts[hex(script)]+=1
  if script==0x212416c:
   n=arm[off+34];assert n>0
   records[str(skill['record'])]=n;frames[n]+=1
assert counts=={'0x212416c':325,'0x2123ee0':36}
for n in range(1,31):assert struct.unpack_from('<I',arm,0xd02cc+n*104+28)[0]==0x212456f
out={'tickRate':60,'maxZoom':2,'dimFraction':2/3,'records':records}
audit={'arm9Sha256':hashlib.sha256(arm).hexdigest(),'overlay19Sha256':hashlib.sha256(ov).hexdigest(),
 'scripts':dict(counts),'supportScript':'0x212456f','transitionFrames':dict(sorted(frames.items())),
 'zoomIn':'1 + sqrt((i + 1) / frames)','zoomOut':'2 - sqrt((i + 1) / frames)',
 'evidence':['overlay19 0x212429f..0x212434a / 0x212449e..0x2124530: zoom loops',
 '0x21209ac: zoom setter; 0x21121a8 / 0x2112374: camera rendering',
 '0x211ee78..0x211eea4: brightness = 1 - (zoom - 1) * 2/3',
 '0x211fd80..0x211fd94: record byte +0x22 passed to script as fixed point argument'],
 'limits':['Web camera anchoring and focus duration use viewport and NANR; original effect VM not fully ported.',
 'Damage events are already resolved; web focus pauses subsequent engine ticks, not original hit timing.',
 'Original speed-line sprites and camera pan trajectory not yet ported.']}
outputs={'web/assets/battle/presentation.js':'window.BATTLE_PRESENTATION_DATA='+json.dumps(out,separators=(',',':'))+';\n',
 'docs/battle-presentation-audit.json':json.dumps(audit,ensure_ascii=False,indent=2)+'\n'}
for name,text in outputs.items():
 path=repo/name
 if a.check:assert path.read_text(encoding='utf-8')==text,name
 else:path.write_text(text,encoding='utf-8',newline='\n')
print('Verified: 325 zoom skills, 36 unzoomed skills, 30 SP records')

