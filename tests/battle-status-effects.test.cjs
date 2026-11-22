const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=256;}});for(const f of ['web/assets/battle/status-effects.js','web/battle-status-effects.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);const draws=[],ctx={save(){},restore(){},drawImage:(...args)=>draws.push(args)};return {c,fx:c.window.createBattleStatusEffects(),ctx,draws};}
const bounds={cx:50,top:30,bottom:70,width:32,height:40};
test('7종 상태 효과가 원본 셀·반복·프레임 유지 시간으로 재생된다',()=>{
 const {c,fx}=setup(),states=c.window.BATTLE_STATUS_ART.states;assert.deepEqual(Object.keys(states).map(Number),[1,5,7,8,9,10,13]);
 for(const [id,s] of Object.entries(states)){assert.equal(fx.sample(id,0),s.frames[0][0]);const first=s.frames[0][1]/60;assert.equal(fx.sample(id,first+1e-6),s.frames[1][0]);const total=s.frames.reduce((n,f)=>n+f[1],0)/60;assert.equal(fx.sample(id,total+1e-6),s.frames[0][0]);}
});
test('수면·치료·만료·KO·재적용은 별도 엔진 상태 변경 없이 반영된다',()=>{
 const {fx,ctx}=setup(),u={id:0,alive:true,status:{id:9,until:10}},before=JSON.stringify(u);assert.equal(fx.draw(ctx,u,0,bounds).cell,22);fx.tick(.18);assert.equal(fx.draw(ctx,u,.18,bounds).cell,23);assert.equal(JSON.stringify(u),before);
 u.status={id:9,until:20};assert.equal(fx.draw(ctx,u,.2,bounds).cell,22);u.status=null;assert.equal(fx.draw(ctx,u,.2,bounds),null);u.status={id:8,until:10};u.alive=false;assert.equal(fx.draw(ctx,u,.2,bounds),null);u.alive=true;assert.equal(fx.draw(ctx,u,10,bounds),null);
});
test('상태 변경은 즉시 새 그림으로 시작하고 미확인 상태에 임의 도형을 그리지 않는다',()=>{
 const {fx,ctx,draws}=setup(),u={id:1,alive:true,status:{id:7,until:10}};assert.equal(fx.draw(ctx,u,0,bounds).cell,64);fx.tick(.3);u.status={id:1,until:10};assert.equal(fx.draw(ctx,u,.3,bounds).cell,76);
 const n=draws.length;for(const id of [2,4,6,11,12,14]){u.status.id=id;assert.equal(fx.draw(ctx,u,.3,bounds),null);}assert.equal(draws.length,n);
});
test('머리 효과는 실제 도트 머리 위, 얼음은 발끝에 맞추며 개체 크기에 따라 조절한다',()=>{
 const {fx,ctx}=setup(),u={id:0,alive:true,status:{id:9,until:10}};const head=fx.draw(ctx,u,0,bounds);assert.ok(head.y<bounds.top);u.status.id=8;const body=fx.draw(ctx,u,0,bounds);assert.equal(body.y,bounds.bottom);
 const large=fx.draw(ctx,u,0,{...bounds,width:80,height:100});assert.ok(large.scale>body.scale);assert.equal(large.y,bounds.bottom);
});
test('개체별 상태 시계는 독립적이며 dt0/초기화는 동작을 진행시키지 않는다',()=>{
 const {fx,ctx}=setup(),a={id:0,alive:true,status:{id:9,until:10}},b={id:1,alive:true,status:{id:9,until:10}};fx.draw(ctx,a,0,bounds);fx.tick(.18);assert.equal(fx.draw(ctx,a,0,bounds).cell,23);assert.equal(fx.draw(ctx,b,0,bounds).cell,22);fx.tick(0);assert.equal(fx.draw(ctx,a,0,bounds).cell,23);fx.clear();assert.equal(fx.draw(ctx,a,0,bounds).cell,22);
});
test('필살기 전환 중 정지하고 유지 구간에만 기존 배틀 연출 시계를 따라간다',()=>{
 const src=fs.readFileSync('web/game.js','utf8'),part=src.slice(src.indexOf('  function battleTick('),src.indexOf('  function battleLog('));let tick=0;
 const c=vm.createContext({drawArena(){},battle:{state:{},actions:new Map(),effects:{tick(){}},statusEffects:{tick:dt=>tick+=dt},presentation:{busy:true,snapshot:()=>({age:0,transition:.2,hold:1}),tick(){}}}});vm.runInContext(part,c);c.battleTick(.1);assert.equal(tick,0);
 c.battle.presentation.snapshot=()=>({age:.2,transition:.2,hold:1});c.battleTick(.1);assert.ok(Math.abs(tick-.1)<1e-9);
});
