const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(dpr=2){
 const rendered=[],baseCalls=[],overlay={style:{},setAttribute(){},getContext:()=>dst};
 const dst={setTransform:(...x)=>rendered.push(['matrix',...x]),clearRect:(...x)=>rendered.push(['clear',...x]),fillText:(...x)=>rendered.push(['fill',...x]),strokeText:(...x)=>rendered.push(['stroke',...x])};
 const parent={style:{},clientLeft:0,clientTop:0,scrollLeft:0,scrollTop:0,appendChild(c){this.child=c;},getBoundingClientRect:()=>({left:10,top:20})};
 const canvas={width:416,height:272,parentElement:parent,getBoundingClientRect:()=>({left:10,top:60,width:832,height:544})};
 const ctx={canvas,font:'bold 10px sans-serif',globalAlpha:1,textAlign:'center',textBaseline:'alphabetic',fillStyle:'#fff',strokeStyle:'#123',lineWidth:2,
  getTransform:()=>({a:2,b:0,c:0,d:2,e:-40,f:10}),fillText:(...x)=>baseCalls.push(x),strokeText:(...x)=>baseCalls.push(x),fillRect(){},measureText(text){return {width:text.length*10,font:this.font};}};
 const c=vm.createContext({window:{devicePixelRatio:dpr},document:{createElement:()=>overlay},getComputedStyle:el=>el===parent?{position:'static'}:{borderLeftWidth:'0',borderRightWidth:'0',borderTopWidth:'0',borderBottomWidth:'0'}});
 vm.runInContext(fs.readFileSync('web/hd-text.js','utf8'),c);return {api:c.window.HDText,ctx,overlay,rendered,baseCalls,dst};
}
test('HD 글자는 화면 크기와 DPR에 맞추고 원래 게임 좌표·캔버스 크기를 바꾸지 않는다',()=>{
 const s=setup();s.api.begin(s.ctx);s.ctx.fillText('헤비 버너',70,100);s.api.end(s.ctx);
 assert.equal(s.ctx.canvas.width,416);assert.equal(s.ctx.canvas.height,272);assert.equal(s.overlay.width,1664);assert.equal(s.overlay.height,1088);assert.equal(s.overlay.style.pointerEvents,'none');
 assert.ok(s.rendered.some(x=>JSON.stringify(x)===JSON.stringify(['matrix',8,0,0,8,-160,40])));assert.equal(s.baseCalls.length,0);assert.match(s.dst.font,/Championship HD/);
});
test('다음 프레임에 남은 글자를 지우고 HUD 덮개의 순서와 외곽선을 유지한다',()=>{
 const s=setup();s.api.begin(s.ctx);s.ctx.fillText('이전 이름',10,10);s.ctx.fillRect(0,0,416,30);s.ctx.strokeText('현재 이름',20,20);s.ctx.fillText('현재 이름',20,20);s.api.end(s.ctx);
 assert.deepEqual(s.rendered.filter(x=>['fill','stroke','clear'].includes(x[0])).map(x=>x[0]),['clear','fill','clear','stroke','fill']);
 s.rendered.length=0;s.api.begin(s.ctx);s.ctx.fillText('다음',1,2);s.api.end(s.ctx);assert.equal(s.rendered.filter(x=>x[0]==='fill').length,1);assert.equal(s.rendered.find(x=>x[0]==='fill')[1],'다음');
 s.ctx.fillText('프레임 밖',0,0);assert.equal(s.baseCalls.length,1);
});
test('글자 폭도 같은 HD 글꼴로 측정하며 보이지 않는 캔버스는 레이어를 숨긴다',()=>{
 const s=setup(1);s.api.begin(s.ctx);const before=s.ctx.font,result=s.ctx.measureText('디지몬');assert.match(result.font,/Championship HD/);assert.equal(s.ctx.font,before);
 s.ctx.canvas.getBoundingClientRect=()=>({left:0,top:0,width:0,height:0});s.api.end(s.ctx);assert.equal(s.overlay.hidden,true);
});
