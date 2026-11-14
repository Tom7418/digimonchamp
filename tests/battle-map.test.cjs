const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('배경을 자르거나 찌그러뜨리지 않고 표시하고 이미지를 경기 사이에 재사용한다',()=>{
 const images=[],draws=[];
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=416;images.push(this);}});
 vm.runInContext(fs.readFileSync('web/battle-map.js','utf8'),c);
 const renderer=c.window.createBattleMapRenderer(),map={id:3,asset:'assets/battle/maps/3.png',width:416,height:272};
 const ctx={fillRect(){},drawImage:(...args)=>draws.push(args)};
 renderer.preload(map);renderer.draw(ctx,map,480,314);renderer.draw(ctx,map,480,314);
 assert.equal(images.length,1);assert.equal(images[0].src,'assets/battle/maps/3.webp');
 const [,x,y,w,h]=draws[0];assert.equal(w/h,416/272);assert.ok(x>=0&&y>=0&&x+w<=480&&y+h<=314);
 images[0].complete=false;renderer.draw(ctx,map,480,314);assert.equal(draws.length,2);
 images[0].complete=true;images[0].naturalWidth=0;renderer.draw(ctx,map,480,314);assert.equal(draws.length,2);
});

test('실제 출전은 맵을 한 번 고르고 결과 화면까지 같은 맵과 전투 좌표를 유지한다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),draws=[],moves=[],images=[],elements={};
 const ctx={imageSmoothingEnabled:true,fillRect(){},drawImage:(...a)=>draws.push(a),save(){},restore(){},translate:(...a)=>moves.push(a),scale(){},beginPath(){},ellipse(){},fill(){},fillText(){},strokeText(){}};
 elements['#arena']={width:416,height:272,getContext:()=>ctx};
 let hpWrites=0;elements['#battle-hp']={set innerHTML(value){hpWrites++;}};
 const c=vm.createContext({window:{},performance:{now:()=>0},Image:function(){this.complete=true;this.naturalWidth=416;images.push(this);}});
 for(const file of ['core.js','battle-map.js'])vm.runInContext(fs.readFileSync('web/'+file,'utf8'),c);
 vm.runInContext(`let selections=0,battle;
  const C={...ChampCore,battleMapFor:(...args)=>{selections++;return ChampCore.battleMapFor(...args);}};
  const battleBackdrop=window.createBattleMapRenderer();
  window.createBattleEffects=()=>({draw(){}});
  const members=()=>[C.newDigimon(1,'아구몬')],canFight=()=>true,nameOf=d=>d.speciesId;
  const log=()=>{},render=()=>{},persist=()=>{},toast=()=>{},showModal=(...args)=>{globalThis.modal=args;};
  const animations={movement:()=>({frame:0,flip:false}),sample:()=>0},SPRITE_BY_NAME={아구몬:'m201_agumon'};
  const body=()=>{},clamp=(n)=>Math.max(0,Math.min(100,n)),esc=String;
  const spriteOf=()=>({body:24,baseline:40,image:{complete:true,naturalWidth:64}});
  globalThis.current=()=>battle;globalThis.selections=()=>selections;
 `,c);
 c.$=selector=>elements[selector]??(elements[selector]={});
 vm.runInContext(source.slice(source.indexOf('  function startBattle('),source.indexOf('  function battleTick(')),c);
 vm.runInContext(source.slice(source.indexOf('  function drawArena('),source.indexOf('  // ---------- 그리기 (캔버스) ----------')),c);
 c.startBattle({title:'물을 조정하는 자',match:{id:'m35'},format:1,stage:3,scale:1,prize:0},'일반');
 const battle=c.current(),positions=battle.state.units.map(u=>[u.x,u.y]);
 assert.match(c.modal[1],/width="416" height="272"/);assert.equal(battle.map.id,3);
 c.drawArena(0);battle.done=true;c.drawArena(0);
 assert.equal(c.selections(),1);assert.equal(images.length,1);assert.equal(draws.length,2);
 assert.deepEqual(battle.state.units.map(u=>[u.x,u.y]),positions);
 assert.deepEqual(moves,[[28,70],[28,70]]);assert.equal(hpWrites,1);
 assert.equal(elements['#battle-map-name'].textContent,'섬');
});

test('무손실 WebP 실패 시 PNG로 한 번만 대체하고 최근3개 배경만 합성 캐시한다',()=>{
 const images=[],buffers=[],draws=[];
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=416;images.push(this);}});
 vm.runInContext(fs.readFileSync('web/battle-map.js','utf8'),c);
 const renderer=c.window.createBattleMapRenderer({makeCanvas:()=>({getContext:()=>({drawImage:(...a)=>buffers.push(a)})})});
 const map=id=>({id,asset:`assets/battle/maps/${id}.png`,width:416,height:272}),ctx={fillRect(){},drawImage:(...a)=>draws.push(a)};
 const img=renderer.preload(map(0));img.onerror();assert.equal(img.src,'assets/battle/maps/0.png');
 renderer.draw(ctx,map(0),416,272);renderer.draw(ctx,map(0),416,272);assert.equal(buffers.length,1);
 for(const id of [1,2,3])renderer.draw(ctx,map(id),416,272);
 renderer.draw(ctx,map(0),416,272);assert.equal(buffers.length,5);
 img.onerror();assert.equal(renderer.status(map(0)),'failed');
});

test('디지몬 그림과 효과는 같은 배율로 투영되며 큰 종도 경기장 여백에 들어간다',()=>{
 const c=vm.createContext({window:{}});vm.runInContext(fs.readFileSync('web/battle-map.js','utf8'),c);
 const r=c.window.createBattleMapRenderer(),v=r.viewport;
 for(const meta of [{body:24,baseline:40},{body:150,baseline:180}]){
  const scale=r.spriteScale(meta)*v.scale;
  assert.ok(meta.body*scale<=80&&meta.baseline*scale<=80);
  const left=v.x+20*v.scale-meta.body*scale/2,top=v.y+(20+14)*v.scale-meta.baseline*scale;
  assert.ok(left>=0&&top>=0);
 }
 assert.equal(r.spriteScale({body:24,baseline:40})*v.scale,1);
});

test('그림을 읽는 첫 프레임에는 전투를 진행하지 않고4초 대기 뒤에는 풀어준다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  function battleTick('),b=source.indexOf('  function battleLog(',a);
 let steps=0,draws=0;
 const c=vm.createContext({performance:{now:()=>0},drawArena:()=>draws++,finishBattle(){},battleBackdrop:{status:()=> 'loading'},spriteOf:()=>({image:{complete:false}}),C:{stepBattle:()=>{steps++;return [];}},battle:{done:false,map:{id:0},assetWait:0,acc:0,state:{over:false,units:[]},effects:{tick(){}},actions:new Map(),motion:new Map()}});
 vm.runInContext(source.slice(a,b),c);c.battleTick(.05);assert.equal(steps,0);assert.equal(draws,1);
 c.battle.assetWait=4;c.battleTick(.05);assert.equal(steps,1);
});
