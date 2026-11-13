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
