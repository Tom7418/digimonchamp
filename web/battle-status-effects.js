// 기존 상태 그림과 웹판 자체 표시를 재생한다. 지속·치료·피해는 엔진 상태를 따른다.
(function(root){
 root.createBattleStatusEffects=function(data=root.BATTLE_STATUS_ART){
  const image=new Image();image.src='assets/battle/status-effects.png?v=20261122-native-status';let clock=0;const actors=new Map();
  const reducedMotion=root.matchMedia?.('(prefers-reduced-motion: reduce)');
  function frame(sequence,age){
   let ticks=Math.max(0,age)*data.tickRate;
   const total=sequence.frames.reduce((n,f)=>n+f[1],0),prefix=sequence.frames.slice(0,sequence.start).reduce((n,f)=>n+f[1],0);
   if(ticks>=total){if(!sequence.loop)return sequence.frames.at(-1)[0];ticks=prefix+(ticks-prefix)%(total-prefix);}
   for(const [cell,hold] of sequence.frames){if(ticks<hold)return cell;ticks-=hold;}
   return sequence.frames.at(-1)[0];
  }
  // 기존 그림이 없는 상태에는 웹판에서 그리는 기하 도형을 사용한다.
  function drawWebEffect(ctx,kind,bounds,age){
   const {cx,top,bottom,width,height}=bounds;
   const radius=Math.max(10,width/2+3), centerY=bottom-height*.45;
   ctx.save();
   if(kind==='petrified'){
    const inset=5*(1-Math.min(1,age/.28));
    ctx.strokeStyle='#d6e4ef';
    ctx.lineWidth=1.5;
    ctx.beginPath();
    for(const side of [-1,1]){
     const x=cx+side*(radius+inset), tip=x-side*5;
     ctx.moveTo(tip,top);ctx.lineTo(x,top);ctx.lineTo(x,bottom);ctx.lineTo(tip,bottom);
    }
    ctx.stroke();
   }else if(kind==='cursed'){
    ctx.fillStyle='#e0a2ff';
    for(let i=0;i<3;i++){
     const angle=age*2.8+i*2*Math.PI/3;
     const x=cx+radius*Math.cos(angle), y=centerY+Math.max(5,height*.2)*Math.sin(angle);
     ctx.beginPath();
     ctx.moveTo(x,y-3);ctx.lineTo(x+2,y);ctx.lineTo(x,y+3);ctx.lineTo(x-2,y);ctx.closePath();
     ctx.fill();
    }
   }else{
    const y=bottom+14, x=cx-9, phase=Math.floor(age*6)%3;
    for(let i=0;i<3;i++){
     ctx.fillStyle=i===phase?'#ffe0a1':'#6b604e';
     ctx.fillRect(x+i*7,y,4,2);
    }
   }
   ctx.restore();
  }
  return {
   tick(dt){clock+=Math.max(0,dt);},
   draw(ctx,unit,time,bounds,battleOver=false){
    const status=unit.alive&&unit.status?.until>time?unit.status.id:0,sequence=data.states[status];
    const waiting=!battleOver&&!unit.alive&&unit.riseAt>time;
    const kind=waiting?'revival':status===12?'petrified':status===13?'cursed':null;
    if(!sequence&&!kind){actors.delete(unit.id);return null;}
    const marker=kind??status, until=waiting?unit.riseAt:unit.status.until;
    let actor=actors.get(unit.id);
    if(!actor||actor.marker!==marker||actor.until!==until){
     actor={marker,until,start:clock};
     actors.set(unit.id,actor);
    }
    const age=clock-actor.start;
    if(kind){
     drawWebEffect(ctx,kind,bounds,reducedMotion?.matches ? .28 : age);
     return {kind,status};
    }
    const cell=frame(sequence,age),art=data.cells[cell];
    const body=sequence.anchor==='body',scale=body?Math.max(.65,Math.min(3,Math.max(bounds.width/32,bounds.height/28))):Math.max(.65,Math.min(1.5,bounds.height/40));
    // ARM9 0x020645e8: 모델 높이의 약 4/5만큼 발끝에서 위로 부착한다.
    // NDS 정수 모델 높이 대신 현재 웹 스프라이트 경계에 비율을 투영한다.
    const x=bounds.cx,y=body?bounds.bottom:bounds.bottom-bounds.height*data.headHeightRatio;
    if(image.complete&&image.naturalWidth){
     ctx.save();ctx.imageSmoothingEnabled=false;
     // NCER 원점을 보존하며 상태 그림을 좌우 반전하지 않는다.
     ctx.drawImage(image,art.x,art.y,art.w,art.h,x+art.left*scale,y+art.top*scale,art.w*scale,art.h*scale);ctx.restore();
    }
    return {status,cell,sequence:sequence.sequence,x,y,scale};
   },
   sample:(id,age)=>data.states[id]?frame(data.states[id],age):null,
   clear(){actors.clear();clock=0;},
   get ready(){return image.complete&&!!image.naturalWidth;},
  };
 };
})(typeof window!=='undefined'?window:globalThis);
