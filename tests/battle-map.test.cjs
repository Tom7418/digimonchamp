const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

test('배경을 자르거나 찌그러뜨리지 않고 표시하고 이미지를 경기 사이에 재사용한다',()=>{
 const images=[],draws=[];
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=416;images.push(this);}});
 vm.runInContext(fs.readFileSync('web/battle-map.js','utf8'),c);
 const renderer=c.window.createBattleMapRenderer(),map={id:3,asset:'assets/battle/maps/3.png',width:416,height:272};
 const ctx={fillRect(){},drawImage:(...args)=>draws.push(args)};
 renderer.preload(map);renderer.draw(ctx,map,480,314);renderer.draw(ctx,map,480,314);
 assert.equal(images.length,1);assert.equal(images[0].src,map.asset);
 const [,x,y,w,h]=draws[0];assert.equal(w/h,416/272);assert.ok(x>=0&&y>=0&&x+w<=480&&y+h<=314);
 images[0].complete=false;renderer.draw(ctx,map,480,314);assert.equal(draws.length,2);
 images[0].complete=true;images[0].naturalWidth=0;renderer.draw(ctx,map,480,314);assert.equal(draws.length,2);
});

test('실제 출전은 맵을 한 번 고르고 결과 화면까지 같은 맵과 전투 좌표를 유지한다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),draws=[],moves=[],images=[],elements={};
 const ctx={imageSmoothingEnabled:true,fillRect(){},drawImage:(...a)=>draws.push(a),save(){},restore(){},translate:(...a)=>moves.push(a),fillText(){},strokeText(){}};
 elements['#arena']={width:480,height:314,getContext:()=>ctx};
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
  globalThis.current=()=>battle;globalThis.selections=()=>selections;
 `,c);
 c.$=selector=>elements[selector]??(elements[selector]={});
 vm.runInContext(source.slice(source.indexOf('  function startBattle('),source.indexOf('  function battleTick(')),c);
 vm.runInContext(source.slice(source.indexOf('  function drawArena('),source.indexOf('  // ---------- 그리기 (캔버스) ----------')),c);
 c.startBattle({title:'물을 조정하는 자',match:{id:'m35'},format:1,stage:3,scale:1,prize:0},'일반');
 const battle=c.current(),positions=battle.state.units.map(u=>[u.x,u.y]);
 assert.match(c.modal[1],/height="314"/);assert.equal(battle.map.id,3);
 c.drawArena(0);battle.done=true;c.drawArena(0);
 assert.equal(c.selections(),1);assert.equal(images.length,1);assert.equal(draws.length,2);
 assert.deepEqual(battle.state.units.map(u=>[u.x,u.y]),positions);
 assert.deepEqual(moves,[[0,32],[0,32]]);
});
