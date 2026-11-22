const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{}});for(const path of ['web/core.js','web/assets/hunt/item-ui.js','web/hunt-item-view.js'])vm.runInContext(fs.readFileSync(path,'utf8'),c);return {C:c.ChampCore,view:c.window.huntItemLoadoutHtml,art:c.window.HUNT_ITEM_UI};}
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
test('보유 아이템이 없어도 5개 빈 장비 칸을 표시하고 저장을 변경하지 않는다',()=>{
 const {C,view}=setup(),save={...C.freshSave(0),gear:{},huntItems:[]},before=JSON.stringify(save),html=view(C,save,esc);
 assert.equal((html.match(/번 빈 장비 칸/g)||[]).length,5);assert.match(html,/0\/5칸/);assert.match(html,/가진 사냥 아이템이 없습니다/);assert.equal(JSON.stringify(save),before);
});
test('원본 아이템 표의 33종 모두 전용 아이콘에 연결하고 긴 라이플의 원래 비율을 유지한다',()=>{
 const {C,view,art}=setup(),all=[...C.SHOTS,...C.BAITS,...C.GEARS];assert.equal(all.length,33);
 for(const x of all){assert.ok(art.icons[x.id],x.id);const a=art.icons[x.id];assert.ok(a.x>=0&&a.x+16<=art.sheet.width&&a.y+32<=art.sheet.height);}
 const save={...C.freshSave(0),gear:Object.fromEntries(all.map(x=>[x.id,2])),huntItems:[]},html=view(C,save,esc);
 assert.equal((html.match(/class="hunt-item-icon"/g)||[]).length,33);assert.equal((html.match(/class="hunt-item-group"/g)||[]).length,8);
 assert.equal(art.icons.sleep2.cell,17);assert.equal(art.icons.trap2.cell,45);assert.match(html,/background-position:-416px -0px/);
});
test('장착 순서·수량0 슬롯·5칸 제한을 기존 엔진 결과대로 보여 주며 해제는 계속 가능하다',()=>{
 const {C,view}=setup(),ids=['bomb1','bait1','sleep2','wire2','trap2'];
 const save={...C.freshSave(0),gear:Object.fromEntries([...ids,'light1'].map(x=>[x,x==='bomb1'?0:3])),huntItems:ids},html=view(C,save,esc);
 assert.match(html,/5\/5칸/);assert.match(html,/hunt-item-slot active depleted/);assert.match(html,/소진/);
 const rack=html.split('class="hunt-item-rack">')[1].split('</div><p class="hint">')[0];
 assert.deepEqual([...rack.matchAll(/data-hunt-item="([^"]+)"/g)].map(m=>m[1]),ids);
 assert.match(html,/data-hunt-item="light1"[^>]* disabled/);assert.doesNotMatch(rack,/ disabled/);
 const next=C.toggleHuntItem(save,'bomb1');assert.equal(C.huntItems(next).length,4);assert.doesNotMatch(view(C,next,esc),/data-hunt-item="light1"[^>]* disabled/);
});
test('한글 이름은 HTML을 이스케이프하고 장비 그림/뷰는 아이템 효과를 바꾸지 않는다',()=>{
 const {C,view}=setup(),fake={...C,SHOTS:[{id:'hand1',name:'<"이름>'}],BAITS:[],GEARS:[]};
 const save={...C.freshSave(0),gear:{hand1:10},huntItems:['hand1']},before=JSON.stringify(save),html=view(fake,save,esc);
 assert.match(html,/&lt;&quot;이름>/);assert.equal(JSON.stringify(save),before);assert.doesNotMatch(html,/<canvas|onerror=/);
});



test('사냥 HUD는 출발 순서대로 5칸을 표시하고 소진한 칸을 당기거나 바꾸지 않는다',()=>{
 const {C,art}=setup(),c=vm.createContext({window:{HUNT_ITEM_UI:art}});vm.runInContext(fs.readFileSync('web/hunt-item-view.js','utf8'),c);
 const save={gear:{bomb1:0,hand1:12,wire2:3}},hunt={items:['bomb1','hand1','wire2'],tool:'gear',plug:{check:new Set()}};
 const html=c.window.huntItemHudHtml(C,save,hunt,'bomb1',esc),slots=[...html.matchAll(/data-hunt-gear="([^"]*)"/g)].map(m=>m[1]);
 assert.deepEqual(slots,['bomb1','hand1','wire2','','']);assert.match(html,/hunt-hud-slot active[^>]*data-hunt-gear="bomb1"[^>]* disabled/);assert.match(html,/모두 사용했습니다/);
 assert.equal((html.match(/class="hunt-item-icon"/g)||[]).length,2);assert.equal((html.match(/aria-keyshortcuts=/g)||[]).length,5);
});
test('체커가 없는 수량은 사냥 HUD의 화면·툴팁·접근성 이름 어디에도 드러나지 않는다',()=>{
 const {C,art}=setup(),c=vm.createContext({window:{HUNT_ITEM_UI:art}});vm.runInContext(fs.readFileSync('web/hunt-item-view.js','utf8'),c);
 const save={gear:{hand1:12,bomb1:7}},hunt={items:['hand1','bomb1'],tool:'rope',plug:{check:new Set()}};
 let html=c.window.huntItemHudHtml(C,save,hunt,'hand1',esc);assert.doesNotMatch(html,/12개|7개|×12|×7|aria-pressed="true"/);
 hunt.plug.check.add('shot');html=c.window.huntItemHudHtml(C,save,hunt,'hand1',esc);assert.match(html,/12개/);assert.match(html,/×12/);assert.doesNotMatch(html,/7개|×7/);
 hunt.plug.check.add('damage');assert.match(c.window.huntItemHudHtml(C,save,hunt,'hand1',esc),/×7/);
});
test('실제 장비 선택/소진 갱신은 다른 아이템을 자동 선택하지 않고 미완료 와이어를 취소한다',()=>{
 const nodes={'#gear-select':{value:'',innerHTML:''}},noop=()=>{},c=vm.createContext({window:{},esc,$:id=>nodes[id]??={classList:{toggle:noop}},setHtml:(id,html)=>(nodes[id]??={}).html=html});
 for(const file of ['web/core.js','web/assets/hunt/item-ui.js','web/hunt-item-view.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 vm.runInContext(`globalThis.C=ChampCore;globalThis.GEAR=[...C.SHOTS,...C.BAITS,...C.GEARS];globalThis.save={gear:{hand1:1,bomb1:2,wire2:3,light1:4}};globalThis.hunt={items:['bomb1','hand1','wire2'],tool:'rope',plug:{check:new Set()},drawing:true,trail:[1,2],pull:{},pan:{},lastScreen:{}};globalThis.checkKind=x=>C.shotOf(x.id)?'shot':x.kind==='wire'?'wire':'damage';`,c);
 c.window.renderHuntItemHud=(node,html)=>node.html=html;
 const src=fs.readFileSync('web/game.js','utf8');vm.runInContext(src.slice(src.indexOf('  function setTool('),src.indexOf('  // 사냥 장비(샷')),c);
 vm.runInContext(src.slice(src.indexOf('  function refreshGear()'),src.indexOf('  // 장비 사용:')),c);
 c.refreshGear();assert.equal(nodes['#gear-select'].value,'bomb1');assert.equal(c.selectHuntGear('hand1'),true);assert.equal(c.hunt.tool,'gear');assert.equal(c.hunt.drawing,false);assert.equal(c.hunt.trail.length,0);
 c.save.gear.hand1=0;c.refreshGear();assert.equal(nodes['#gear-select'].value,'hand1');assert.equal(c.save.gear.bomb1,2);assert.equal(c.selectHuntGear('light1'),false);assert.equal(c.selectHuntGear('hand1'),false);
 c.setTool('rope');assert.doesNotMatch(nodes['#hunt-item-hud'].html,/aria-pressed="true"/);
});


test('첨부 원본 셔터의 2~6 셀과 원래 아이콘 비율을 보존한다',()=>{
 const {art}=setup();assert.deepEqual(Array.from(art.shutter.cells),[2,3,4,5,6]);assert.deepEqual(Array.from(art.shutter.sourceTicks),[2,2,2,2,2]);assert.equal(art.shutter.durationMs,500);
 const png=fs.readFileSync('web/assets/hunt/item-shutter.png');assert.equal(png.readUInt32BE(16),120);assert.equal(png.readUInt32BE(20),16);assert.equal(art.icons.sleep2.height,32);assert.equal(art.icons.hand1.height,16);
});
test('소진 셔터는 한 번만 시작하고 닫히는 동안 아이콘을 유지한 뒤 제거한다',async()=>{
 const {art}=setup(),c=vm.createContext({window:{HUNT_ITEM_UI:art}});vm.runInContext(fs.readFileSync('web/hunt-item-view.js','utf8'),c);
 let finish,removed=0,calls=0,frames,options;const animation={finished:new Promise(resolve=>finish=resolve)};
 const shutter={hidden:true,animate:(f,o)=>{calls++;frames=f;options=o;return animation;}},icon={dataset:{},querySelector:s=>s==='.hunt-shutter'?shutter:{remove:()=>removed++}};
 c.window.playHuntShutter(icon);c.window.playHuntShutter(icon);
 assert.equal(calls,1);assert.equal(shutter.hidden,false);assert.equal(icon.dataset.closed,'true');assert.equal(removed,0);assert.equal(options.duration,500);assert.equal(frames[0].backgroundPosition,'-0px 0px');assert.equal(frames.at(-1).backgroundPosition,'-192px 0px');
 finish();await Promise.resolve();assert.equal(removed,1);
});
test('모션 감소 설정에서는 즉시 닫으며 사냥 종료는 진행 중 셔터를 정리한다',()=>{
 const {art}=setup(),c=vm.createContext({window:{HUNT_ITEM_UI:art,matchMedia:()=>({matches:true})}});vm.runInContext(fs.readFileSync('web/hunt-item-view.js','utf8'),c);
 let removed=0,animated=0,cancelled=0,cleared=0;const shutter={hidden:true,animate:()=>animated++},icon={dataset:{},querySelector:s=>s==='.hunt-shutter'?shutter:{remove:()=>removed++}};
 c.window.playHuntShutter(icon);assert.equal(animated,0);assert.equal(removed,1);assert.equal(shutter.hidden,false);
 c.window.resetHuntItemHud({getAnimations:()=>[{cancel:()=>cancelled++}],replaceChildren:()=>cleared++});assert.equal(cancelled,1);assert.equal(cleared,1);
});
