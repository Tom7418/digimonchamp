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
 const c=vm.createContext({battle:{presentation:{busy:true,snapshot:()=>({age:0,transition:1,hold:1}),tick(){ticks++;}},state:{}},drawArena:dt=>{assert.equal(dt,0);draws++;}});
 vm.runInContext(src.slice(src.indexOf('  function battleTick('),src.indexOf('  function battleLog(')),c);c.battleTick(.1);assert.equal(ticks,1);assert.equal(draws,1);
});

test('원본 속도선은 강조 중에만24개를 그리고 일시정지에서는 좌표를 유지한다',()=>{
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=288;}});
 for(const f of ['assets/battle/presentation.js','assets/battle/speedlines.js','battle-presentation.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 const p=c.window.createBattlePresentation(),draws=[],moves=[];
 const ctx={save(){},restore(){},beginPath(){},rect(){},clip(){},scale(){},translate:(...v)=>moves.push(v),drawImage:(...v)=>draws.push(v)};
 p.draw(ctx,416,272);assert.equal(draws.length,0);
 const record=+Object.keys(c.window.BATTLE_PRESENTATION_DATA.records)[0];p.add({type:'hit',from:0,special:true,skill:{record,name:'기술'}},[{id:0,x:0,y:0}],.2);p.tick(.05);
 p.draw(ctx,416,272);assert.equal(draws.length,24);assert.ok(draws.every(d=>d[1]===224&&d[2]===4&&d[3]===64&&d[4]===8));
 assert.ok(moves.every(([x,y])=>y<=48||y>=128));assert.ok(moves.some(([x,y])=>y===0));assert.ok(moves.some(([x,y])=>y===176));
 const positions=JSON.stringify(moves);moves.length=0;p.tick(0);p.draw(ctx,416,272);assert.equal(JSON.stringify(moves),positions);
 p.tick(10);draws.length=0;p.draw(ctx,416,272);assert.equal(draws.length,0);
});
