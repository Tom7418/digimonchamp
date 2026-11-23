const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{}});for(const f of ['core.js','assets/dex/portraits.js','dex-view.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);const C=c.ChampCore,save=C.freshSave(0);return {c,C,save,render:n=>c.window.dexViewHtml(C,save,n,String)};}
test('원본216종 전용도감그림이실제도감의각종ID와맞고범위를벗어나지않는다',()=>{
 const s=setup(),art=s.c.window.DEX_ART;assert.equal(Object.keys(art.entries).length,216);
 for(const e of s.C.dexEntries(s.save)){const m=art.entries[e.id];assert.ok(m,e.id);assert.ok(m.index>=0&&m.index<216);assert.ok(m.width<=96&&m.height<=80);}
});
test('등록한종만원본도트·이름·기술을표시하고미등록정보를숨긴다',()=>{
 const s=setup();s.save.seen=['아구몬'];const html=s.render(null);assert.match(html,/아구몬/);assert.match(html,/헤비 플레임/);assert.doesNotMatch(html,/토이아구몬/);
 assert.equal((html.match(/data-dex=/g)||[]).length,216);assert.equal((html.match(/ disabled/g)||[]).length,215);assert.equal((html.match(/class="dex-unknown"/g)||[]).length,215);
 assert.doesNotMatch(html,/dex-unknown[^>]*>\?/);
});
test('등록종선택으로상세정보를바꾸며열람은등록상태를변경하지않는다',()=>{
 const s=setup();s.save.seen=['아구몬','가루다몬'];const row=s.C.dexEntries(s.save).find(e=>e.id==='가루다몬'),before=JSON.stringify(s.save),html=s.render(row.no);
 assert.match(html,/쉐도우 윙/);assert.match(html,/dex-original-stage/);assert.equal(JSON.stringify(s.save),before);
});
