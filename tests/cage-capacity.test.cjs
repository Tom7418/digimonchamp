const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('기본을제외한화면정원·엔진정원은원본실행표와같다',()=>{
 const c=vm.createContext({window:{}});for(const f of ['core.js','cage-layout.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 const audit=JSON.parse(fs.readFileSync('docs/cage-capacity-audit.json','utf8'));assert.equal(audit.codeFacilities.length,37);
 for(const row of audit.codeFacilities){assert.equal(row.capacity,row.mask.toString(2).replace(/0/g,'').length*2);
  const cage=c.ChampCore.CAGES.find(t=>t.no===row.facilityNo);if(cage)assert.equal(cage.capacity,row.capacity,cage.id);
 }
 for(const [id,t] of Object.entries(c.window.CageLayout.types))if(id!=='free')assert.equal(t.capacity,c.ChampCore.getCage(t.core).capacity,t.name);
 assert.equal(c.ChampCore.getCage('기본 케이지').capacity,99);
});
