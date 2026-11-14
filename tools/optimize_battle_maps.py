"""변환된 배틀 PNG11장을 픽셀 변화 없는 WebP로 최적화한다.
python tools/optimize_battle_maps.py [--check] (Pillow 필요)
PNG는 호환용으로 보존하며 원본 ROM 파일을 읽거나 배포하지 않는다.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import sys

REPO=Path(__file__).resolve().parents[1]
try:
    from PIL import Image
except ImportError:
    sys.path.insert(0,str(REPO/'.analysis-deps'))
    from PIL import Image

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    maps=json.loads((REPO/'src/data/battle-maps.json').read_text(encoding='utf-8'))['maps']
    audit={'method':'WebP lossless method6; PNG fallback preserved','maps':{},'pngBytes':0,'webpBytes':0}
    for item in maps:
        source=REPO/'web'/item['asset'];output=source.with_suffix('.webp')
        with Image.open(source) as png:
            rgb=png.convert('RGB')
            if args.check:packed=output.read_bytes()
            else:
                buffer=io.BytesIO();rgb.save(buffer,format='WEBP',lossless=True,method=6);packed=buffer.getvalue()
            assert packed[12:16]==b'VP8L' and packed[20]==0x2f,output
            with Image.open(io.BytesIO(packed)) as decoded:
                assert decoded.size==rgb.size==(416,272)
                assert decoded.convert('RGB').tobytes()==rgb.tobytes(),source
            audit['maps'][str(item['id'])]={'pngBytes':source.stat().st_size,'webpBytes':len(packed),
                'rgbSha256':hashlib.sha256(rgb.tobytes()).hexdigest(),'webpSha256':hashlib.sha256(packed).hexdigest()}
        assert len(packed)<=source.stat().st_size,source
        if not args.check:output.write_bytes(packed)
        audit['pngBytes']+=source.stat().st_size;audit['webpBytes']+=len(packed)
    path=REPO/'docs/battle-image-optimization.json';text=json.dumps(audit,indent=2)+'\n'
    if args.check:assert path.read_text(encoding='utf-8')==text
    else:path.write_text(text,encoding='utf-8',newline='\n')
    print(f"Identical pixels: {audit['pngBytes']} -> {audit['webpBytes']} bytes")
