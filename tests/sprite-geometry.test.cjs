const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),zlib=require('node:zlib');
// 배포 PNG는 extract_sprites.png의RGBA/filter0 형식. 실제 원본 도트의 투명 여백으로 판정을 검사한다.
function png(file){
 const b=fs.readFileSync(file),chunks=[];let width,height;
 for(let off=8;off<b.length;){const n=b.readUInt32BE(off),type=b.toString('ascii',off+4,off+8),data=b.subarray(off+8,off+8+n);
  if(type==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);assert.equal(data[8],8);assert.equal(data[9],6);}
  if(type==='IDAT')chunks.push(data);off+=n+12;
 }
 const raw=zlib.inflateSync(Buffer.concat(chunks)),rgba=Buffer.alloc(width*height*4);
 for(let y=0;y<height;y++){assert.equal(raw[y*(width*4+1)],0);raw.copy(rgba,y*width*4,y*(width*4+1)+1,(y+1)*(width*4+1));}
 return {complete:true,naturalWidth:width,naturalHeight:height,rgba};
}
function setup(){
 const window={},cache=new Map(),monsters=new Map(),calls=[];let reads=0;
 const noop=()=>{},nodes={},toolbar={classList:{toggle:noop},querySelector:k=>nodes[k]??={},querySelectorAll:()=>[]};
 const document={createElement(tag){if(tag==='section')return toolbar;let im,sx,sw,sh;return {getContext(){return {drawImage(image,x,y,w,h){im=image;sx=x;sw=w;sh=h;},getImageData(){reads++;const data=new Uint8ClampedArray(sw*sh*4);for(let y=0;y<sh;y++)data.set(im.rgba.subarray((y*im.naturalWidth+sx)*4,(y*im.naturalWidth+sx+sw)*4),y*sw*4);return {data};}};}};}};
 const ctx=vm.createContext({window,document,view:{team:[]},digi:uid=>monsters.get(uid),ctx:{drawImage(...args){calls.push(args);}}});
 vm.runInContext(fs.readFileSync('web/assets/sprites.js','utf8'),ctx);
 const sprites=window.SPRITES,lookup=(id,isEgg=false)=>{const a=sprites.find(s=>isEgg?s.name==='디지에그':s.id===id);if(!a)return null;if(!cache.has(a.id))cache.set(a.id,{...a,image:png('web/assets/'+a.id+'.png')});return cache.get(a.id);};
 Object.assign(ctx,{spriteOf:lookup,C:{getSpecies:id=>({stage:sprites.find(s=>s.id===id)?.name==='깜몬'?1:6})}});
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  const spriteGeometryCache='),b=source.indexOf('  // ---------- 빗자루',a);assert.ok(a>0&&b>a);
 vm.runInContext(source.slice(a,b)+';globalThis.api={spriteHit,spriteVisualBounds,spriteFrameGeometry,petAt,petVisualBounds,drawPetNote,spriteFrames,wildSpriteHit};',ctx);
 function pet(meta,uid=1){const d={uid,speciesId:meta.id,isEgg:meta.name==='디지에그'},p={uid,x:300.3,y:250.7,direction:-1};monsters.set(uid,d);ctx.view.team.push(p);return {p,d,a:lookup(meta.id,d.isEgg)};}
 return {...ctx.api,sprites,lookup,ctx,pet,calls,get reads(){return reads;}};
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function world(a,pose,x,y){return {x:Math.round(pose.x)+(pose.flip?-1:1)*(x-(a.cx??a.width/2))*pose.scale,y:Math.round(pose.y)+(y-(a.baseline??a.height))*pose.scale};}

test('217종의 실제 첫 프레임 픽셀은 크기·반전·배율과 관계없이 잡히고 위쪽 공기는 잡히지 않는다',()=>{
 const s=setup();assert.equal(s.sprites.length,217);
 for(const meta of s.sprites){const a=s.lookup(meta.id),g=s.spriteFrameGeometry(a,0);if(g.empty)continue;
  const i=g.alpha.findIndex(x=>x),px=i%a.width+0.5,py=Math.floor(i/a.width)+0.5;
  for(const scale of [1.6,2])for(const flip of [false,true]){
   const pose={x:300.3,y:250.7,scale,flip,frame:0},point=world(a,pose,px,py),bounds=s.spriteVisualBounds(a,pose);
   assert.equal(s.spriteHit(a,pose,point,0),true,meta.name);
   assert.equal(s.spriteHit(a,pose,{x:bounds.cx,y:bounds.top-12}),false,meta.name);
  }
 }
});
test('투명 픽셀·빈 셀은 제외하며 다른 프레임으로 바뀌면 실제 픽셀을 다시 사용하고 캐시를 재사용한다',()=>{
 const s=setup(),a=s.lookup(s.sprites.find(x=>x.name==='아구몬').id),pose={x:300,y:250,scale:2,flip:false,frame:0};
 const g=s.spriteFrameGeometry(a,0),before=s.reads;s.spriteFrameGeometry(a,0);assert.equal(s.reads,before);
 let transparent=-1;for(let y=g.top;y<g.bottom;y++)for(let x=g.left;x<g.right;x++)if(!g.alpha[y*a.width+x])transparent=y*a.width+x;
 assert.ok(transparent>=0);assert.equal(s.spriteHit(a,pose,world(a,pose,transparent%a.width+0.5,Math.floor(transparent/a.width)+0.5),0),false);
 let changed=false;for(let frame=1;frame<a.frames;frame++){const other=s.spriteFrameGeometry(a,frame);for(let i=0;i<g.alpha.length;i++)if(g.alpha[i]!==other.alpha[i]){const point=world(a,pose,i%a.width+0.5,Math.floor(i/a.width)+0.5);assert.equal(s.spriteHit(a,{...pose,frame},point,0),!!other.alpha[i]);changed=true;break;}if(changed)break;}
 assert.equal(changed,true);
});
test('드래그·치료용 선택은 같은 실제 몸 판정을 쓰며 겹칠 때 앞에 그린 개체를 선택한다',()=>{
 const s=setup(),meta=s.sprites.find(x=>x.name==='깜몬'),first=s.pet(meta,1),second=s.pet(meta,2),g=s.spriteFrameGeometry(first.a,0);
 const i=g.alpha.findIndex(x=>x),point=world(first.a,{...first.p,scale:2,flip:false},i%first.a.width+0.5,Math.floor(i/first.a.width)+0.5);
 assert.equal(s.petAt(point).p,second.p);assert.equal(s.petAt({x:300,y:180}),null);
 const source=fs.readFileSync('web/game.js','utf8');assert.match(source,/board.hitTest = pt=>petAt\(pt\)\?\.p/);
});
test('음표는 실제 머리 바로 위에 붙고 작은 디지몬에 맞게 작아지며 이동과 현재 프레임을 따라간다',()=>{
 const s=setup(),small=s.pet(s.sprites.find(x=>x.name==='깜몬'),1),large=s.pet([...s.sprites].sort((a,b)=>b.body-a.body)[0],2),im=png('web/assets/ui/note_1.png');
 for(const actor of [small,large]){s.drawPetNote(im,actor.p);const call=s.calls.at(-1),bounds=s.petVisualBounds(actor.p,actor.d);near(call[6]+call[8],bounds.top-4);assert.ok(call[3]<=im.naturalWidth);}
 const largeHeight=s.calls.at(-1)[8],smallHeight=s.calls.at(-2)[8];assert.ok(largeHeight>smallHeight);
 const before=s.calls[0];small.p.x+=70;small.p.y+=40;s.drawPetNote(im,small.p);near(s.calls.at(-1)[5]-before[5],70);near(s.calls.at(-1)[6]-before[6],40);
 const frame=Array.from({length:small.a.frames},(_,i)=>i).find(i=>s.spriteFrameGeometry(small.a,i).top!==s.spriteFrameGeometry(small.a,0).top);
 assert.notEqual(frame,undefined);s.spriteFrames.set(small.p,{speciesId:small.d.speciesId,isEgg:false,frame});s.drawPetNote(im,small.p);near(s.calls.at(-1)[6]+s.calls.at(-1)[8],s.petVisualBounds(small.p,small.d).top-4);
});

test('확대·축소·카메라 이동 후 실제 몸을 누를 때만 드래그를 시작한다',()=>{
 const s=setup(),actor=s.pet(s.sprites.find(x=>x.name==='깜몬')),g=s.spriteFrameGeometry(actor.a,0),events={};
 s.ctx.view.layoutVersion=6;s.ctx.view.layout=[{id:'clinic',kind:'clinic',q:1,r:1,rotation:0}];
 s.ctx.Image=function(){};
 for(const file of ['cage-layout.js','cage-editor.js'])vm.runInContext(fs.readFileSync('web/'+file,'utf8'),s.ctx);
 const canvas={style:{},closest:()=>({after(){}}),addEventListener:(k,f)=>events[k]=f,getBoundingClientRect:()=>({left:80,top:40,width:480,height:280}),setPointerCapture(){}};
 const board=s.ctx.window.createCageEditor(canvas,()=>s.ctx.view,()=>{},()=>{},()=>false);board.hitTest=pt=>s.petAt(pt)?.p;
 const i=g.alpha.findIndex(x=>x),point=world(actor.a,{...actor.p,scale:2,flip:false},i%actor.a.width+0.5,Math.floor(i/actor.a.width)+0.5);
 const event=p=>({pointerId:1,clientX:80+(p.x-board.cam.x)*board.zoom/2,clientY:40+(p.y-board.cam.y)*board.zoom/2});
 for(const wheel of [-500,1000]){
  board.centerOn(600,400);events.wheel({...event(point),deltaY:wheel,preventDefault(){}});
  canvas.onpointerdown(event(point));assert.equal(board.isDragging(actor.p.uid),true);canvas.onpointercancel();
  const bounds=s.petVisualBounds(actor.p,actor.d);canvas.onpointerdown(event({x:bounds.cx,y:bounds.top-20}));assert.equal(board.isDragging(actor.p.uid),false);canvas.onpointercancel();
 }
});
test('사냥의 묶인 개체 클릭과 단발 샷도 같은 프레임·크기의 판정을 쓴다',()=>{
 const s=setup(),a=s.lookup(s.sprites.find(x=>x.name==='아구몬').id),w={id:a.id,x:300,y:250,vx:1};
 const pose={x:w.x,y:w.y,scale:2,frame:0,flip:true},g=s.spriteFrameGeometry(a,0),i=g.alpha.findIndex(x=>x);
 s.spriteFrames.set(w,{speciesId:w.id,frame:0,flip:true});
 assert.equal(s.wildSpriteHit(w,world(a,pose,i%a.width+0.5,Math.floor(i/a.width)+0.5)),true);
 const bounds=s.spriteVisualBounds(a,pose);assert.equal(s.wildSpriteHit(w,{x:bounds.cx,y:bounds.top-20}),false);
 const source=fs.readFileSync('web/game.js','utf8');assert.match(source,/w.bound > 0 && wildSpriteHit\(w,p\)/);assert.match(source,/shot.spread\?.*:wildSpriteHit\(w,p\)/);
});
