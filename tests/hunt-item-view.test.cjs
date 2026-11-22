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

