const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const noop=()=>{},notes=[],canvas={width:960,height:560,setPointerCapture:noop,getBoundingClientRect:()=>({left:100,top:50,width:480,height:280})};
 const ctx=vm.createContext({window:{},hunt:null,AREA:{x0:24,y0:24,x1:1000,y1:1000},HUNT_ZOOM:{min:1,max:3},ROPE_BODY_Y:15,BOUND_RUN_SPEED:38,
  canvas,performance:{now:()=>0},$:()=>({classList:{toggle:noop}}),refreshGear:noop,render:noop,persist:noop,log:noop,toast:noop,huntNote:s=>notes.push(s),
  huntMinimapBox:()=>null,wireGear:()=>null,wireMode:()=>ctx.hunt.tool==='wire',wildSpriteHit:(w,p)=>Math.hypot(p.x-w.x,p.y-(w.y-15))<30});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 vm.runInContext('globalThis.C=ChampCore;globalThis.save=C.freshSave(0);save.clock=540;globalThis.huntKeys=new Set();',ctx);
 const src=fs.readFileSync('web/game.js','utf8');
 for(const [start,end] of [['  function huntMapPoint(','  function spawnWild('],['  function setTool(','  // 사냥 장비'],['  function crosses(','  // 로프를 감는다'],['  // 로프를 감는다','  // 미니맵:'],['  function huntPanPointer(','  function huntMinimapBox('],['  function huntWheel(','  function drawHunt(']]){
  const a=src.indexOf(start),b=src.indexOf(end,a);assert.ok(a>0&&b>a,start);vm.runInContext(src.slice(a,b),ctx);
 }
 ctx.hunt={tool:'rope',cam:{x:200,y:300},size:{w:1024,h:1024},zoom:2,view:{x:0,y:0},trail:[],wilds:[],wires:[],baits:[],traps:[],fx:[],respawn:1000,notes:[],carried:0};
 const event=(x,y,extra={})=>({clientX:100+x/2,clientY:50+y/2,pointerId:1,button:0,buttons:1,preventDefault:noop,...extra});
 return {ctx,notes,event};
}
test('손 떼기 마지막 좌표를 카메라/축소 화면에 맞춰 로프 끝에 적용한다',()=>{
 const {ctx:c,event:e}=setup(),w={id:'깜몬',x:300,y:415,bound:6};c.hunt.wilds=[w];
 c.huntPointer('down',e(200,200));assert.equal(c.hunt.pull.w,w);
 c.huntPointer('up',e(360,280));assert.equal(w.anchor.x,380);assert.equal(w.anchor.y,440);assert.equal(c.hunt.pull,null);
});
test('잡은 로프 끝은 포인터 이동 없이 확대/가장자리 스크롤 중에도 같은 화면 위치를 따른다',()=>{
 const {ctx:c,event:e}=setup(),w={id:'깜몬',x:300,y:415,bound:6};c.hunt.wilds=[w];c.huntPointer('down',e(200,200));
 c.huntWheel({...e(400,280),deltaY:-200});
 const check=()=>{const p=c.huntToWorld(c.hunt.lastScreen);assert.ok(Math.abs(w.anchor.x-p.x)<1e-8);assert.ok(Math.abs(w.anchor.y-p.y)<1e-8);};check();
 c.hunt.lastScreen={x:950,y:280};const before=c.hunt.cam.x;c.huntScroll(.1);assert.ok(c.hunt.cam.x>before);check();
 c.huntKeys.add('ArrowDown');c.huntScroll(.1);check();
});
test('취소된 닫힌 로프/와이어는 감거나 설치하지 않고 재고도 보존한다',()=>{
 for(const tool of ['rope','wire']){
  const {ctx:c,event:e}=setup();c.hunt.tool=tool;const before=c.save.wires;
  c.huntPointer('down',e(100,100));for(let i=0;i<12;i++)c.huntPointer('move',e(100+50*Math.cos(i/11*Math.PI*2),100+50*Math.sin(i/11*Math.PI*2)));
  c.huntPointer('cancel',{preventDefault(){}});
  assert.equal(c.hunt.drawing,false);assert.equal(c.hunt.trail.length,0);assert.equal(c.hunt.lastScreen,null);assert.equal(c.hunt.wires.length,0);assert.equal(c.save.wires,before);
 }
});
test('도구 전환은 그리던 선·당기기·화면 끌기를 취소하며 이미 감은 로프는 유지한다',()=>{
 const {ctx:c}=setup(),w={bound:6,anchor:{x:320,y:420}};
 Object.assign(c.hunt,{drawing:true,trail:[{x:10,y:10}],pull:{w},pan:{x:1},lastScreen:{x:20,y:30}});
 c.setTool('wire');assert.equal(c.hunt.trail.length,0);assert.equal(c.hunt.pull,null);assert.equal(c.hunt.pan,null);assert.equal(w.bound,6);assert.equal(w.anchor.x,320);
});
test('실제 로프 체력 감소→기절→클릭 포획은 한 번만 등록되고 카드 용량 실패도 소비하지 않는다',()=>{
 const {ctx:c,event:e}=setup();c.hunt.cam=null;c.hunt.terrain={width:128,height:128,tileSize:8,cells:new Uint8Array(128*128)};
 const w={id:'깜몬',x:350,y:400,hp:.001,max:1,bound:6,boundMax:6,anchor:{x:290,y:385},vx:0,vy:0,stun:10,flash:0};c.hunt.wilds=[w];
 c.huntTick(.1);assert.equal(w.ko,true);assert.equal(w.hp,0);assert.equal(w.bound,0);
 const count=c.save.digimon.length;c.huntPointer('down',e(w.x,w.y-15));assert.equal(c.save.digimon.length,count+1);const carried=c.hunt.carried;assert.ok(carried>0);
 c.huntPointer('down',e(w.x,w.y-15));assert.equal(c.save.digimon.length,count+1);assert.equal(c.hunt.carried,carried);
 const rejected={...w,gone:false,ko:true};c.hunt.wilds=[rejected];c.hunt.carried=c.save.memoryCard;
 c.huntPointer('down',e(rejected.x,rejected.y-15));assert.equal(c.save.digimon.length,count+1);assert.equal(c.hunt.carried,c.save.memoryCard);assert.equal(rejected.ko,false);
});
