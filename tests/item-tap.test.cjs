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
  vm.runInContext(`globalThis.C=ChampCore; globalThis.save=C.freshSave(0); save.meat=2; save.digimon=[C.newDigimon(1,'깜몬')];save.digimon[0].hunger=0;
    globalThis.view={foods:[],poops:[],team:[{uid:1,x:200,y:300,cageId:'cage',cage:'field'}],selected:0};
    let selectedItem=null; const ITEMS=[{kind:'meat',count:()=>C.availableFood(save,view.foods,'meat')}];
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
test('케이지에서 먹이로 걸어와 먹을 때만 재고를 한 번 소비한다',()=>{
  const s=setup();s.choose('meat');s.tap();const p=s.ctx.view.team[0],d=s.ctx.save.digimon[0];p.x=100;
  s.seekFood(p,d,1);assert.equal(p.cageId,null);assert.ok(p.x>100);
  p.x=200;p.y=300;s.seekFood(p,d,0);
  assert.equal(s.ctx.view.foods.length,0);assert.equal(s.ctx.save.meat,1);assert.equal(s.ctx.save.digimon[0].hunger,35);
  assert.equal(s.seekFood(p,s.ctx.save.digimon[0],1),false);
});
test('알약은 디지몬 터치로 치료하고 먹이를 만들지 않는다',()=>{
  const s=setup();s.ctx.save.digimon[0].sick=true;s.choose('pill');s.tap();
  assert.equal(s.ctx.save.digimon[0].sick,false);assert.equal(s.ctx.save.pills,1);assert.equal(s.ctx.view.foods.length,0);
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
