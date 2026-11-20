const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const noop=()=>{},texts=[],poses=[],nodes={},toolbar={classList:{toggle:noop},querySelector:k=>nodes[k]??={},querySelectorAll:()=>[]};
 const window={DIGIMON_ANIMATIONS:{training:{cm16:32}}},math=Object.create(Math);math.random=()=>.25;
 const ctx=vm.createContext({window,Math:math,document:{createElement:()=>toolbar},Image:function(){},performance:{now:()=>0},eggName:()=>'디지에그',
  ctx:new Proxy({fillText(text){texts.push(text);}}, {get:(t,k)=>k in t?t[k]:noop}),
  titleOpen:false,battle:null,hunt:null,paused:false,mailOpen:false,dayEnding:false,feeding:new Map(),hatching:new Map(),trainingFloats:new Map(),spriteFrames:new WeakMap(),effect:null,
  drawFood:noop,drawPoop:noop,updateSweeps:noop,drawSweeps:noop,drawCareFx:noop,bubbleOf:()=>null,footprint:()=>20,body:noop,asset:()=>null,
  animations:{pose(p,id,state){poses.push(state);return 0;}},animationId:()=> 'agumon',SPRITE_BY_NAME:{},petVisualBounds:p=>({top:p.y-40}),
 });
 for(const file of ['core.js','cage-layout.js','cage-editor.js'])vm.runInContext(fs.readFileSync('web/'+file,'utf8'),ctx);
 vm.runInContext(`globalThis.C=ChampCore;globalThis.L=window.CageLayout;globalThis.save=C.freshSave(0);save.digimon=[C.newDigimon(1,'아구몬',()=>.5)];
 globalThis.view={layoutVersion:6,layout:[{id:'c',kind:'clinic',q:1,r:1,rotation:0}],team:[],foods:[],poops:[]};globalThis.digi=()=>save.digimon[0];
 globalThis.seekFood=()=>!!globalThis.foodBusy||C.isSleeping(digi());`,ctx);
 const canvas={style:{},closest:()=>({after:noop}),addEventListener:noop};
 ctx.board=window.createCageEditor(canvas,()=>ctx.view,noop,noop,()=>false);
 const center=ctx.board.center(1,1);ctx.view.team=[{uid:1,...center,cageId:'c',cage:'clinic',direction:1}];
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  function drawFarm('),b=source.indexOf('  // 오른쪽 아래 작은 지도:',a);
 vm.runInContext(source.slice(a,b),ctx);return {ctx,texts,poses,p:ctx.view.team[0]};
}
test('실제 육성 화면은 소속 케이지 안에서 걸으며 걷기 대신 훈련 동작을 덮어씌우지 않는다',()=>{
 const s=setup(),y=s.p.y;for(let i=0;i<20;i++)s.ctx.drawFarm(0,.1);
 assert.ok(Math.abs(s.p.y-y)>20);assert.ok(s.poses.includes('walk'));assert.equal(s.p.cageId,'c');
 assert.equal(s.texts.some(text=>String(text).includes('아구몬')),false);
});
test('실제 육성 화면은 수면·식사·정지 화면·알 상태에서는 자율 이동하지 않는다',()=>{
 for(const mode of ['paused','mailOpen','dayEnding','titleOpen','food','sleep','egg']){
  const s=setup(),old={x:s.p.x,y:s.p.y};
  if(mode==='food')s.ctx.foodBusy=true;
  else if(mode==='sleep')s.ctx.save.digimon[0].restCycle={species:'아구몬',sleepLeft:10};
  else if(mode==='egg')s.ctx.save.digimon[0].isEgg=true;
  else s.ctx[mode]=true;
  for(let i=0;i<10;i++)s.ctx.drawFarm(0,.1);
  assert.equal(s.p.x,old.x,mode);assert.equal(s.p.y,old.y,mode);
 }
});


test('빈사는 정지할 때KO, 굶주린 식사 접근 중 걷기, 도착하면 먹기이며 초상화도 같다',()=>{
 for(const mode of ['rest','walk','eat']){
  const s=setup(),d=s.ctx.save.digimon[0];d.dying={};d.hunger=mode==='rest'?50:0;
  s.ctx.seekFood=()=>{if(mode==='walk')s.p.x+=1;if(mode!=='rest')s.ctx.feeding.set(d.uid,{});return true;};
  s.ctx.drawFarm(0,.1);const expected={rest:'ko',walk:'walk',eat:'eat'}[mode];assert.equal(s.poses.at(-1),expected);
  const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  const portraitActor ='),b=source.indexOf('  // ---------- 사냥',a);
  s.ctx.current=()=>d;s.ctx.portrait=s.ctx.ctx;s.ctx.spriteOf=()=>({baseline:40,body:24});
  vm.runInContext(source.slice(a,b),s.ctx);s.ctx.drawPortrait(.1);assert.equal(s.poses.at(-1),expected);
 }
});
