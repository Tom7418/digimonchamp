const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup({loaded=true,failed=false,canStart=()=>true,valid=()=>true}={}){
 const images=[],done=[],drains=[],draws=[],species=[];
 const sandbox=vm.createContext({window:{},Image:function(){this.complete=loaded;this.naturalWidth=failed?0:4378;images.push(this);}});
 for(const f of ['assets/evolution/effects.js','evolution.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),sandbox);
 const assets=new Map(),dialog={open:false,showModal(){this.open=true;},close(){this.open=false;},addEventListener(){}};
 const player=sandbox.window.createEvolutionPlayer({data:sandbox.window.EVOLUTION_DATA,
  loadSpecies:id=>{if(!assets.has(id))assets.set(id,{baseline:60,body:50,image:{complete:loaded,naturalWidth:failed?0:64}});return assets.get(id);},
  drawSpecies:(...a)=>species.push(a),canStart,valid,dialog,onComplete:(...a)=>done.push(a),onDrain:e=>drains.push(e)});
 const ctx={fillRect(){},fillText(){},drawImage:(...a)=>draws.push(a)};
 return {player,images,assets,done,drains,draws,species,dialog,data:sandbox.window.EVOLUTION_DATA,draw:()=>player.draw(ctx,480,320)};
}
test('원본 셀·유지 시간과 확인된 진화 실루엣39를 사용한다',()=>{
 const s=setup();assert.equal(s.data.silhouetteSequence,39);assert.equal(s.data.cells,22);
 assert.deepEqual(Array.from(s.data.sequences[0].frames,f=>f[0]),Array.from({length:13},(_,i)=>i));
 assert.equal(s.data.sequences[0].frames[12][1],37);
 assert.equal(s.data.sequences[1].frames[2][0],s.data.labelCell);
 assert.equal(s.data.sequences[1].frames[5][0],s.data.platformCell);
});
test('진화 전 모습→실루엣 교대→진화 후 모습 순서와 정지를 유지한다',()=>{
 const s=setup(),event={uid:1,from:'아구몬',to:'그레이몬'};s.player.enqueue(event);s.player.update(0);
 assert.equal(s.player.snapshot().speciesId,'아구몬');assert.equal(s.player.snapshot().white,false);
 s.player.update(15/60);assert.equal(s.player.snapshot().phase,'gather');assert.equal(s.player.snapshot().white,true);
 s.player.update(20/60+0.00001);assert.equal(s.player.snapshot().phase,'morph');assert.equal(s.player.snapshot().speciesId,'아구몬');
 s.player.update(10/60);assert.equal(s.player.snapshot().speciesId,'그레이몬');
 const elapsed=s.player.snapshot().elapsed;s.player.update(0);assert.equal(s.player.snapshot().elapsed,elapsed);
 s.draw();assert.ok(s.species.some(a=>a[1]==='그레이몬'&&a[5]===true));assert.ok(s.draws.length>=14);
 for(const args of s.draws){const [,sx,sy,sw,sh]=args;assert.ok(sx>=0&&sy>=0&&sw>0&&sh>0&&sx+sw<=4378&&sy+sh<=64);}
 s.player.update(160/60);assert.equal(s.player.snapshot().phase,'reveal');assert.equal(s.player.snapshot().white,false);
 s.player.update(2);assert.equal(s.player.busy,false);assert.equal(s.done.length,1);assert.equal(s.drains.length,1);assert.equal(s.dialog.open,false);
 assert.deepEqual(event,{uid:1,from:'아구몬',to:'그레이몬'});
});
test('여러 마리·연속 진화는 이벤트 순서대로 재생하고 건너뛰기도 결과를 다시 적용하지 않는다',()=>{
 const s=setup();s.player.enqueue({uid:1,from:'a',to:'b'});s.player.enqueue({uid:2,from:'c',to:'d'});s.player.enqueue({uid:1,from:'b',to:'e'});
 assert.equal(s.player.appearance(1),'a');s.player.update(0);s.player.skip();assert.equal(s.player.busy,true);assert.equal(s.drains.length,0);
 s.player.update(0);assert.equal(s.player.snapshot().uid,2);assert.equal(s.player.appearance(1),'b');
 s.player.update(5);s.player.update(0);assert.equal(s.player.snapshot().from,'b');s.player.skip();
 assert.deepEqual(s.done.map(([e])=>e.to),['b','d','e']);assert.equal(s.drains.length,1);
 s.player.enqueue({uid:3,from:'a',to:'b'});s.player.clear();assert.equal(s.player.busy,false);assert.equal(s.done.length,3);
});
test('그림 대기·읽기 실패·사라진 개체로 큐가 멈추지 않고 부화 종료를 기다린다',()=>{
 const s=setup({loaded:false});s.player.enqueue({uid:1,from:'a',to:'b'});s.player.update(1);
 assert.equal(s.player.snapshot().loading,true);assert.equal(s.player.snapshot().elapsed,0);
 s.assets.forEach(a=>a.image.complete=true);s.images[0].complete=true;s.player.update(.1);assert.equal(s.player.snapshot().loading,false);
 const failure=setup({failed:true});failure.player.enqueue({uid:1,from:'a',to:'b'});failure.player.update(1);assert.equal(failure.player.busy,false);
 const timeout=setup({loaded:false});timeout.player.enqueue({uid:1,from:'a',to:'b'});timeout.player.update(8);assert.equal(timeout.player.busy,false);
 let hatch=true;const wait=setup({canStart:()=>!hatch});wait.player.enqueue({uid:1,from:'a',to:'b'});wait.player.update(4);
 assert.equal(wait.player.snapshot(),null);assert.equal(wait.dialog.open,false);hatch=false;wait.player.update(0);assert.equal(wait.player.snapshot().elapsed,0);
 const lost=setup({valid:()=>false});lost.player.enqueue({uid:1,from:'a',to:'b'});lost.player.update(1);assert.equal(lost.player.busy,false);
});
test('실제 진화 이벤트를 화면 큐에 전달하며 안내 편지는 연출 완료 전 열지 않는다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  function logEvent('),b=source.indexOf('  // 화면용 목록',a),events=[];
 const ctx=vm.createContext({C:{getSpecies:id=>({name:id})},evolutionScene:{enqueue:e=>events.push(e)},log(){},toast(){throw Error('진화 연출 전에 토스트 금지');},tipMail(){throw Error('진화 연출 전에 편지 금지');}});
 vm.runInContext(source.slice(a,b),ctx);ctx.logEvent({type:'evolved',uid:7,from:'아구몬',to:'그레이몬'});
 assert.equal(events.length,1);assert.equal(events[0].uid,7);
});
test('실제 화면 프레임은 진화 동안 시간을 멈추고 편지·숨김·일시정지에 따라 연출도 멈춘다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  function frame(now)'),b=source.indexOf("  document.addEventListener('visibilitychange'",a),updates=[];
 const ctx=vm.createContext({window:{evolutionScene:{busy:true,update:dt=>updates.push(dt)}},document:{hidden:false},titleOpen:false,selectedItem:null,lastTime:1,battle:null,paused:false,board:{editing:false},mailOpen:false,dayEnding:false,hunt:null,clock:3,speed:1,$:()=>({open:false}),drawFarm(){},drawPortrait(){},requestAnimationFrame(){}});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);vm.runInContext('const C=ChampCore;const MINUTES_PER_SECOND=C.MINUTES_PER_SECOND;globalThis.save=C.freshSave(0);'+source.slice(a,b),ctx);
 const clock=ctx.save.clock;ctx.frame(10001);assert.equal(ctx.save.clock,clock);assert.equal(ctx.clock,3);assert.equal(updates[0],.05);
 ctx.paused=true;ctx.frame(10021);assert.equal(updates.at(-1),0);
 const count=updates.length;ctx.mailOpen=true;ctx.frame(10041);ctx.document.hidden=true;ctx.frame(10061);assert.equal(updates.length,count);
 // 사냥 중 발생한 진화는 귀환까지 대기한다. 사냥 자체를 멈춰 귀환을 강요하지 않는다.
 let huntTicks=0;ctx.document.hidden=false;ctx.mailOpen=false;ctx.paused=false;ctx.hunt={};
 ctx.huntTick=()=>huntTicks++;ctx.drawHunt=()=>{};ctx.frame(10081);
 assert.equal(huntTicks,1);assert.ok(ctx.clock>3);assert.equal(updates.length,count);
});
