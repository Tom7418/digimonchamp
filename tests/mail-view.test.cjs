const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(reduced=false){
 let time=0,id=0,restores=0;const jobs=new Map(),draws=[];
 const raf=fn=>{jobs.set(++id,fn);return id;},cancel=n=>jobs.delete(n);
 const ctx={clearRect(){},fillRect(){},drawImage:(...v)=>draws.push(v)};
 const sender={},text={},box={dataset:{},hidden:false,focus(){},querySelector:s=>s==='.mail-art'?{getContext:()=>ctx}:s==='.mail-text'?text:sender};
 const c=vm.createContext({window:{document:{activeElement:{isConnected:true,focus:()=>restores++}},matchMedia:()=>({matches:reduced})},Image:function(){this.complete=true;this.naturalWidth=72;},requestAnimationFrame:raf,cancelAnimationFrame:cancel,performance:{now:()=>time}});
 for(const f of ['web/assets/ui/mail-art.js','web/mail-view.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
 return {c,view:c.window.ChampMailView,box,sender,text,draws,restores:()=>restores,step(ms){time+=ms;const list=[...jobs.values()];jobs.clear();for(const fn of list)fn(time);}};
}
test('원본 35/36 시퀀스는 각12틱 동안 중앙에서 펼쳐지고 닫힌다',()=>{
 const s=setup(),data=s.c.window.MAIL_ART;
 assert.deepEqual(Array.from(data.open.frames,f=>f[0]),[62,63,64,65,66,67]);assert.deepEqual(Array.from(data.close.frames,f=>f[0]),[68,69,65,64,63,70]);
 s.view.open(s.box);assert.equal(s.view.phase(s.box),'opening');assert.equal(s.draws.at(-1)[1],0);s.step(34);assert.equal(s.draws.at(-1)[1],8);s.step(166);assert.equal(s.view.phase(s.box),'open');
 let closed=0;s.view.advance(s.box,()=>closed++);assert.equal(closed,0);assert.equal(s.view.phase(s.box),'closing');s.step(200);assert.equal(closed,1);assert.equal(s.view.phase(s.box),'closed');
});
test('열리는 중 입력은 펼치기만 마치고 닫히는 중 연속 입력은 큐를 한 번만 진행한다',()=>{
 const s=setup();let n=0;s.view.open(s.box);s.view.advance(s.box,()=>n++);assert.equal(n,0);assert.equal(s.view.phase(s.box),'open');
 s.view.advance(s.box,()=>n++);s.view.advance(s.box,()=>n++);s.view.advance(s.box,()=>n++);assert.equal(n,0);s.step(200);assert.equal(n,1);s.step(1000);assert.equal(n,1);
});
test('다음 편지를 여는 콜백과 모션 감소 설정은 중복 프레임·초점 복구를 남기지 않는다',()=>{
 const s=setup();s.view.open(s.box);s.step(200);s.view.advance(s.box,()=>s.view.open(s.box));s.step(200);assert.equal(s.view.phase(s.box),'opening');s.step(200);assert.equal(s.view.phase(s.box),'open');
 s.view.hide(s.box);s.view.hide(s.box);assert.equal(s.restores(),1);assert.equal(s.view.phase(s.box),'closed');s.step(1000);assert.equal(s.view.phase(s.box),'closed');
 const reduced=setup(true);reduced.view.open(reduced.box);assert.equal(reduced.view.phase(reduced.box),'open');let n=0;reduced.view.advance(reduced.box,()=>n++);assert.equal(n,1);
});
test('실제 이벤트 메일의 선물은 닫힘 완료 전 지급되지 않고 완료 뒤 한 번만 지급된다',()=>{
 const s=setup(),core=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('web/core.js','utf8')+';this.C=ChampCore',core);const C=core.C;
 const context=vm.createContext({ChampMailView:s.view,view:{tips:{},team:[{x:300,y:300}],selected:0,foods:[]},save:C.queueMails({...C.freshSave(0),meat:0},[0x77]),battle:null,hunt:null,titleOpen:false,
  $:()=>s.box,persist(){},renderTray(){},log(){},board:{roam:{x0:0,x1:1000,y0:0,y1:1000},attachFloorItem:i=>i},C:{...C,isNight:()=>false,matchEntryNotice:()=>null}});
 const source=fs.readFileSync('web/game.js','utf8'),start=source.indexOf('  let mailOpen = false;'),end=source.indexOf('  function matchDays(',start);
 vm.runInContext(source.slice(start,end)+';this.api={checkSchedule,advanceMail,save:()=>save};',context);
 context.api.checkSchedule();s.step(200);context.api.advanceMail();context.api.advanceMail();assert.equal(context.view.foods.length,0);assert.equal(context.api.save().meat,0);
 s.step(200);assert.equal(context.view.foods.length,3);assert.equal(context.api.save().meat,6);assert.equal(context.api.save().pendingMails.length,0);assert.equal(s.box.hidden,true);
 context.api.advanceMail();s.step(1000);assert.equal(context.view.foods.length,3);
});
