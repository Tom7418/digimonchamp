 'use strict';
(function(root){
 root.createHuntEquipmentRenderer=function(data=root.HUNT_EQUIPMENT_ART){
  const images=new Map(),ages=new WeakMap();
  const variants={bomb1:'bom_nomal',bomb2:'bom_sleep',bomb3:'bom_stun',bomb4:'bom_flash',mine1:'smallmine',mine2:'hugemine',trap1:'digicach',trap2:'digiprison',toy1:'decoy',toy2:'decoy2',light1:'digilight',light2:'digilight2'};
  function resource(a){return variants[a.g?.id||a.gearId]|| (a.kind==='toy'?'decoy':a.kind==='light'?(a.name?.startsWith('블루')?'digilight2':'digilight'):
   a.effect==='독'?'niku_poison':a.effect==='마비'?'niku_stun':a.effect==='수면'?'niku_sleep':a.big?'niku_big':'niku_nomal');}
  function duration(a,sequence=0){const m=data?.[resource(a)],s=m?.sequences[sequence];return s?s.frames.reduce((n,f)=>n+f[1],0)/60:0;}
  // 원본 overlay0 0x0212b754 → b688: 소멸1, 정지2, 20·18·…·2틱 깜빡임.
  // 설치물 복사본만 그려 유인 판정이나 마인 피해를 다시 발생시키지 않는다.
  const blinkPeriods=[20,18,16,14,12,10,8,6,4,2];
  function retirement(a){return {...a,retiring:true,left:duration(a,1)+blinkPeriods.reduce((n,x)=>n+x,0)/60};}
  function retirementFrame(a,age){
   const lead=duration(a,1);if(age<lead)return {sequence:1,visible:true};
   let ticks=Math.floor(Math.max(0,age-lead)*60+1e-7);
   for(const period of blinkPeriods){if(ticks<period)return {sequence:2,visible:ticks<period/2};ticks-=period;}
   return {sequence:2,visible:false};
  }
  const retireAges=new WeakMap();
  function drawRetiring(ctx,a,dt){
   const age=(retireAges.get(a)||0)+Math.max(0,dt);retireAges.set(a,age);
   const state=retirementFrame(a,age);if(!state.visible)return false;
   return draw(ctx,a,0,state.sequence,state.sequence===1?age:age-duration(a,1));
  }
  // overlay0의 화염5칸/불티3칸 풀과 5틱/3틱 간격, 40틱 생성 구간.
  // 원본 연기는 한 프레임에 하나씩 10개를 방사한다. NDS 3D 좌표는 웹 평면으로 투영한다.
  function explosion(x,y,g,rng=Math.random){
   const effect={x,y,g,explosion:true,particles:[]};
   if(g.id==='bomb4'){effect.flash=true;effect.left=.45;return effect;}
   const offset=()=> (16+Math.floor(rng()*16))*(rng()<.5?-1:1);
   function add(sequence,tick,dx=0,dy=0){effect.particles.push({x:x+dx,y:y+dy,g,sequence,delay:tick/60,life:duration(effect,sequence)});}
   add(3,0);
   // 원본은 풀의 각 칸에 좌표를 한 번 정하고 재활성화할 때 같은 좌표를 사용한다.
   const positions={3:[[0,0],...Array.from({length:4},()=>[offset(),offset()])],4:Array.from({length:3},()=>[offset(),offset()])};
   const fire=[duration(effect,3)*60,-Infinity,-Infinity,-Infinity,-Infinity],sparks=[-Infinity,-Infinity,-Infinity];
   for(let tick=0;tick<=40;tick++){
    for(const [pool,first,interval,seq] of [[fire,1,5,3],[sparks,0,3,4]]){
     if(tick%interval)continue;
     const index=pool.findIndex((until,i)=>i>=first&&until<tick);
     if(index>=0){add(seq,tick,...positions[seq][index]);pool[index]=tick+duration(effect,seq)*60;}
    }
    if(tick<10){
     // 방향/거리 난수의 고정소수점·삼각함수 표 전체 대신 웹 평면의 방사 배치를 사용한다.
     const angle=(tick/10+rng()/10)*Math.PI*2,radius=10+Math.floor(rng()*80);
     add(2,tick,Math.cos(angle)*radius,Math.sin(angle)*radius);
    }
   }
   effect.left=Math.max(...effect.particles.map(p=>p.delay+p.life));return effect;
  }
  const explosionAges=new WeakMap();
  function drawExplosion(ctx,e,dt){
   const age=(explosionAges.get(e)||0)+Math.max(0,dt);explosionAges.set(e,age);
   if(e.flash)return;
   for(const p of e.particles){const t=age-p.delay;if(t>=0&&t<p.life)draw(ctx,p,0,p.sequence,t);}
  }
  function flashAlpha(e){
   if(!e.flash)return 0;const t=explosionAges.get(e)||0;
   // 원본 플래시 분기의 화면 밝기 변경을 사냥 화면에만 투영한다. 강도·완급은 웹판 표시 정책.
   return Math.max(0,Math.min(1,t/.08,(.45-t)/.25))*.55;
  }
  function draw(ctx,a,dt,sequence=0,playbackAge){
   const key=resource(a),meta=data?.[key];if(!meta)return false;
   if(!images.has(key)){const im=new Image();im.src=`assets/hunt/${key}.png`;images.set(key,im);}
   const image=images.get(key);let state=ages.get(a);if(!state||state.sequence!==sequence)state={sequence,age:0};else state.age+=Math.max(0,dt);ages.set(a,state);const age=playbackAge??state.age;
   if(!image.complete||!image.naturalWidth)return false;
   // 원본 프레임/유지 시간. 이벤트→시퀀스 선택은 웹판 정책으로 분리한다.
   const seq=meta.sequences[sequence]||meta.sequences[0],total=seq.frames.reduce((n,f)=>n+f[1],0);
   let tick=age*60;if(seq.loop)tick%=total;else tick=Math.min(total-1e-6,tick);
   let frame=seq.frames.at(-1)[0];for(const [cell,hold] of seq.frames){if(tick<hold){frame=cell;break;}tick-=hold;}
   ctx.drawImage(image,frame*meta.width,0,meta.width,meta.height,a.x+meta.left,a.y+meta.top,meta.width,meta.height);
   return true;
  }
  return {draw,resource,duration,retirement,drawRetiring,retirementFrame,explosion,drawExplosion,flashAlpha};
 };
})(typeof window!=='undefined'?window:globalThis);
