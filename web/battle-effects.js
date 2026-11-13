'use strict';
// 화면 전용: 엔진 이벤트 시점의 좌표를 복사하므로 여러 마리의 동시 적중도 독립 표시한다.
(function(root){
 function createBattleEffects(){
  let effects=[];
  function add(event,units){
   if(!['hit','heal','ko'].includes(event.type))return;
   const target=units.find(u=>u.id===(event.type==='ko'?event.id:event.to));
   const source=units.find(u=>u.id===event.from);
   if(!target)return;
   effects.push({kind:event.type,special:!!event.special,x:target.x,y:target.y-10,
    fromX:source?.x??target.x,fromY:(source?.y??target.y)-10,age:0,
    duration:event.type==='ko'?0.8:0.45});
  }
  function tick(dt){for(const e of effects)e.age+=Math.max(0,dt);effects=effects.filter(e=>e.age<e.duration);}
  function draw(ctx){
   for(const e of effects){
    const t=e.age/e.duration;ctx.save();ctx.globalAlpha=1-t;
    const color=e.kind==='heal'?'#70edae':e.special?'#ffd36a':'#fff4d0';
    ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=e.special?3:2;
    if(e.kind==='hit'){
     // 이미 적중한 공격의 연결선과 파열광. 투사체 속도·피해 판정을 추가하지 않는다.
     ctx.beginPath();ctx.moveTo(e.fromX,e.fromY);ctx.lineTo(e.x,e.y);ctx.stroke();
     for(let i=0;i<6;i++){const a=i*Math.PI/3,r=5+t*17;ctx.beginPath();
      ctx.moveTo(e.x+Math.cos(a)*r*0.4,e.y+Math.sin(a)*r*0.4);
      ctx.lineTo(e.x+Math.cos(a)*r,e.y+Math.sin(a)*r);ctx.stroke();}
    }else if(e.kind==='heal'){
     ctx.beginPath();ctx.arc(e.x,e.y,10+t*15,0,Math.PI*2);ctx.stroke();
     ctx.fillRect(e.x-2,e.y-10-t*18,4,12);ctx.fillRect(e.x-6,e.y-6-t*18,12,4);
    }else{
     ctx.beginPath();ctx.ellipse(e.x,e.y+22,12+t*15,4+t*5,0,0,Math.PI*2);ctx.stroke();
    }
    ctx.restore();
   }
  }
  return {add,tick,draw,get count(){return effects.length;}};
 }
 root.createBattleEffects=createBattleEffects;
 if(typeof module!=='undefined')module.exports={createBattleEffects};
})(typeof window!=='undefined'?window:globalThis);
