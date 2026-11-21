 'use strict';
(function(root){
 root.createHuntEquipmentRenderer=function(data=root.HUNT_EQUIPMENT_ART){
  const images=new Map(),ages=new WeakMap();
  const variants={bomb1:'bom_nomal',bomb2:'bom_sleep',bomb3:'bom_stun',bomb4:'bom_flash',mine1:'smallmine',mine2:'hugemine',trap1:'digicach',trap2:'digiprison',toy1:'decoy',toy2:'decoy2',light1:'digilight',light2:'digilight2'};
  function resource(a){return variants[a.g?.id||a.gearId]|| (a.kind==='toy'?'decoy':a.kind==='light'?(a.name?.startsWith('블루')?'digilight2':'digilight'):
   a.effect==='독'?'niku_poison':a.effect==='마비'?'niku_stun':a.effect==='수면'?'niku_sleep':a.big?'niku_big':'niku_nomal');}
  function duration(a,sequence=0){const m=data?.[resource(a)],s=m?.sequences[sequence];return s?s.frames.reduce((n,f)=>n+f[1],0)/60:0;}
  function draw(ctx,a,dt,sequence=0){
   const key=resource(a),meta=data?.[key];if(!meta)return false;
   if(!images.has(key)){const im=new Image();im.src=`assets/hunt/${key}.png`;images.set(key,im);}
   const image=images.get(key);let state=ages.get(a);if(!state||state.sequence!==sequence)state={sequence,age:0};else state.age+=Math.max(0,dt);ages.set(a,state);const age=state.age;
   if(!image.complete||!image.naturalWidth)return false;
   // 원본 프레임/유지 시간. 이벤트→시퀀스 선택은 웹판 정책으로 분리한다.
   const seq=meta.sequences[sequence]||meta.sequences[0],total=seq.frames.reduce((n,f)=>n+f[1],0);
   let tick=age*60;if(seq.loop)tick%=total;else tick=Math.min(total-1e-6,tick);
   let frame=seq.frames.at(-1)[0];for(const [cell,hold] of seq.frames){if(tick<hold){frame=cell;break;}tick-=hold;}
   ctx.drawImage(image,frame*meta.width,0,meta.width,meta.height,a.x+meta.left,a.y+meta.top,meta.width,meta.height);
   return true;
  }
  return {draw,resource,duration};
 };
})(typeof window!=='undefined'?window:globalThis);
