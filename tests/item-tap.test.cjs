const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
// 실제 화면 입력·먹이 이동 코드와 배포 엔진을 연결한다.
function setup() {
  const target = () => ({ handlers: {}, addEventListener(t,f) { (this.handlers[t]??=[]).push(f); }, fire(t,e={}) { for(const f of this.handlers[t]??[]) f(e); } });
  const tray=target(), window=target(), document=Object.assign(target(),{hidden:false});
  const canvas=Object.assign(target(),{setPointerCapture(){},getBoundingClientRect:()=>({left:0,right:960,top:0,bottom:560,width:960,height:560})});
  const modal={open:false},board={editing:false,cam:{x:0,y:0},roam:{x0:60,x1:1900,y0:120,y1:1150},toWorld(e){return {x:e.clientX+this.cam.x,y:e.clientY+this.cam.y};}},mail={};
  const ctx=vm.createContext({window,document,canvas,board,titleOpen:false,battle:null,hunt:null,mailOpen:false,dayEnding:false,
    $:id=>({'#tray':tray,'#modal':modal,'#mail':mail})[id],renderTray(){},persist(){},nextMail(){},toast(){},render(){},log(){},syncTeam(){},nameOf:()=> '깜몬',performance:{now:()=>0},effect:null});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../web/core.js'),'utf8'),ctx);
  for (const file of ['assets/sprites.js', 'assets/animations.js', 'animation.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../web',file),'utf8'),ctx);
  vm.runInContext('const animations=window.createAnimationPlayer(window.DIGIMON_ANIMATIONS); const SPRITE_BY_NAME=Object.fromEntries(window.SPRITES.map(s=>[s.name,s.id]));',ctx);
  vm.runInContext(`globalThis.C=ChampCore; globalThis.save=C.freshSave(0); save.meat=2; save.digimon=[C.newDigimon(1,'깜몬')];save.digimon[0].hunger=0;
    globalThis.view={foods:[],poops:[],team:[{uid:1,x:200,y:300,cageId:'cage',cage:'field'}],selected:0};
    let selectedItem=null; const ITEMS=[{kind:'meat',count:()=>C.availableFood(save,view.foods,'meat')},{kind:'pill',count:()=>C.availableFood(save,view.foods,'pill')}];
    function petAt(){return {p:view.team[0],d:save.digimon[0]};} function apply(r){if(r.ok)save=r.save;return r.ok;}`,ctx);
  const source=fs.readFileSync(path.join(__dirname,'../web/game.js'),'utf8');
  const a=source.indexOf('  function dropItem('),b=source.indexOf('  // 머리 위 상태',a);
  assert.ok(a>0&&b>a);
  vm.runInContext(source.slice(a,b)+'\ninitFarmInput();globalThis.api={seekFood};',ctx);
  const event=(patch={})=>({pointerId:1,button:0,isPrimary:true,clientX:200,clientY:300,preventDefault(){},stopImmediatePropagation(){this.stopped=true;},...patch});
  const choose=kind=>tray.fire('click',{target:{closest:()=>({dataset:{item:kind}})}});
  const tap=()=>{canvas.fire('pointerdown',event());const up=event();canvas.fire('pointerup',up);return up;};
  return {ctx,canvas,window,document,board,event,choose,tap,...ctx.api};
}
test('디지몬 위 터치도 직접 급여하지 않고 바닥에 놓으며 재고 이상 배치하지 않는다',()=>{
  const s=setup();s.choose('meat');assert.equal(s.tap().stopped,true);
  assert.equal(s.ctx.save.digimon[0].hunger,0);assert.equal(s.ctx.view.foods.length,1);assert.equal(s.ctx.save.meat,2);
  s.tap();s.tap();assert.equal(s.ctx.view.foods.length,2);
});
test('케이지에서 걸어와 한 입씩 먹고 배가 차면 남은 고기를 보존한다',()=>{
  const s=setup();s.choose('meat');s.tap();const p=s.ctx.view.team[0],d=s.ctx.save.digimon[0];p.x=100;
  s.seekFood(p,d,1);assert.equal(p.cageId,null);assert.ok(p.x>100);
  p.x=200;p.y=300;s.seekFood(p,d,0);
  assert.equal(s.ctx.view.foods.length,1);assert.equal(s.ctx.save.meat,2);
  s.seekFood(p,d,0); // 일시정지에서는 씹기 시간도 흐르지 않는다.
  assert.equal(s.ctx.save.meat,2);
  s.seekFood(p,d,10);
  assert.equal(s.ctx.view.foods[0].remaining,95);assert.equal(s.ctx.save.meat,2);assert.equal(s.ctx.save.digimon[0].hunger,10);
  for(let i=0;i<9;i++) s.seekFood(p,s.ctx.save.digimon[0],10);
  assert.equal(s.ctx.save.digimon[0].hunger,100);assert.equal(s.ctx.view.foods[0].remaining,50);
  assert.equal(s.seekFood(p,s.ctx.save.digimon[0],1),false);
});
test('먹는 중 다른 디지몬의 중복 소비와 케이지 이동 후 뒤늦은 소비를 막는다',()=>{
  const s=setup();s.choose('meat');s.tap();const p=s.ctx.view.team[0],d=s.ctx.save.digimon[0];p.cageId=null;
  s.seekFood(p,d,0);
  const other={...d,uid:2};assert.equal(s.seekFood({...p,uid:2},other,0),false);
  p.cageId='new-cage';s.seekFood(p,d,10);
  assert.equal(s.ctx.save.meat,2);assert.equal(s.ctx.view.foods.length,1);
});
test('약(주사기)은 디지몬 터치로 병을 고치고 먹이를 만들지 않는다',()=>{
  const s=setup();vm.runInContext('Math.random=()=>0',s.ctx);s.ctx.save.digimon[0].sick=true;s.choose('shot');s.tap();
  assert.equal(s.ctx.save.digimon[0].sick,false);assert.equal(s.ctx.save.medicine,1);assert.equal(s.ctx.view.foods.length,0);
});
test('알약(프로틴)은 고기처럼 바닥에 놓이고 배가 불러도 먹는다',()=>{
  const s=setup();s.ctx.save.digimon[0].hunger=100;s.choose('pill');s.tap();
  assert.equal(s.ctx.view.foods.length,1);assert.equal(s.ctx.view.foods[0].kind,'pill');assert.equal(s.ctx.save.pills,2);
  const p=s.ctx.view.team[0];p.x=200;p.y=300;
  s.seekFood(p,s.ctx.save.digimon[0],0);
  for(let i=0;i<4;i++) s.seekFood(p,s.ctx.save.digimon[0],10);
  assert.equal(s.ctx.view.foods.length,0);assert.equal(s.ctx.save.pills,1);assert.equal(s.ctx.save.digimon[0].protein,1);
});
test('카메라 이동 후에는 화면 좌표가 아닌 월드 좌표에 고기를 놓는다',()=>{
  const s=setup();s.board.cam={x:1000,y:500};s.choose('meat');s.tap();
  assert.equal(s.ctx.view.foods[0].x,1200);assert.equal(s.ctx.view.foods[0].y,800);
});
test('타이틀 화면에서는 아이템을 사용하지 않는다',()=>{
  const s=setup();s.ctx.titleOpen=true;s.choose('meat');s.tap();assert.equal(s.ctx.view.foods.length,0);
});
for(const cancel of ['pointercancel','Escape','blur','hidden','outside']) test(cancel+' 취소는 소비와 케이지 클릭을 막는다',()=>{
  const s=setup();s.choose('meat');s.canvas.fire('pointerdown',s.event());
  if(cancel==='pointercancel')s.canvas.fire(cancel,s.event());
  if(cancel==='Escape')s.window.fire('keydown',s.event({key:'Escape'}));
  if(cancel==='blur')s.window.fire('blur');
  if(cancel==='hidden'){s.document.hidden=true;s.document.fire('visibilitychange');}
  const up=s.event(cancel==='outside'?{clientX:-10}:{});s.canvas.fire('pointerup',up);
  assert.equal(up.stopped,true);assert.equal(s.ctx.view.foods.length,0);assert.equal(s.ctx.save.meat,2);
});
test('다른 손가락·중복 이벤트·편집 모드에서는 추가 배치하지 않는다',()=>{
  const s=setup();s.choose('meat');s.canvas.fire('pointerdown',s.event());s.canvas.fire('pointerup',s.event({pointerId:2}));
  assert.equal(s.ctx.view.foods.length,0);s.canvas.fire('pointerup',s.event());s.canvas.fire('pointerup',s.event());
  assert.equal(s.ctx.view.foods.length,1);s.board.editing=true;s.tap();assert.equal(s.ctx.view.foods.length,1);
});
