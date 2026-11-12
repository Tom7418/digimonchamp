'use strict';
// 화면 입력과 그리기는 이 모듈이, 충돌/회전 판정은 CageLayout이 담당한다.
// pointer 이벤트와 capture를 사용하여 마우스 및 터치 드래그를 함께 지원한다.
window.createCageEditor=function(canvas,getState,changed,notify,isBlocked){
 const L=window.CageLayout, R=45, image=new Image();image.src='assets/cage_shop_icon.png';
 let editing=false,tool=null,rotation=0,selected=null,drag=null,hover=null;
 const center=(q,r)=>({x:110+Math.sqrt(3)*R*(q+r/2),y:150+R*1.5*r});
 const polygon=(ctx,q,r)=>{const c=center(q,r);ctx.beginPath();for(let i=0;i<6;i++){const a=(i*60-30)*Math.PI/180;const x=c.x+R*Math.cos(a),y=c.y+R*Math.sin(a);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.closePath();};
 const coordinate=e=>{const box=canvas.getBoundingClientRect();return {x:(e.clientX-box.left)*960/box.width,y:(e.clientY-box.top)*560/box.height};};
 const tile=p=>{let best=null,dist=R;for(let q=0;q<6;q++)for(let r=0;r<5;r++){const c=center(q,r),d=Math.hypot(p.x-c.x,p.y-c.y);if(d<dist){dist=d;best={q,r};}}return best;};
 const toolbar=document.createElement('section');toolbar.className='cage-toolbar';
 toolbar.innerHTML='<div class="cage-toolbar-head"><button id="edit-cages">케이지 편집</button><button id="rotate-cage">↻ 회전</button><button id="remove-cage">선택 케이지 철거</button></div><div class="cage-palette">'+Object.entries(L.types).map(([k,t])=>`<button data-build="${k}" draggable="false"><span style="background-position:-${t.frame*64}px 0"></span>${t.name}<small>${t.cells.length}칸 · 정원 ${t.capacity}</small></button>`).join('')+'</div><p id="cage-instruction"></p>';
 canvas.closest('.canvas-wrap').after(toolbar);
 const instruction=toolbar.querySelector('#cage-instruction');
 function status(){toolbar.classList.toggle('editing',editing);toolbar.querySelector('#edit-cages').textContent=editing?'✓ 편집 완료':'케이지 편집';instruction.textContent=editing?'종류 선택 → 빈 칸에 배치 · 설치된 케이지는 끌어서 이동 · 회전 후 배치 · 빈 곳을 눌러 선택 해제':'디지몬을 케이지로 끌어 넣으세요. 파트너 선택 후 케이지를 클릭해도 입장합니다.';toolbar.querySelector('#rotate-cage').disabled=!editing;toolbar.querySelector('#remove-cage').disabled=!editing||!selected;toolbar.querySelectorAll('[data-build]').forEach(b=>b.classList.toggle('active',b.dataset.build===tool));}
 function init(){const s=getState();s.layout=L.restore(s.layout);for(const p of s.team){if(!s.layout.some(c=>c.id===p.cageId)){p.cageId=null;p.cage='free';p.cageSeconds=0;}}}
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
   if(editing){const next=candidate(t);if(next){if(L.valid(s.layout,next)){if(drag?.cage)Object.assign(s.layout.find(c=>c.id===drag.cage),next);else{s.layout.push({...next,id:crypto.randomUUID()});}changed('케이지 배치를 저장했습니다.');}else notify('다른 케이지와 겹치거나 사육장을 벗어납니다.');}}
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
     for(const c of s.layout){const type=L.types[c.kind];for(const [q,r] of L.cells(c)){polygon(ctx,q,r);ctx.save();ctx.clip();const p=center(q,r);ctx.fillStyle='#9da678';ctx.fill();if(image.complete&&image.naturalWidth)ctx.drawImage(image,type.frame*64,0,64,48,p.x-55,p.y-43,110,86);ctx.restore();polygon(ctx,q,r);ctx.strokeStyle=selected===c.id?'#ffe374':'#c1e9f3';ctx.lineWidth=selected===c.id?4:2;ctx.stroke();}const p=center(c.q,c.r);ctx.fillStyle='#102e3ce8';ctx.fillRect(p.x-47,p.y+25,94,16);ctx.fillStyle='#fff';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(type.name,p.x,p.y+37);}
     const next=editing&&candidate(hover);if(next){const valid=L.valid(s.layout,next);for(const [q,r] of L.cells(next)){polygon(ctx,q,r);ctx.fillStyle=valid?'#79efa588':'#ff5a6e99';ctx.fill();}}
     // 디지몬은 배치된 시설 안에서만 훈련한다. 같은 시설에서는 점유 칸을 나눠 사용한다.
     for(const p of s.team){const c=s.layout.find(c=>c.id===p.cageId);if(c){const index=s.team.filter(x=>x.cageId===c.id).indexOf(p),cells=L.cells(c),cell=cells[index%cells.length],pos=center(...cell);p.x=pos.x;p.y=pos.y+8;p.target=p.x;p.cage=c.kind;}else if(p.cage!=='free'){p.cage='free';p.cageId=null;}}
     if(drag?.pet!==undefined){const p=s.team[drag.pet];p.x=drag.point.x;p.y=drag.point.y+25;p.target=p.x;}
   }
 };
};
