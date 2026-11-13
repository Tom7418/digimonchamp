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
 const tile=p=>{let best=null,dist=R;for(let q=0;q<6;q++)for(let r=0;r<5;r++){const c=center(q,r),d=Math.hypot(p.x-c.x,p.y-c.y);if(d<dist){dist=d;best={q,r};}}return best;};
 // 팔레트의 작은 모양 미리보기도 실제 배치 좌표에서 생성한다.
 function footprint(kind){const points=L.cells({kind,q:0,r:0,rotation:0}).map(([q,r])=>{const c=center(q,r);return Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return [c.x+R*Math.cos(a),c.y+R*Math.sin(a)];});});const flat=points.flat(),xs=flat.map(p=>p[0]),ys=flat.map(p=>p[1]);return `<svg class="footprint" viewBox="${Math.min(...xs)-3} ${Math.min(...ys)-3} ${Math.max(...xs)-Math.min(...xs)+6} ${Math.max(...ys)-Math.min(...ys)+6}" aria-label="${L.types[kind].cells.length}칸 점유 모양">${points.map(ps=>`<polygon points="${ps.map(p=>p.join(',')).join(' ')}"/>`).join('')}</svg>`;}
 // 맞닿은 변은 제거하여 여러 칸 시설을 하나의 방처럼 표시한다.
 function outerBorder(ctx,c){const edges=new Map();for(const [q,r] of L.cells(c)){const p=center(q,r),v=Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return [p.x+R*Math.cos(a),p.y+R*Math.sin(a)];});for(let i=0;i<6;i++){const a=v[i],b=v[(i+1)%6],key=[a.map(Math.round).join(','),b.map(Math.round).join(',')].sort().join('/');if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}}ctx.beginPath();for(const [a,b] of edges.values()){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();return [...edges.values()];}
 const toolbar=document.createElement('section');toolbar.className='cage-toolbar';
 toolbar.innerHTML='<div class="cage-toolbar-head"><button id="edit-cages">케이지 편집</button><button id="rotate-cage">↻ 회전</button><button id="remove-cage">선택 케이지 철거</button></div><div class="cage-palette">'+Object.entries(L.types).map(([k,t])=>`<button data-build="${k}" draggable="false"><img src="assets/facilities/${t.img||k}.png" alt="${t.name} 시설">${footprint(k)}${t.name}<small>${t.cells.length}칸 · 정원 ${t.capacity}</small></button>`).join('')+'</div><p id="cage-instruction"></p>';
 canvas.closest('.canvas-wrap').after(toolbar);
 const instruction=toolbar.querySelector('#cage-instruction');
 function status(){toolbar.classList.toggle('editing',editing);toolbar.querySelector('#edit-cages').textContent=editing?'✓ 편집 완료':'케이지 편집';instruction.textContent=editing?'종류 선택 → 빈 칸에 배치 · 설치된 케이지는 끌어서 이동 · 회전 후 배치 · 빈 곳을 눌러 선택 해제':'디지몬을 케이지로 끌어 넣으세요. 파트너 선택 후 케이지를 클릭해도 입장합니다. 휠: 확대/축소 · 빈 바닥 드래그: 화면 이동.';if(getState().storedCages?.length)instruction.textContent+=` · 보관 시설 ${getState().storedCages.length}개: 해당 종류를 선택해 다시 설치하세요.`;toolbar.querySelector('#rotate-cage').disabled=!editing;toolbar.querySelector('#remove-cage').disabled=!editing||!selected;toolbar.querySelectorAll('[data-build]').forEach(b=>b.classList.toggle('active',b.dataset.build===tool));}
 function init(){const s=getState();if(s.layoutVersion!==5){s.layoutBackup=JSON.parse(JSON.stringify(s.layout||[]));const renamed=c=>c&&({...c,kind:L.rename(c.kind)});const old=(s.layout||[]).map(renamed);if(!old.some(c=>c.kind==='free')&&!(s.storedCages||[]).some(c=>L.rename(c.kind)==='free'))old.push({id:'start-basic',kind:'free',q:1,r:2,rotation:0});const migrated=L.migrate(old);s.layout=migrated.placed;s.storedCages=[...(s.storedCages||[]).map(renamed).filter(c=>c&&L.types[c.kind]),...migrated.stored];for(const p of s.team||[])if(p.cage)p.cage=L.rename(p.cage);s.layoutVersion=5;}s.layout=L.restore(s.layout);for(const p of s.team){if(!s.layout.some(c=>c.id===p.cageId)){p.cageId=null;p.cage='free';p.cageSeconds=0;}}}
 init();status();
 toolbar.querySelector('#edit-cages').onclick=()=>{if(isBlocked())return;editing=!editing;tool=null;selected=null;drag=null;status();};
 toolbar.querySelectorAll('[data-build]').forEach(b=>{
   b.onclick=()=>{if(isBlocked())return;editing=true;tool=tool===b.dataset.build?null:b.dataset.build;selected=null;rotation=0;status();};
 });
 function rotate(){if(isBlocked()||!editing)return;rotation=(rotation+1)%6;if(selected){const s=getState(),c=s.layout.find(c=>c.id===selected),next={...c,rotation:(c.rotation+1)%6};if(L.valid(s.layout,next)){Object.assign(c,next);changed('케이지 방향을 바꿨습니다.');}else notify('회전할 공간이 부족합니다.');}status();}
 toolbar.querySelector('#rotate-cage').onclick=rotate;
 toolbar.querySelector('#remove-cage').onclick=()=>{if(isBlocked()||!selected)return;const s=getState();s.layout=s.layout.filter(c=>c.id!==selected);for(const p of s.team)if(p.cageId===selected){p.cageId=null;p.cage='free';p.cageSeconds=0;}selected=null;changed('케이지를 철거하고 디지몬을 자유 활동으로 돌렸습니다.');status();};
 function candidate(t){if(!t)return null;const s=getState();if(drag?.cage){const c=s.layout.find(c=>c.id===drag.cage);return {...c,q:t.q-drag.offsetQ,r:t.r-drag.offsetR};}if(tool)return {id:'new',kind:tool,q:t.q,r:t.r,rotation};return null;}
 canvas.style.touchAction='none';canvas.onclick=null;
 canvas.onpointerdown=e=>{if(isBlocked())return;const s=getState(),p=coordinate(e),t=tile(p);hover=t;canvas.setPointerCapture(e.pointerId);
   if(editing){const cage=t&&L.at(s.layout,t.q,t.r);if(cage&&!tool){selected=cage.id;drag={cage:cage.id,offsetQ:t.q-cage.q,offsetR:t.r-cage.r};}else if(!tool){selected=null;}status();}
   else{let best=-1,distance=65;s.team.forEach((pet,i)=>{const d=Math.hypot(p.x-pet.x,p.y-(pet.y-25));if(d<distance){best=i;distance=d;}});if(best>=0){s.selected=best;drag={pet:best,start:p,point:p};changed();}else drag={click:true};}
   // 디지몬·케이지를 잡지 않았으면 끌어서 사육장을 둘러본다
   if(drag?.click||(editing&&!tool&&!drag)){drag={...(drag||{}),pan:{x:e.clientX,y:e.clientY,cx:cam.x,cy:cam.y,moved:false}};}
 };
 canvas.onpointermove=e=>{if(drag?.pan){const box=canvas.getBoundingClientRect(),k=VIEW.w/box.width/zoom,dx=(e.clientX-drag.pan.x)*k,dy=(e.clientY-drag.pan.y)*k;if(Math.hypot(dx,dy)>6)drag.pan.moved=true;if(drag.pan.moved){cam.x=drag.pan.cx-dx;cam.y=drag.pan.cy-dy;clampCam();}}hover=tile(coordinate(e));if(drag?.pet!==undefined)drag.point=coordinate(e);};
 canvas.addEventListener('wheel',e=>{if(isBlocked())return;e.preventDefault();const before=coordinate(e),p=screenPoint(e);zoom=Math.max(0.5,Math.min(2.5,zoom*Math.exp(-e.deltaY*0.001)));cam.x=before.x-p.x/zoom;cam.y=before.y-p.y/zoom;clampCam();},{passive:false});
 canvas.onpointerup=e=>{if(isBlocked()){drag=null;return;}if(drag?.pan?.moved){drag=null;status();return;}const s=getState(),t=tile(coordinate(e));
   if(editing){const next=candidate(t);if(next){if(L.valid(s.layout,next)){if(drag?.cage)Object.assign(s.layout.find(c=>c.id===drag.cage),next);else{const stored=(s.storedCages||[]).findIndex(c=>c.kind===next.kind);const id=stored>=0?s.storedCages.splice(stored,1)[0].id:crypto.randomUUID();s.layout.push({...next,id});}changed('케이지 배치를 저장했습니다.');}else notify('다른 케이지와 겹치거나 사육장을 벗어납니다.');}}
   else if(drag?.pet!==undefined&&Math.hypot(drag.point.x-drag.start.x,drag.point.y-drag.start.y)<8){onPet?.(drag.pet);}
   else if(t){const cage=L.at(s.layout,t.q,t.r),pet=s.team[drag?.pet??s.selected];if(cage){if(L.assign(s,pet,cage.id))changed(L.over(s,cage.id)?`${L.types[cage.kind].name}의 정원을 넘었습니다. 이대로 하루가 지나면 스트레스를 받습니다.`:`${L.types[cage.kind].name}에 입장했습니다.`);}else if(drag?.pet!==undefined){pet.cageId=null;pet.cage='free';pet.cageSeconds=0;const c=center(t.q,t.r);pet.x=c.x;pet.y=c.y;pet.target=c.x;changed('자유 활동으로 전환했습니다.');}}
   drag=null;status();
 };
 canvas.onpointercancel=()=>{drag=null;hover=null;};
 let onPet=null; // 디지몬을 움직이지 않고 눌렀을 때(쓰다듬기) 부르는 함수
 return {
   set onPet(f){onPet=f;},
   reset(){selected=null;drag=null;tool=null;init();status();},
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
     for(let q=0;q<6;q++)for(let r=0;r<5;r++){polygon(ctx,q,r);ctx.fillStyle='#407675';ctx.fill();ctx.strokeStyle='#8eaaa1';ctx.lineWidth=1;ctx.stroke();}
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
     // 디지몬은 배치된 시설 안에서만 훈련한다. 같은 시설에서는 점유 칸을 나눠 사용한다.
     for(const p of s.team){const c=s.layout.find(c=>c.id===p.cageId);if(c){const index=s.team.filter(x=>x.cageId===c.id).indexOf(p),cells=L.cells(c),cell=cells[index%cells.length],pos=center(...cell);const group=s.team.filter(x=>x.cageId===c.id),offset=cells.length===1?(index-(group.length-1)/2)*60:0;p.x=pos.x+offset;p.y=pos.y+20;p.target=p.x;p.cage=c.kind;}else if(p.cage!=='free'){p.cage='free';p.cageId=null;}}
     if(drag?.pet!==undefined){const p=s.team[drag.pet];p.x=drag.point.x;p.y=drag.point.y+25;p.target=p.x;}
   }
 };
};
