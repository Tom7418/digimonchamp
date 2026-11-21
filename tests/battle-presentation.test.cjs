const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{}});for(const f of ['assets/battle/presentation.js','battle-presentation.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);return {c,p:c.window.createBattlePresentation()};}
test('原本325개 기술만 확대하고 일반공격·SP는 확대하지 않는다',()=>{
 const {c,p}=setup(),records=c.window.BATTLE_PRESENTATION_DATA.records;assert.equal(Object.keys(records).length,325);
 const units=[{id:0,x:10,y:30}];
 for(const e of [{type:'hit',from:0,special:false},{type:'support',from:0,skill:{id:1}},{type:'hit',from:0,special:true,skill:{record:31}}])p.add(e,units,.5);
 assert.equal(p.busy,false);
 p.add({type:'hit',from:0,special:true,skill:{record:+Object.keys(records)[0],name:'검증'}},units,.5);assert.equal(p.busy,true);
 assert.equal(p.snapshot().zoom,1);p.tick(p.snapshot().transition);assert.equal(p.snapshot().zoom,2);assert.ok(Math.abs(p.snapshot().dim-2/3)<1e-9);
 const held=p.snapshot();p.tick(0);assert.deepEqual(p.snapshot(),held);
 p.tick(.5);p.tick(held.transition/4);assert.ok(Math.abs(p.snapshot().zoom-1.5)<1e-8);
 p.tick(10);assert.equal(p.busy,false);assert.equal(p.snapshot(),null);
});
test('광역 중복 강조를 막고 서로 다른 시전자는 차례대로 처리한다',()=>{
 const {c,p}=setup(),record=+Object.keys(c.window.BATTLE_PRESENTATION_DATA.records)[0],units=[{id:0,x:0,y:0},{id:1,x:100,y:100}];
 const event={type:'hit',special:true,from:0,skill:{record,name:'기술'}};p.add(event,units,.1);p.add(event,units,.1);p.add({...event,from:1},units,.1);
 p.tick(10);assert.equal(p.snapshot().from,1);p.tick(10);assert.equal(p.busy,false);
});
test('실제 배틀 틱은 강조 중 엔진·효과·시간을 진행하지 않고 정지 프레임을 그린다',()=>{
 const src=fs.readFileSync('web/game.js','utf8');let ticks=0,draws=0;
 const c=vm.createContext({battle:{presentation:{busy:true,tick(){ticks++;}},state:{}},drawArena:dt=>{assert.equal(dt,0);draws++;}});
 vm.runInContext(src.slice(src.indexOf('  function battleTick('),src.indexOf('  function battleLog(')),c);c.battleTick(.1);assert.equal(ticks,1);assert.equal(draws,1);
});
