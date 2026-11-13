const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('실제 이어하기는 배치·먹이·훈련을 보존하고 능력치 이전을 한 번만 알린다',()=>{
  const source=fs.readFileSync('web/game.js','utf8');
  const a=source.indexOf('  function load()'),b=source.indexOf('  function persist()',a);
  const ctx=vm.createContext({window:{},save:null,view:null,Date:{now:()=>1000},
    KEY:'champion-web-v2',freshView:()=>({logs:[]}),stamp:()=>'',logEvent(){},
    localStorage:{getItem(){return ctx.stored;}}});
  vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
  vm.runInContext(`const C=ChampCore,MINUTES_PER_SECOND=C.MINUTES_PER_SECOND;
    const old=C.freshSave(1000);const d=C.newDigimon(1,'아구몬',()=>0.5);
    delete d.statVersion;d.stats={hp:25,tp:25,atk:25,def:25,int:25,spd:25};
    d.trainMinutes=9;old.digimon=[d];
    globalThis.stored=JSON.stringify({save:old,view:{logs:[],foods:[{kind:'meat',x:100,y:200}],layout:[{id:'start'}],farmWorld:2}});
  `+source.slice(a,b),ctx);
  ctx.load();
  assert.equal(ctx.save.digimon[0].statVersion,1);
  assert.equal(ctx.save.digimon[0].legacyStats.hp,25);
  assert.equal(ctx.save.digimon[0].stats.hp,640);
  assert.equal(ctx.save.digimon[0].trainMinutes,9);
  assert.equal(ctx.view.foods[0].x,100);assert.equal(ctx.view.layout[0].id,'start');
  assert.equal(ctx.view.logs.length,1);
  ctx.stored=JSON.stringify({save:ctx.save,view:ctx.view});
  const once=JSON.stringify(ctx.save);ctx.load();
  assert.equal(JSON.stringify(ctx.save),once);assert.equal(ctx.view.logs.length,1);
});
