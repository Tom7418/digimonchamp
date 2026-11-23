const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('실제 배틀 종료는 세 번째 배틀 결과를 진화 큐/저장에 한 번만 전달한다',()=>{
 const events=[],noop=()=>{},nodes={};let persisted=0;
 const ctx=vm.createContext({window:{},esc:String,$:key=>nodes[key]??={insertAdjacentHTML:(_position,html)=>nodes.result=html},battleLog:noop,log:noop,toast:noop,render:noop,persist:()=>persisted++,logEvent:e=>events.push(e)});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 if(ctx.window)vm.runInContext(fs.readFileSync('web/day-result-view.js','utf8'),ctx);
 vm.runInContext(`globalThis.C=ChampCore;globalThis.save=C.freshSave(0);save.digimon=[{...C.newDigimon(1,'코로몬'),battles:2,stageAge:0}];
 globalThis.battle={done:false,state:{winner:1,reason:'hp',units:[{uid:1,team:0,alive:true}]},setup:{match:null,prize:0,title:'프리 배틀'}};`,ctx);
 const src=fs.readFileSync('web/game.js','utf8'),a=src.indexOf('  function finishBattle()'),b=src.indexOf('  function drawArena(',a);
 vm.runInContext(src.slice(a,b),ctx);const time=ctx.save.clock;ctx.finishBattle();ctx.finishBattle();
 assert.equal(ctx.save.digimon[0].battles,3);assert.equal(ctx.save.digimon[0].speciesId,'아구몬');assert.equal(ctx.save.clock,time);
 assert.equal(events.length,1);assert.equal(events[0].from,'코로몬');assert.equal(events[0].to,'아구몬');assert.equal(persisted,1);
});
test('옛 배틀3회 저장도 시작 시 평가해 진화시키고 다시 열면 중복 진화하지 않는다',()=>{
 const events=[],ctx=vm.createContext({logEvent:e=>events.push(e)});vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 if(ctx.window)vm.runInContext(fs.readFileSync('web/day-result-view.js','utf8'),ctx);
 vm.runInContext(`const C=ChampCore;globalThis.save=C.freshSave(0);save.digimon=[{...C.newDigimon(1,'코로몬'),battles:3,stageAge:5}];`,ctx);
 const src=fs.readFileSync('web/game.js','utf8'),a=src.indexOf('  const restoredEvolution ='),b=src.indexOf('  const board =',a),part=src.slice(a,b);
 vm.runInContext('{'+part+'}',ctx);assert.equal(ctx.save.digimon[0].speciesId,'아구몬');assert.equal(events.length,1);
 vm.runInContext('save=JSON.parse(JSON.stringify(save));{'+part+'}',ctx);assert.equal(events.length,1);
});

test('타이틀로 랭크가 풀리면 출전하지 않은 대기 개체도 결과 반영 직후 진화한다',()=>{
 const events=[],noop=()=>{},nodes={},ctx=vm.createContext({window:{},esc:String,$:key=>nodes[key]??={insertAdjacentHTML:(_position,html)=>nodes.result=html},battleLog:noop,log:noop,toast:noop,render:noop,persist:noop,logEvent:e=>events.push(e)});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 if(ctx.window)vm.runInContext(fs.readFileSync('web/day-result-view.js','utf8'),ctx);
 vm.runInContext(`globalThis.C=ChampCore;globalThis.save=C.freshSave(0);const g0=C.TITLES.filter(t=>t.grade===0);save.titles=g0.slice(0,3).map(t=>t.id);
 save.digimon=[C.newDigimon(1,'코로몬'),{...C.newDigimon(2,'아구몬'),battles:6}];
 globalThis.battle={done:false,state:{winner:0,reason:'hp',units:[{uid:1,team:0,alive:true}]},setup:{match:g0[3],prize:0,title:'타이틀'}};`,ctx);
 assert.equal(ctx.C.tamerRank(ctx.save),2);const time=ctx.save.clock;
 const src=fs.readFileSync('web/game.js','utf8'),a=src.indexOf('  function finishBattle()'),b=src.indexOf('  function drawArena(',a);
 vm.runInContext(src.slice(a,b),ctx);ctx.finishBattle();
 assert.equal(ctx.C.tamerRank(ctx.save),3);assert.equal(ctx.save.digimon[1].speciesId,'그레이몬');assert.equal(ctx.save.clock,time);
 assert.equal(events.length,1);assert.equal(events[0].uid,2);assert.match(nodes['#modal-body'].innerHTML,/타이틀 메달을 획득/);
});


test('최초 타이틀 승리만 메달을 안내하고 재우승은 상금과 세로 결과만 표시한다',()=>{
 const src=fs.readFileSync('web/game.js','utf8'),start=src.indexOf('  function finishBattle()'),end=src.indexOf('  function drawArena(',start);
 for(const repeat of [false,true]){
  const nodes={},messages=[],classes=new Set(['battle-modal']);
  const recordPanel={},resultDetails=[];
  nodes['#modal-body']={
   querySelector:selector=>selector==='.battle-log-panel'?recordPanel:null,
   append:detail=>resultDetails.push(detail),
  };
  const document={createElement:tag=>({tag,append(...children){this.children=children;}})};
  const c=vm.createContext({window:{},document,esc:String,$:key=>nodes[key]??={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)}},battleLog:()=>{},log:s=>messages.push(s),toast:()=>{},render:()=>{},persist:()=>{},logEvent:()=>{}});
  for(const file of ['web/core.js','web/day-result-view.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
  vm.runInContext(`globalThis.C=ChampCore;globalThis.save=C.freshSave(0);globalThis.m=C.TITLES[0];save.titles=${repeat?'[m.id]':'[]'};globalThis.oldBits=save.bits;
   globalThis.battle={done:false,state:{winner:0,reason:'hp',units:[]},setup:{match:m,prize:0,title:m.name}};`+src.slice(start,end),c);
  c.finishBattle();c.finishBattle();
  const html=nodes['#modal-body'].innerHTML;
  assert.equal(c.save.titles.filter(x=>x===c.m.id).length,1);assert.equal(c.save.bits,c.oldBits+c.m.prize);
  assert.equal(/class="title-medal"/.test(html),!repeat);assert.equal(messages.some(x=>x.startsWith('타이틀 메달 획득:')), !repeat);
  assert.equal(resultDetails.length,1);assert.equal(resultDetails[0].tag,'details');
  assert.equal(resultDetails[0].children[1],recordPanel);
  assert.equal(classes.has('title-result-modal'),true);assert.equal(classes.has('battle-modal'),false);assert.doesNotMatch(html,/<canvas|battle-layout/);
 }
});


test('전투 기록은 위를 읽는 동안 이동하지 않고 최신 위치에서만 따라간다',()=>{
 const rows=[];
 const record={
  clientHeight:40,scrollTop:0,
  get scrollHeight(){return rows.length*20;},
  insertAdjacentHTML(_position,html){rows.push(html);},
 };
 const ctx=vm.createContext({$:()=>record,esc:String});
 const src=fs.readFileSync('web/game.js','utf8');
 vm.runInContext(src.slice(src.indexOf('  function battleLog('),src.indexOf('  function finishBattle(')),ctx);
 for(let i=0;i<40;i++)ctx.battleLog('기록 '+i);
 assert.equal(record.scrollTop,record.scrollHeight);
 record.scrollTop=120;
 ctx.battleLog('기상');
 assert.equal(record.scrollTop,120);
 assert.equal(rows.length,41);
 assert.equal(rows[0],'<p>기록 0</p>');
 record.scrollTop=record.scrollHeight-record.clientHeight;
 ctx.battleLog('경기 종료');
 assert.equal(record.scrollTop,record.scrollHeight);
});
