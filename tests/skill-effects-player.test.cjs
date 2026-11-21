const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=2048;}});for(const p of ['assets/battle/skill-effects.js','skill-effects-player.js'])vm.runInContext(fs.readFileSync('web/'+p,'utf8'),c);return {data:c.window.BATTLE_SKILL_EFFECTS,fx:c.window.createBattleSkillEffects()};}
const units=()=>[{id:0,x:40,y:90,hp:100,alive:true},{id:1,x:180,y:100,hp:0,alive:false}];
const event=record=>({type:'hit',special:true,from:0,to:1,skill:{record},damage:100});
test('361개 기술의 참조는 실제 원본 NANR/셀과 무손실 아틀라스 안에 있다',()=>{
 const {data}=setup();assert.equal(Object.keys(data.records).length,361);assert.equal(Object.values(data.records).filter(x=>x.kind==='projectile').length,122);
 for(const d of Object.values(data.records))for(const key of ['muzzle','flight','finish','impact'])if(d[key]){
  const [bank,seq]=d[key],b=data.banks[bank],s=b.sequences[seq];assert.ok(s.frames.length);
  for(const [ci,t] of s.frames){const c=b.cells[ci];assert.ok(t>0&&c.x+c.w<=2048&&c.y+c.h<=318);}
 }
});
test('아구몬·토이아구몬은 전용 불꽃을 사용하고 비행/명중 시퀀스를 구별한다',()=>{
 const {data}=setup(),a=data.records[60],toy=data.records[99];assert.equal(data.banks[a.flight[0]].name,'e003_fireball00');assert.equal(data.banks[toy.flight[0]].name,'e003_toyfire00');
 assert.deepEqual(Array.from(a.muzzle),[7,0]);assert.deepEqual(Array.from(a.flight),[7,1]);assert.deepEqual(Array.from(a.finish),[7,2]);assert.equal(a.speed,2.5);
});
test('투사체 도착까지 HP/쓰러짐을 숨기고 도착 이벤트는 한 번만 발생한다',()=>{
 const {fx}=setup(),u=units(),before=new Map([[1,{...u[1],hp:100,alive:true}]]),e=event(60),snapshot=JSON.stringify(u),t=fx.add(e,u,before);
 assert.ok(t.lead>0);assert.equal(fx.busy,true);assert.equal(fx.visualUnit(u[1]).hp,100);fx.tick(0);assert.equal(fx.drain().length,0);
 fx.tick(t.lead-.001);assert.equal(fx.visualUnit(u[1]).alive,true);fx.tick(.002);assert.equal(fx.busy,false);assert.equal(fx.visualUnit(u[1]).hp,0);assert.equal(fx.drain()[0],e);assert.equal(fx.drain().length,0);assert.equal(JSON.stringify(u),snapshot);
 fx.tick(t.hold+1);assert.equal(fx.count,0);
});
test('오른쪽에서 왼쪽으로 발사해도 대상에 도착하며 일시정지 중 프레임은 유지한다',()=>{
 const {fx}=setup(),u=units();u[0].x=220;u[1].x=40;const t=fx.add(event(60),u),calls=[];
 const ctx={save(){},restore(){},translate(...a){calls.push(['p',...a]);},scale(...a){calls.push(['s',...a]);},drawImage(...a){calls.push(['d',...a.slice(1)]);}};
 fx.draw(ctx);const first=JSON.stringify(calls);calls.length=0;fx.tick(0);fx.draw(ctx);assert.equal(JSON.stringify(calls),first);assert.ok(calls.some(x=>x[0]==='s'&&x[1]<0));fx.tick(t.lead);assert.equal(fx.drain().length,1);
});
test('해석되지 않은 기술을 투사체로 꾸미지 않고 기본 공격은 기존 경로에 맡긴다',()=>{
 const {fx}=setup();assert.equal(fx.add({type:'hit',special:false},units()),null);assert.equal(fx.add(event(99999),units()),null);
});
