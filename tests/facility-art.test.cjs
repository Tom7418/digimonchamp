const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('facility art uses hex assets and remains clipped at every rotation',()=>{
 for(const kind of ['clinic','cm02','cm04','free','field','cm03'])for(let rotation=0;rotation<6;rotation++){
  const noop=()=>{}, toolbar={classList:{toggle:noop},querySelector:()=>({}),querySelectorAll:()=>[]};
  const window={},images=[];
  function Image(){this.complete=true;this.naturalWidth=kind==='field'?208:104;this.naturalHeight=kind==='field'?210:120;images.push(this);}
  const sandbox=vm.createContext({window,Image,document:{createElement:()=>toolbar}});
  for(const name of ['cage-layout.js','cage-editor.js'])vm.runInContext(fs.readFileSync('web/'+name,'utf8'),sandbox);
  const canvas={style:{},closest:()=>({after:noop}),addEventListener:noop};
  const state={layoutVersion:4,layout:[{id:'a',kind,q:2,r:2,rotation}],team:[]};
  const board=window.createCageEditor(canvas,()=>state,noop,noop,()=>false);
  let clipped=false;const stack=[],draws=[];
  const ctx=new Proxy({save(){stack.push(clipped);},restore(){clipped=stack.pop();},clip(){clipped=true;},
    drawImage(im,...args){draws.push({src:im.src,args,clipped});}}, {get:(t,p)=>p in t?t[p]:noop});
  board.draw(ctx);
  assert.equal(draws.length,1);assert.equal(draws[0].clipped,true);
  assert.equal(clipped,false);
  assert.equal(draws[0].src,'assets/facilities/'+{clinic:'clinic-hex',cm02:'cm02-hex',cm04:'cm04-hex',free:'free-hex',field:'field-hex',cm03:'cm03-hex'}[kind]+'.png');
  assert.ok(draws[0].args[6]>0&&draws[0].args[7]>0);
 }
});
