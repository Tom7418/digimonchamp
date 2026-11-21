const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
test('사냥13종원본장비의프레임·방향·설치상태와정지시간을유지한다',()=>{
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=100;}});
 for(const f of ['assets/hunt/equipment.js','hunt-equipment.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 const r=c.window.createHuntEquipmentRenderer(),draws=[],ctx={drawImage:(...a)=>draws.push(a)};
 for(const [id,key] of Object.entries({mine1:'smallmine',mine2:'hugemine',trap1:'digicach',trap2:'digiprison',toy1:'decoy',toy2:'decoy2',light1:'digilight',light2:'digilight2'})){
  const a={g:{id},x:100,y:100};assert.equal(r.resource(a),key);r.draw(ctx,a,.1);const frame=draws.at(-1)[1];r.draw(ctx,a,0);assert.equal(draws.at(-1)[1],frame);
 }
 for(const [effect,key] of [['독','niku_poison'],['마비','niku_stun'],['수면','niku_sleep']])assert.equal(r.resource({effect}),key);
 assert.equal(r.resource({big:true}),'niku_big');assert.equal(r.resource({}),'niku_nomal');
 for(const m of Object.values(c.window.HUNT_EQUIPMENT_ART))for(const seq of m.sequences)for(const [frame,hold] of seq.frames){assert.ok(frame>=0&&hold>0);}
 assert.equal(draws.length,16);
});
