const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const window={},node={},messages=[];
 const ctx=vm.createContext({window,toast:x=>messages.push(x),$:()=>node,esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),showModal:(title,html)=>messages.push({title,html})});
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),ctx);
 vm.runInContext(`const C=ChampCore;const save=C.freshSave(0);save.clock=10*1440+8*60;
 const L={types:{gym:{core:'체육관',name:'체육관'},volcano:{core:'화산',name:'화산'}}};
 const view={selected:0,team:[{cageId:'gym'}],layout:[{id:'gym',kind:'gym'},{id:'volcano',kind:'volcano'}]};`,ctx);
 const source=fs.readFileSync('web/game.js','utf8'),a=source.indexOf('  function trainingMenu('),b=source.indexOf('  function shopMenu(',a);
 assert.ok(a>0&&b>a);vm.runInContext(source.slice(a,b)+';globalThis.openTraining=trainingMenu',ctx);
 return {ctx,node,messages};
}
test('선택 디지몬의 시설부터 안내를 열고 다른 시설로 바꿔도 게임 저장은 변경되지 않는다',()=>{
 const s=setup(),before=vm.runInContext('JSON.stringify({save,view})',s.ctx);s.ctx.openTraining();
 assert.match(s.messages[0].html,/<option value="gym" selected>/);assert.match(s.messages[0].html,/원본 시설 결과표/);assert.match(s.messages[0].html,/발생 비율/);
 assert.match(s.messages[0].html,/여름/);s.node.onchange({target:{value:'volcano'}});
 assert.match(s.messages[1].html,/<option value="volcano" selected>/);assert.match(s.messages[1].html,/용 수치/);
 assert.equal(vm.runInContext('JSON.stringify({save,view})',s.ctx),before);
});
test('설치 시설이 없으면 빈 표를 열지 않으며 훈련 안내 버튼이 실제 화면에 연결된다',()=>{
 const s=setup();vm.runInContext('view.layout=[]',s.ctx);s.ctx.openTraining();assert.equal(s.messages[0],'설치된 케이지가 없습니다.');
 assert.match(fs.readFileSync('web/index.html','utf8'),/id="training-info"/);
 assert.match(fs.readFileSync('web/game.js','utf8'),/training-info.*onclick=.*trainingMenu/);
});
