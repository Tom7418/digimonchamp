 'use strict';
(function(root){
 // 확대 대상/전환 시간은 원본 표. 카메라 중심 보간과 유지 시간은 웹 화면 정책.
 root.createBattlePresentation=function(data=root.BATTLE_PRESENTATION_DATA){
  const queue=[];let active=null;
  const lines=root.BATTLE_SPEEDLINE_DATA;
  const image=lines&&typeof Image!=='undefined'?new Image():null;
  if(image)image.src='assets/battle/speedlines.png';
  function add(event,units,duration){
   const frames=event.type==='hit'&&event.special&&data?.records[event.skill?.record];
   const actor=units.find(u=>u.id===event.from);
   if(!frames||!actor)return;
   // 같은 틱의 광역 적중은 시전자/기술 한 번만 강조한다.
   if([active,...queue].some(a=>a&&a.from===event.from&&a.record===event.skill.record))return;
   queue.push({from:event.from,record:event.skill.record,name:event.skill.name,x:actor.x,y:actor.y,
    transition:frames/data.tickRate,hold:Math.max(0,duration),age:0});
   if(!active)active=queue.shift();
  }
  function tick(dt){
   if(!active)return;
   active.age+=Math.max(0,dt);
   if(active.age>=active.transition*2+active.hold)active=queue.shift()||null;
  }
  function snapshot(){
   if(!active)return null;
   const a=active,t=a.transition;
   // 원본 VM: 1+sqrt((i+1)/n)로 확대, 2-sqrt((i+1)/n)로 복귀.
   const z=a.age<t?1+Math.sqrt(a.age/t):a.age<t+a.hold?2:2-Math.sqrt(Math.min(1,(a.age-t-a.hold)/t));
   return {...a,zoom:z,dim:(z-1)*data.dimFraction,progress:z-1};
  }
  function draw(ctx,width,height){
   const focus=snapshot();
   if(!focus||!lines||!image?.complete||!image.naturalWidth||focus.zoom<=1||focus.zoom>2)return;
   ctx.save();ctx.beginPath();ctx.rect(0,0,width,height);ctx.clip();
   // 원본 0x211ee30: alpha=1+floor((zoom-1)*30), DS alpha 1..31.
   ctx.globalAlpha=(1+Math.floor((focus.zoom-1)*30))/31;
   ctx.scale(width/256,height/192);
   for(let band=0;band<lines.bands;band++){
    const speed=1+Math.floor(band/2)*.5,direction=band%2?-1:1;
    const offset=focus.age*lines.tickRate*speed*direction;
    for(let column=0;column<3;column++){
     const x=((column*lines.spacing+offset+128)%lines.wrap+lines.wrap)%lines.wrap-128;
     for(const y of [64+band*16,240-band*16]){
      ctx.save();ctx.translate(x,y);ctx.scale(2,2);
      ctx.drawImage(image,lines.cell*lines.width,0,lines.width,lines.height,0,0,lines.width,lines.height);ctx.restore();
     }
    }
   }
   ctx.restore();
  }
  return {add,tick,snapshot,draw,get busy(){return !!active;}};
 };
})(typeof window!=='undefined'?window:globalThis);
