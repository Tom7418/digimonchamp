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


test('폭발은 원본36틱을 재생하고 정지·상태전환·마지막프레임을 보존한다',()=>{
 const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=1500;}});
 for(const f of ['assets/hunt/equipment.js','hunt-equipment.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 const r=c.window.createHuntEquipmentRenderer(),frames=[],a={g:{id:'bomb1'},x:30,y:40},ctx={drawImage:(...v)=>frames.push(v[1])};
 assert.equal(r.duration(a,2),.6);r.draw(ctx,a,0,2);const first=frames.at(-1);r.draw(ctx,a,.1,2);assert.notEqual(frames.at(-1),first);
 const paused=frames.at(-1);r.draw(ctx,a,0,2);assert.equal(frames.at(-1),paused);
 r.draw(ctx,a,10,2);const last=frames.at(-1);r.draw(ctx,a,1,2);assert.equal(frames.at(-1),last);
 r.draw(ctx,a,0,0);r.draw(ctx,a,0,2);assert.equal(frames.at(-1),first);
 for(const id of ['bomb1','bomb2','bomb3','bomb4','mine1','mine2'])assert.equal(r.duration({g:{id}},2),.6);
});

test('실제 폭발 이벤트는 원본 도트를 예약하고 기존 범위·피해를 한 번만 적용한다',()=>{
 const src=fs.readFileSync('web/game.js','utf8'),a=src.indexOf('  function blast('),b=src.indexOf('  // 체커 묶음:',a),events=[];
 const hunt={fx:[],wilds:[{x:10,y:15,hp:10},{x:500,y:500,hp:10}]};
 const c=vm.createContext({hunt,huntEquipmentArt:{duration:()=>.6},C:{},itemHit:(w)=>{w.hp-=2;return true},wakeFromSleep(){},applyEffect:(...v)=>events.push(v),huntNote(){}});
 vm.runInContext(src.slice(a,b),c);c.blast(10,0,{id:'mine1',name:'마인',power:50,range:70});
 assert.equal(hunt.fx.length,3);assert.equal(hunt.fx[0].artSequence,2);assert.equal(hunt.fx[0].left,.6);
 assert.equal(hunt.wilds[0].hp,8);assert.equal(hunt.wilds[1].hp,10);assert.equal(events.length,1);
});
