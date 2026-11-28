const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const noop=()=>{},texts=[],poses=[],orbits=[],nodes={},toolbar={classList:{toggle:noop},querySelector:k=>nodes[k]??={},querySelectorAll:()=>[]};
 const window={},math=Object.create(Math);math.random=()=>.25;
 const ctx=vm.createContext({farmHealth:undefined,window,Math:math,document:{createElement:()=>toolbar},Image:function(){},performance:{now:()=>0},eggName:()=>'디지에그',
  ctx:new Proxy({fillText(text){texts.push(text);},arc(x,y,r){if(r===2)orbits.push([x,y]);}}, {get:(t,k)=>k in t?t[k]:noop}),
  titleOpen:false,battle:null,hunt:null,paused:false,mailOpen:false,dayEnding:false,feeding:new Map(),hatching:new Map(),trainingFloats:new Map(),cageReactions:new WeakMap(),spriteFrames:new WeakMap(),effect:null,log:noop,
  drawFood:noop,drawPoop:noop,updateSweeps:noop,drawSweeps:noop,drawCareFx:noop,bubbleOf:()=>null,footprint:()=>20,body:noop,asset:()=>null,
  $:()=>({open:false}),render:noop,persist:noop,animationId:()=> 'm201_agumon',SPRITE_BY_NAME:{},petVisualBounds:p=>({cx:p.x,top:p.y-40,width:36}),
 });
 for(const file of ['core.js','cage-layout.js','cage-editor.js','assets/animations.js','animation.js'])vm.runInContext(fs.readFileSync('web/'+file,'utf8'),ctx);
 const player=window.createAnimationPlayer(window.DIGIMON_ANIMATIONS);
 ctx.animations={...player,pose(p,id,state,dt){poses.push(state);return player.pose(p,id,state,dt);}};
 vm.runInContext(`globalThis.C=ChampCore;globalThis.L=window.CageLayout;globalThis.save=C.freshSave(0);save.digimon=[C.newDigimon(1,'아구몬',()=>.5)];
 globalThis.view={layoutVersion:6,layout:[{id:'c',kind:'clinic',q:1,r:1,rotation:0}],team:[],foods:[],poops:[]};globalThis.digi=()=>save.digimon[0];
 globalThis.seekFood=()=>!!globalThis.foodBusy||C.isSleeping(digi());`,ctx);
 const canvas={style:{},closest:()=>({after:noop}),addEventListener:noop};
 ctx.board=window.createCageEditor(canvas,()=>ctx.view,noop,noop,()=>false);
 const center=ctx.board.center(1,1);ctx.view.team=[{uid:1,...center,cageId:'c',cage:'clinic',direction:1}];
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  function drawFarm('),b=source.indexOf('  // 오른쪽 아래 작은 지도:',a);
 const before=source.indexOf('  function showCageReaction('),after=source.indexOf('  // 화면용 목록(view.team)',before);
 vm.runInContext(source.slice(before,after),ctx);
 vm.runInContext(source.slice(a,b),ctx);return {ctx,texts,poses,orbits,p:ctx.view.team[0]};
}
test('실제 육성 화면은 소속 케이지 안에서 걸으며 걷기 대신 훈련 동작을 덮어씌우지 않는다',()=>{
 const s=setup(),y=s.p.y;for(let i=0;i<20;i++)s.ctx.drawFarm(0,.1);
 assert.ok(Math.abs(s.p.y-y)>20);assert.ok(s.poses.includes('walk'));assert.equal(s.p.cageId,'c');
 assert.equal(s.texts.some(text=>String(text).includes('아구몬')),false);
});
test('미니 화산은 원본 자세를 세 번 재생한 뒤 한 번만 보상하고 식사·정지·수면 중에는 진행하지 않는다',()=>{
 const {ctx,p}=setup(),d=ctx.save.digimon[0],trained=[];
 d.cage='미니 화산';d.cageInstance=p.cageId;d.hunger=100;
 p.cage='cm35';ctx.view.layout[0].kind='cm35';
 const id='m201_agumon',action=ctx.animations.duration(id,'seq_29');
 const expected=ctx.animations.sample(id,'seq_29',0);
 ctx.logEvent=e=>{if(e.type==='trained')trained.push(e);};
 ctx.drawFarm(0,.025);
 assert.equal(ctx.spriteFrames.get(p).frame,expected);
 for(const mode of ['paused','foodBusy','sleep']){
  const elapsed=p.training.elapsed;
  if(mode==='sleep')d.restCycle={species:d.speciesId,sleepLeft:10};
  else ctx[mode]=true;
  ctx.drawFarm(0,1);
  assert.equal(p.training.elapsed,elapsed,mode);assert.equal(trained.length,0);
  if(mode==='sleep')d.restCycle=undefined;
  else ctx[mode]=false;
 }
 const total=action*3+2*.28;
 while(p.training.elapsed+.025<total)ctx.drawFarm(0,.025);
 assert.equal(trained.length,0);
 ctx.drawFarm(0,.025);ctx.drawFarm(0,.025);
 assert.equal(trained.length,1);assert.equal(ctx.save.digimon[0].trainDone,true);
 for(let i=0;i<20;i++)ctx.drawFarm(0,.1);
 assert.equal(trained.length,1);
});
test('운동장에서는 성격과 상관없이 달리는 자세와 실제 이동을 함께 재생한다',()=>{
 const {ctx,p}=setup(),d=ctx.save.digimon[0];
 d.cage='운동장';d.cageInstance=p.cageId;d.personality='솔직';
 p.cage='cm02';ctx.view.layout[0].kind='cm02';
 const y=p.y;
 for(let i=0;i<10;i++)ctx.drawFarm(0,.05);
 assert.ok(Math.abs(p.y-y)>8);
 assert.equal(p.motion,'run');
 assert.equal(p.cageId,'c');
});
test('케이지 불만과 청소 이벤트가 원본 자세를 재생하고 정지 중에는 유지한다',()=>{
 const {ctx,p,poses}=setup();
 const d=ctx.save.digimon[0];
 const at={x:p.x,y:p.y};
 ctx.logEvent({type:'grumble',uid:1,name:'아구몬',reason:'dirty'});
 for(let i=0;i<5;i++)ctx.drawFarm(0,.1);
 assert.ok(poses.slice(-5).every(state=>state==='eyesClosed'));
 assert.deepEqual({x:p.x,y:p.y},at);
 ctx.drawFarm(0,.1);
 assert.notEqual(poses.at(-1),'eyesClosed');

 ctx.logEvent({type:'relieved',uids:[1]});
 ctx.drawFarm(0,.05);
 const left=ctx.cageReactions.get(p).left;
 assert.equal(poses.at(-1),'cheering');
 assert.ok(Math.abs(left+.05-70/60)<1e-8);
 ctx.paused=true;
 ctx.drawFarm(0,.1);
 assert.equal(ctx.cageReactions.get(p).left,left);
 assert.equal(poses.at(-1),'cheering');
 ctx.paused=false;
 d.restCycle={species:'아구몬',sleepLeft:10};
 ctx.drawFarm(0,.1);
 assert.equal(poses.at(-1),'seq_13');
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
  assert.equal(s.texts.filter(text=>text==='!').length,1);
  const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  const portraitActor ='),b=source.indexOf('  // ---------- 사냥',a);
  s.ctx.current=()=>d;s.ctx.portrait=s.ctx.ctx;s.ctx.spriteOf=()=>({baseline:40,body:24});
  vm.runInContext(source.slice(a,b),s.ctx);s.ctx.drawPortrait(.1);assert.equal(s.poses.at(-1),expected);
 }
});

test('빈사 표식은 몸에 붙어 돌며 일시 정지와 모션 감소 때 멈춘다',()=>{
 const s=setup(),d=s.ctx.save.digimon[0];d.dying={};d.hunger=60;
 const frame=dt=>{s.orbits.length=0;s.ctx.drawFarm(0,dt);return s.orbits.slice();};
 const first=frame(.1),second=frame(.2);
 assert.equal(first.length,2);
 assert.notDeepEqual(second,first);
 s.ctx.paused=true;assert.deepEqual(frame(.5),second);
 s.ctx.paused=false;s.ctx.window.matchMedia=()=>({matches:true});
 const fixed=frame(.1);
 assert.deepEqual(frame(.5),fixed);
 s.ctx.petVisualBounds=p=>({cx:p.x+5,top:p.y-50,width:72});
 const large=frame(.1);
 assert.ok(Math.abs(large[0][0]-large[1][0])>Math.abs(fixed[0][0]-fixed[1][0]));
 assert.equal(large[0][1],fixed[0][1]-10);
 d.dying=undefined;assert.deepEqual(frame(.1),[]);
 assert.equal(s.p.dyingCueTime,0);
});
