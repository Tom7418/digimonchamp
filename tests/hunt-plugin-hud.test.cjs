const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=256;}});
 for(const f of ['web/assets/hunt/plugin-hud.js','web/hunt-plugin-hud.js'])vm.runInContext(fs.readFileSync(f,'utf8'),c);
 const draws=[],ctx={save(){},restore(){},fillRect(){},drawImage:(...v)=>draws.push(v)};
 return {c,r:c.window.createHuntPluginHud(),ctx,draws,data:c.window.HUNT_PLUGIN_ART};
}
test('레이더는 탐지 대상과 묶인 개체만 원본 점으로 표시하고 사라진 개체는 숨긴다',()=>{
 const {r,ctx,draws,data}=setup(),h={size:{w:1024,h:1024},map:{complete:true,naturalWidth:1024},cam:{x:100,y:200},zoom:2,plug:{onRadar:s=>s.attr==='백신'},wilds:[{id:'seen',x:300,y:400},{id:'hidden',x:500,y:600},{id:'bound',x:700,y:800,bound:1},{id:'gone',x:100,y:100,gone:true}]},before=JSON.stringify(h);
 r.radar(ctx,h,{x:800,y:400,w:150,h:150,k:150/1024},id=>({attr:id==='seen'||id==='gone'?'백신':'바이러스'}));
 const glyphs=draws.filter(v=>v[0].src?.endsWith('plugin-hud.png'));assert.equal(glyphs.length,3);assert.equal(glyphs[0][1],data.cells[2].x);assert.equal(glyphs[1][1],data.cells[1].x);assert.equal(glyphs[2][1],data.cells[0].x);
 assert.equal(JSON.stringify(h),before);assert.equal(data.marker.loop,false);
});
test('속성 네 종류는 원본 Va/Vi/Da/Fr 셀을 쓰며 미확인 속성을 임의 그림으로 바꾸지 않는다',()=>{
 const {r,ctx,draws,data}=setup();
 for(const [name,id] of [['백신',23],['바이러스',24],['데이터',25],['프리',26]]){assert.equal(r.attribute(ctx,name,20,30),true);assert.equal(draws.at(-1)[1],data.cells[id].x);assert.equal(draws.at(-1)[2],data.cells[id].y);}
 const n=draws.length;assert.equal(r.attribute(ctx,'미확인',20,30),false);assert.equal(draws.length,n);
});
test('메모리 체커는 포획 용량 변화와 0·세 자리 숫자를 원본 숫자/G/나눔 셀로 표시한다',()=>{
 const {r,ctx,draws,data}=setup(),count=(current,max)=>{draws.length=0;const box=r.memory(ctx,current,max);assert.ok(box.x>=0&&box.x+box.width<=960);return draws.length;};
 assert.equal(count(0,96),6);assert.equal(draws[0][1],data.cells[4].x);
 assert.equal(count(32,96),7);assert.equal(draws[0][1],data.cells[7].x);
 assert.equal(count(100,128),9);assert.equal(draws.at(-1)[1],data.cells[data.g].x);
});
test('실제 장착 검사를 통과한 레이더만 지도를 열고 지도 터치는 월드 좌표로 이동한다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),c=vm.createContext({window:{},hunt:{size:{w:1024,h:768},cam:{x:0,y:0},zoom:2,trail:[{x:1,y:2}]},screenPoint:e=>e,canvas:{setPointerCapture(){},getBoundingClientRect(){}},centers:[]});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),c);vm.runInContext('globalThis.C=ChampCore;globalThis.save=C.freshSave(0);globalThis.huntCenter=(x,y)=>centers.push([x,y]);',c);
 const start=source.indexOf('  function huntPanPointer('),end=source.indexOf('  function huntWheel(',start);vm.runInContext(source.slice(start,end),c);
 assert.equal(c.huntMinimapBox(),null);c.save.plugins=['gen_a'];assert.equal(c.huntMinimapBox(),null);c.save.pluginLoadout=['gen_a'];const mm=c.huntMinimapBox();assert.ok(mm.w>0&&mm.h>0);
 assert.equal(c.huntPanPointer('down',{x:mm.x+mm.w/2,y:mm.y+mm.h/2}),true);assert.deepEqual(Array.from(c.centers[0]),[512,384]);assert.equal(c.hunt.trail.length,1);
 c.huntPanPointer('up',{x:mm.x,y:mm.y});assert.equal(c.hunt.pan,null);
 c.save.plugins=[];assert.equal(c.huntMinimapBox(),null);c.hunt=null;assert.equal(c.huntMinimapBox(),null);
});


test('분석 상세는 화면 안 한 마리에 집중하고 포인터·로프·포획 종료를 따른다',()=>{
 const source=fs.readFileSync('web/game.js','utf8'),a={x:200,y:200},b={x:300,y:200},hidden={x:2000,y:200},c=vm.createContext({hunt:{wilds:[a,b,hidden],cam:{x:0,y:0},zoom:1,inspectWild:b}});
 const start=source.indexOf('  function huntAnalysisTarget('),end=source.indexOf('  function drawHuntMinimap(',start);vm.runInContext(source.slice(start,end),c);
 assert.equal(c.huntAnalysisTarget(),b);c.hunt.pull={w:a};assert.equal(c.huntAnalysisTarget(),a);a.gone=true;assert.equal(c.huntAnalysisTarget(),b);b.gone=true;assert.equal(c.huntAnalysisTarget(),null);
 a.gone=false;c.hunt.wilds=[a,hidden];c.hunt.inspectWild=hidden;assert.equal(c.huntAnalysisTarget(),a);
});
