const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ctx=vm.createContext({window:{}});
for(const file of ['assets/sprites.js','assets/animations.js','animation.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',file),'utf8'),ctx);
const data=ctx.window.DIGIMON_ANIMATIONS;
const player=ctx.window.createAnimationPlayer(data);
test('224개(216종+디지에그 8종) 모든 연결 프레임은 실제 스프라이트 범위 안이고 유지 시간이 양수다',()=>{
  assert.equal(Object.keys(data.sprites).length,224);
  for(const sp of ctx.window.SPRITES)for(const seq of data.banks[data.sprites[sp.id]]){
    assert.ok(seq.frames.length>0);
    for(const [cell,ticks] of seq.frames){assert.ok(cell>=0&&cell<sp.frames);assert.ok(ticks>0);}
  }
});
test('NANR의 서로 다른 유지 시간과 반복 경계를 따른다',()=>{
  const id='m201_agumon',seq=data.banks[data.sprites[id]][0],first=seq.frames[0][1]/60;
  assert.equal(player.sample(id,'idle',first-0.001),seq.frames[0][0]);
  assert.equal(player.sample(id,'idle',first+0.001),seq.frames[1][0]);
  assert.equal(player.sample(id,'idle',player.duration(id,'idle')+0.001),seq.frames[0][0]);
});
test('훈련 클립은 원본 시퀀스를 처음부터 세 번 재생하고 그 사이에만 쉬는 동작을 넣는다',()=>{
  const id='m201_agumon',action=player.duration(id,'seq_29'),cycle=action+.28;
  const first=player.sample(id,'seq_29',0),second=player.sample(id,'seq_29',.2);
  for(let n=0;n<3;n++){
    assert.equal(player.trainingClip(id,35,n*cycle+.001,false).frame,first);
    assert.equal(player.trainingClip(id,35,n*cycle+.2,false).frame,second);
  }
  assert.equal(player.trainingClip(id,35,action+.01,false).recovery,true);
  assert.equal(player.trainingClip(id,35,action+.01,true).frame,player.sample(id,'run',.01));
  assert.equal(player.trainingClip(id,35,2*cycle+action-.001,false).done,undefined);
  assert.equal(player.trainingClip(id,35,2*cycle+action,false).done,true);
});
test('상태 전환은 처음부터 시작하며 dt=0은 정지 프레임을 유지한다',()=>{
  const actor={},id='m201_agumon';player.pose(actor,id,'walk',0);
  const frame=player.pose(actor,id,'walk',0.3);
  assert.equal(player.pose(actor,id,'walk',0),frame);
  assert.equal(player.pose(actor,id,'eat',0.3),player.sample(id,'eat',0));
});
test('단발 재생은 마지막 셀을 유지하고 없는 종은 안전하게 첫 셀을 쓴다',()=>{
  const p=ctx.window.createAnimationPlayer({tickRate:60,states:{idle:0},sprites:{a:0},banks:[[{frames:[[2,3],[7,5]],loop:false,start:0}]]});
  assert.equal(p.sample('a','idle',10),7);assert.equal(p.sample('missing','idle',10),0);
});

test('사냥 실제 이동·로프 정지·수직 이동에서 동작과 방향을 구분한다',()=>{
  const p=ctx.window.createAnimationPlayer(data), a={}, id='m201_agumon';
  let m=p.movement(a,id,2,0,0.1);
  assert.equal(m.state,'walk');assert.equal(m.flip,true);
  m=p.movement(a,id,0,3,0.1);assert.equal(m.flip,true);
  m=p.movement(a,id,-2,0,0.1);assert.equal(m.flip,false);
  m=p.movement(a,id,0,0,0.1);assert.equal(m.state,'idle');
  m=p.movement(a,id,3,0,0.1,true);assert.equal(m.state,'idle');assert.equal(m.flip,false);
});
test('사냥 일시정지는 방향·상태·프레임을 유지하고 재개 시 걷기를 다시 시작한다',()=>{
  const p=ctx.window.createAnimationPlayer(data), a={}, id='m201_agumon';
  p.movement(a,id,2,0,0.1);
  const moving=p.movement(a,id,2,0,0.3);
  const paused=p.movement(a,id,-2,0,0,true);
  assert.deepEqual(paused,moving);
  assert.equal(p.movement(a,id,0,0,0.1,true).state,'idle');
  assert.equal(p.movement(a,id,2,0,0.1).frame,p.sample(id,'walk',0));
});

test('먹기·피격·로프 코드와 사용자 GIF 전투 불능37 분류를 따른다',()=>{
 assert.equal(data.states.eat,14);assert.equal(data.states.hurt,5);assert.equal(data.states.hurtAlt,6);
 assert.equal(data.states.ko,37);assert.equal(data.states.boundIdle,16);
 assert.deepEqual(Array.from(data.banks[data.sprites.m201_agumon][14].frames,f=>f[0]),[24,25]);
 assert.equal(data.trainingActions.cm07[0][0],29);assert.equal(data.trainingActions.cm05[0][0],8);assert.equal(data.trainingActions.cm04[0][0],33);
});

test('설치 가능한 모든 훈련 시설에 원본 동작이 연결되어 있다',()=>{
 for(const file of ['core.js','cage-layout.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',file),'utf8'),ctx);
 const cages=vm.runInContext('Object.values(window.CageLayout.types).map(type=>ChampCore.getCage(type.core)).filter(c=>c.up||c.apUp||c.battleUp)',ctx);
 assert.ok(cages.length>20);
 for(const cage of cages){
  const phases=data.trainingActions['cm'+String(cage.no).padStart(2,'0')];
  assert.ok(phases?.length,cage.id);
  for(const [seq] of phases)assert.equal(data.states['seq_'+seq],seq);
 }
});

test('시설의 복합 자세, 달리는 시설과 두 미니 시설의 원본 대응을 재생한다',()=>{
 const id='m201_agumon';
 assert.equal(player.trainingClip(id,30,.25,false).frame,player.sample(id,'seq_32',.25));
 assert.equal(player.trainingClip(id,30,.51,false).frame,player.sample(id,'seq_15',.01));
 assert.equal(player.trainingClip(id,6,.9,false).frame,player.sample(id,'seq_31',.9));
 assert.equal(player.trainingClip(id,6,1.01,false).frame,player.sample(id,'seq_0',.01));
 for(const no of [2,3,8,9]){
  assert.equal(player.trainingClip(id,no,2,false).moving,true);
  assert.equal(player.trainingClip(id,no,3.01,false).moving,false);
 }
 for(const [mini,normal] of [[33,11],[38,15]]){
  for(const t of [.1,.7,1.5])assert.deepEqual(player.trainingClip(id,mini,t,false),player.trainingClip(id,normal,t,false));
 }
});

test('216종의 필수 동작은 모두 존재하고 디지에그는 별도 구조를 유지한다',()=>{
 const required=['idle','walk','eat','hurt','hurtAlt','ko','boundIdle','boundRun'];
 for(const sp of ctx.window.SPRITES){
  const bank=data.banks[data.sprites[sp.id]];
  if(sp.id.endsWith('_digitama')){assert.equal(bank.length,2);continue;}
  assert.equal(bank.length,40,sp.id);
  for(const state of required)assert.ok(bank[data.states[state]]?.frames.length,sp.id+':'+state);
 }
});
test('아구몬 셀 번호를 다른 종에 복사하지 않는다',()=>{
 for(const [id,cells] of [['m208_gabumon',[22,23]],['m205_gaomon',[29,30]],['m102_koromon',[23,24]]]){
  const seq=data.banks[data.sprites[id]][data.states.eat];
  assert.deepEqual(Array.from(seq.frames,f=>f[0]),cells);
 }
});

test('제공된 GIF 역할은40개 슬롯을 유지하고 미확인27/36과 코드로 확인한 진화39를 구분한다',()=>{
 for(const [name,n] of Object.entries({run:3,surprised:4,attack1:7,attack2:8,attack3:9,attack4:10,sleep:13,sleep2:15,boundEat:24,happy:28,angry:29,cheering:30,guard:31,train:32,shout:33,guard2:34,jumpHit:38}))assert.equal(data.states[name],n);
 for(const n of [27,36])assert.equal(data.states['seq_'+n],n);
 assert.equal(data.states.evolving,39);
 assert.notDeepEqual(data.banks[data.sprites.m201_agumon][data.states.ko].frames,data.banks[data.sprites.m201_agumon][data.states.sleep2].frames);
});

test('실제 적중 이벤트는 공격과 피격을 분리하며 결과 화면에서도 재생을 마친다',()=>{
 const source=fs.readFileSync('web/game.js','utf8');
 const a=source.indexOf('  function battleTick(dt)'),b=source.indexOf('  function battleLog(',a);
 for(const special of [false,true]){
  const sandbox=vm.createContext({window:{},performance:{now:()=>0},battleBackdrop:{spriteScale:()=>1},spriteOf:()=>({}),drawArena(){},finishBattle(){},battleLog(){}});
  for(const f of ['core.js','assets/sprites.js','assets/animations.js','animation.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),sandbox);
  vm.runInContext(`const animations=window.createAnimationPlayer(window.DIGIMON_ANIMATIONS);
    const SPRITE_BY_NAME=Object.fromEntries(window.SPRITES.map(s=>[s.name,s.id]));
    const C={getSpecies:ChampCore.getSpecies,stepBattle:()=>[{type:'hit',from:0,to:1,damage:10,special:${special}}]};
    let battle={done:false,acc:0.1,state:{over:false,units:[{id:0,speciesId:'아구몬',x:0,y:0},{id:1,speciesId:'토이아구몬',x:50,y:0}]},actions:new Map(),motion:new Map(),flashes:[],effects:{tick(){},add(){}}};
    globalThis.current=battle;
  `+source.slice(a,b),sandbox);
  sandbox.battleTick(0.01);
  assert.equal(sandbox.current.actions.get(0).state,special?'attack1':'attack4');
  assert.ok(['hurt','hurtAlt'].includes(sandbox.current.actions.get(1).state));
  sandbox.current.done=true;sandbox.battleTick(10);
  assert.equal(sandbox.current.actions.size,0);
 }
});

test('실제 기술 레코드의7~10 동작·한글 이름·소비TP를 화면에 전달한다',()=>{
 const source=fs.readFileSync('web/game.js','utf8');
 const start=source.indexOf('  function battleTick(dt)'),end=source.indexOf('  function battleLog(',start);
 for(const [speciesId,slot,animation,name,cost] of [
  ['가루다몬',0,'attack3','쉐도우 윙',30],['가루다몬',1,'attack1','파이어 허리케인',20],
  ['코로몬',0,'attack2','물방울',4],['드라코몬',1,'attack4','테일 스매시',10],
 ]){
  const logs=[];
  const sandbox=vm.createContext({window:{},performance:{now:()=>0},battleBackdrop:{spriteScale:()=>1},spriteOf:()=>({}),drawArena(){},finishBattle(){},battleLog:t=>logs.push(t)});
  for(const file of ['core.js','assets/sprites.js','assets/animations.js','animation.js'])vm.runInContext(fs.readFileSync('web/'+file,'utf8'),sandbox);
  vm.runInContext(`const animations=window.createAnimationPlayer(window.DIGIMON_ANIMATIONS);
   const SPRITE_BY_NAME=Object.fromEntries(window.SPRITES.map(s=>[s.name,s.id]));
   const skill=ChampCore.battleSkills('${speciesId}')[${slot}];
   const C={getSpecies:ChampCore.getSpecies,stepBattle:()=>[{type:'hit',from:0,to:1,damage:12,special:true,skill}]};
   let battle={done:false,acc:0.1,state:{over:false,units:[{id:0,name:'${speciesId}',speciesId:'${speciesId}',x:0,y:0},{id:1,name:'토이아구몬',speciesId:'토이아구몬',x:50,y:0}]},actions:new Map(),motion:new Map(),flashes:[],effects:{tick(){},add(){}}};
   globalThis.current=battle;
  `+source.slice(start,end),sandbox);
  sandbox.battleTick(0.01);
  assert.equal(sandbox.current.actions.get(0).state,animation);
  assert.ok(sandbox.current.flashes.some(f=>f.id===0&&f.text===name&&f.skill));
  assert.deepEqual(logs,[`${speciesId} · ${name} → 토이아구몬 (12 · TP ${cost})`]);
 }
});


test('피해0은 방어34, 치료/강화는35, 부활은33을 종별 원본 길이로 재생한다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  function battleTick('),b=source.indexOf('  function battleLog(',a);
 for(const [events,actor,state] of [
  [[{type:'revive',id:0,amount:25}],0,'shout'],
  [[{type:'hit',from:0,to:1,damage:0}],1,'guard2'],
  [[{type:'heal',from:0,to:1,amount:300,support:{id:1,name:'치료α'}}],0,'shoutFrame2'],
  [[{type:'support',from:0,targets:[0],skill:{id:9,name:'공격업'}}],0,'shoutFrame2'],
  [[{type:'hit',from:1,to:0,damage:10},{type:'support',from:0,targets:[0],skill:{id:28,name:'부활α'}}],0,'shout'],
 ]){
  const c=vm.createContext({window:{},events,performance:{now:()=>0},battleBackdrop:{spriteScale:()=>1},spriteOf:()=>({}),drawArena(){},finishBattle(){},battleLog(){}});
  for(const f of ['core.js','assets/sprites.js','assets/animations.js','animation.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
  vm.runInContext(`const animations=window.createAnimationPlayer(window.DIGIMON_ANIMATIONS),SPRITE_BY_NAME=Object.fromEntries(window.SPRITES.map(s=>[s.name,s.id]));
   const C={getSpecies:ChampCore.getSpecies,stepBattle:()=>events};
   const battle={done:false,acc:.1,state:{over:false,units:[{id:0,speciesId:'아구몬',alive:true,x:0,y:0},{id:1,speciesId:'토이아구몬',alive:true,x:50,y:0}]},actions:new Map(),motion:new Map(),flashes:[],effects:{tick(){},add(){}}};globalThis.b=battle;`+source.slice(a,b),c);
  c.battleTick(.001);const action=c.b.actions.get(actor);
  assert.equal(action.state,state);assert.equal(action.duration,player.duration(actor===0?'m201_agumon':ctx.window.SPRITES.find(s=>s.name==='토이아구몬').id,state));
 }
});

test('교차 공격은 명중 전 준비 자세를 표시하고 명중 즉시 막기·피격으로 전환한다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),logs=[];
 const c=vm.createContext({window:{},Image:function(){},battleLog:line=>logs.push(line),drawArena(){},finishBattle(){}});
 for(const f of ['assets/battle/effects.js','battle-effects.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 vm.runInContext(`
  const units=[{id:0,name:'A',speciesId:'a',x:70,y:80},{id:1,name:'B',speciesId:'b',x:110,y:80}];
  const events=[{type:'hit',from:0,to:1,damage:0},{type:'hit',from:1,to:0,damage:12}];
  const C={getSpecies:id=>({id}),stepBattle:()=>events.splice(0)};
  const SPRITE_BY_NAME={},animations={duration:()=>.5,windup:()=>.2},battleBackdrop={spriteScale:()=>1},spriteOf=()=>({});
  const battle={acc:0,state:{units,over:false},motion:new Map(),actions:new Map(),flashes:[],effects:window.createBattleEffects()};
  globalThis.b=battle;
 `+source.slice(source.indexOf('  function battleTick('),source.indexOf('  function battleLog(')),c);
 c.battleTick(.1);
 assert.equal(c.b.actions.get(0).state,'attack4');assert.equal(c.b.actions.get(1).state,'attack4');
 c.battleTick(.19);assert.equal(logs.length,0);
 assert.equal(c.b.actions.get(1).state,'attack4');
 c.battleTick(.02);assert.equal(logs.length,2);
 assert.equal(c.b.actions.get(1).state,'guard2');
 assert.ok(['hurt','hurtAlt'].includes(c.b.actions.get(0).state));
 assert.equal(c.b.actions.get(1).left,.5);
 c.battleTick(.51);assert.equal(c.b.actions.size,0);
 // 지연이 없는 공격도 같은 틱의 이후 공격 이벤트가 막기를 덮지 않는다.
 c.b.effects.add=()=>undefined;
 vm.runInContext("events.push({type:'hit',from:0,to:1,damage:0},{type:'hit',from:1,to:0,damage:12})",c);
 c.battleTick(.1);
 assert.equal(c.b.actions.get(1).state,'guard2');
 assert.ok(['hurt','hurtAlt'].includes(c.b.actions.get(0).state));
});

test('실제 경기장은 상태이상 지속·해제·KO·정지에서 올바른 원본 자세를 그린다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),frames=[],drawXs=[],labels=[],els={};
 const paint={save(){},restore(){},translate(){},scale(){},beginPath(){},ellipse(){},fill(){},fillRect(){},fillText(text){labels.push(text);},strokeText(){}};
 els['#arena']={width:416,height:272,getContext:()=>paint};
 const c=vm.createContext({window:{},performance:{now:()=>0},body:(...args)=>{frames.push(args[6]);drawXs.push(args[3]);},$:sel=>els[sel]??(els[sel]={}),esc:String,clamp:n=>Math.max(0,Math.min(100,n))});
 for(const f of ['core.js','assets/sprites.js','assets/animations.js','animation.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 vm.runInContext(`const C=ChampCore,animations=window.createAnimationPlayer(window.DIGIMON_ANIMATIONS),SPRITE_BY_NAME=Object.fromEntries(window.SPRITES.map(s=>[s.name,s.id]));
 const battleBackdrop={draw:()=>true,viewport:{x:0,y:0,scale:1},spriteScale:()=>1},spriteOf=()=>({body:24});
 const d=C.newDigimon(1,'아구몬',()=>.5);let battle={state:C.createBattle([C.entrantOf(d,'일반')],[C.entrantOf({...d,uid:2},'일반')]),map:{name:'검사'},motion:new Map(),actions:new Map(),effects:{draw(){}},flashes:[],done:false};battle.state.t=1;
 battle.state.units.forEach(u=>battle.motion.set(u.id,{dx:0,dy:0}));globalThis.b=battle;`,c);
 vm.runInContext(source.slice(source.indexOf('  function drawArena('),source.indexOf('  // ---------- 그리기 (캔버스) ----------')),c);
 const u=c.b.state.units[0],id='m201_agumon';
 for(const [status,state] of [[8,'sleep2'],[9,'sleep'],[10,'eyesClosed'],[12,'sleep2']]){
  u.status={id:status,until:10};c.b.actions.set(0,{state:'attack4',duration:1,left:1});
  frames.length=0;c.drawArena(.1);assert.equal(frames[0],player.sample(id,state,0));
  c.drawArena(0);assert.equal(frames[2],frames[0]);
  c.b.actions.clear();u.status.until=1;frames.length=0;c.drawArena(.1);assert.equal(frames[0],player.sample(id,'idle',0));
 }
 u.status={id:9,until:10};u.alive=false;frames.length=0;c.drawArena(.1);assert.equal(frames[0],player.sample(id,'ko',0));
 u.alive=true;u.status=undefined;c.b.motion.set(0,{dx:2,dy:0});frames.length=0;c.drawArena(.1);assert.equal(frames[0],player.sample(id,'walk',0));
 // 카운트다운은 필살기 연출이 보류한 개체/시뮬레이션 시각을 따른다.
 u.alive=false;u.hp=0;u.riseAt=6.17;
 c.b.effects.visualUnit=actor=>actor.id===u.id?{...actor,alive:true,hp:10,riseAt:undefined}:actor;
 c.drawArena(.1);assert.doesNotMatch(els['#battle-hp'].innerHTML,/기상 판정/);
 delete c.b.effects.visualUnit;
 labels.length=0;c.drawArena(.1);
 assert.ok(labels.includes('기상 판정까지 6초'));
 assert.match(els['#battle-hp'].innerHTML,/기상 판정까지 6초/);
 c.b.state.t=4;c.drawArena(.1);
 assert.match(els['#battle-hp'].innerHTML,/기상 판정까지 3초/);
 c.b.state.over=true;c.drawArena(.1);
 assert.match(els['#battle-hp'].innerHTML,/전투 불능/);
 assert.doesNotMatch(els['#battle-hp'].innerHTML,/기상 판정/);
 c.b.state.over=false;u.riseAt=undefined;c.drawArena(.1);
 assert.match(els['#battle-hp'].innerHTML,/전투 불능/);
 u.alive=true;u.hp=5;c.drawArena(.1);
 assert.doesNotMatch(els['#battle-hp'].innerHTML,/전투 불능|기상 판정/);

 u.status={id:9,until:10};
 c.b.actions.set(0,{kind:'hit',state:'hurt',duration:1,left:1});
 frames.length=0;c.drawArena(0);
 assert.equal(frames[0],player.sample(id,'hurt',0));
 c.b.actions.set(0,{kind:'hit',state:'guard2',duration:1,left:1});
 frames.length=0;c.drawArena(0);
 assert.equal(frames[0],player.sample(id,'guard2',0));
 c.b.actions.clear();
 frames.length=0;c.drawArena(.1);
 assert.equal(frames[0],player.sample(id,'sleep',0));
 c.b.motion.set(0,{dx:10,dy:0});
 for(const [age,x] of [[0,u.x-10],[.03,u.x-7],[.07,u.x-3],[.1,u.x]]){
  c.b.motionAge=age;drawXs.length=0;c.drawArena(0);
  assert.ok(Math.abs(drawXs[0]-x)<1e-8);
 }

});

test('공격 대상 바라보기는 정지·일시정지에서도 유지되고 다음 이동 때만 방향을 바꾼다',()=>{
 const c=vm.createContext({window:{}});for(const f of ['web/assets/animations.js','web/animation.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
 const p=c.window.createAnimationPlayer(c.window.DIGIMON_ANIMATIONS),actor={},id=Object.keys(c.window.DIGIMON_ANIMATIONS.sprites)[0];
 p.movement(actor,id,-1,0,.1);assert.equal(p.face(actor,id,100),true);
 assert.equal(p.movement(actor,id,0,0,.1).flip,true);assert.equal(p.movement(actor,id,-1,0,0).flip,true);
 assert.equal(p.movement(actor,id,-1,0,.1).flip,false);assert.equal(p.face(actor,id,-100),false);
});

test('아구몬은 원본 준비15프레임이 지난 순간 입을 벌린12번 셀로 전환하고 빔 동안 유지한다',()=>{
 const id='m201_agumon',wait=player.windup(id,'attack1');assert.equal(wait,15/60);
 assert.equal(player.sample(id,'attack1',wait-.001),11);assert.equal(player.sample(id,'attack1',wait),12);assert.equal(player.sample(id,'attack1',4),12);
});
test('전체 종의 스킬 준비 시간은 종별 원본 첫 프레임 시간이며 복합 공격 순서를 보존한다',()=>{
 for(const [id,bank] of Object.entries(data.sprites)){
  if(id.endsWith('_digitama'))continue;
  for(const [n,state] of [[7,'attack1'],[8,'attack2'],[9,'attack3'],[10,'attack4']]){
   const seq=data.banks[bank][n],wait=player.windup(id,state);assert.equal(wait,seq.frames.length>1?seq.frames[0][1]/60:0);
   if(seq.frames.length>1)assert.equal(player.sample(id,state,wait+1e-6),seq.frames[1][0]);
  }
 }
 const id='m205_gaomon',q=data.banks[data.sprites[id]][9];assert.ok(q.frames.length>2);
 let t=0;for(const [cell,ticks] of q.frames){assert.equal(player.sample(id,'attack3',t+1e-6),cell);t+=ticks/60;}
});

test('복합 빔은 발사 프레임을 연장하고 기술이 끝나기 전 복귀 자세로 넘어가지 않는다',()=>{
 const id=Object.keys(data.sprites).find(x=>x.includes('victorygreymon')),q=data.banks[data.sprites[id]][9];assert.equal(q.frames.length,3);
 const activeEnd=(q.frames[0][1]+q.frames[1][1])/60,holdUntil=activeEnd+.5;
 assert.equal(player.sampleCast(id,'attack3',holdUntil-.001,holdUntil),q.frames[1][0]);
 assert.equal(player.sampleCast(id,'attack3',holdUntil+.001,holdUntil),q.frames[2][0]);
 assert.equal(player.castDuration(id,'attack3',holdUntil),player.duration(id,'attack3')+.5);
});


test('공격 결과는 명중 때 한 번 기록하고 상태 피해로 인한 쓰러짐도 빠뜨리지 않는다',()=>{
 const source=fs.readFileSync('web/game.js','utf8');
 const logs=[],routineFlags=[],sounds=[];
 const c=vm.createContext({ChampSound:{play:name=>sounds.push(name)},battleLog:(text,routine=false)=>{logs.push(text);routineFlags.push(routine);},drawArena(){},finishBattle(){}});
 vm.runInContext(`
  const units=[
   {id:0,name:'공격자',speciesId:'a',x:0,y:0},
   {id:1,name:'대상',speciesId:'b',x:10,y:0},
   {id:2,name:'동료',speciesId:'c',x:15,y:0},
  ];
  const delayed={type:'hit',from:0,to:1,damage:12,special:true,skill:{name:'필살기 A',tpCost:4}};
  const C={getSpecies:id=>({id}),stepBattle:()=>[
   {type:'hit',from:0,to:2,damage:3},
   {type:'hit',from:2,to:0,damage:0},
   {type:'hit',from:0,to:2,damage:6,critical:true},
   delayed,{type:'status',id:1,status:'수면'},{type:'ko',id:1},
   {type:'statusDamage',id:2,status:'독',damage:2},{type:'ko',id:2},
  ]};
  const SPRITE_BY_NAME={},animations={duration:()=>1},battleBackdrop={spriteScale:()=>1},spriteOf=()=>({});
  const effects={busy:false,add(e){if(e===delayed){this.busy=true;return {lead:1};}},tick(){},drain(){if(!this.busy)return [];this.busy=false;return [delayed];}};
  const battle={acc:0,state:{units,over:false},motion:new Map(),actions:new Map(),flashes:[],effects};
  globalThis.current=battle;
 `+source.slice(source.indexOf('  function battleTick('),source.indexOf('  function battleLog(')),c);
 c.battleTick(.1);
 assert.deepEqual(logs,[
  '공격자 · 일반 공격 → 동료 (3)',
  '동료 · 일반 공격 → 공격자 (막음 · 피해 0)',
  '공격자 · 일반 공격 → 동료 (크리티컬 · 6)',
  '동료: 독 피해 2','동료 쓰러짐!',
 ]);
 assert.equal(c.current.flashes.some(f=>f.text==='수면'),false);
 assert.deepEqual(sounds,['hit','guard','critical','cast']);
 c.battleTick(.02);
 assert.deepEqual(logs.slice(5),['공격자 · 필살기 A → 대상 (12 · TP 4)','대상: 수면 상태','대상 쓰러짐!']);
 assert.equal(c.current.flashes.find(f=>f.text==='수면').until,c.current.visualTime+900);
 c.battleTick(.02);
 assert.equal(logs.length,8);
 assert.deepEqual(sounds,['hit','guard','critical','cast','hit']);
 assert.deepEqual(routineFlags,[true,true,false,true,false,false,false,false]);
});
