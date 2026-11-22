// 원본 상태 그림/NANR 재생. 상태 판정·지속·치료·피해는 기존 엔진을 따른다.
(function(root){
 root.createBattleStatusEffects=function(data=root.BATTLE_STATUS_ART){
  const image=new Image();image.src='assets/battle/status-effects.png?v=20261122-native-status';let clock=0;const actors=new Map();
  function frame(sequence,age){
   let ticks=Math.max(0,age)*data.tickRate;
   const total=sequence.frames.reduce((n,f)=>n+f[1],0),prefix=sequence.frames.slice(0,sequence.start).reduce((n,f)=>n+f[1],0);
   if(ticks>=total){if(!sequence.loop)return sequence.frames.at(-1)[0];ticks=prefix+(ticks-prefix)%(total-prefix);}
   for(const [cell,hold] of sequence.frames){if(ticks<hold)return cell;ticks-=hold;}
   return sequence.frames.at(-1)[0];
  }
  return {
   tick(dt){clock+=Math.max(0,dt);},
   draw(ctx,unit,time,bounds){
    const status=unit.alive&&unit.status?.until>time?unit.status.id:0,sequence=data.states[status];
    if(!sequence){actors.delete(unit.id);return null;}
    let actor=actors.get(unit.id);
    if(!actor||actor.status!==status||actor.until!==unit.status.until){actor={status,until:unit.status.until,start:clock};actors.set(unit.id,actor);}
    const cell=frame(sequence,clock-actor.start),art=data.cells[cell];
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
