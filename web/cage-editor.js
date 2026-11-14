'use strict';
// 화면 입력과 그리기는 이 모듈이, 충돌/회전 판정은 CageLayout이 담당한다.
// pointer 이벤트와 capture를 사용하여 마우스 및 터치 드래그를 함께 지원한다.
window.createCageEditor=function(canvas,getState,changed,notify,isBlocked){
 // 원작처럼 육각 한 칸을 크게 그린다(디지몬 여러 마리가 들어가는 방 크기). 사육장 전체는 화면보다 커서
 // 카메라로 끌어 이동한다. 디지몬·먹이·똥 좌표는 모두 이 월드 좌표를 쓴다.
 const L=window.CageLayout, R=140, facilities={};
 const VIEW={w:960,h:560}, MARGIN=60, OX=MARGIN+Math.sqrt(3)*R/2, OY=MARGIN+R;
 const WORLD={w:Math.ceil(Math.sqrt(3)*R*8+MARGIN*2),h:Math.ceil(R*8+MARGIN*2)};
 const cam={x:0,y:0};
 let zoom=1; // 휠은 커서 아래 월드 위치를 유지하며 확대·축소한다.
 const clampCam=()=>{cam.x=Math.max(0,Math.min(WORLD.w-VIEW.w/zoom,cam.x));cam.y=Math.max(0,Math.min(WORLD.h-VIEW.h/zoom,cam.y));};
 // 원본 시설 그림 중 위쪽이 투명하게 비어 있는 것(미니 운동장 등)은 그대로 늘리면 육각 윗부분이 빈 채로 잘려 보인다.
 // 불러올 때 투명 여백을 제외한 그림 범위를 구한다. 새 육각 전용 그림은 점유 경계에 맞춘다.
 const contentBox=im=>{try{const c=document.createElement('canvas');c.width=im.naturalWidth;c.height=im.naturalHeight;const x=c.getContext('2d');x.drawImage(im,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let top=c.height,bottom=0,left=c.width,right=0;for(let y=0;y<c.height;y++)for(let i=0;i<c.width;i++)if(d[(y*c.width+i)*4+3]>8){if(y<top)top=y;if(y>bottom)bottom=y;if(i<left)left=i;if(i>right)right=i;}return bottom>=top?{x:left,y:top,w:right-left+1,h:bottom-top+1}:null;}catch{return null;}};
 for(const [kind,t] of Object.entries(L.types)){const im=new Image();im.onload=()=>{im.content=contentBox(im);};im.src=`assets/facilities/${kind==='free'?'free-ground':(t.img||kind)}.png`;facilities[kind]=im;}
 let editing=false,tool=null,rotation=0,selected=null,drag=null,hover=null;
 const center=(q,r)=>({x:OX+Math.sqrt(3)*R*(q+r/2),y:OY+R*1.5*r});
 const polygon=(ctx,q,r,append=false)=>{const c=center(q,r);if(!append)ctx.beginPath();for(let i=0;i<6;i++){const a=(i*60-30)*Math.PI/180;const x=c.x+R*Math.cos(a),y=c.y+R*Math.sin(a);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();};
 const screenPoint=e=>{const box=canvas.getBoundingClientRect();return {x:(e.clientX-box.left)*VIEW.w/box.width,y:(e.clientY-box.top)*VIEW.h/box.height};};
 const coordinate=e=>{const p=screenPoint(e);return {x:p.x/zoom+cam.x,y:p.y/zoom+cam.y};};
 // 원 안 거리 대신 실제 육각 경계로 판정하여 모서리에서도 이웃 칸으로 잘못 들어가지 않는다.
 const inHex=(p,c)=>{const x=Math.abs(p.x-c.x),y=Math.abs(p.y-c.y);return x<=Math.sqrt(3)*R/2+1e-6&&y+x/Math.sqrt(3)<=R+1e-6;};
 const tile=p=>{for(let r=0;r<5;r++)for(let q=-Math.floor(r/2);q<5+(r%2===0?1:0)-Math.floor(r/2);q++)if(inHex(p,center(q,r)))return {q,r};return null;};
 const inCage=(p,c)=>L.cells(c).some(([q,r])=>inHex(p,center(q,r)));
 // 벽의 바깥 변만 검사한다. 여러 칸짜리 케이지의 내부 이음선은 벽이 아니다.
 const edges=c=>{const map=new Map();for(const [q,r] of L.cells(c)){const o=center(q,r),v=Array.from({length:6},(_,i)=>({x:o.x+R*Math.cos((i*60-30)*Math.PI/180),y:o.y+R*Math.sin((i*60-30)*Math.PI/180)}));for(let i=0;i<6;i++){const a=v[i],b=v[(i+1)%6],k=[a,b].map(p=>`${Math.round(p.x)},${Math.round(p.y)}`).sort().join('/');if(map.has(k))map.delete(k);else map.set(k,[a,b]);}}return [...map.values()];};
 const onSegment=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)));return {x:a.x+t*dx,y:a.y+t*dy};};
 const safeInCage=(p,c)=>inCage(p,c)&&edges(c).every(([a,b])=>{const n=onSegment(p,a,b);return Math.hypot(n.x-p.x,n.y-p.y)>=12;});
 // 각 육각의 안쪽 다각형에 가장 가까운 지점을 찾아 안전하게 착지한다(중앙 스냅 아님).
 function nearestCage(p){let best=null;for(const c of getState().layout)for(const [q,r] of L.cells(c)){
   const o=center(q,r),radius=R-24,v=Array.from({length:6},(_,i)=>({x:o.x+radius*Math.cos((i*60-30)*Math.PI/180),y:o.y+radius*Math.sin((i*60-30)*Math.PI/180)}));
   const x=Math.abs(p.x-o.x),y=Math.abs(p.y-o.y),inside=x<=Math.sqrt(3)*radius/2&&y+x/Math.sqrt(3)<=radius;
   const candidates=inside?[p]:v.map((a,i)=>onSegment(p,a,v[(i+1)%6]));
   for(const point of candidates){const distance=Math.hypot(point.x-p.x,point.y-p.y);if(!best||distance<best.distance)best={cage:c,point,distance};}
 }return best;}
 // 종류와 무관하게 배치 물건의 소속과 내부 위치를 기록한다(고기/상한 고기/약 등).
 function attachFloorItem(item){const s=getState(),id=item.cageId||item.cagePosition?.id;const c=s.layout.find(c=>c.id===id)||s.layout.find(c=>inCage(item,c));item.cageId=c?.id||null;item.cagePosition=c?localPoint(item,c):null;return item;}
 // 바닥 아이템은 같은 객체를 옮겨 먹기/청소 예약 참조도 유지한다.
 function moveContents(c,next){const s=getState();for(const item of [...(s.foods||[]),...(s.poops||[]),...(s.floorItems||[])]){
   const owner=item.cageId||item.cagePosition?.id;
   if(owner===c.id||(!owner&&inCage(item,c))){const local=localPoint(item,c),point=worldPoint(local,next);item.x=point.x;item.y=point.y;item.cageId=c.id;item.cagePosition=local;}
 }}
 const bounces=new Map();
 function bouncePet(p,from){const landing=nearestCage(from);if(!landing)return false;L.assign(getState(),p,landing.cage.id);placePet(p,landing.point,landing.cage);bounces.set(p.uid,{from:{...from},elapsed:0,duration:0.4});return true;}
 // 이동 선분을 작은 간격으로 검사해 프레임이 커도 다른 시설을 관통하지 않는다.
 const canMove=(p,to)=>{const s=getState(),own=s.layout.find(c=>c.id===p.cageId),n=Math.max(1,Math.ceil(Math.hypot(to.x-p.x,to.y-p.y)/6));for(let i=1;i<=n;i++){const point={x:p.x+(to.x-p.x)*i/n,y:p.y+(to.y-p.y)*i/n};if(own?!inCage(point,own):s.layout.some(c=>inCage(point,c)))return false;}return true;};
 const movePet=(p,to)=>{if(!canMove(p,to))return false;const c=getState().layout.find(c=>c.id===p.cageId);placePet(p,to,c);return true;};
 // 케이지를 옮기거나 회전해도 같은 바닥 위치를 따라가도록 내부 좌표를 저장한다.
 const localPoint=(p,c)=>{const a=-(c.rotation||0)*Math.PI/3,o=center(c.q,c.r),x=p.x-o.x,y=p.y-o.y;return {id:c.id,x:x*Math.cos(a)-y*Math.sin(a),y:x*Math.sin(a)+y*Math.cos(a)};};
 const worldPoint=(p,c)=>{const a=(c.rotation||0)*Math.PI/3,o=center(c.q,c.r);return {x:o.x+p.x*Math.cos(a)-p.y*Math.sin(a),y:o.y+p.x*Math.sin(a)+p.y*Math.cos(a)};};
 const placePet=(pet,point,cage)=>{pet.x=point.x;pet.y=point.y;pet.target=point.x;pet.cagePosition=cage?localPoint(point,cage):null;};
 const draggedPoint=point=>({x:point.x+(drag.offset?.x||0),y:point.y+(drag.offset?.y||0)});
 const restoreDrag=()=>{if(drag?.pet!==undefined){const pet=getState().team[drag.pet];if(pet)Object.assign(pet,drag.original);}};
 // 팔레트의 작은 모양 미리보기도 실제 배치 좌표에서 생성한다.
 function footprint(kind){const points=L.cells({kind,q:0,r:0,rotation:0}).map(([q,r])=>{const c=center(q,r);return Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return [c.x+R*Math.cos(a),c.y+R*Math.sin(a)];});});const flat=points.flat(),xs=flat.map(p=>p[0]),ys=flat.map(p=>p[1]);return `<svg class="footprint" viewBox="${Math.min(...xs)-3} ${Math.min(...ys)-3} ${Math.max(...xs)-Math.min(...xs)+6} ${Math.max(...ys)-Math.min(...ys)+6}" aria-label="${L.types[kind].cells.length}칸 점유 모양">${points.map(ps=>`<polygon points="${ps.map(p=>p.join(',')).join(' ')}"/>`).join('')}</svg>`;}
 // 맞닿은 변은 제거하여 여러 칸 시설을 하나의 방처럼 표시한다.
 function outerBorder(ctx,c){const edges=new Map();for(const [q,r] of L.cells(c)){const p=center(q,r),v=Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return [p.x+R*Math.cos(a),p.y+R*Math.sin(a)];});for(let i=0;i<6;i++){const a=v[i],b=v[(i+1)%6],key=[a.map(Math.round).join(','),b.map(Math.round).join(',')].sort().join('/');if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}}ctx.beginPath();for(const [a,b] of edges.values()){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();return [...edges.values()];}
 const toolbar=document.createElement('section');toolbar.className='cage-toolbar';
 toolbar.innerHTML='<div class="cage-toolbar-head"><button id="edit-cages">케이지 편집</button><button id="rotate-cage">↻ 회전</button><button id="remove-cage">선택 케이지 철거</button></div><div class="cage-palette">'+Object.entries(L.types).map(([k,t])=>`<button data-build="${k}" draggable="false"><img src="assets/facilities/${t.img||k}.png" alt="${t.name} 시설">${footprint(k)}${t.name}<small>${t.cells.length}칸 · 정원 ${t.capacity}</small></button>`).join('')+'</div><p id="cage-instruction"></p>';
 canvas.closest('.canvas-wrap').after(toolbar);
 const instruction=toolbar.querySelector('#cage-instruction');
 function status(){toolbar.classList.toggle('editing',editing);toolbar.querySelector('#edit-cages').textContent=editing?'✓ 편집 완료':'케이지 편집';instruction.textContent=editing?'종류 선택 → 빈 칸에 배치 · 설치된 케이지는 끌어서 이동 · 회전 후 배치 · 빈 곳을 눌러 선택 해제':'디지몬을 케이지로 끌어 넣으세요. 선택 후 원하는 바닥을 클릭해도 배치합니다. 휠: 확대/축소 · 빈 바닥 드래그: 화면 이동.';if(getState().storedCages?.length)instruction.textContent+=` · 보관 시설 ${getState().storedCages.length}개: 해당 종류를 선택해 다시 설치하세요.`;toolbar.querySelector('#rotate-cage').disabled=!editing;toolbar.querySelector('#remove-cage').disabled=!editing||!selected;toolbar.querySelectorAll('[data-build]').forEach(b=>b.classList.toggle('active',b.dataset.build===tool));}
 function init(){const s=getState();if(s.layoutVersion!==6){s.layoutBackup=JSON.parse(JSON.stringify(s.layout||[]));const renamed=c=>c&&({...c,kind:L.rename(c.kind)});const old=(s.layout||[]).map(renamed);if(!old.some(c=>c.kind==='free')&&!(s.storedCages||[]).some(c=>L.rename(c.kind)==='free'))old.push({id:'start-basic',kind:'free',q:1,r:2,rotation:0});const migrated=L.migrate(old);s.layout=migrated.placed;s.storedCages=[...(s.storedCages||[]).map(renamed).filter(c=>c&&L.types[c.kind]),...migrated.stored];for(const p of s.team||[])if(p.cage)p.cage=L.rename(p.cage);s.layoutVersion=6;}s.layout=L.restore(s.layout);for(const p of s.team){if(!s.layout.some(c=>c.id===p.cageId)){p.cageId=null;p.cage='free';p.cageSeconds=0;}}}
 init();status();
 toolbar.querySelector('#edit-cages').onclick=()=>{if(isBlocked())return;editing=!editing;tool=null;selected=null;drag=null;status();};
 toolbar.querySelectorAll('[data-build]').forEach(b=>{
   b.onclick=()=>{if(isBlocked())return;editing=true;tool=tool===b.dataset.build?null:b.dataset.build;selected=null;rotation=0;status();};
 });
 function rotate(){if(isBlocked()||!editing)return;rotation=(rotation+1)%6;if(selected){const s=getState(),c=s.layout.find(c=>c.id===selected),next={...c,rotation:(c.rotation+1)%6};if(L.valid(s.layout,next)){moveContents(c,next);Object.assign(c,next);changed('케이지 방향을 바꿨습니다.');}else notify('회전할 공간이 부족합니다.');}status();}
 toolbar.querySelector('#rotate-cage').onclick=rotate;
 toolbar.querySelector('#remove-cage').onclick=()=>{if(isBlocked()||!selected)return;const s=getState();for(const item of [...(s.foods||[]),...(s.poops||[]),...(s.floorItems||[])])if((item.cageId||item.cagePosition?.id)===selected){item.cageId=null;item.cagePosition=null;}s.layout=s.layout.filter(c=>c.id!==selected);for(const p of s.team)if(p.cageId===selected){p.cageId=null;p.cage='free';p.cageSeconds=0;}selected=null;changed('케이지를 철거하고 디지몬을 자유 활동으로 돌렸습니다.');status();};
 function candidate(t){if(!t)return null;const s=getState();if(drag?.cage){const c=s.layout.find(c=>c.id===drag.cage);return {...c,q:t.q-drag.offsetQ,r:t.r-drag.offsetR};}if(tool)return {id:'new',kind:tool,q:t.q,r:t.r,rotation};return null;}
 canvas.style.touchAction='none';canvas.onclick=null;
 canvas.onpointerdown=e=>{if(isBlocked())return;const s=getState(),p=coordinate(e),t=tile(p);hover=t;canvas.setPointerCapture(e.pointerId);
   if(editing){const cage=t&&L.at(s.layout,t.q,t.r);if(cage&&!tool){selected=cage.id;drag={cage:cage.id,offsetQ:t.q-cage.q,offsetR:t.r-cage.r};}else if(!tool){selected=null;}status();}
   else{let best=-1,distance=65;s.team.forEach((pet,i)=>{const d=Math.hypot(p.x-pet.x,p.y-(pet.y-25));if(d<distance){best=i;distance=d;}});if(best>=0){s.selected=best;drag={pet:best,start:p,point:p,offset:{x:s.team[best].x-p.x,y:s.team[best].y-p.y},original:{x:s.team[best].x,y:s.team[best].y,target:s.team[best].target}};bounces.delete(s.team[best].uid);onGrab?.(s.team[best].uid);changed();}else drag={click:true};}
   // 디지몬·케이지를 잡지 않았으면 끌어서 사육장을 둘러본다
   if(drag?.click||(editing&&!tool&&!drag)){drag={...(drag||{}),pan:{x:e.clientX,y:e.clientY,cx:cam.x,cy:cam.y,moved:false}};}
 };
 canvas.onpointermove=e=>{if(drag?.pan){const box=canvas.getBoundingClientRect(),k=VIEW.w/box.width/zoom,dx=(e.clientX-drag.pan.x)*k,dy=(e.clientY-drag.pan.y)*k;if(Math.hypot(dx,dy)>6)drag.pan.moved=true;if(drag.pan.moved){cam.x=drag.pan.cx-dx;cam.y=drag.pan.cy-dy;clampCam();}}hover=tile(coordinate(e));if(drag?.pet!==undefined)drag.point=coordinate(e);};
 canvas.addEventListener('wheel',e=>{if(isBlocked())return;e.preventDefault();const before=coordinate(e),p=screenPoint(e);zoom=Math.max(0.5,Math.min(2.5,zoom*Math.exp(-e.deltaY*0.001)));cam.x=before.x-p.x/zoom;cam.y=before.y-p.y/zoom;clampCam();},{passive:false});
 canvas.onpointerup=e=>{if(isBlocked()){restoreDrag();drag=null;return;}if(drag?.pan?.moved){drag=null;status();return;}const s=getState(),point=coordinate(e),foot=drag?.pet!==undefined?draggedPoint(point):point,t=tile(editing?point:foot);
   if(editing){const next=candidate(t);if(next){if(L.valid(s.layout,next)){if(drag?.cage){const c=s.layout.find(c=>c.id===drag.cage);moveContents(c,next);Object.assign(c,next);}else{const stored=(s.storedCages||[]).findIndex(c=>c.kind===next.kind);const id=stored>=0?s.storedCages.splice(stored,1)[0].id:crypto.randomUUID();s.layout.push({...next,id});}changed('케이지 배치를 저장했습니다.');}else notify('다른 케이지와 겹치거나 사육장을 벗어납니다.');}}
   else if(drag?.pet!==undefined&&Math.hypot(point.x-drag.start.x,point.y-drag.start.y)<8){restoreDrag();onPet?.(drag.pet);}
   else if(t){
     const cage=L.at(s.layout,t.q,t.r),pet=s.team[drag?.pet??s.selected];
     if(pet&&(!cage||!safeInCage(foot,cage))&&bouncePet(pet,foot)){changed('케이지 안으로 튕겨 들어갔습니다.');}
     else if(pet&&cage){
       if(L.assign(s,pet,cage.id)){placePet(pet,foot,cage);changed(L.over(s,cage.id)?`${L.types[cage.kind].name}의 정원을 넘었습니다. 이대로 하루가 지나면 스트레스를 받습니다.`:`${L.types[cage.kind].name}에 입장했습니다.`);}
     }else if(pet&&(drag?.pet!==undefined||drag?.click)){
       pet.cageId=null;pet.cage='free';pet.cageSeconds=0;placePet(pet,foot,null);changed('자유 활동으로 전환했습니다.');
     }
   }else restoreDrag(); // 사육장 밖에 놓거나 취소하면 원래 위치/소속을 유지한다.
   drag=null;status();
 };
 canvas.onpointercancel=()=>{restoreDrag();drag=null;hover=null;};
 let onPet=null,onGrab=null; // 잡기/단순 터치의 게임 쪽 처리를 연결한다.
 return {
   set onPet(f){onPet=f;},
   set onGrab(f){onGrab=f;},
   canMove,movePet,attachFloorItem,
   isBouncing(uid){return bounces.has(uid);},
   advance(dt){for(const [uid,b] of bounces){b.elapsed+=Math.max(0,dt);if(!getState().team.some(p=>p.uid===uid)||b.elapsed>=b.duration)bounces.delete(uid);}},
   isDragging(uid){return drag?.pet!==undefined&&getState().team[drag.pet]?.uid===uid;},
   reset(){selected=null;drag=null;tool=null;bounces.clear();init();status();},
   world:WORLD, view:VIEW, cam, center, R, get zoom(){return zoom;},
   // 화면(캔버스) 좌표 이벤트 → 월드 좌표
   toWorld:e=>coordinate(e),
   centerOn(x,y){cam.x=x-VIEW.w/(2*zoom);cam.y=y-VIEW.h/(2*zoom);clampCam();},
   // 배치된 시설의 실제 범위를 기준으로 화면 중심과 배율을 맞춘다.
   centerLayout(){
     const points=getState().layout.flatMap(c=>L.cells(c).map(([q,r])=>center(q,r)));
     if(!points.length){cam.x=(WORLD.w-VIEW.w/zoom)/2;cam.y=(WORLD.h-VIEW.h/zoom)/2;clampCam();return;}
     const left=Math.min(...points.map(p=>p.x))-R, right=Math.max(...points.map(p=>p.x))+R;
     const top=Math.min(...points.map(p=>p.y))-R, bottom=Math.max(...points.map(p=>p.y))+R;
     zoom=Math.max(0.5,Math.min(1,VIEW.w/(right-left+100),VIEW.h/(bottom-top+100)));
     cam.x=(left+right)/2-VIEW.w/(2*zoom);cam.y=(top+bottom)/2-VIEW.h/(2*zoom);clampCam();
   },
   // 자유 활동 디지몬이 돌아다닐 수 있는 범위
   roam:{x0:OX-R*0.6,x1:OX+Math.sqrt(3)*R*7-R*0.4,y0:OY-R*0.5,y1:OY+R*6.5},
   open(){if(isBlocked())return;editing=true;status();toolbar.scrollIntoView({block:'nearest',behavior:'smooth'});},
   get editing(){return editing;},
   draw(ctx){const s=getState();ctx.fillStyle='#214b50';ctx.fillRect(0,0,WORLD.w,WORLD.h);
     for(let r=0;r<5;r++)for(let q=-Math.floor(r/2);q<5+(r%2===0?1:0)-Math.floor(r/2);q++){polygon(ctx,q,r);ctx.fillStyle='#407675';ctx.fill();ctx.strokeStyle='#8eaaa1';ctx.lineWidth=1;ctx.stroke();}
     for(const c of s.layout){
       const type=L.types[c.kind],cells=L.cells(c),anchor=center(c.q,c.r),im=facilities[c.kind];
       // 전체 점유 영역을 합집합으로 잘라 원본 시설 배경을 딱 한 번 그린다.
       ctx.save();ctx.beginPath();for(const [q,r] of cells)polygon(ctx,q,r,true);ctx.clip();ctx.fillStyle=type.color||'#a5a883';ctx.fill();
       // 시설 그림도 회전된 실제 점유 칸 합집합 안에서만 표시한다.
       // clinic/field는 내부 가구·트랙까지 이 모양에 맞춰 다시 구성한 전용 이미지다.
       const local=type.cells.map(([q,r])=>({x:Math.sqrt(3)*R*(q+r/2),y:R*1.5*r}));
       const left=Math.min(...local.map(p=>p.x))-Math.sqrt(3)*R/2,top=Math.min(...local.map(p=>p.y))-R;
       const width=Math.max(...local.map(p=>p.x))-left+Math.sqrt(3)*R/2,height=Math.max(...local.map(p=>p.y))-top+R;
       ctx.translate(anchor.x,anchor.y);ctx.rotate((c.rotation||0)*Math.PI/3);
       if(im.complete&&im.naturalWidth){
         const b=im.content||{x:0,y:0,w:im.naturalWidth,h:im.naturalHeight};
         const k=Math.min(width/b.w,height/b.h);
         const fitted=!!type.fit;
         const dw=fitted?width:b.w*k,dh=fitted?height:b.h*k;
         ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
         ctx.drawImage(im,b.x,b.y,b.w,b.h,left+(width-dw)/2,top+(height-dh)/2,dw,dh);
       }ctx.restore();
       // 기본 케이지 울타리는 이미지 실루엣 대신 실제 네 칸의 외곽 변에 맞춘다.
       if(c.kind==='free'){
         ctx.save();ctx.lineJoin='round';ctx.strokeStyle='#173b66';ctx.lineWidth=9;
         const edges=outerBorder(ctx,c);ctx.strokeStyle='#39b9df';ctx.lineWidth=5;outerBorder(ctx,c);
         for(const [a,b] of edges)for(let i=0,n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/65);i<=n;i++){
           const x=a[0]+(b[0]-a[0])*i/n,y=a[1]+(b[1]-a[1])*i/n;
           ctx.fillStyle='#173b66';ctx.fillRect(x-5,y-7,10,13);
           ctx.fillStyle='#65d5ee';ctx.fillRect(x-3,y-5,6,8);
           ctx.fillStyle='#ddfaff';ctx.fillRect(x-3,y-5,6,3);
         }ctx.restore();
       }
       ctx.strokeStyle=selected===c.id?'#ffe374':'#8ed3e6';ctx.lineWidth=selected===c.id?4:2;outerBorder(ctx,c);
       // 시설 이름·칸 수는 케이지 편집 중에만 보인다 (플레이 화면에는 숨김)
     }
     const next=editing&&candidate(hover);if(next){const valid=L.valid(s.layout,next);for(const [q,r] of L.cells(next)){polygon(ctx,q,r);ctx.fillStyle=valid?'#79efa588':'#ff5a6e99';ctx.fill();}}
     // 중앙 정렬은 최초의 잘못된 옛 좌표에만 사용한다. 이후에는 놓은 위치를 매 프레임 보존한다.
     for(const p of s.team){
       let c=s.layout.find(c=>c.id===p.cageId);
       // 새 개체/옛 저장이 시설 안에 있는데 소속만 비어 있으면 벽 안에 갇히지 않도록 복구한다.
       if(!c&&!p.cageId&&s.team[drag?.pet]!==p){c=s.layout.find(c=>inCage(p,c));if(c){L.assign(s,p,c.id);p.cagePosition=localPoint(p,c);}}
       if(c){
         if(p.cagePosition?.id!==c.id||!Number.isFinite(p.cagePosition.x)||!Number.isFinite(p.cagePosition.y)){
           const point=Number.isFinite(p.x)&&Number.isFinite(p.y)&&inCage(p,c)?p:center(...L.cells(c)[0]);
           p.cagePosition=localPoint(point,c);
         }
         let point=worldPoint(p.cagePosition,c);
         if(!inCage(point,c)){point=center(...L.cells(c)[0]);p.cagePosition=localPoint(point,c);}
         p.x=point.x;p.y=point.y;p.target=p.x;p.cage=c.kind;
       }else if(p.cageId||p.cage!=='free'){p.cage='free';p.cageId=null;p.cagePosition=null;}
     }
     for(const p of s.team){const b=bounces.get(p.uid);if(b){const cage=s.layout.find(c=>c.id===p.cageId);if(!cage||!p.cagePosition){bounces.delete(p.uid);continue;}const t=b.elapsed/b.duration,e=1-(1-t)**2,to=worldPoint(p.cagePosition,cage);p.x=b.from.x+(to.x-b.from.x)*e;p.y=b.from.y+(to.y-b.from.y)*e-35*Math.sin(Math.PI*t);}}
     if(drag?.pet!==undefined){const p=s.team[drag.pet],point=draggedPoint(drag.point);p.x=point.x;p.y=point.y;p.target=p.x;}
   }
 };
};
