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

def rail_interior():
    """한 칸 난간의 안쪽. 이미지 외곽이 아니라 여섯 직선으로 경계 띠를 고정한다."""
    mask=Image.new('L',(208,240))
    ImageDraw.Draw(mask).polygon([(104,9),(200,65),(200,175),(104,231),(8,175),(8,65)],fill=255)
    return mask

def straight_rail(image):
    # 지형의 들쭉날쭉한 끝이 난간을 대신하지 않도록, 경계 띠만 동일한 정육각 난간으로 교체한다.
    assert image.size==(208,240)
    mask=footprint([[0,0]]);inside=rail_interior()
    result=Image.new('RGBA',image.size,(17,49,70,255));result.putalpha(mask)
    result.alpha_composite(Image.composite(image,Image.new('RGBA',image.size),inside))
    d=ImageDraw.Draw(result)
    points=[(104,5),(203,63),(203,177),(104,235),(5,177),(5,63)]
    d.line(points+[points[0]],fill=(39,159,207,255),width=5,joint='curve')
    d.line(points+[points[0]],fill=(127,239,250,255),width=2,joint='curve')
    for a,b in zip(points,points[1:]+points[:1]):
        for i in range(3):
            x=round(a[0]+(b[0]-a[0])*i/3);y=round(a[1]+(b[1]-a[1])*i/3)
            d.rectangle((x-3,y-4,x+3,y+4),fill=(13,39,58,255))
            d.rectangle((x-2,y-3,x+2,y+2),fill=(91,225,244,255))
            d.rectangle((x-1,y-2,x+1,y),fill=(223,255,255,255))
    # 난간/기둥도 정확히 같은 육각형 밖으로 나가지 않는다.
    result=Image.composite(result,Image.new('RGBA',result.size),mask)
    result=Image.composite(image,result,inside)
    assert ImageChops.multiply(ImageChops.difference(result,image).convert('RGB'),inside.convert('RGB')).getbbox() is None
    return result

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
    revised=job.get('boundaryRevision')==2
    if revised: base=straight_rail(base)
    suffix='-hex2' if revised else ''
    output=REPO/f"web/assets/facilities/polished/{job['code']}{suffix}.png"
    output.parent.mkdir(exist_ok=True)
    base.save(output,optimize=True)
    base.save(output.with_suffix('.webp'),lossless=True,method=6,exact=True)
    record={'kind':job['kind'],'name':job['name'],'cells':job['cells'],'asset':str(output.relative_to(REPO/'web')).replace('\\','/'),
            'size':list(base.size),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
            'webpAsset':str(output.with_suffix('.webp').relative_to(REPO/'web')).replace('\\','/'),
            'webpSha256':hashlib.sha256(output.with_suffix('.webp').read_bytes()).hexdigest(),
            'originalReference':job['original'].replace('\\','/'),'restoredContents':job['required'],
            'generatedSourceSha256':hashlib.sha256(Path(job['generated']).read_bytes()).hexdigest(),
            'prompt':job['prompt']}
    if revised: record['boundaryRevision']=2
    return record

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
        if code in ['C33','C35','C37','C38','C39']:
            assert row.get('boundaryRevision')==2 and '-hex2' in row['asset'],code
            # 과거 alpha 검사만으로 못 잡던, 경계 띠 내부의 깨진 난간도 픽셀로 확인한다.
            expected=straight_rail(im)
            assert ImageChops.difference(expected,im).convert('RGB').getbbox() is None,code
    print('33 cage assets verified; 32 exact footprint alpha masks; approved C16 unchanged.')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--inputs',type=Path); p.add_argument('--only',nargs='+'); p.add_argument('--partial',action='store_true'); p.add_argument('--check',action='store_true'); args=p.parse_args()
    path=REPO/'docs/cage-art-refresh.json'
    if args.check: check(json.loads(path.read_text(encoding='utf-8')))
    else:
        assert args.inputs
        records=json.loads(path.read_text(encoding='utf-8'))['facilities'] if args.only else {}
        for source in sorted(args.inputs.glob('C*.json')):
            job=json.loads(source.read_text(encoding='utf-8'))
            if args.only and job['code'] not in args.only: continue
            records[job['code']]=prepare(job)
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
