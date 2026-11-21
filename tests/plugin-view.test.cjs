const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{}});for(const f of ['core.js','plugin-view.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);const C=c.ChampCore,save=C.freshSave(0);return {c,C,save,render:()=>c.window.pluginLoadoutHtml(C,save,String)};}
test('실제 보유플러그인만 분류별 표시하고 빈슬롯·효과를 안내한다',()=>{
 const s=setup();s.save.plugins=['an_stage','ck_shot','ra_dragon','memory'];s.save.pluginLoadout=[];const html=s.render();
 assert.equal((html.match(/class="plugin-empty"/g)||[]).length,s.C.pluginSlots(s.save));
 assert.match(html,/미니맵 탐지: 용/);assert.match(html,/확인: 세대/);assert.match(html,/남은 수량: 샷/);assert.match(html,/plugin_3.png/);assert.doesNotMatch(html,/data-plugin="an_o"/);
});
test('장비칸이 가득 차도 장착된 항목은 해제 가능하며 미장착만 비활성화한다',()=>{
 const s=setup();s.save.plugins=['an_stage','ck_shot','memory'];s.save.pluginLoadout=['an_stage','ck_shot'];const html=s.render();
 assert.match(html,/data-plugin="memory"[^>]+disabled/);assert.doesNotMatch(html,/data-plugin="an_stage"[^>]+disabled/);assert.match(html,/aria-pressed="true"/);assert.match(html,/2\/2칸/);
});
test('모든 원본플러그인을 표시해도 저장을 바꾸지 않고 실제해제·장착결과를 반영한다',()=>{
 const s=setup();s.save.plugins=s.C.PLUGINS.map(p=>p.id);s.save.pluginLoadout=['an_stage','ck_shot'];const before=JSON.stringify(s.save);s.render();assert.equal(JSON.stringify(s.save),before);
 Object.assign(s.save,s.C.togglePlugin(s.save,'an_stage'));assert.match(s.render(),/1\/2칸/);
 Object.assign(s.save,s.C.togglePlugin(s.save,'memory'));const html=s.render();assert.match(html,/2\/2칸/);assert.match(html,/data-plugin="memory"[^>]+aria-pressed="true"/);
});
