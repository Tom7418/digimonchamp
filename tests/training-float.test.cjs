const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('훈련 변화량은 마리별로 독립 저장하며 엔진의 증감 문자열을 보존한다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  function logEvent(e)'),b=source.indexOf("    if (e.type === 'poop')",a);
 const ctx=vm.createContext({C:{getSpecies(){}},trainingFloats:new Map(),log(){}});
 vm.runInContext(source.slice(a,b)+'}',ctx);
 ctx.logEvent({type:'trained',uid:1,name:'a',changes:'HP +2, TP -1'});
 ctx.logEvent({type:'trained',uid:2,name:'b',changes:'공격 +1'});
 assert.equal(ctx.trainingFloats.size,2);
 assert.deepEqual(Array.from(ctx.trainingFloats.get(1).lines),['HP +2','TP -1']);
 assert.equal(ctx.trainingFloats.get(2).elapsed,0);
});

test('두 종의 실제 훈련 결과를 머리 위 표시까지 전달하며 상한 차이를 보존한다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  function logEvent(e)'),b=source.indexOf("    if (e.type === 'poop')",a);
 const ctx=vm.createContext({window:{},trainingFloats:new Map(),log(){}});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 vm.runInContext('const C=ChampCore;'+source.slice(a,b)+'}',ctx);
 vm.runInContext(`
   for(const [i,name] of ['아구몬','피요몬'].entries()){
     const d=C.newDigimon(i+1,name);d.stats.atk=52;d.stats.def=40;
     d.cage='체육관';d.trainMinutes=14;d.hunger=100;
     const s={...C.freshSave(0),digimon:[d]};
     const r=C.tickFarm(s,()=>0.5);
     r.events.filter(e=>e.type==='trained').forEach(logEvent);
     globalThis['result'+i]=r.save.digimon[0];
   }
 `,ctx);
 assert.equal(ctx.result0.stats.atk,53);assert.equal(ctx.result1.stats.atk,52);
 assert.equal(ctx.trainingFloats.get(1).lines[0],'공격 +1');
 assert.equal(ctx.trainingFloats.get(2).lines[0],'공격 +0 (상한)');
 assert.equal(ctx.trainingFloats.get(1).lines[1],`방어 ${ctx.result0.stats.def-40}`);
});

test('실제 화면 틱은10초에10게임분을 진행하고 정지 중에는 진행하지 않는다',()=>{
 const source=fs.readFileSync('web/game.js','utf8');
 const a=source.indexOf('  function frame(now)'),b=source.indexOf("  document.addEventListener('visibilitychange'",a);
 const ctx=vm.createContext({window:{},document:{hidden:false},titleOpen:false,selectedItem:null,
   lastTime:1,battle:null,paused:false,board:{editing:false},mailOpen:false,dayEnding:false,hunt:null,
   clock:0,speed:1,drawTitleArt(){},farmInputBlocked(){return false},syncTeam(){},logEvent(){},
   spoilFoods(){},checkSchedule(){},render(){},persist(){},drawFarm(){},drawPortrait(){},requestAnimationFrame(){}});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 vm.runInContext('const C=ChampCore;globalThis.save={...C.freshSave(0),clock:510};const MINUTES_PER_SECOND=C.MINUTES_PER_SECOND;'+source.slice(a,b),ctx);
 for(let i=1;i<=540;i++)ctx.frame(1+i*1000/60);
 assert.equal(ctx.save.clock,510); // 9초까지08:30 유지
 for(let i=541;i<=600;i++)ctx.frame(1+i*1000/60);
 assert.equal(ctx.save.clock,520); // 시작08:00→08:10
 ctx.paused=true;for(let i=601;i<=1200;i++)ctx.frame(1+i*1000/60);
 assert.equal(ctx.save.clock,520);
 ctx.paused=false;
 for(let i=1;i<=100;i++)ctx.frame(20001+i*100); // 10fps여도 실제10초는 게임10분
 assert.equal(ctx.save.clock,530);
 ctx.save.clock=23*60+50;ctx.clock=0;
 ctx.checkSchedule=()=>{if(ctx.ChampCore.isNight(ctx.save))ctx.dayEnding=true;};
 for(let i=1;i<=600;i++)ctx.frame(30001+i*1000/60);
 assert.equal(ctx.save.clock,1439);assert.equal(ctx.dayEnding,true);assert.equal(ctx.clock,0);
});
