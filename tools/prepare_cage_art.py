"""생성 케이지를 현재 점유 모양에 맞춰 정리하고 원본 구조물 근거를 기록한다.
python tools/prepare_cage_art.py --inputs .analysis-deps/cage-generated [--partial]
python tools/prepare_cage_art.py --check
이미지 창작은 image_gen, 이 도구는 크기/투명 여백/게임용 마스크와 파일 검증을 담당한다.
"""
import argparse
from collections import deque
import hashlib
import json
from pathlib import Path
import sys

REPO = Path(__file__).resolve().parents[1]
try:
    from PIL import Image, ImageDraw, ImageChops
except ImportError:
    sys.path.insert(0, str(REPO / '.analysis-deps'))
    from PIL import Image, ImageDraw, ImageChops

def footprint(cells):
    # 기존 월드 육각 비율과 동일. 칸수/충돌 좌표는 바꾸지 않는다.
    centers = [(208 * (q + r / 2), 180 * r) for q, r in cells]
    left, top = min(x for x,y in centers)-104, min(y for x,y in centers)-120
    w, h = round(max(x for x,y in centers)-left+104), round(max(y for x,y in centers)-top+120)
    mask = Image.new('L', (w, h)); d=ImageDraw.Draw(mask)
    for x,y in centers:
        x,y=x-left,y-top
        d.polygon([(round(x),round(y-120)),(round(x+104),round(y-60)),(round(x+104),round(y+60)),
                   (round(x),round(y+120)),(round(x-104),round(y+60)),(round(x-104),round(y-60))],fill=255)
    return mask

def filled_floor(path):
    """원본 바닥의 투명 여백을 가장 가까운 바닥 색으로 채워 내부 빈 구멍만 받친다."""
    im=Image.open(path).convert('RGBA'); px=im.load(); w,h=im.size
    queue=deque((x,y) for y in range(h) for x in range(w) if px[x,y][3]>128)
    visited=set(queue)
    while queue:
        x,y=queue.popleft()
        for nx,ny in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
            if 0<=nx<w and 0<=ny<h and (nx,ny) not in visited:
                visited.add((nx,ny)); px[nx,ny]=px[x,y]; queue.append((nx,ny))
    return im

def prepare(job):
    raw=Image.open(job['generated']).convert('RGBA')
    # 원치 않은 바깥 발광/투명 안전 여백은 레이아웃 크기 계산에서 제외한다.
    bbox=raw.getchannel('A').point(lambda a:255 if a>=220 else 0).getbbox()
    assert bbox,job['code']
    mask=footprint(job['cells']); raw=raw.crop(bbox).resize(mask.size,Image.Resampling.LANCZOS)
    floor=REPO/(job['current'] if job['code']=='C00' else f"web/assets/facilities/cm{job['number']:02}.png")
    base=filled_floor(floor).resize(mask.size,Image.Resampling.LANCZOS)
    base.alpha_composite(raw)
    base.putalpha(mask)
    # 투명 영역의 보이지 않는 RGB는 0으로 정리한다. 표시 픽셀은 그대로이고 용량만 줄어든다.
    base=Image.composite(base,Image.new('RGBA',base.size),mask)
    output=REPO/f"web/assets/facilities/polished/{job['code']}.png"
    output.parent.mkdir(exist_ok=True)
    base.save(output,optimize=True)
    base.save(output.with_suffix('.webp'),lossless=True,method=6,exact=True)
    return {'kind':job['kind'],'name':job['name'],'cells':job['cells'],'asset':str(output.relative_to(REPO/'web')).replace('\\','/'),
            'size':list(base.size),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
            'webpAsset':str(output.with_suffix('.webp').relative_to(REPO/'web')).replace('\\','/'),
            'webpSha256':hashlib.sha256(output.with_suffix('.webp').read_bytes()).hexdigest(),
            'originalReference':job['original'].replace('\\','/'),'restoredContents':job['required'],
            'generatedSourceSha256':hashlib.sha256(Path(job['generated']).read_bytes()).hexdigest(),
            'prompt':job['prompt']}

def check(report):
    assert len(report['facilities'])==33
    for code,row in report['facilities'].items():
        path=REPO/'web'/row['asset']; im=Image.open(path).convert('RGBA')
        assert list(im.size)==row['size'] and hashlib.sha256(path.read_bytes()).hexdigest()==row['sha256'],code
        if code!='C16':
            mask=footprint(row['cells'])
            assert im.size==mask.size and ImageChops.difference(im.getchannel('A'),mask).getbbox() is None,code
        packed=REPO/'web'/row['webpAsset']
        assert hashlib.sha256(packed.read_bytes()).hexdigest()==row['webpSha256'],code
        assert Image.open(packed).convert('RGBA').tobytes()==im.tobytes(),code
        assert (REPO/row['originalReference']).exists(),code
    print('33 cage assets verified; 32 exact footprint alpha masks; approved C16 unchanged.')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--inputs',type=Path); p.add_argument('--partial',action='store_true'); p.add_argument('--check',action='store_true'); args=p.parse_args()
    path=REPO/'docs/cage-art-refresh.json'
    if args.check: check(json.loads(path.read_text(encoding='utf-8')))
    else:
        assert args.inputs
        records={}
        for source in sorted(args.inputs.glob('C*.json')):
            job=json.loads(source.read_text(encoding='utf-8')); records[job['code']]=prepare(job)
        approved=REPO/'web/assets/facilities/clinic-polished.png'
        Image.open(approved).save(approved.with_suffix('.webp'),lossless=True,method=6,exact=True)
        records['C16']={'kind':'clinic','name':'미니 양호실','cells':[[0,0]],'asset':'assets/facilities/clinic-polished.png',
                        'size':[416,480],'sha256':hashlib.sha256(approved.read_bytes()).hexdigest(),
                        'webpAsset':'assets/facilities/clinic-polished.webp','webpSha256':hashlib.sha256(approved.with_suffix('.webp').read_bytes()).hexdigest(),
                        'originalReference':'web/assets/facilities/original/cm16-complete.png','restoredContents':'Previously approved artwork retained.',
                        'prompt':'See docs/art-refresh-prompts.md; retained unchanged.'}
        report={'date':'2026-11-15','method':'image_gen original+restored OBJ / footprint / approved C16 style references; static redesigned artwork, not ROM pixel copy.',
                'facilities':records}
        if not args.partial: check(report)
        path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(f'{len(records)} cage images prepared.')
