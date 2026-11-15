"""펜스 결함 장면을 준비한다. C16은 이중 윤곽 방지를 위해 한 장 전체를 사용한다. 최종 펜스는 cage-fence.js가 그린다.
python tools/prepare_cage_scenes.py [--check]
입력: .analysis-deps/fence4-generated/Cxx.json (내장 image_gen 결과 경로/지시)
"""
import hashlib,json,statistics
from pathlib import Path
from prepare_cage_art import Image,ImageChops,REPO,footprint
from unify_cage_fences import geometry

CODES=['C00','C05','C16','C31']
sha=lambda x:hashlib.sha256(x).hexdigest()

def continuous_scene(source,cells,size):
    """이미지 편집 결과를 한 좌표계로 변환한다. 다른 그림과 경계 띠를 섞지 않는다."""
    image=Image.open(source).convert('RGBA')
    box=image.getchannel('A').point(lambda a:255 if a>=220 else 0).getbbox()
    assert box
    image=image.crop(box).resize(size,Image.Resampling.LANCZOS)
    image.putalpha(footprint(cells).resize(size,Image.Resampling.NEAREST))
    return Image.composite(image,Image.new('RGBA',size),image.getchannel('A'))

def edge_mask(cells,size):
    # 24px까지는 옛 펜스/그림자 제거,24~28px는 색 이음선 방지.28px 안쪽은 그대로 보존한다.
    mask=ImageChops.invert(geometry(cells,size,24)[1])
    for margin,opacity in [(25,191),(26,128),(27,64)]:
        shell=ImageChops.invert(geometry(cells,size,margin)[1]).point(lambda v:opacity if v else 0)
        mask=ImageChops.lighter(mask,shell)
    return mask

def run(check=False):
    path=REPO/'docs/cage-art-refresh.json';data=json.loads(path.read_text(encoding='utf-8'))
    audit={'method':'Only confirmed damaged perimeter strips are filled from image_gen edits. Central RGBA preserved. All displayed fences use web/cage-fence.js.','facilities':{}}
    previous_path=REPO/'docs/cage-scene-audit.json'
    previous=json.loads(previous_path.read_text(encoding='utf-8')) if check else None
    for code,row in data['facilities'].items():
        if code not in CODES:
            if not check:row['fenceLayer']='shared-vector-v4'
            continue
        if check:
            info=previous['facilities'][code];base=Image.open(REPO/'web'/info['baseAsset']).convert('RGBA')
            out=Image.open(REPO/'web'/row['asset']).convert('RGBA');mask=edge_mask(row['cells'],base.size)
            assert out.size==base.size
            if info.get('method')=='single-source':
                # 크기/해시와 단일 원본 변환을 대조한다. 옛 내부 픽셀 보존 검사는 이 수정에 적용하지 않는다.
                assert sha((REPO/'web'/row['asset']).read_bytes())==info['preparedSha256'],code
                job=REPO/'.analysis-deps/fence4-generated'/f'{code}.json'
                if job.exists():
                    source=Path(json.loads(job.read_text(encoding='utf-8'))['path'])
                    if source.exists():assert out.tobytes()==continuous_scene(source,row['cells'],base.size).tobytes(),code
            else:
                for ch in ImageChops.difference(out,base).split():assert ImageChops.multiply(ch,ImageChops.invert(mask.point(lambda v:255 if v else 0))).getbbox() is None,code
            assert sha((REPO/'web'/info['baseAsset']).read_bytes())==info['baseSha256']
            assert Image.open(REPO/'web'/row['webpAsset']).convert('RGBA').tobytes()==out.tobytes()
            continue
        job=json.loads((REPO/'.analysis-deps/fence4-generated'/f'{code}.json').read_text(encoding='utf-8'))
        source=row.get('sceneBaseAsset',row['asset']);base=Image.open(REPO/'web'/source).convert('RGBA')
        if code=='C16':
            # 부분 합성은 시계/커튼 봉 위치 차이로 이중 윤곽을 만든다. 완성된 편집본 한 장만 사용한다.
            out=continuous_scene(job['path'],row['cells'],base.size)
            name=f'assets/facilities/polished/{code}-scene5.png';png=REPO/'web'/name;webp=png.with_suffix('.webp')
            out.save(png,optimize=True);out.save(webp,lossless=True,method=6,exact=True)
            audit['facilities'][code]={'method':'single-source','baseAsset':source,'baseSha256':sha((REPO/'web'/source).read_bytes()),'prompt':job['prompt'],'generatedSha256':sha(Path(job['path']).read_bytes()),'preparedSha256':sha(png.read_bytes()),'reason':'Remove displaced clock/curtain ghosts caused by mixing edge and central scenes.'}
            row.update(sceneBaseAsset=source,asset=name,webpAsset=webp.relative_to(REPO/'web').as_posix(),sha256=sha(png.read_bytes()),webpSha256=sha(webp.read_bytes()),fenceLayer='shared-vector-v4')
            continue
        clean=Image.open(job['path']).convert('RGBA');box=clean.getchannel('A').point(lambda a:255 if a>=220 else 0).getbbox();assert box
        clean=clean.crop(box).resize(base.size,Image.Resampling.LANCZOS)
        # 원래의 주조색과 경계 정리본의 작은 색차만 보정한다. 가운데 장면은 원본을 그대로 쓴다.
        sample=ImageChops.subtract(geometry(row['cells'],base.size,28)[1],geometry(row['cells'],base.size,40)[1])
        points=[i for i,v in enumerate(sample.tobytes()) if v]
        for channel in range(3):
            a=base.getchannel(channel).tobytes();b=clean.getchannel(channel).tobytes()
            delta=max(-20,min(20,round(statistics.median(a[i]-b[i] for i in points)))) if points else 0
            clean.putalpha(clean.getchannel('A'))
            channels=list(clean.split());channels[channel]=channels[channel].point(lambda v:max(0,min(255,v+delta)));clean=Image.merge('RGBA',channels)
        mask=edge_mask(row['cells'],base.size);out=Image.composite(clean,base,mask)
        ideal=footprint(row['cells']).resize(base.size,Image.Resampling.NEAREST);out.putalpha(ideal)
        # PNG 바깥 투명 픽셀의 숨은 RGB 정리도 마스크 범위 안에서만 한다.
        transparent=Image.composite(out,Image.new('RGBA',out.size),ideal);out=Image.composite(transparent,out,mask)
        # 최종 알파 정리도 내부 원본 픽셀을 바꾸지 않도록 제한한다.
        out=Image.composite(out,base,mask.point(lambda v:255 if v else 0))
        name=f'assets/facilities/polished/{code}-scene4.png';png=REPO/'web'/name;webp=png.with_suffix('.webp')
        out.save(png,optimize=True);out.save(webp,lossless=True,method=6,exact=True)
        info={'baseAsset':source,'baseSha256':sha((REPO/'web'/source).read_bytes()),'maskSha256':sha(mask.tobytes()),'prompt':job['prompt'],'generatedSha256':sha(Path(job['path']).read_bytes())}
        audit['facilities'][code]=info
        row.update(sceneBaseAsset=source,asset=name,webpAsset=webp.relative_to(REPO/'web').as_posix(),sha256=sha(png.read_bytes()),webpSha256=sha(webp.read_bytes()),fenceLayer='shared-vector-v4')
    if not check:
        path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8');previous_path.write_text(json.dumps(audit,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        return run(True)
    assert all(r.get('fenceLayer')=='shared-vector-v4' for r in data['facilities'].values())
    print('C16 single-source scene verified; other 3 perimeter strips preserve central RGBA; 33 shared fences.')

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');run(p.parse_args().check)
