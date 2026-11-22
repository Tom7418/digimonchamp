const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){let clock=0;const c=vm.createContext({window:{},performance:{now:()=>clock},Image:function(){this.complete=true;this.naturalWidth=58;}});vm.runInContext(fs.readFileSync('web/hp-bars.js','utf8'),c);return {c,bars:c.window.createHpBars(),time:t=>clock=t};}
test('처음은 실제 HP로 표시하고 피해·회복은 350ms 동안 단조롭게 따라간다',()=>{
 const {bars,time}=setup();assert.equal(bars.sample('a',100,100),100);assert.equal(bars.sample('a',40,100),100);assert.equal(bars.busy(),true);
 let last=100;for(const t of [50,100,175,250,350]){time(t);const value=bars.sample('a',40,100);assert.ok(value<=last&&value>=40);last=value;}assert.equal(last,40);assert.equal(bars.busy(),false);
 assert.equal(bars.sample('a',80,100),40);time(525);assert.ok(bars.sample('a',80,100)>40);time(700);assert.equal(bars.sample('a',80,100),80);
});
test('연속 피해는 현재 보이는 HP에서 이어가고 최대HP 변경은 즉시 새 비율로 맞춘다',()=>{
 const {bars,time}=setup();bars.sample(1,100,100);bars.sample(1,50,100);time(100);const shown=bars.sample(1,50,100);assert.equal(bars.sample(1,10,100),shown);time(450);assert.equal(bars.sample(1,10,100),10);assert.equal(bars.sample(1,180,200),180);
 assert.equal(bars.sample('egg',20,0),0);assert.equal(bars.sample('bad',NaN,100),0);assert.equal(bars.sample('high',120,100),100);
});
test('최대HP가 백만이어도 고정 폭의 원본 그림 두 번만 그리고 HP를 변경하지 않는다',()=>{
 const {bars}=setup(),draws=[],ctx={save(){},restore(){},drawImage(...args){draws.push(args);}},pet={hp:500000,maxHp:1000000};
 bars.draw(ctx,pet,pet.hp,pet.maxHp,10,20,58,8);assert.equal(draws.length,2);assert.equal(draws[1][3],25);assert.equal(draws[1][7],25);assert.equal(pet.hp,500000);assert.equal(pet.maxHp,1000000);
});
test('새 사냥 개체/새 게임으로 남은 표시 상태를 정리하며 사용하지 않는 개체는 보간을 막지 않는다',()=>{
 const {bars}=setup();bars.sample('old',100,100);bars.sample('old',0,100);assert.equal(bars.busy(),true);bars.begin();bars.sample('new',50,100);bars.end();assert.equal(bars.busy(),false);bars.sample('new',0,100);bars.clear();assert.equal(bars.busy(),false);assert.equal(bars.sample('new',100,100),100);
});
test('정보창 HP는 실제 수치와 표시 비율을 분리하고 같은 DOM 채움을 갱신한다',()=>{
 const {c}=setup(),html=c.window.hpBarHtml(40,100,75),fill={style:{}},attrs={},node={querySelector:()=>fill,setAttribute:(k,v)=>attrs[k]=v};assert.match(html,/aria-valuenow="40"/);assert.match(html,/scaleX\(0.75\)/);
 c.window.updateHpBar(node,30,100,50);assert.equal(attrs['aria-valuenow'],30);assert.equal(fill.style.transform,'scaleX(0.5)');assert.doesNotMatch(c.window.hpBarHtml(0,0),/NaN|Infinity/);
});
test('배틀 결과는 마지막 명중 후 HP바가 줄어드는 동안 기다리고 엔진을 다시 진행하지 않는다',()=>{
 let busy=true,finished=0,steps=0;const c=vm.createContext({performance:{now:()=>0},drawArena(){},finishBattle:()=>finished++,C:{stepBattle:()=>{steps++;return [];}},battle:{state:{over:true,units:[]},health:{busy:()=>busy},effects:{tick(){}},actions:new Map(),motion:new Map(),acc:0,done:false}});
 const s=fs.readFileSync('web/game.js','utf8');vm.runInContext(s.slice(s.indexOf('  function battleTick('),s.indexOf('  function battleLog(')),c);c.battleTick(.05);assert.equal(finished,0);busy=false;c.battleTick(.05);assert.equal(finished,1);assert.equal(steps,0);
});
test('필살기 명중 대기 중에는 원본 HP바도 아직 줄어들지 않는다',()=>{
 const {c,bars,time}=setup();for(const f of ['web/assets/battle/effects.js','web/battle-effects.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);const fx=c.window.createBattleEffects();
 const units=[{id:0,x:0,y:0,hp:100},{id:1,x:40,y:0,hp:60}],before=new Map([[1,{...units[1],hp:100}]]);bars.sample(1,100,100);
 fx.add({type:'hit',from:0,to:1,special:true},units,before,1,.25);fx.tick(.1);time(100);assert.equal(bars.sample(1,fx.visualUnit(units[1]).hp,100),100);assert.equal(bars.busy(),false);
 fx.tick(.151);time(251);assert.equal(bars.sample(1,fx.visualUnit(units[1]).hp,100),100);assert.equal(bars.busy(),true);time(601);assert.equal(bars.sample(1,fx.visualUnit(units[1]).hp,100),60);
});
