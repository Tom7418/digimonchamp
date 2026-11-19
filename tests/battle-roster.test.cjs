const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const noop=()=>{},messages=[],ctx=vm.createContext({window:{createBattleEffects:()=>({})},battle:null,battleBackdrop:{preload:noop},spriteOf:()=>null,
  log:noop,render:noop,persist:noop,showModal:noop,toast:text=>messages.push(text),nameOf:d=>d.speciesId,$:()=>({classList:{add:noop}})});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 vm.runInContext(`const C=ChampCore;globalThis.save=C.freshSave(0);save.digimon=[1,2,3,4].map(uid=>C.newDigimon(uid,'코로몬'));globalThis.current=()=>save.digimon[0];`,ctx);
 const src=fs.readFileSync('web/game.js','utf8'),a=src.indexOf('  const canFight ='),b=src.indexOf('  function battleTick(',a);
 vm.runInContext(src.slice(a,b),ctx);
 const start=(format,selection,match)=>ctx.startBattle({title:'프리 배틀',format,stage:2,scale:1,prize:0,match},selection);
 return {ctx,messages,start};
}
test('직접 선택한 세 개체만 선택 순서대로 출전하고1:1은 첫 개체를 사용한다',()=>{
 const s=setup();s.start(3,[3,1,4]);
 assert.deepEqual(Array.from(s.ctx.battle.state.units.filter(u=>u.team===0),u=>u.uid),[3,1,4]);
 s.ctx.battle=null;s.start(1,[4,2]);assert.deepEqual(Array.from(s.ctx.battle.state.units.filter(u=>u.team===0),u=>u.uid),[4]);
});
test('인원 부족·중복·질병·부상·알은 자동 충원하지 않고 출전을 거부한다',()=>{
 for(const selection of [[],[1,2],[1,1,2],[1,2,999]]){const s=setup();s.start(3,selection);assert.equal(s.ctx.battle,null);assert.ok(s.messages.length);}
 for(const flag of ['sick','injured','isEgg']){const s=setup();s.ctx.save.digimon[1][flag]=true;s.start(3,[1,2,3]);assert.equal(s.ctx.battle,null);assert.ok(s.messages.length);}
});
test('타이틀 조건은 현재 선택한 팀 전체로 출전 직전에 다시 검증한다',()=>{
 const s=setup(),match={id:'test',format:1,limitStage:3};s.start(1,[2],match);assert.equal(s.ctx.battle,null);assert.ok(s.messages.some(x=>x.includes('성장기')));
 s.ctx.save.digimon[1]={...s.ctx.ChampCore.newDigimon(2,'아구몬')};s.start(1,[2],match);assert.ok(s.ctx.battle);assert.equal(s.ctx.battle.state.units.find(u=>u.team===0).uid,2);
});
