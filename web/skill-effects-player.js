'use strict';
(function(root){
 // 원본 0x21285ee: 발사/비행/명중 NANR, 속도, 오프셋·배율. 대상 이동/충돌은 확정된 웹 이벤트를 따른다.
 root.createBattleSkillEffects=function(data=root.BATTLE_SKILL_EFFECTS){
  const image=new Image();image.src='assets/battle/skill-effects.png';let jobs=[],clock=0;const arrivals=[];
  const sequence=ref=>data.banks[ref[0]].sequences[ref[1]];
  const duration=ref=>ref?sequence(ref).frames.reduce((n,f)=>n+f[1],0)/data.tickRate:0;
  function add(event,units,before){
   if(event.type!=='hit'||!event.special)return null;
   const d=data?.records[event.skill?.record],a=units.find(u=>u.id===event.from),t=units.find(u=>u.id===event.to);
   if(!d||!a||!t)return null;
   // 미해석 스크립트는 이미 확인한 대상 타격 그림만 사용한다. 비행 궤적을 임의로 만들지 않는다.
   if(d.kind!=='projectile'&&!d.impact)return null;
   const flip=t.x<a.x,sign=flip?-1:1,off=d.flightOffset||[0,0,1];
   const start={x:a.x+sign*off[0],y:a.y+off[1]},end={x:t.x,y:t.y-10};
   const lead=d.kind==='projectile'?Math.hypot(end.x-start.x,end.y-start.y)/(d.speed*60):0;
   const tail=Math.max(duration(d.finish),duration(d.impact));
   jobs.push({d,event,from:{x:a.x,y:a.y},start,end,flip,begin:clock,lead,tail,arrived:lead===0,before:before?.get(t.id)});
   return {lead,hold:lead+tail};
  }
  function tick(dt){
   clock+=Math.max(0,dt);
   for(const j of jobs)if(!j.arrived&&clock-j.begin>=j.lead){j.arrived=true;arrivals.push(j.event);}
   jobs=jobs.filter(j=>clock-j.begin<j.lead+j.tail);
  }
  function drawRef(ctx,ref,x,y,age,scale=1,flip=false){
   if(!ref||!image.complete||!image.naturalWidth)return;
   const s=sequence(ref),total=duration(ref)*data.tickRate;let tick=Math.max(0,age)*data.tickRate;
   if(tick>=total){if(!s.loop)return;const intro=s.frames.slice(0,s.start).reduce((n,f)=>n+f[1],0);tick=intro+(tick-total)%(total-intro);}
   let ci=s.frames.at(-1)[0];for(const [cell,ticks] of s.frames){ci=cell;if(tick<ticks)break;tick-=ticks;}
   const c=data.banks[ref[0]].cells[ci];ctx.save();ctx.translate(x,y);ctx.scale((flip?-1:1)*scale,scale);
   ctx.drawImage(image,c.x,c.y,c.w,c.h,c.left,c.top,c.w,c.h);ctx.restore();
  }
  function draw(ctx,scale=1){
   for(const j of jobs){
    const age=clock-j.begin,d=j.d;
    if(age<j.lead){
     const o=d.muzzleOffset;drawRef(ctx,d.muzzle,j.from.x+(j.flip?-1:1)*o[0],j.from.y+o[1],age,o[2]*scale,j.flip);
     const p=age/j.lead;drawRef(ctx,d.flight,j.start.x+(j.end.x-j.start.x)*p,j.start.y+(j.end.y-j.start.y)*p,age,d.flightOffset[2]*scale,j.flip);
    }else{drawRef(ctx,d.finish,j.end.x,j.end.y,age-j.lead,(d.flightOffset?.[2]||1)*scale,j.flip);drawRef(ctx,d.impact,j.end.x,j.end.y,age-j.lead,scale,j.flip);}
   }
  }
  return {add,tick,draw,duration,drain:()=>arrivals.splice(0),visualUnit:u=>jobs.find(j=>!j.arrived&&j.event.to===u.id&&j.before)?.before||u,
   get busy(){return jobs.some(j=>!j.arrived);},get count(){return jobs.length;},get ready(){return image.complete&&!!image.naturalWidth;}};
 };
})(window);
