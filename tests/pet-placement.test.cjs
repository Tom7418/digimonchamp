const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(saved){
 const noop=()=>{},nodes={},toolbar={classList:{toggle:noop},querySelector:k=>nodes[k]??=( {} ),querySelectorAll:()=>[]};
 const window={},ctx=vm.createContext({window,document:{createElement:()=>toolbar},Image:function(){},crypto:{randomUUID:()=> 'new'}});
 for(const f of ['cage-layout.js','cage-editor.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),ctx);
 const events={},box={left:80,top:40,width:480,height:280};
 const canvas={style:{},closest:()=>({after:noop}),addEventListener:(k,f)=>events[k]=f,getBoundingClientRect:()=>box,setPointerCapture:noop};
 const state=saved??{layoutVersion:6,layout:[{id:'clinic',kind:'clinic',q:1,r:1,rotation:0},{id:'field',kind:'field',q:2,r:2,rotation:0}],team:[],selected:0};
 const board=window.createCageEditor(canvas,()=>state,noop,noop,()=>false);
 if(!saved){const p=board.center(0,0);state.team=[{uid:1,...p,target:p.x,cage:'free',cageId:null}];}
 const drawCtx=new Proxy({}, {get:()=>noop});
 const draw=()=>board.draw(drawCtx);
 const event=p=>({pointerId:1,clientX:box.left+(p.x-board.cam.x)*board.zoom*box.width/960,clientY:box.top+(p.y-board.cam.y)*board.zoom*box.height/560});
 const drop=point=>{const p=state.team[0];canvas.onpointerdown(event({x:p.x,y:p.y-25}));canvas.onpointermove(event({x:point.x,y:point.y-25}));draw();canvas.onpointerup(event({x:point.x,y:point.y-25}));draw();};
 return {state,board,canvas,events,draw,event,drop,nodes};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('케이지 중앙 밖에 놓은 실제 발 위치를 매 프레임 보존한다',()=>{
 const s=setup(),c=s.board.center(1,1),point={x:c.x+65,y:c.y+35};s.drop(point);
 const p=s.state.team[0];assert.equal(p.cageId,'clinic');assert.equal(p.cage,'clinic');
 for(let i=0;i<5;i++)s.draw();near(p.x,point.x);near(p.y,point.y);near(p.target,point.x);
 // 같은 시설 안에서 다시 옮겨도 소속은 유지한다.
 s.drop({x:c.x-65,y:c.y+30});near(p.x,c.x-65);near(p.y,c.y+30);assert.equal(p.cageId,'clinic');
});
test('여러 칸 시설 안의 원하는 위치와 확대·이동된 화면 좌표를 보존한다',()=>{
 const s=setup();s.board.centerOn(900,600);
 s.events.wheel({...s.event(s.board.center(2,2)),deltaY:-600,preventDefault(){}});
 const c=s.board.center(2,3),point={x:c.x-70,y:c.y+20};s.drop(point);
 const p=s.state.team[0];assert.equal(p.cageId,'field');near(p.x,point.x);near(p.y,point.y);
 const reload=setup(JSON.parse(JSON.stringify(s.state)));reload.draw();near(reload.state.team[0].x,point.x);near(reload.state.team[0].y,point.y);
});
test('케이지 이동·회전 때 내부 위치를 따라가며 다른 디지몬에 의해 재정렬되지 않는다',()=>{
 const s=setup(),c=s.board.center(1,1);s.drop({x:c.x+40,y:c.y+20});
 s.state.team.push({uid:2,x:c.x-30,y:c.y+10,target:c.x-30,cage:'clinic',cageId:'clinic'});s.draw();
 const cage=s.state.layout[0];cage.q=2;cage.rotation=1;s.draw();const next=s.board.center(2,1),p=s.state.team[0];
 near(p.x,next.x+40*0.5-20*Math.sqrt(3)/2);near(p.y,next.y+40*Math.sqrt(3)/2+20*0.5);
});
test('드래그 취소·사육장 밖 드롭은 원래 좌표와 소속을 복구한다',()=>{
 const s=setup(),c=s.board.center(1,1);s.drop({x:c.x+50,y:c.y});
 const p=s.state.team[0],old={x:p.x,y:p.y};
 for(const cancel of [true,false]){
  s.canvas.onpointerdown(s.event({x:p.x,y:p.y-25}));s.canvas.onpointermove(s.event({x:-500,y:-500}));s.draw();
  if(cancel)s.canvas.onpointercancel();else s.canvas.onpointerup(s.event({x:-500,y:-500}));
  s.draw();near(p.x,old.x);near(p.y,old.y);assert.equal(p.cageId,'clinic');
 }
});
test('빈 바닥 드롭도 중앙으로 끌어당기지 않으며 옛 저장의 유효한 위치를 보존한다',()=>{
 const s=setup(),c=s.board.center(1,1);s.drop({x:c.x+40,y:c.y});
 s.state.layout=[];
 const free=s.board.center(0,0),point={x:free.x+55,y:free.y+15};s.drop(point);
 assert.equal(s.state.team[0].cageId,null);near(s.state.team[0].x,point.x);near(s.state.team[0].y,point.y);
 s.canvas.onpointerdown(s.event({x:point.x,y:point.y-25}));s.canvas.onpointermove(s.event({x:point.x+100,y:point.y}));s.draw();s.canvas.onpointercancel();
 near(s.state.team[0].x,point.x);near(s.state.team[0].y,point.y);near(s.state.team[0].target,point.x);
 s.state.layout=[{id:'clinic',kind:'clinic',q:1,r:1,rotation:0}];
 const p=s.state.team[0];p.cageId='clinic';p.cage='clinic';p.x=c.x-55;p.y=c.y+40;delete p.cagePosition;
 s.draw();near(p.x,c.x-55);near(p.y,c.y+40);
});
test('선택 후 클릭도 클릭한 바닥 위치를 쓰고 마지막 pointerup 좌표로 드롭한다',()=>{
 const s=setup(),c=s.board.center(1,1),p=s.state.team[0],point={x:c.x+60,y:c.y};
 s.canvas.onpointerdown(s.event(point));s.canvas.onpointerup(s.event(point));s.draw();
 near(p.x,point.x);near(p.y,point.y);assert.equal(p.cageId,'clinic');
 const end={x:c.x-60,y:c.y+20};
 s.canvas.onpointerdown(s.event({x:p.x,y:p.y-25}));
 // 마지막 move 이벤트가 생략되어도 실제 놓은 위치를 사용한다.
 s.canvas.onpointerup(s.event({x:end.x,y:end.y-25}));s.draw();near(p.x,end.x);near(p.y,end.y);
 const free=s.board.center(0,0),empty={x:free.x+50,y:free.y};
 s.canvas.onpointerdown(s.event(empty));s.canvas.onpointerup(s.event(empty));s.draw();
 near(p.x,empty.x);near(p.y,empty.y);assert.equal(p.cageId,'clinic');assert.equal(s.board.isBouncing(p.uid),true);
});

test('틈에 놓으면 가까운 케이지 내부로 튕기고 일시정지·재접속·착지를 보존한다',()=>{
 const s=setup(),c=s.board.center(0,0),gap={x:c.x+60,y:c.y+20};s.drop(gap);const p=s.state.team[0];
 assert.equal(p.cageId,'clinic');assert.equal(s.board.isBouncing(p.uid),true);near(p.x,gap.x);
 s.board.advance(0);s.draw();near(p.x,gap.x);
 const reload=setup(JSON.parse(JSON.stringify(s.state)));reload.draw();assert.equal(reload.state.team[0].cageId,'clinic');
 s.board.advance(0.2);s.draw();assert.notEqual(p.x,gap.x);
 s.board.advance(0.2);s.draw();assert.equal(s.board.isBouncing(p.uid),false);
 assert.ok(Math.hypot(p.x-s.board.center(1,1).x,p.y-s.board.center(1,1).y)<140);
 near(p.x,reload.state.team[0].x);near(p.y,reload.state.team[0].y);
});
test('자율 이동은 케이지 밖·다른 케이지 관통을 막고 내부 여러 칸 이동은 허용한다',()=>{
 const s=setup(),inside=s.board.center(2,2);s.drop(inside);const p=s.state.team[0];
 assert.equal(s.board.movePet(p,s.board.center(2,3)),true);
 assert.equal(s.board.canMove(p,s.board.center(0,0)),false);
 const old={x:p.x,y:p.y};assert.equal(s.board.movePet(p,s.board.center(0,0)),false);near(p.x,old.x);near(p.y,old.y);
 p.cageId=null;p.cage='free';p.x=s.board.center(1,1).x-180;p.y=s.board.center(1,1).y;
 assert.equal(s.board.canMove(p,{x:p.x+360,y:p.y}),false); // 끝점만 보면 통과 가능한 선분도 차단
});

test('시설 안에 생성되거나 옛 저장의 소속이 비어 있는 개체는 내부 이동과 먹기가 가능하도록 복구한다',()=>{
 const s=setup(),p=s.state.team[0],c=s.board.center(1,1);p.x=c.x;p.y=c.y;
 s.draw();assert.equal(p.cageId,'clinic');assert.equal(s.board.movePet(p,{x:c.x+30,y:c.y}),true);
 assert.equal(s.board.canMove(p,s.board.center(0,0)),false);
});

test('케이지 이동·회전에 고기·상한 고기·프로틴·똥·추가 물건이 따라가고 재접속 뒤에도 유지한다',()=>{
 const s=setup(),c=s.board.center(1,1),other=s.board.center(2,2);
 const meat={kind:'meat',x:c.x+25,y:c.y+20,remaining:70},pill={kind:'pill',x:c.x-20,y:c.y},poop={uid:1,x:c.x,y:c.y+30};
 const rotten={kind:'rotten',x:c.x+15,y:c.y-20},placed={kind:'future-item',x:c.x-10,y:c.y-15};
 const unmoved={kind:'meat',x:other.x,y:other.y};s.state.foods=[meat,pill,rotten,unmoved];s.state.poops=[poop];s.state.floorItems=[placed];
 s.board.attachFloorItem(rotten);assert.equal(rotten.cageId,'clinic');
 s.nodes['#edit-cages'].onclick();
 s.canvas.onpointerdown(s.event(c));const next=s.board.center(2,1);s.canvas.onpointermove(s.event(next));s.canvas.onpointerup(s.event(next));
 near(meat.x,next.x+25);near(meat.y,next.y+20);assert.equal(meat.remaining,70);near(pill.x,next.x-20);near(poop.y,next.y+30);
 near(unmoved.x,other.x);near(unmoved.y,other.y);near(rotten.x,next.x+15);near(rotten.y,next.y-20);near(placed.x,next.x-10);near(placed.y,next.y-15);
 s.nodes['#rotate-cage'].onclick();near(meat.x,next.x+25*0.5-20*Math.sqrt(3)/2);near(meat.y,next.y+25*Math.sqrt(3)/2+20*0.5);
 near(rotten.x,next.x+15*0.5+20*Math.sqrt(3)/2);near(placed.y,next.y-10*Math.sqrt(3)/2-15*0.5);
 const reload=setup(JSON.parse(JSON.stringify(s.state)));reload.draw();near(reload.state.foods[0].x,meat.x);near(reload.state.foods[2].x,rotten.x);
 reload.nodes['#edit-cages'].onclick();reload.canvas.onpointerdown(reload.event(next));const end=reload.board.center(1,1);reload.canvas.onpointermove(reload.event(end));reload.canvas.onpointerup(reload.event(end));near(reload.state.foods[2].x,rotten.x+end.x-next.x);
});
