const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const nodes={'#modal':{close(){}},'#gear-select':{value:'bait1'}},messages=[],noop=()=>{};
 const ctx=vm.createContext({window:{},hunt:null,AREA:{x0:40,y0:70,x1:920,y1:530},performance:{now:()=>0},document:{body:{classList:{add:noop,remove:noop}}},$:k=>nodes[k],
  huntMapImage:()=>null,setTool:noop,log:noop,render:noop,persist:noop,toast:x=>messages.push(x),huntNote:x=>messages.push(x),refreshGear:noop,
  huntIsNight:()=>false,wireMode:()=>ctx.hunt.tool==='wire',wireGear:()=>null,canvasPoint:e=>({x:e.clientX,y:e.clientY}),canvas:{setPointerCapture:noop},BIND_SECONDS:4,PULL_DISTANCE:70,
  applyEffect:noop,blast:noop,wrapRope:noop,endHunt:noop,pullRope:noop,wildSpriteHit:()=>true});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);vm.runInContext('globalThis.C=ChampCore;globalThis.save=C.freshSave(0);save.clock=480;save.bits=90000;save.wires=2;save.gear.bait1=2;Math.random=C.seeded(38);',ctx);
 const source=fs.readFileSync('web/game.js','utf8');
 function part(start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>0&&b>a);vm.runInContext(source.slice(a,b),ctx);}
 part('  function huntMapPoint(','  function endHunt(');
 part('  function useGearAt(','  // 선분 교차');
 part('  function crosses(','  // 로프를 감는다');
 part('  function huntPointer(','  function drawHunt(');
 const start=()=>ctx.startHunt({...ctx.C.FIELDS[0],open:true});
 const event=p=>({pointerId:1,clientX:p.x,clientY:p.y,preventDefault(){}});
 function barrier(){start();const cells=new Uint8Array(128*128);for(let y=0;y<128;y++)cells[y*128+30]=1;
  Object.assign(ctx.hunt,{terrain:{width:128,height:128,tileSize:8,cells},view:{x:40,y:96},spawnPoints:[],wilds:[],respawn:999,baits:[],traps:[],wires:[]});
 }
 return {ctx,nodes,messages,start,event,barrier};
}
test('실제 사냥 시작은 배경 crop 좌표를 더한 안전한 칸에5마리를 생성한다',()=>{
 const s=setup();s.start();assert.equal(s.ctx.hunt.wilds.length,s.ctx.C.WILD_COUNT);
 for(const w of s.ctx.hunt.wilds)assert.equal(s.ctx.C.canStandOnHuntTerrain(s.ctx.hunt.terrain,s.ctx.huntMapPoint(w)),true);
 const bits=s.ctx.save.bits;s.ctx.startHunt({id:'없는 필드',open:true,fee:100});assert.equal(s.ctx.save.bits,bits);
});
test('도주·미끼 장난감 이동도 잘라낸 지도 위치의 벽을 넘지 않고 와이어 충돌은 유지한다',()=>{
 const s=setup();s.barrier();const w={id:'깜몬',x:180,y:220,vx:600,vy:0,hp:1,max:1,flee:10,flash:0,turn:100,stun:0};s.ctx.hunt.wilds=[w];
 s.ctx.hunt.baits=[{x:180,y:300,vx:600,vy:0,left:10,range:0}];s.ctx.huntTick(0.05);
 assert.ok(w.x<=196);assert.ok(w.vx<0);assert.equal(w.gone,undefined);assert.ok(s.ctx.hunt.baits[0].x<=196);assert.ok(s.ctx.hunt.baits[0].vx<0);
 w.x=180;w.vx=600;s.ctx.hunt.wires=[{a:{x:190,y:180},b:{x:190,y:260}}];s.ctx.huntTick(0.05);assert.equal(w.x,180);assert.equal(w.movedX,0);
});
test('벽 건너 함정은 발동하지 않고 막힌 칸의 먹이 설치는 재고를 차감하지 않는다',()=>{
 const s=setup();s.barrier();const w={id:'깜몬',x:196,y:220,vx:0,vy:0,hp:1,max:1,flee:0,flash:0,turn:100,stun:0};s.ctx.hunt.wilds=[w];
 const trap={x:212,y:220,g:{kind:'trap',range:60,holds:1,seconds:2,name:'함정'},left:60,held:0};s.ctx.hunt.traps=[trap];s.ctx.huntTick(0.05);assert.equal(trap.held,0);assert.equal(w.stun,0);
 const before=s.ctx.save.gear.bait1;s.ctx.useGearAt({x:204,y:220});assert.equal(s.ctx.save.gear.bait1,before);assert.equal(s.ctx.hunt.baits.length,0);
 s.ctx.useGearAt({x:180,y:220});assert.equal(s.ctx.save.gear.bait1,before-1);assert.equal(s.ctx.hunt.baits.length,1);
});
test('와이어가 벽을 가로지르면 설치·소비를 막고 통행 가능한 구간은 설치한다',()=>{
 const s=setup();s.barrier();s.ctx.hunt.tool='wire';const run=(a,b)=>{s.ctx.huntPointer('down',s.event(a));s.ctx.huntPointer('move',s.event(b));s.ctx.huntPointer('up',s.event(b));};
 run({x:180,y:220},{x:240,y:220});assert.equal(s.ctx.hunt.wires.length,0);assert.equal(s.ctx.save.wires,2);
 run({x:180,y:150},{x:180,y:250});assert.equal(s.ctx.hunt.wires.length,1);assert.equal(s.ctx.save.wires,1);
});

test('16지도에서 화면 경계 반사까지 거쳐도 개체와 장난감을 벽 안으로 보정하지 않는다',()=>{
 const s=setup(),rng=s.ctx.C.seeded(737);
 for(const field of s.ctx.C.FIELDS){
  s.ctx.startHunt({...field,open:true,fee:0});const h=s.ctx.hunt,p=s.ctx.C.pickHuntSpawn(h.spawnPoints,rng);
  const w={id:'깜몬',x:p.x-h.view.x,y:p.y-h.view.y,vx:0,vy:0,hp:1,max:1,flee:0,flash:0,turn:1000,stun:0};
  h.wilds=[w];h.respawn=1000;h.baits=[{x:w.x,y:w.y,vx:0,vy:0,left:1000,range:0}];
  for(let i=0;i<40;i++){
   w.vx=(rng()-0.5)*1000;w.vy=(rng()-0.5)*1000;const b=h.baits[0];b.vx=(rng()-0.5)*1000;b.vy=(rng()-0.5)*1000;
   s.ctx.huntTick(0.1);
   for(const actor of [w,b]){assert.equal(s.ctx.C.canStandOnHuntTerrain(h.terrain,s.ctx.huntMapPoint(actor)),true,field.id);assert.ok(actor.x>=40-1e-7&&actor.x<=920+1e-7,JSON.stringify({field:field.id,i,x:actor.x,y:actor.y}));assert.ok(actor.y>=70-1e-7&&actor.y<=530+1e-7);}
  }
 }
});
