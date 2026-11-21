const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=100;}});for(const f of ['web/assets/battle/effects.js','web/battle-effects.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);return c.window.createBattleEffects();}
test('원본 타격광 유지 시간에 따라 동시 효과가 종료된다',()=>{const fx=setup(),u=[{id:0,x:10,y:20},{id:1,x:90,y:60}];fx.add({type:'hit',from:0,to:1},u);fx.add({type:'heal',to:0},u);fx.tick(0);assert.equal(fx.count,2);fx.tick(0.5);assert.equal(fx.count,1);fx.tick(0.6);assert.equal(fx.count,0);});
test('타격광은 생성 시점 대상 좌표에 원본 이미지 셀을 그린다',()=>{const fx=setup(),u=[{id:0,x:10,y:20},{id:1,x:90,y:60}],draws=[];fx.add({type:'hit',from:0,to:1},u);u[1].x=200;fx.add({type:'hit',to:99},u);fx.draw({drawImage:(...a)=>draws.push(a)});assert.equal(draws.length,1);assert.equal(draws[0][5]+draws[0][7]/2,90);assert.equal(draws[0][6]+draws[0][8]/2,50);});
test('배틀 원본 도트 배율을 바꿔도 타격광의 적중 중심은 그대로다',()=>{const fx=setup(),draws=[];fx.add({type:'hit',to:1},[{id:1,x:90,y:60}]);fx.draw({drawImage:(...a)=>draws.push(a)},4/3);const d=draws[0];assert.equal(d[5]+d[7]/2,90);assert.equal(d[6]+d[8]/2,50);});

test('아직 공통 타격광을 쓰는 기술도 준비 중에는 피해·그림을 표시하지 않는다',()=>{
 const fx=setup(),u=[{id:0,x:10,y:20},{id:1,x:90,y:60,hp:0}],before=new Map([[1,{...u[1],hp:100}]]),draws=[];
 const e={type:'hit',special:true,from:0,to:1};fx.add(e,u,before,1,.25);fx.draw({drawImage:(...a)=>draws.push(a)});assert.equal(draws.length,0);assert.equal(fx.visualUnit(u[1]).hp,100);assert.equal(fx.busy,true);
 fx.tick(.251);assert.equal(fx.drain()[0],e);assert.equal(fx.visualUnit(u[1]).hp,0);fx.draw({drawImage:(...a)=>draws.push(a)});assert.equal(draws.length,1);assert.equal(fx.drain().length,0);
});
