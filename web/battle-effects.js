'use strict';
// 원본 NCER/NCBR 타격광과 NANR 셀 유지 시간을 재생한다.
(function(root){
 function createBattleEffects(){
  let effects=[];
  const data=root.BATTLE_EFFECT_DATA;
  const hitImage=new Image();hitImage.src='assets/battle/effects.png';
  const healImages=Array.from({length:6},(_,i)=>{const im=new Image();im.src='assets/ui/fx_ring_'+(i+1)+'.png';return im;});
  function add(event,units){
   if(!['hit','heal'].includes(event.type))return;
   const target=units.find(u=>u.id===event.to);if(!target)return;
   effects.push({kind:event.type,x:target.x,y:target.y-10,age:0,
    duration:event.type==='heal'?1:data.hit.frames.reduce((s,f)=>s+f[1],0)/data.tickRate});
  }
  function tick(dt){for(const e of effects)e.age+=Math.max(0,dt);effects=effects.filter(e=>e.age<e.duration);}
  function draw(ctx){
   for(const e of effects){
    if(e.kind==='hit'){
     let t=e.age*data.tickRate,cell=data.hit.frames[0][0];
     for(const f of data.hit.frames){cell=f[0];if(t<f[1])break;t-=f[1];}
     if(hitImage.complete&&hitImage.naturalWidth)ctx.drawImage(hitImage,cell*data.width,0,data.width,data.height,e.x-data.width/2,e.y-data.height/2,data.width,data.height);
    }else{
     const image=healImages[Math.min(5,Math.floor(e.age*6))];
     if(image.complete&&image.naturalWidth)ctx.drawImage(image,e.x-16,e.y-16,32,32);
    }
   }
  }
  return {add,tick,draw,get count(){return effects.length;}};
 }
 root.createBattleEffects=createBattleEffects;
 if(typeof module!=='undefined')module.exports={createBattleEffects};
})(typeof window!=='undefined'?window:globalThis);
