const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const src=fs.readFileSync('web/game.js','utf8'),events=[],nodes={},noop=()=>{};let persisted=0;
 const ctx=vm.createContext({$:key=>nodes[key]??={},syncTeam:noop,logEvent:e=>events.push(e),showModal:noop,log:noop,toast:noop,closeModal:noop,
  persist:()=>persisted++,esc:String,feeding:new Map(),view:{selected:0,foods:[]}});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 vm.runInContext(`const C=ChampCore;globalThis.save=C.freshSave(0);globalThis.current=()=>save.digimon[0];globalThis.nameOf=d=>d.speciesId;`,ctx);
 // 실제 화면 갱신의 진화 검사까지 실행한다. 그 뒤의 DOM 표 그리기만 생략한다.
 const a=src.indexOf('  function checkReadyEvolutions()'),b=src.indexOf('    syncPoops();',a);
 vm.runInContext(src.slice(a,b)+'}',ctx);
 return {src,ctx,nodes,events,get persisted(){return persisted;}};
}
test('놓아주기로 용량을 비우면 먹이 참조 오류 없이 전체 진화를 즉시 재평가한다',()=>{
 const s=setup(),c=s.ctx;
 vm.runInContext(`save.digimon=[1,2,3,4].map(uid=>C.newDigimon(uid,'코로몬'));save.digimon[1].ap.물=20;feeding.set(1,{});feeding.set(3,{});`,c);
 c.render();assert.equal(s.events.length,0);const time=c.save.clock,food={kind:'meat',x:200,y:300};c.view.foods=[food];
 const a=s.src.indexOf('  function releaseMenu()'),b=s.src.indexOf('  // ---------- 배틀',a);vm.runInContext(s.src.slice(a,b),c);
 c.releaseMenu();s.nodes['#confirm-release'].onclick();
 assert.equal(c.save.digimon.length,3);assert.equal(c.save.digimon[0].uid,2);assert.equal(c.save.digimon[0].speciesId,'스노우아구몬');
 assert.equal(c.save.clock,time);assert.equal(s.events.length,1);assert.equal(s.persisted,1);assert.equal(c.feeding.has(1),false);assert.equal(c.feeding.has(3),true);assert.equal(c.view.foods[0],food);
});
test('새 속성 조건과 옛 배틀0회 저장도 화면/시작 시점에 시간 진행 없이 진화한다',()=>{
 const s=setup(),c=s.ctx;vm.runInContext(`save.digimon=[C.newDigimon(1,'코로몬')];save.digimon[0].ap.물=20;`,c);
 const time=c.save.clock;c.render();assert.equal(c.save.digimon[0].speciesId,'스노우아구몬');assert.equal(c.save.clock,time);
 vm.runInContext(`save.digimon=[C.newDigimon(2,'코로몬')];save.digimon[0].ap.물=20;`,c);
 const a=s.src.indexOf('  const restoredEvolution ='),b=s.src.indexOf('  const board =',a);vm.runInContext('{'+s.src.slice(a,b)+'}',c);
 assert.equal(c.save.digimon[0].speciesId,'스노우아구몬');assert.equal(c.save.clock,time);assert.equal(s.events.length,2);
});
