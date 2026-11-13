"""원본 공통 효과 시트와 NANR 타격광 시퀀스를 웹용으로 변환."""
import json
from pathlib import Path
import extract_sprites as sprites
from extract_animations import decode
PROJECT=Path(__file__).resolve().parents[1]
if __name__=='__main__':
    output=PROJECT/'web/assets/battle'
    output.mkdir(exist_ok=True)
    capture=[];write=sprites.png
    sprites.png=lambda p,w,h,b:capture.append((w,h,b))
    meta=sprites.extract('e000_effect','common','')
    sprites.png=write
    w,h,b=capture[0];write(output/'effects.png',w,h,b)
    seq=decode(sprites.ROOT/'common/e000_effect.nanr',meta['frames'])[11]
    data={'width':meta['width'],'height':meta['height'],'hit':seq,'sourceSequence':11,'tickRate':60}
    (output/'effects.js').write_text('window.BATTLE_EFFECT_DATA='+json.dumps(data)+';\n',encoding='utf-8')
