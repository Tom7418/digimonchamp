const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=256;}});for(const f of ['web/assets/battle/status-effects.js','web/battle-status-effects.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);const draws=[],ctx={save(){},restore(){},drawImage:(...args)=>draws.push(args)};return {c,fx:c.window.createBattleStatusEffects(),ctx,draws};}
const bounds={cx:50,top:30,bottom:70,width:32,height:40};
test('11종 상태 효과가 원본 셀·반복·프레임 유지 시간으로 재생된다',()=>{
 const {c,fx}=setup(),states=c.window.BATTLE_STATUS_ART.states;assert.deepEqual(Object.keys(states).map(Number),[1,2,4,5,6,7,8,9,10,11,14]);
 for(const [id,s] of Object.entries(states)){assert.equal(fx.sample(id,0),s.frames[0][0]);const first=s.frames[0][1]/60;assert.equal(fx.sample(id,first+1e-6),s.frames[1][0]);const total=s.frames.reduce((n,f)=>n+f[1],0)/60;assert.equal(fx.sample(id,total+1e-6),s.frames[0][0]);}
});
test('수면·치료·만료·KO·재적용은 별도 엔진 상태 변경 없이 반영된다',()=>{
 const {fx,ctx}=setup(),u={id:0,alive:true,status:{id:9,until:10}},before=JSON.stringify(u);assert.equal(fx.draw(ctx,u,0,bounds).cell,25);fx.tick(.18);assert.equal(fx.draw(ctx,u,.18,bounds).cell,26);assert.equal(JSON.stringify(u),before);
 u.status={id:9,until:20};assert.equal(fx.draw(ctx,u,.2,bounds).cell,25);u.status=null;assert.equal(fx.draw(ctx,u,.2,bounds),null);u.status={id:8,until:10};u.alive=false;assert.equal(fx.draw(ctx,u,.2,bounds),null);u.alive=true;assert.equal(fx.draw(ctx,u,10,bounds),null);
});
test('상태 변경은 즉시 새 그림으로 시작하고 미확인 상태에 임의 도형을 그리지 않는다',()=>{
 const {fx,ctx,draws}=setup(),u={id:1,alive:true,status:{id:7,until:10}};assert.equal(fx.draw(ctx,u,0,bounds).cell,64);fx.tick(.3);u.status={id:1,until:10};assert.equal(fx.draw(ctx,u,.3,bounds).cell,76);
 const n=draws.length;for(const id of [3]){u.status.id=id;assert.equal(fx.draw(ctx,u,.3,bounds),null);}assert.equal(draws.length,n);
});
test('머리 효과는 원본 높이 비율, 얼음·마비는 발끝에 맞추며 개체 크기에 따라 조절한다',()=>{
 const {fx,ctx}=setup(),u={id:0,alive:true,status:{id:9,until:10}};const head=fx.draw(ctx,u,0,bounds);assert.equal(head.y,bounds.bottom-bounds.height*.8);u.status.id=8;const body=fx.draw(ctx,u,0,bounds);assert.equal(body.y,bounds.bottom);
 const large=fx.draw(ctx,u,0,{...bounds,width:80,height:100});assert.ok(large.scale>body.scale);assert.equal(large.y,bounds.bottom);
});
test('개체별 상태 시계는 독립적이며 dt0/초기화는 동작을 진행시키지 않는다',()=>{
 const {fx,ctx}=setup(),a={id:0,alive:true,status:{id:9,until:10}},b={id:1,alive:true,status:{id:9,until:10}};fx.draw(ctx,a,0,bounds);fx.tick(.18);assert.equal(fx.draw(ctx,a,0,bounds).cell,26);assert.equal(fx.draw(ctx,b,0,bounds).cell,25);fx.tick(0);assert.equal(fx.draw(ctx,a,0,bounds).cell,26);fx.clear();assert.equal(fx.draw(ctx,a,0,bounds).cell,25);
});
test('필살기 컷인 중에는 기존 상태 효과도 정지하고 복귀 후 재생된다',()=>{
 const src=fs.readFileSync('web/game.js','utf8'),part=src.slice(src.indexOf('  function battleTick('),src.indexOf('  function battleLog('));let tick=0;
 const c=vm.createContext({C:{},drawArena(){},battle:{state:{},actions:new Map(),effects:{tick(){}},statusEffects:{tick:dt=>tick+=dt},presentation:{busy:true,snapshot:()=>({age:0,transition:.2,hold:1}),tick(){}}}});vm.runInContext(part,c);c.battleTick(.1);assert.equal(tick,0);
 c.battle.presentation.snapshot=()=>({age:.2,transition:.2,hold:1});c.battleTick(.1);assert.equal(tick,0);
 c.battle.presentation.busy=false;c.battleTick(.05);assert.equal(tick,.05);
});

// 모양으로 추정했던 연결이 원본 분기와 다시 달라지지 않도록 확인한다.
test('혼란·수면·다운과 추가 상태는 원본 선택 시퀀스를 사용한다',()=>{
 const {c}=setup(),states=c.window.BATTLE_STATUS_ART.states;
 for(const [id,seq] of [[1,27],[2,0],[4,4],[5,24],[6,1],[7,23],[8,22],[9,5],[10,2],[11,25],[14,26]])assert.equal(states[id].sequence,seq);
 assert.equal(states[7].anchor,'head');assert.equal(states[10].anchor,'body');
 const audit=JSON.parse(fs.readFileSync('docs/status-effects-audit.json','utf8'));
 for(const [id,s] of Object.entries(states)){assert.equal(audit.nativeDispatch[id].sequence,s.sequence);assert.equal(audit.nativeDispatch[id].anchor,s.anchor);}
 for(const id of [12,13])assert.equal(audit.nativeDispatch[id].mode,0);
});


test('석화·저주·기상 대기 웹판 효과는 현재 상태에 반응하고 기존 그림을 참조하지 않는다',()=>{
 const {c,fx,draws}=setup(),paths=[];
 const ctx={
  save(){},restore(){},beginPath(){},closePath(){},
  moveTo(...xy){paths.push(xy);},lineTo(){},stroke(){},fill(){},
  fillRect(...xy){paths.push([...xy,this.fillStyle]);},
 };
 const u={id:1,alive:true,status:{id:12,until:9}};
 assert.equal(fx.draw(ctx,u,0,bounds).kind,'petrified');
 const stoneStart=paths.splice(0);
 fx.tick(.3);fx.draw(ctx,u,.3,bounds);
 assert.notDeepEqual(paths.splice(0),stoneStart);
 u.status.id=13;assert.equal(fx.draw(ctx,u,.3,bounds).kind,'cursed');
 const curseStart=paths.splice(0);
 fx.tick(0);fx.draw(ctx,u,.3,bounds);
 assert.deepEqual(paths.splice(0),curseStart);
 fx.tick(.25);fx.draw(ctx,u,.55,bounds);
 assert.notDeepEqual(paths.splice(0),curseStart);
 u.alive=false;u.riseAt=6;
 assert.equal(fx.draw(ctx,u,.55,bounds).kind,'revival');
 assert.equal(fx.draw(ctx,u,.55,bounds,true),null);
 assert.equal(fx.draw(ctx,u,6,bounds),null);
 u.alive=true;assert.equal(fx.draw(ctx,u,9,bounds),null);
 assert.equal(draws.length,0);

 c.window.matchMedia=()=>({matches:true});
 const calm=c.window.createBattleStatusEffects();
 paths.length=0;calm.draw(ctx,u,0,bounds);
 const initial=paths.splice(0);calm.tick(1);calm.draw(ctx,u,1,bounds);
 assert.deepEqual(paths,initial);
});
