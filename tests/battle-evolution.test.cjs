const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('실제 배틀 종료는 세 번째 배틀 결과를 진화 큐/저장에 한 번만 전달한다',()=>{
 const events=[],noop=()=>{},nodes={};let persisted=0;
 const ctx=vm.createContext({window:{},$:key=>nodes[key]??={},battleLog:noop,log:noop,toast:noop,render:noop,persist:()=>persisted++,logEvent:e=>events.push(e)});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 vm.runInContext(`globalThis.C=ChampCore;globalThis.save=C.freshSave(0);save.digimon=[{...C.newDigimon(1,'코로몬'),battles:2,stageAge:0}];
 globalThis.battle={done:false,state:{winner:1,reason:'hp',units:[{uid:1,team:0,alive:true}]},setup:{match:null,prize:0,title:'프리 배틀'}};`,ctx);
 const src=fs.readFileSync('web/game.js','utf8'),a=src.indexOf('  function finishBattle()'),b=src.indexOf('  function drawArena(',a);
 vm.runInContext(src.slice(a,b),ctx);const time=ctx.save.clock;ctx.finishBattle();ctx.finishBattle();
 assert.equal(ctx.save.digimon[0].battles,3);assert.equal(ctx.save.digimon[0].speciesId,'아구몬');assert.equal(ctx.save.clock,time);
 assert.equal(events.length,1);assert.equal(events[0].from,'코로몬');assert.equal(events[0].to,'아구몬');assert.equal(persisted,1);
});
test('옛 배틀3회 저장도 시작 시 평가해 진화시키고 다시 열면 중복 진화하지 않는다',()=>{
 const events=[],ctx=vm.createContext({logEvent:e=>events.push(e)});vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 vm.runInContext(`const C=ChampCore;globalThis.save=C.freshSave(0);save.digimon=[{...C.newDigimon(1,'코로몬'),battles:3,stageAge:5}];`,ctx);
 const src=fs.readFileSync('web/game.js','utf8'),a=src.indexOf('  const restoredEvolution ='),b=src.indexOf('  const board =',a),part=src.slice(a,b);
 vm.runInContext('{'+part+'}',ctx);assert.equal(ctx.save.digimon[0].speciesId,'아구몬');assert.equal(events.length,1);
 vm.runInContext('save=JSON.parse(JSON.stringify(save));{'+part+'}',ctx);assert.equal(events.length,1);
});
