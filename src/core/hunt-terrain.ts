import table from '../data/hunt-terrain.json';
import type { Rng } from './rng';

/** 사냥터/그림/지형 번호는 사용자 확인 대응을 하나로 공유한다. */
export const HUNT_MAP: Readonly<Record<string,string>> = Object.freeze(table.fields);
export interface HuntPoint { x:number; y:number }
export interface HuntRect { x0:number; y0:number; x1:number; y1:number }
export interface HuntTerrain { width:number; height:number; tileSize:number; cells:Uint8Array }
const cache=new Map<string,HuntTerrain>();
/** ATR에서 변환한 수치만 사용한다. 낮/밤은 동일한 지형이고 팔레트만 다르다. */
export function huntTerrain(field:string):HuntTerrain|null {
  const no=HUNT_MAP[field];if(!no)return null;
  if(!cache.has(no)){
    const raw=(table.maps as Record<string,{width:number;height:number;runs:number[]}>)[no];
    const cells=new Uint8Array(raw.width*raw.height);let at=0;
    for(let i=0;i<raw.runs.length;i+=2){const [value,count]=raw.runs.slice(i,i+2);cells.fill(value,at,at+count);at+=count;}
    if(at!==cells.length)throw new Error('Invalid hunt terrain '+no);
    cache.set(no,{width:raw.width,height:raw.height,tileSize:table.tileSize,cells});
  }
  return cache.get(no)!;
}
/** 원본 0x0207bd60: 범위 밖과 bit0는 차단. bit1/2만 켜진 물/눈은 벽으로 취급하지 않는다. */
export function huntTerrainAt(grid:HuntTerrain,p:HuntPoint):number {
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>=grid.width*grid.tileSize||p.y>=grid.height*grid.tileSize)return 1;
  return grid.cells[Math.floor(p.y/grid.tileSize)*grid.width+Math.floor(p.x/grid.tileSize)];
}
/** 발 원과 막힌 칸의 교차. 기본 반경4px는 웹판 안전 여백이며 몸 전체/날개로는 막지 않는다. */
export function canStandOnHuntTerrain(grid:HuntTerrain,p:HuntPoint,radius=4):boolean {
  if(huntTerrainAt(grid,p)&1)return false;
  if(!Number.isFinite(radius))return false;
  const r=Math.max(0,radius),tile=grid.tileSize;
  if(p.x-r<0||p.y-r<0||p.x+r>grid.width*tile||p.y+r>grid.height*tile)return false;
  if(!r)return true;
  for(let y=Math.floor((p.y-r)/tile);y<=Math.floor((p.y+r)/tile);y++)for(let x=Math.floor((p.x-r)/tile);x<=Math.floor((p.x+r)/tile);x++){
    if(!(huntTerrainAt(grid,{x:x*tile,y:y*tile})&1))continue;
    const dx=p.x-Math.max(x*tile,Math.min((x+1)*tile,p.x)),dy=p.y-Math.max(y*tile,Math.min((y+1)*tile,p.y));
    if(dx*dx+dy*dy<r*r-1e-8)return false;
  }
  return true;
}
/** 작은 보폭으로 검사해 빠른 이동이 얇은 벽을 건너뛰지 않는다. 대각선 코너도 발 원으로 막는다. */
export function huntTerrainLineClear(grid:HuntTerrain,from:HuntPoint,to:HuntPoint,radius=4):boolean {
  if(!Number.isFinite(to.x)||!Number.isFinite(to.y)||!canStandOnHuntTerrain(grid,from,radius))return false;
  const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/(grid.tileSize/2)));
  for(let i=0;i<=n;i++)if(!canStandOnHuntTerrain(grid,{x:from.x+(to.x-from.x)*i/n,y:from.y+(to.y-from.y)*i/n},radius))return false;
  return true;
}
/** 이동한 실제 선분도 돌려줘 와이어 판정을 벽 미끄러짐 경로와 일치시킨다. */
export function moveOnHuntTerrain(grid:HuntTerrain,from:HuntPoint,to:HuntPoint,radius=4) {
  let p={...from},blockedX=false,blockedY=false;const path=[p];
  if(!Number.isFinite(to.x)||!Number.isFinite(to.y)||!canStandOnHuntTerrain(grid,from,radius))return {...p,blockedX:true,blockedY:true,path};
  const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/(grid.tileSize/2))),dx=(to.x-from.x)/n,dy=(to.y-from.y)/n;
  for(let i=0;i<n;i++){
    const previous=p,next={x:p.x+dx,y:p.y+dy};
    if(canStandOnHuntTerrain(grid,next,radius)){p=next;path.push(p);continue;}
    if(dx){const q={x:p.x+dx,y:p.y};if(canStandOnHuntTerrain(grid,q,radius)){p=q;path.push(p);}else blockedX=true;}
    if(dy){const q={x:p.x,y:p.y+dy};if(canStandOnHuntTerrain(grid,q,radius)){p=q;path.push(p);}else blockedY=true;}
    if(p===previous)break;
  }
  return {...p,blockedX,blockedY,path};
}
/** 생성 후보는 화면에 잘라 표시하는 지도 좌표의 안전한 칸 중심만 쓴다. */
export function huntSpawnPoints(grid:HuntTerrain,rect:HuntRect,radius=4):HuntPoint[] {
  const out:HuntPoint[]=[],t=grid.tileSize;
  for(let y=Math.max(0,Math.floor(rect.y0/t));y<Math.min(grid.height,Math.ceil(rect.y1/t));y++)
    for(let x=Math.max(0,Math.floor(rect.x0/t));x<Math.min(grid.width,Math.ceil(rect.x1/t));x++){
      const p={x:(x+0.5)*t,y:(y+0.5)*t};
      if(p.x>=rect.x0&&p.x<=rect.x1&&p.y>=rect.y0&&p.y<=rect.y1&&canStandOnHuntTerrain(grid,p,radius))out.push(p);
    }
  return out;
}
export function pickHuntSpawn(points:readonly HuntPoint[],rng:Rng):HuntPoint|null {
  if(!points.length)return null;
  return {...points[Math.max(0,Math.min(points.length-1,Math.floor(rng()*points.length)))]};
}
