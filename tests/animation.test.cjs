const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ctx=vm.createContext({window:{}});
for(const file of ['assets/sprites.js','assets/animations.js','animation.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',file),'utf8'),ctx);
const data=ctx.window.DIGIMON_ANIMATIONS;
const player=ctx.window.createAnimationPlayer(data);
test('217종의 모든 연결 프레임은 실제 스프라이트 범위 안이고 유지 시간이 양수다',()=>{
  assert.equal(Object.keys(data.sprites).length,217);
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
 assert.equal(data.training.cm07,29);assert.equal(data.training.cm05,8);assert.equal(data.training.cm04,33);
});

test('216종의 필수 동작은 모두 존재하고 디지에그는 별도 구조를 유지한다',()=>{
 const required=['idle','walk','eat','hurt','hurtAlt','ko','boundIdle','boundRun'];
 for(const sp of ctx.window.SPRITES){
  const bank=data.banks[data.sprites[sp.id]];
  if(sp.id==='e000_digitama'){assert.equal(bank.length,2);continue;}
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

test('제공된 GIF 역할은40개 슬롯을 유지하고 모르는27/36/39는 단정하지 않는다',()=>{
 for(const [name,n] of Object.entries({run:3,surprised:4,attack1:7,attack2:8,attack3:9,attack4:10,sleep:13,sleep2:15,boundEat:24,happy:28,angry:29,cheering:30,guard:31,train:32,shout:33,guard2:34,jumpHit:38}))assert.equal(data.states[name],n);
 for(const n of [27,36,39])assert.equal(data.states['seq_'+n],n);
 assert.notDeepEqual(data.banks[data.sprites.m201_agumon][data.states.ko].frames,data.banks[data.sprites.m201_agumon][data.states.sleep2].frames);
});

test('실제 적중 이벤트는 공격과 피격을 분리하며 결과 화면에서도 재생을 마친다',()=>{
 const source=fs.readFileSync('web/game.js','utf8');
 const a=source.indexOf('  function battleTick(dt)'),b=source.indexOf('  function battleLog(',a);
 for(const special of [false,true]){
  const sandbox=vm.createContext({window:{},performance:{now:()=>0},drawArena(){},finishBattle(){},battleLog(){}});
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
