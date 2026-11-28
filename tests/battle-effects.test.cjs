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

test('방어 성공은 타격광을 생략하되 기술 준비 시간과 명중 통지는 보존한다',()=>{
 const fx=setup(),u=[{id:1,x:90,y:60,hp:100}],draws=[];
 const ctx={drawImage:(...a)=>draws.push(a)};
 fx.add({type:'hit',to:1,damage:0},u);
 fx.draw(ctx);assert.equal(draws.length,0);
 const blocked={type:'hit',special:true,to:1,damage:0};
 assert.equal(fx.add(blocked,u,undefined,1,.2).lead,.2);
 fx.tick(.19);assert.equal(fx.drain().length,0);
 fx.tick(.02);assert.equal(fx.drain()[0],blocked);
 fx.draw(ctx);assert.equal(draws.length,0);assert.equal(fx.busy,false);
});

test('컷인 동안 비행 중인 다른 공격의 명중을 보류하고 복귀 후 현재 위치에서 반영한다',()=>{
 const fx=setup(),target={id:1,x:90,y:60,hp:25,maxHp:100,alive:true},units=[target],draws=[];
 const live={type:'hit',from:0,to:1,damage:45},focus={type:'hit',from:2,to:1,damage:30};
 fx.add(live,units,undefined,1,.3,45);
 fx.add(focus,units,undefined,1,.2,30);
 target.x=120;
 fx.tick(.25,units,event=>event===focus);
 assert.deepEqual([...fx.drain()],[focus]);
 assert.equal(fx.visualUnit(target).hp,70);
 assert.equal(fx.visualUnit(target).x,120);
 target.x=150;
 fx.tick(.15,units);
 assert.equal(fx.drain().length,0);
 assert.equal(fx.visualUnit(target).hp,70);
 fx.tick(.151,units);
 assert.deepEqual([...fx.drain()],[live]);
 assert.equal(fx.visualUnit(target).hp,25);
 fx.draw({drawImage:(...args)=>draws.push(args)});
 assert.deepEqual(draws.map(d=>d[5]+d[7]/2),[150,120]);
});
