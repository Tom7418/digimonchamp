'use strict';
(function(root){
 // 원본 0x21285ee/0x2129611: 발사/비행/명중 NANR, 속도, 오프셋·배율. 대상 이동/충돌은 확정된 웹 이벤트를 따른다.
 root.createBattleSkillEffects=function(data=root.BATTLE_SKILL_EFFECTS){
  const image=new Image();image.src='assets/battle/skill-effects.png';let jobs=[],clock=0;const arrivals=[];
  const sequence=ref=>data.banks[ref[0]].sequences[ref[1]];
  const duration=ref=>ref?sequence(ref).frames.reduce((n,f)=>n+f[1],0)/data.tickRate:0;
  function add(event,units,before,actorScale=1,windup=0){
   if(event.type!=='hit'||!event.special)return null;
   const d=data?.records[event.skill?.record],a=units.find(u=>u.id===event.from),t=units.find(u=>u.id===event.to);
   if(!d||!a||!t)return null;
   // 미해석 스크립트는 이미 확인한 대상 타격 그림만 사용한다. 비행 궤적을 임의로 만들지 않는다.
   if(!['projectile','beam'].includes(d.kind)&&(!d.impact||event.damage===0))return null;
   // 투사체 원본도 왼쪽을 본다. 그림 반전과 좌표 진행 부호를 분리한다.
   const flip=t.x>a.x,sign=flip?1:-1,off=d.flightOffset||[0,0,1];
   const sourceOrigin=data.actorOrigins?.[a.speciesId];
   const from=sourceOrigin?{x:a.x+(flip?-1:1)*sourceOrigin[0]*actorScale,y:a.y+14+sourceOrigin[1]*actorScale}:{x:a.x,y:a.y};
   const start={x:from.x+sign*off[0]*actorScale,y:from.y+off[1]*actorScale},end={x:t.x,y:t.y-10};
   const lead=['projectile','beam'].includes(d.kind)?Math.hypot(end.x-start.x,end.y-start.y)/(d.speed*60):0;
   const beam=d.kind==='beam'?data.beam:null;
   const activeEnd=beam?Math.max(lead,(beam.growDelayFrames+Math.ceil(1/beam.widthStep)-1)/data.tickRate):0;
   const tail=beam?Math.max(activeEnd-lead+Math.ceil(1/beam.widthStep)/data.tickRate,duration(d.impact)):Math.max(duration(d.finish),duration(d.impact));
   jobs.push({d,event,from,actorScale,start,end,flip,begin:clock+windup,lead,tail,activeEnd,arrived:windup+lead===0,before:before?.get(t.id)});
   return {lead:windup+lead,hold:windup+lead+tail,lockActor:d.kind==='beam'};
  }
  function tick(dt){
   clock+=Math.max(0,dt);
   for(const j of jobs)if(!j.arrived&&clock-j.begin>=j.lead){j.arrived=true;arrivals.push(j.event);}
   jobs=jobs.filter(j=>clock-j.begin<j.lead+j.tail);
  }
  function drawRef(ctx,ref,x,y,age,scale=1,flip=false,options={}){
   if(!ref||!image.complete||!image.naturalWidth)return;
   const s=sequence(ref),total=duration(ref)*data.tickRate;let tick=Math.max(0,age)*data.tickRate;
   if(tick>=total){if(!s.loop&&!options.hold)return;if(!s.loop)tick=total-1e-6;else {const intro=s.frames.slice(0,s.start).reduce((n,f)=>n+f[1],0);tick=intro+(tick-total)%(total-intro);}}
   let ci=s.frames.at(-1)[0];for(const [cell,ticks] of s.frames){ci=cell;if(tick<ticks)break;tick-=ticks;}
   const c=data.banks[ref[0]].cells[ci];ctx.save();ctx.translate(x,y);if(options.angle)ctx.rotate(options.angle);ctx.scale((flip?-1:1)*(options.x??scale),options.y??scale);
   ctx.drawImage(image,c.x,c.y,c.w,c.h,c.left,c.top,c.w,c.h);ctx.restore();
  }
  function draw(ctx,scale=1){
   for(const j of jobs){
    const age=clock-j.begin,d=j.d;
    if(age<0)continue; // 준비 동작 중에는 발사광·투사체·빔을 그리지 않는다.
    if(d.kind==='beam'){
     const b=data.beam,dx=j.end.x-j.start.x,dy=j.end.y-j.start.y,distance=Math.hypot(dx,dy)||1;
     const frame=Math.floor(age*data.tickRate+1e-7),endFrame=Math.ceil(j.activeEnd*data.tickRate);
     // VM의 길이 변수는8에서 시작하지만 몸통 배율은(길이-8)/8이다.
     const length=Math.min(b.maxLength,b.initialLength+d.speed*Math.min(frame,endFrame))-b.initialLength;
     const width=age<j.activeEnd?Math.min(1,b.widthStep*(1+Math.max(0,frame-b.growDelayFrames))):Math.max(0,1-b.widthStep*Math.floor((age-j.activeEnd)*data.tickRate+1e-7));
     const thickness=Math.sqrt(width),angle=Math.atan2(dy,dx),head=j.event.damage!==0&&age>=j.lead&&age<j.lead+b.hitHeadFrames/data.tickRate?d.hitHead:d.head;
     // 원본 빔은 +X 축 그림을 회전한다. 투사체용 좌우 반전을 중복하지 않는다.
     drawRef(ctx,d.flight,j.start.x,j.start.y,age,scale,false,{angle,x:length/b.axisPixels,y:thickness*scale,hold:true});
     drawRef(ctx,head,j.start.x+dx/distance*length,j.start.y+dy/distance*length,age,scale,false,{angle,y:thickness*scale,hold:true});
     drawRef(ctx,d.origin,j.start.x,j.start.y,age,scale,false,{y:thickness*scale,hold:true});
     if(age>=j.lead&&j.event.damage!==0)drawRef(ctx,d.impact,j.end.x,j.end.y,age-j.lead,scale,j.flip);
    }else if(age<j.lead){
     const o=d.muzzleOffset;drawRef(ctx,d.muzzle,j.from.x+(j.flip?1:-1)*o[0]*j.actorScale,j.from.y+o[1]*j.actorScale,age,o[2]*scale,j.flip);
     const p=age/j.lead;drawRef(ctx,d.flight,j.start.x+(j.end.x-j.start.x)*p,j.start.y+(j.end.y-j.start.y)*p,age,d.flightOffset[2]*scale,j.flip);
    }else{
     drawRef(ctx,d.finish,j.end.x,j.end.y,age-j.lead,(d.flightOffset?.[2]||1)*scale,j.flip);
     if(j.event.damage!==0)drawRef(ctx,d.impact,j.end.x,j.end.y,age-j.lead,scale,j.flip);
    }
   }
  }
  return {add,tick,draw,duration,drain:()=>arrivals.splice(0),visualUnit:u=>jobs.find(j=>!j.arrived&&j.event.to===u.id&&j.before)?.before||u,
   get busy(){return jobs.some(j=>!j.arrived||j.d.kind==='beam');},get count(){return jobs.length;},get ready(){return image.complete&&!!image.naturalWidth;}};
 };
})(window);
