const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const noop=()=>{}, node={classList:{toggle:noop},querySelector:()=>({}),querySelectorAll:()=>[]};
 const events={},canvas={style:{},closest:()=>({after:noop}),addEventListener:(k,f)=>events[k]=f,
   getBoundingClientRect:()=>({left:0,top:0,width:960,height:560}),setPointerCapture:noop};
 const window={CageLayout:{types:{},restore:x=>x,at:()=>null}};
 const state={layoutVersion:2,layout:[],team:[]};
 vm.runInNewContext(fs.readFileSync('web/cage-editor.js','utf8'),{window,document:{createElement:()=>node},Image:function(){}});
 return {board:window.createCageEditor(canvas,()=>state,noop,noop,()=>false),canvas,events};
}
test('wheel zoom keeps cursor world point and drag uses zoom adjusted world distance',()=>{
 const {board,canvas,events}=setup();board.centerOn(1000,600);
 const e={clientX:480,clientY:280,deltaY:-400,preventDefault(){}};
 const before=board.toWorld(e);events.wheel(e);
 assert.ok(board.zoom>1);assert.ok(Math.abs(board.toWorld(e).x-before.x)<1e-8);
 assert.ok(Math.abs(board.toWorld(e).y-before.y)<1e-8);
 const x=board.cam.x;
 canvas.onpointerdown({...e,pointerId:1});
 canvas.onpointermove({...e,clientX:580});
 assert.ok(Math.abs(board.cam.x-(x-100/board.zoom))<1e-8);
 canvas.onpointerup(e);
});
test('zoom and camera remain bounded at extreme wheel deltas',()=>{
 const {board,events}=setup(),e={clientX:480,clientY:280,preventDefault(){}};
 events.wheel({...e,deltaY:100000});assert.equal(board.zoom,0.5);
 assert.ok(board.cam.x>=0&&board.cam.y>=0);
 events.wheel({...e,deltaY:-100000});assert.equal(board.zoom,2.5);
 assert.ok(board.cam.x<=board.world.w-board.view.w/board.zoom);
});
