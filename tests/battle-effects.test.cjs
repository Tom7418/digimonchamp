const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('web/battle-effects.js','utf8'),c);return c.window.createBattleEffects();}
test('동시 적중·회복·KO는 독립 유지되고 정지/만료를 따른다',()=>{
 const fx=setup(),units=[{id:0,x:10,y:20},{id:1,x:90,y:60}];
 fx.add({type:'hit',from:0,to:1,special:true},units);fx.add({type:'heal',from:0,to:0},units);fx.add({type:'ko',id:1},units);
 assert.equal(fx.count,3);fx.tick(0);assert.equal(fx.count,3);
 fx.tick(0.5);assert.equal(fx.count,1);fx.tick(0.4);assert.equal(fx.count,0);
});
test('효과는 이벤트 시점 좌표를 보존하며 잘못된 대상은 무시한다',()=>{
 const fx=setup(),u=[{id:0,x:10,y:20},{id:1,x:90,y:60}],lines=[];
 fx.add({type:'hit',from:0,to:1},u);u[1].x=200;fx.add({type:'hit',from:0,to:99},u);
 const noop=()=>{};const ctx=new Proxy({moveTo:(x,y)=>lines.push([x,y]),lineTo:(x,y)=>lines.push([x,y])},{get:(o,k)=>o[k]||noop});
 fx.draw(ctx);assert.deepEqual(lines.slice(0,2),[[10,10],[90,50]]);assert.equal(fx.count,1);
});
