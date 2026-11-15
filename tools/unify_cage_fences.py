"""현재 미니 숲(C33)의 코드형 펜스를 모든 케이지의 바깥 경계에만 적용한다.
python tools/unify_cage_fences.py [--check]
그림 재생성/리사이즈 없이 펜스 띠 밖의 RGBA 픽셀은 모두 보존한다.
"""
import argparse
import hashlib
import json
import math
from collections import deque
from pathlib import Path
from prepare_cage_art import Image, ImageDraw, ImageChops, REPO, footprint, rail_interior, straight_rail
from PIL import ImageFilter

STYLE='mini-forest-fence-v1'
# 이 그림들은 청록색이 기존 펜스에만 쓰인다. 의료 커튼/물 등은 이 목록에서 제외한다.
FENCE_CYAN_ONLY={'C00','C01','C02','C03','C04','C05','C07','C08','C11','C12','C14','C15','C19','C23','C24','C25','C30','C34'}
NO_CLEANUP={'C16','C31'}
sha=lambda data:hashlib.sha256(data).hexdigest()

def perimeter(cells):
    centers=[(208*(q+r/2),180*r) for q,r in cells]
    left=min(x for x,y in centers)-104;top=min(y for x,y in centers)-120
    edges={}
    for x,y in centers:
        x,y=x-left,y-top
        v=[(x,y-120),(x+104,y-60),(x+104,y+60),(x,y+120),(x-104,y+60),(x-104,y-60)]
        for a,b in zip(v,v[1:]+v[:1]):
            key=tuple(sorted((a,b)))
            if key in edges:del edges[key]
            else:edges[key]=(a,b)
    unused=set(edges.values());loops=[]
    while unused:
        a,b=min(unused);unused.remove((a,b));start=a;points=[a];prev,current=a,b
        while current!=start:
            points.append(current)
            choices=[e for e in unused if e[0]==current]
            assert choices,'Open facility boundary'
            dx,dy=current[0]-prev[0],current[1]-prev[1]
            def turn(e):
                ex,ey=e[1][0]-current[0],e[1][1]-current[1]
                return math.atan2(dx*ey-dy*ex,dx*ex+dy*ey)%(2*math.pi)
            edge=min(choices,key=turn);unused.remove(edge);prev,current=current,edge[1]
        loops.append(points)
    return loops

def inset(points,distance):
    result=[]
    for i,p in enumerate(points):
        before,after=points[i-1],points[(i+1)%len(points)]
        u=(p[0]-before[0],p[1]-before[1]);v=(after[0]-p[0],after[1]-p[1])
        lu,lv=math.hypot(*u),math.hypot(*v)
        a=(p[0]-u[1]/lu*distance,p[1]+u[0]/lu*distance)
        b=(p[0]-v[1]/lv*distance,p[1]+v[0]/lv*distance)
        cross=u[0]*v[1]-u[1]*v[0]
        if abs(cross)<1e-9:result.append(a);continue
        t=((b[0]-a[0])*v[1]-(b[1]-a[1])*v[0])/cross
        result.append((a[0]+t*u[0],a[1]+t*u[1]))
    return result

def geometry(cells,size,margin=8):
    ideal=footprint(cells);sx,sy=size[0]/ideal.width,size[1]/ideal.height
    assert abs(sx-sy)<1e-9,'Aspect ratio must stay unchanged'
    scale=sx
    if len(cells)==1:
        inner=rail_interior() if margin==8 else Image.new('L',(208,240))
        if margin!=8:ImageDraw.Draw(inner).polygon([(round(x),round(y)) for x,y in inset([(104,0),(208,60),(208,180),(104,240),(0,180),(0,60)],margin)],fill=255)
        return (ideal.resize(size,Image.Resampling.NEAREST),
                inner.resize(size,Image.Resampling.NEAREST),[],scale)
    shape=ideal.resize(size,Image.Resampling.NEAREST)
    inside=Image.new('L',size);d=ImageDraw.Draw(inside);loops=perimeter(cells)
    for loop in loops:d.polygon([(round(x*scale),round(y*scale)) for x,y in inset(loop,margin)],fill=255)
    return shape,inside,loops,scale

def render(base,cells,reference=False,code=None):
    shape,inside,loops,scale=geometry(cells,base.size)
    protected=inside
    underlay=base.copy()
    leftovers=Image.new('L',base.size)
    if not reference and code not in NO_CLEANUP:
        # 옛 청록 펜스와 연결되어 안쪽으로 튀어나온 기둥만 찾는다.
        # 물/커튼처럼 내부24px보다 깊게 이어지는 청록 물체는 제외한다.
        w,h=base.size;px=underlay.load();deep=geometry(cells,base.size,24)[1].load()
        cyan={(x,y) for y in range(h) for x in range(w) if px[x,y][3] and px[x,y][1]>185 and px[x,y][2]>190 and px[x,y][1]-px[x,y][0]>25 and px[x,y][2]-px[x,y][0]>30}
        selected=leftovers.load()
        while cyan:
            start=cyan.pop();component=[start];queue=deque([start]);deep_count=0
            while queue:
                x,y=queue.popleft();deep_count+=bool(deep[x,y])
                for point in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                    if point in cyan:cyan.remove(point);component.append(point);queue.append(point)
            if code in FENCE_CYAN_ONLY or (deep_count/len(component)<0.15 and len(component)>=12):
                for x,y in component:selected[x,y]=255
        leftovers=leftovers.filter(ImageFilter.MaxFilter(2*max(5,round(5*scale))+1))
        # 새 펜스 안쪽에 남는 옛 기둥/외곽선만 가까운 비펜스 픽셀로 메운다.
        remove=leftovers.load()
        queue=deque((x,y) for y in range(h) for x in range(w) if not remove[x,y] and px[x,y][3])
        seen=set(queue)
        while queue:
            x,y=queue.popleft()
            for nx,ny in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
                if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen:
                    seen.add((nx,ny));px[nx,ny]=px[x,y];queue.append((nx,ny))
    # 외곽 알파에 있던 옛 기둥도 펜스 영역으로 포함한다. 내부/나머지 투명 픽셀은 그대로 둔다.
    occupied=base.getchannel('A').point(lambda a:255 if a else 0)
    band=ImageChops.lighter(ImageChops.subtract(ImageChops.lighter(shape,occupied),protected),leftovers)
    if len(cells)==1:
        # 기준 미니 숲의 펜스와 색/기둥/픽셀을 정확히 공유한다. 높은 해상도 그림도 리사이즈하지 않는다.
        template=straight_rail(Image.new('RGBA',(208,240))).resize(base.size,Image.Resampling.NEAREST)
        frame=Image.new('RGBA',base.size,(17,49,70,255));frame.putalpha(shape);frame.alpha_composite(template)
    else:
        frame=Image.new('RGBA',base.size,(17,49,70,255));frame.putalpha(shape);d=ImageDraw.Draw(frame)
        for loop in loops:
            points=[(round(x*scale),round(y*scale)) for x,y in inset(loop,5)]
            d.line(points+[points[0]],fill=(39,159,207,255),width=round(5*scale),joint='curve')
            d.line(points+[points[0]],fill=(127,239,250,255),width=round(2*scale),joint='curve')
            for a,b in zip(points,points[1:]+points[:1]):
                n=max(1,round(math.dist(a,b)/(38*scale)))
                for i in range(n):
                    x=round(a[0]+(b[0]-a[0])*i/n);y=round(a[1]+(b[1]-a[1])*i/n)
                    for box,color in [((-3,-4,3,4),(13,39,58,255)),((-2,-3,2,2),(91,225,244,255)),((-1,-2,1,0),(223,255,255,255))]:
                        d.rectangle(tuple(round((x if j%2==0 else y)+v*scale) for j,v in enumerate(box)),fill=color)
        frame=Image.composite(frame,Image.new('RGBA',base.size),shape)
    # 펜스의 안쪽은 원본 내부/옛 펜스 자리 복구본을 사용한다. 바깥 펜스 폭은 기준 C33과 같다.
    frame=Image.composite(underlay,frame,inside)
    result=Image.composite(frame,base,band)
    # RGBA 네 채널을 따로 검사해 alpha만 같아서 RGB 손상을 놓치는 일을 방지한다.
    outside=ImageChops.invert(band)
    for channel in ImageChops.difference(result,base).split():
        assert ImageChops.multiply(channel,outside).getbbox() is None
    return result,band

def run(check=False):
    path=REPO/'docs/cage-art-refresh.json';report=json.loads(path.read_text(encoding='utf-8'))
    audit={'style':STYLE,'reference':'C33','scope':'Fence band only. All RGBA channels outside band and image sizes preserved. Internal shared edges excluded.','facilities':{}}
    for code,row in report['facilities'].items():
        source=row.get('fenceBaseAsset',row['asset']);base=Image.open(REPO/'web'/source).convert('RGBA')
        output,band=render(base,row['cells'],code in ['C33','C35','C37','C38','C39'],code);same=output.tobytes()==base.tobytes()
        # 이미 미니 숲 펜스인 5종은 파일 바이트도 건드리지 않는다.
        asset=source if same else f'assets/facilities/polished/{code}-fence3.png'
        png=REPO/'web'/asset;webp=png.with_suffix('.webp')
        if not check and not same:
            output.save(png,optimize=True);output.save(webp,lossless=True,method=6,exact=True)
        im=Image.open(png).convert('RGBA')
        assert im.size==base.size and im.tobytes()==output.tobytes(),code
        assert Image.open(webp).convert('RGBA').tobytes()==output.tobytes(),code
        record=dict(baseAsset=source,baseSha256=sha((REPO/'web'/source).read_bytes()),asset=asset,
                    fencePixels=sum(v!=0 for v in band.tobytes()),bandSha256=sha(band.tobytes()),unchanged=same)
        audit['facilities'][code]=record
        if check:
            assert row.get('fenceStyle')==STYLE and row['asset']==asset,code
        else:
            row.update(fenceStyle=STYLE,fenceBaseAsset=source,asset=asset,webpAsset=webp.relative_to(REPO/'web').as_posix(),
                       sha256=sha(png.read_bytes()),webpSha256=sha(webp.read_bytes()))
    audit_path=REPO/'docs/cage-fence-audit.json';text=json.dumps(audit,ensure_ascii=False,indent=2)+'\n'
    if check:assert audit_path.read_text(encoding='utf-8')==text
    else:
        path.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        audit_path.write_text(text,encoding='utf-8')
    print('33 fences verified; all non-fence RGBA pixels and sizes unchanged.')

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--check',action='store_true');args=p.parse_args();run(args.check)
