'use strict';
// 화면 입력과 그리기는 이 모듈이, 충돌/회전 판정은 CageLayout이 담당한다.
// pointer 이벤트와 capture를 사용하여 마우스 및 터치 드래그를 함께 지원한다.
window.createCageEditor=function(canvas,getState,changed,notify,isBlocked){
 const L=window.CageLayout, R=45, facilities={};
 for(const [kind,t] of Object.entries(L.types)){const im=new Image();if(t.art!==false)im.src=`assets/facilities/${kind}.png`;facilities[kind]=im;}
 let editing=false,tool=null,rotation=0,selected=null,drag=null,hover=null;
 const center=(q,r)=>({x:110+Math.sqrt(3)*R*(q+r/2),y:150+R*1.5*r});
 const polygon=(ctx,q,r,append=false)=>{const c=center(q,r);if(!append)ctx.beginPath();for(let i=0;i<6;i++){const a=(i*60-30)*Math.PI/180;const x=c.x+R*Math.cos(a),y=c.y+R*Math.sin(a);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();};
 const coordinate=e=>{const box=canvas.getBoundingClientRect();return {x:(e.clientX-box.left)*960/box.width,y:(e.clientY-box.top)*560/box.height};};
 const tile=p=>{let best=null,dist=R;for(let q=0;q<6;q++)for(let r=0;r<5;r++){const c=center(q,r),d=Math.hypot(p.x-c.x,p.y-c.y);if(d<dist){dist=d;best={q,r};}}return best;};
 // 팔레트의 작은 모양 미리보기도 실제 배치 좌표에서 생성한다.
 function footprint(kind){const points=L.cells({kind,q:0,r:0,rotation:0}).map(([q,r])=>{const c=center(q,r);return Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return [c.x+R*Math.cos(a),c.y+R*Math.sin(a)];});});const flat=points.flat(),xs=flat.map(p=>p[0]),ys=flat.map(p=>p[1]);return `<svg class="footprint" viewBox="${Math.min(...xs)-3} ${Math.min(...ys)-3} ${Math.max(...xs)-Math.min(...xs)+6} ${Math.max(...ys)-Math.min(...ys)+6}" aria-label="${L.types[kind].cells.length}칸 점유 모양">${points.map(ps=>`<polygon points="${ps.map(p=>p.join(',')).join(' ')}"/>`).join('')}</svg>`;}
 // 맞닿은 변은 제거하여 여러 칸 시설을 하나의 방처럼 표시한다.
 function outerBorder(ctx,c){const edges=new Map();for(const [q,r] of L.cells(c)){const p=center(q,r),v=Array.from({length:6},(_,i)=>{const a=(i*60-30)*Math.PI/180;return [p.x+R*Math.cos(a),p.y+R*Math.sin(a)];});for(let i=0;i<6;i++){const a=v[i],b=v[(i+1)%6],key=[a.map(Math.round).join(','),b.map(Math.round).join(',')].sort().join('/');if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);}}ctx.beginPath();for(const [a,b] of edges.values()){ctx.moveTo(...a);ctx.lineTo(...b);}ctx.stroke();}
 const toolbar=document.createElement('section');toolbar.className='cage-toolbar';
 toolbar.innerHTML='<div class="cage-toolbar-head"><button id="edit-cages">케이지 편집</button><button id="rotate-cage">↻ 회전</button><button id="remove-cage">선택 케이지 철거</button></div><div class="cage-palette">'+Object.entries(L.types).map(([k,t])=>`<button data-build="${k}" draggable="false">${t.art===false?`<i class="swatch" style="background:${t.color}"></i>`:`<img src="assets/facilities/${k}.png" alt="${t.name} 시설">`}${footprint(k)}${t.name}<small>${t.cells.length}칸 · 정원 ${t.capacity}</small></button>`).join('')+'</div><p id="cage-instruction"></p>';
 canvas.closest('.canvas-wrap').after(toolbar);
 const instruction=toolbar.querySelector('#cage-instruction');
 function status(){toolbar.classList.toggle('editing',editing);toolbar.querySelector('#edit-cages').textContent=editing?'✓ 편집 완료':'케이지 편집';instruction.textContent=editing?'종류 선택 → 빈 칸에 배치 · 설치된 케이지는 끌어서 이동 · 회전 후 배치 · 빈 곳을 눌러 선택 해제':'디지몬을 케이지로 끌어 넣으세요. 파트너 선택 후 케이지를 클릭해도 입장합니다.';if(getState().storedCages?.length)instruction.textContent+=` · 보관 시설 ${getState().storedCages.length}개: 해당 종류를 선택해 다시 설치하세요.`;toolbar.querySelector('#rotate-cage').disabled=!editing;toolbar.querySelector('#remove-cage').disabled=!editing||!selected;toolbar.querySelectorAll('[data-build]').forEach(b=>b.classList.toggle('active',b.dataset.build===tool));}
 function init(){const s=getState();if(s.layoutVersion!==2){s.layoutBackup=JSON.parse(JSON.stringify(s.layout||[]));const migrated=L.migrate(s.layout);s.layout=migrated.placed;s.storedCages=migrated.stored;s.layoutVersion=2;}s.layout=L.restore(s.layout);for(const p of s.team){if(!s.layout.some(c=>c.id===p.cageId)){p.cageId=null;p.cage='free';p.cageSeconds=0;}}}
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
 };
 canvas.onpointermove=e=>{hover=tile(coordinate(e));if(drag?.pet!==undefined)drag.point=coordinate(e);};
 canvas.onpointerup=e=>{if(isBlocked()){drag=null;return;}const s=getState(),t=tile(coordinate(e));
   if(editing){const next=candidate(t);if(next){if(L.valid(s.layout,next)){if(drag?.cage)Object.assign(s.layout.find(c=>c.id===drag.cage),next);else{const stored=(s.storedCages||[]).findIndex(c=>c.kind===next.kind);const id=stored>=0?s.storedCages.splice(stored,1)[0].id:crypto.randomUUID();s.layout.push({...next,id});}changed('케이지 배치를 저장했습니다.');}else notify('다른 케이지와 겹치거나 사육장을 벗어납니다.');}}
   else if(t){const cage=L.at(s.layout,t.q,t.r),pet=s.team[drag?.pet??s.selected];if(cage){if(L.assign(s,pet,cage.id))changed(`${L.types[cage.kind].name}에 입장했습니다.`);else notify('이 케이지의 정원이 찼습니다.');}else if(drag?.pet!==undefined){pet.cageId=null;pet.cage='free';pet.cageSeconds=0;const c=center(t.q,t.r);pet.x=c.x;pet.y=c.y;pet.target=c.x;changed('자유 활동으로 전환했습니다.');}}
   drag=null;status();
 };
 canvas.onpointercancel=()=>{drag=null;hover=null;};
 return {
   reset(){selected=null;drag=null;tool=null;init();status();},
   open(){if(isBlocked())return;editing=true;status();toolbar.scrollIntoView({block:'nearest',behavior:'smooth'});},
   get editing(){return editing;},
   draw(ctx){const s=getState();ctx.fillStyle='#214b50';ctx.fillRect(0,0,960,560);ctx.fillStyle='#c0dcd6';ctx.font='bold 16px sans-serif';ctx.textAlign='left';ctx.fillText(editing?'CAGE EDIT / 케이지 배치':'TRAINING FARM / 사육장',40,100);
     for(let q=0;q<6;q++)for(let r=0;r<5;r++){polygon(ctx,q,r);ctx.fillStyle='#407675';ctx.fill();ctx.strokeStyle='#8eaaa1';ctx.lineWidth=1;ctx.stroke();}
     for(const c of s.layout){
       const type=L.types[c.kind],cells=L.cells(c),anchor=center(c.q,c.r),im=facilities[c.kind];
       // 전체 점유 영역을 합집합으로 잘라 원본 시설 배경을 딱 한 번 그린다.
       ctx.save();ctx.beginPath();for(const [q,r] of cells)polygon(ctx,q,r,true);ctx.clip();ctx.fillStyle=type.color||'#a5a883';ctx.fill();
       const local=type.cells.map(([q,r])=>({x:Math.sqrt(3)*R*(q+r/2),y:R*1.5*r}));
       const left=Math.min(...local.map(p=>p.x))-Math.sqrt(3)*R/2,top=Math.min(...local.map(p=>p.y))-R;
       const width=Math.max(...local.map(p=>p.x))-left+Math.sqrt(3)*R/2,height=Math.max(...local.map(p=>p.y))-top+R;
       ctx.translate(anchor.x,anchor.y);ctx.rotate((c.rotation||0)*Math.PI/3);
       if(im.complete&&im.naturalWidth)ctx.drawImage(im,left,top,width,height);ctx.restore();
       ctx.strokeStyle=selected===c.id?'#ffe374':'#8ed3e6';ctx.lineWidth=selected===c.id?4:2;outerBorder(ctx,c);
       ctx.fillStyle='#102e3ce8';ctx.fillRect(anchor.x-43,anchor.y+25,86,16);ctx.fillStyle='#fff';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(`${type.name} · ${cells.length}칸`,anchor.x,anchor.y+37);
     }
     const next=editing&&candidate(hover);if(next){const valid=L.valid(s.layout,next);for(const [q,r] of L.cells(next)){polygon(ctx,q,r);ctx.fillStyle=valid?'#79efa588':'#ff5a6e99';ctx.fill();}}
     // 디지몬은 배치된 시설 안에서만 훈련한다. 같은 시설에서는 점유 칸을 나눠 사용한다.
     for(const p of s.team){const c=s.layout.find(c=>c.id===p.cageId);if(c){const index=s.team.filter(x=>x.cageId===c.id).indexOf(p),cells=L.cells(c),cell=cells[index%cells.length],pos=center(...cell);const group=s.team.filter(x=>x.cageId===c.id),offset=cells.length===1?(index-(group.length-1)/2)*23:0;p.x=pos.x+offset;p.y=pos.y+8;p.target=p.x;p.cage=c.kind;}else if(p.cage!=='free'){p.cage='free';p.cageId=null;}}
     if(drag?.pet!==undefined){const p=s.team[drag.pet];p.x=drag.point.x;p.y=drag.point.y+25;p.target=p.x;}
   }
 };
};
