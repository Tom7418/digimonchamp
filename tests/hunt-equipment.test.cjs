const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('사냥13종원본장비의프레임·방향·설치상태와정지시간을유지한다',()=>{
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=100;}});
 for(const f of ['assets/hunt/equipment.js','hunt-equipment.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 const r=c.window.createHuntEquipmentRenderer(),draws=[],ctx={drawImage:(...a)=>draws.push(a)};
 for(const [id,key] of Object.entries({mine1:'smallmine',mine2:'hugemine',trap1:'digicach',trap2:'digiprison',toy1:'decoy',toy2:'decoy2',light1:'digilight',light2:'digilight2'})){
  const a={g:{id},x:100,y:100};assert.equal(r.resource(a),key);r.draw(ctx,a,.1);const frame=draws.at(-1)[1];r.draw(ctx,a,0);assert.equal(draws.at(-1)[1],frame);
 }
 for(const [effect,key] of [['독','niku_poison'],['마비','niku_stun'],['수면','niku_sleep']])assert.equal(r.resource({effect}),key);
 assert.equal(r.resource({big:true}),'niku_big');assert.equal(r.resource({}),'niku_nomal');
 for(const m of Object.values(c.window.HUNT_EQUIPMENT_ART))for(const seq of m.sequences)for(const [frame,hold] of seq.frames){assert.ok(frame>=0&&hold>0);}
 assert.equal(draws.length,16);
});


test('폭발은 원본36틱을 재생하고 정지·상태전환·마지막프레임을 보존한다',()=>{
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=1500;}});
 for(const f of ['assets/hunt/equipment.js','hunt-equipment.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 const r=c.window.createHuntEquipmentRenderer(),frames=[],a={g:{id:'bomb1'},x:30,y:40},ctx={drawImage:(...v)=>frames.push(v[1])};
 assert.equal(r.duration(a,2),.6);r.draw(ctx,a,0,2);const first=frames.at(-1);r.draw(ctx,a,.1,2);assert.notEqual(frames.at(-1),first);
 const paused=frames.at(-1);r.draw(ctx,a,0,2);assert.equal(frames.at(-1),paused);
 r.draw(ctx,a,10,2);const last=frames.at(-1);r.draw(ctx,a,1,2);assert.equal(frames.at(-1),last);
 r.draw(ctx,a,0,0);r.draw(ctx,a,0,2);assert.equal(frames.at(-1),first);
 for(const id of ['bomb1','bomb2','bomb3','bomb4','mine1','mine2'])assert.equal(r.duration({g:{id}},2),.6);
});

test('실제 폭발 이벤트는 원본 도트를 예약하고 기존 범위·피해를 한 번만 적용한다',()=>{
 const src=fs.readFileSync('web/game.js','utf8'),a=src.indexOf('  function blast('),b=src.indexOf('  // 체커 묶음:',a),events=[];
 const hunt={fx:[],wilds:[{x:10,y:15,hp:10},{x:500,y:500,hp:10}]};
 const c=vm.createContext({hunt,window:{},Image:function(){this.complete=true;this.naturalWidth=1000;},C:{},itemHit:(w)=>{w.hp-=2;return true},wakeFromSleep(){},applyEffect:(...v)=>events.push(v),huntNote(){}});
 for(const f of ['web/assets/hunt/equipment.js','web/hunt-equipment.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);c.huntEquipmentArt=c.window.createHuntEquipmentRenderer();
 vm.runInContext(src.slice(a,b),c);c.blast(10,0,{id:'mine1',name:'마인',power:50,range:70});
 assert.equal(hunt.fx.length,1);assert.equal(hunt.fx[0].explosion,true);assert.ok(hunt.fx[0].left>1);assert.equal(hunt.fx[0].particles.length,20);
 assert.equal(hunt.wilds[0].hp,8);assert.equal(hunt.wilds[1].hp,10);assert.equal(events.length,1);
});


test('미끼 두 종류는 소멸1 뒤 정지2로 전환하고 원본 20→2틱 가속 점멸을 마친다',()=>{
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=1000;}});
 for(const f of ['web/assets/hunt/equipment.js','web/hunt-equipment.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
 const r=c.window.createHuntEquipmentRenderer();
 for(const id of ['toy1','toy2']){
  const a={kind:'toy',gearId:id,x:50,y:60,left:0},before=JSON.stringify(a),f=r.retirement(a);
  assert.equal(JSON.stringify(a),before);assert.ok(Math.abs(f.left-140/60)<1e-9);
  assert.equal(r.retirementFrame(f,.49).sequence,1);assert.equal(r.retirementFrame(f,.5).sequence,2);
  let tick=0;for(const period of [20,18,16,14,12,10,8,6,4,2]){
   assert.equal(r.retirementFrame(f,.5+tick/60).visible,true);
   assert.equal(r.retirementFrame(f,.5+(tick+period/2)/60).visible,false);tick+=period;
  }
  assert.equal(r.retirementFrame(f,140/60).visible,false);
  const frames=[],ctx={drawImage:(...v)=>frames.push(v)};
  r.drawRetiring(ctx,f,0);const first=frames.at(-1)[1];r.drawRetiring(ctx,f,.26);assert.notEqual(frames.at(-1)[1],first);
  const paused=frames.at(-1)[1];r.drawRetiring(ctx,f,0);assert.equal(frames.at(-1)[1],paused);
  r.drawRetiring(ctx,f,.25);const count=frames.length;r.drawRetiring(ctx,f,.2);assert.equal(frames.length,count);
  r.drawRetiring(ctx,f,1/6);assert.ok(frames.length>count);r.drawRetiring(ctx,f,3);const end=frames.length;r.drawRetiring(ctx,f,0);assert.equal(frames.length,end);
 }
});

function explosionSetup(){
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=4096;}});
 for(const f of ['web/assets/hunt/equipment.js','web/hunt-equipment.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
 return c.window.createHuntEquipmentRenderer();
}
test('폭탄·마인은 원본 5칸/3칸 풀의 생성 간격으로 시간차 입자를 배치한다',()=>{
 const r=explosionSetup();
 for(const id of ['bomb1','bomb2','bomb3','mine1','mine2']){
  const g={id,power:50},before=JSON.stringify(g),e=r.explosion(100,120,g,()=>.5),by=seq=>e.particles.filter(p=>p.sequence===seq);
  assert.equal(JSON.stringify(g),before);assert.equal(by(2).length,10);assert.equal(by(3).length,6);assert.equal(by(4).length,4);
  assert.ok(Math.abs(by(3).at(-1).delay-40/60)<1e-9);assert.ok(Math.abs(e.left-76/60)<1e-9);
  assert.equal(by(3)[0].x,100);assert.equal(by(3)[0].y,120);assert.ok(by(3).some(p=>p.x!==100));
  assert.equal(new Set(by(2).map(p=>p.delay)).size,10);
  for(const p of e.particles){assert.equal(p.life,.6);assert.equal(r.resource(p),r.resource(e));}
 }
});
test('폭발은 미래 입자를 숨기고 일시정지·각 폭발 시계·마지막 소멸을 보존한다',()=>{
 const r=explosionSetup(),a=r.explosion(20,30,{id:'bomb1'},()=>.25),b=r.explosion(20,30,{id:'bomb1'},()=>.25),draws=[],ctx={drawImage:(...v)=>draws.push(v)};
 r.drawExplosion(ctx,a,0);assert.equal(draws.length,4);const start=JSON.stringify(draws);draws.length=0;r.drawExplosion(ctx,a,0);assert.equal(JSON.stringify(draws),start);
 draws.length=0;r.drawExplosion(ctx,a,.3);assert.ok(draws.length>4);draws.length=0;r.drawExplosion(ctx,b,0);assert.equal(JSON.stringify(draws),start);
 draws.length=0;r.drawExplosion(ctx,a,2);assert.equal(draws.length,0);r.drawExplosion(ctx,a,0);assert.equal(draws.length,0);
});
test('플래시 폭탄은 화염을 그리지 않고 별도 밝기 연출만 재생한다',()=>{
 const r=explosionSetup(),e=r.explosion(20,30,{id:'bomb4'}),draws=[],ctx={drawImage:(...v)=>draws.push(v)};
 assert.equal(e.particles.length,0);assert.equal(r.flashAlpha(e),0);r.drawExplosion(ctx,e,.08);assert.ok(r.flashAlpha(e)>0);assert.equal(draws.length,0);
 const paused=r.flashAlpha(e);r.drawExplosion(ctx,e,0);assert.equal(r.flashAlpha(e),paused);r.drawExplosion(ctx,e,1);assert.equal(r.flashAlpha(e),0);
});


test('디지캐치는 닫힘 뒤 앞쪽4번이 반복되고 뒤쪽 닫힌 그림을 유지한다',()=>{
 const r=explosionSetup(),a={g:{id:'trap1',kind:'trap'},x:100,y:120,heldWild:{id:'아구몬'}},calls=[],ctx={drawImage:(...v)=>calls.push(v)};
 r.drawTrap(ctx,a,0,'back');r.drawTrap(ctx,a,0,'front');assert.equal(calls.length,2);
 const open=calls.map(v=>v[1]);calls.length=0;r.drawTrap(ctx,a,.55,'back');r.drawTrap(ctx,a,0,'front');const closed=calls.map(v=>v[1]);assert.notEqual(closed[0],open[0]);assert.notEqual(closed[1],open[1]);
 assert.equal(r.trapLayers(a,.55)[1].sequence,4);
 calls.length=0;r.drawTrap(ctx,a,.12,'back');r.drawTrap(ctx,a,0,'front');assert.equal(calls[0][1],closed[0]);assert.notEqual(calls[1][1],closed[1]);
 const paused=JSON.stringify(calls);calls.length=0;r.drawTrap(ctx,a,0,'back');r.drawTrap(ctx,a,0,'front');assert.equal(JSON.stringify(calls),paused);
});
test('디지프리즌 네 층은 앞뒤를 나눠 그리고 포획 중 설치 그림으로 돌아가지 않는다',()=>{
 const r=explosionSetup(),a={g:{id:'trap2',kind:'trap'},x:100,y:120,heldWild:{id:'아구몬'}},calls=[],ctx={drawImage:(...v)=>calls.push(v)};
 r.drawTrap(ctx,a,0,'back');assert.equal(calls.length,2);r.drawTrap(ctx,a,0,'front');assert.equal(calls.length,4);
 assert.deepEqual(Array.from(r.trapLayers(a,0),p=>p.sequence),[1,3,7,2]);
 calls.length=0;r.drawTrap(ctx,a,2,'back');r.drawTrap(ctx,a,0,'front');assert.equal(calls.length,4);assert.ok(calls.every(v=>v[1]>0));
 const closed=JSON.stringify(calls);calls.length=0;r.drawTrap(ctx,a,2,'back');r.drawTrap(ctx,a,0,'front');assert.equal(JSON.stringify(calls),closed);
});
test('함정 해제·새 개체·새 설치는 이전 포획 동작을 남기지 않고 다시 시작한다',()=>{
 const r=explosionSetup(),a={g:{id:'trap1',kind:'trap'},x:100,y:120},calls=[],ctx={drawImage:(...v)=>calls.push(v)};
 r.drawTrap(ctx,a,0,'back');r.drawTrap(ctx,a,0,'front');assert.equal(calls.length,1);const idle=calls[0][1];
 a.heldWild={};calls.length=0;r.drawTrap(ctx,a,0,'back');r.drawTrap(ctx,a,0,'front');const first=JSON.stringify(calls);
 r.drawTrap(ctx,a,1,'back');a.heldWild=null;calls.length=0;r.drawTrap(ctx,a,0,'back');r.drawTrap(ctx,a,0,'front');assert.equal(calls.length,1);assert.equal(calls[0][1],idle);
 a.heldWild={};calls.length=0;r.drawTrap(ctx,a,0,'back');r.drawTrap(ctx,a,0,'front');assert.equal(JSON.stringify(calls),first);
 a.heldWild.gone=true;calls.length=0;r.drawTrap(ctx,a,0,'back');r.drawTrap(ctx,a,0,'front');assert.equal(calls.length,1);assert.equal(calls[0][1],idle);
});
