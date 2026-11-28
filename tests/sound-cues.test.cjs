const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');

const inventory=new Set(fs.readFileSync('docs/sound-handoff/sound-inventory.csv','utf8').split(/\r?\n/).slice(1).map(l=>l.split(',')[4]).filter(Boolean));

test('원작 사운드 대응표는 사냥터 16곳·배틀 맵 11곳을 모두 덮고 SDAT 목록의 이름만 쓴다',()=>{
 const c=vm.createContext({window:{}});
 for(const f of ['core.js','sound-cues.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 const cues=c.window.ORIGINAL_SOUND_CUES,fields=vm.runInContext('ChampCore.FIELDS.map(f=>f.id)',c),maps=vm.runInContext('ChampCore.BATTLE_MAPS.map(m=>m.id)',c);
 assert.deepEqual([...Object.keys(cues.huntBgm)].sort(),[...fields].sort());
 assert.equal(cues.battleBgm.length,maps.length);
 const names=[...Object.values(cues.huntBgm),...cues.battleBgm,...Object.values(cues.resultBgm),...Object.values(cues.sceneBgm),...Object.values(cues.effects),...Object.values(cues.loops)];
 vm.runInContext(fs.readFileSync('web/assets/battle/skill-sounds.js','utf8'),c);
 const skill=c.window.BATTLE_SKILL_SOUNDS;
 assert.equal(skill.guard,'BATTLE_SE_067_2');
 assert.ok(Object.keys(skill.hit).length>500&&Object.keys(skill.cast).length>300);
 for(const n of [...Object.values(skill.hit),...Object.values(skill.cast)])assert.ok(inventory.has(n),n);
 for(const n of names)assert.ok(inventory.has(n),n);
 // 같은 곡을 나눠 쓰는 사냥터 (낮·밤 지도 포함 ARM9 0x020CA010)
 assert.equal(cues.huntBgm['다이나 초원'],cues.huntBgm['대초원']);
 assert.notEqual(cues.huntBgm['다이나 초원'],cues.huntBgm['모쥬라의 숲']);
});

function audioWorld(manifest){
 const listeners={},fetched=[],started=[],noop=()=>{};
 const param={value:0,setValueAtTime:noop,exponentialRampToValueAtTime:noop,cancelScheduledValues:noop,setTargetAtTime:noop,linearRampToValueAtTime:noop};
 class Ctx{constructor(){this.state='suspended';this.currentTime=0;this.sampleRate=16000;this.destination={};}
  resume(){this.state='running';this.onstate?.();return Promise.resolve();}
  addEventListener(_,f){this.onstate=f;}
  createGain(){return{gain:{...param},connect:noop,disconnect:noop};}
  createBuffer(_,n){const d=new Float32Array(n);return{getChannelData:()=>d};}
  createOscillator(){return{type:'',frequency:{...param},connect:noop,disconnect:noop,start(){started.push('synth');},stop:noop};}
  createBiquadFilter(){return{type:'',Q:{},frequency:{...param},connect:noop,disconnect:noop};}
  createBufferSource(){const s={connect:noop,disconnect:noop,start(){started.push(s);},stop(){s.stopped=true;}};return s;}
  decodeAudioData(b){return Promise.resolve({name:b.name,duration:window.decodedDuration??100});}}
 const window={AudioContext:Ctx,localStorage:{getItem:()=>null,setItem:noop},ORIGINAL_SOUND_FILES:manifest,
  createHuntAmbience:()=>({set(f){window.ambienceField=f;}}),
  document:{hidden:false,querySelectorAll:()=>[],querySelector:()=>null,addEventListener(t,f){listeners[t]=f;}}};
 const c=vm.createContext({window,fetch:(u)=>{fetched.push(u);return Promise.resolve({ok:true,arrayBuffer:()=>Promise.resolve({name:u})});}});
 for(const f of ['sound-cues.js','assets/battle/skill-sounds.js','game-audio.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 listeners.pointerdown();
 return {S:window.ChampSound,window,fetched,started,flush:()=>new Promise(r=>setTimeout(r,0))};
}

test('음원 목록에 원작 이름이 있으면 합성음 대신 그 파일을 재생하고, 배경곡은 반복·교체·정지한다',async()=>{
 const w=audioWorld({HUNT_SE_039_9:'assets/audio/spread.ogg',SEQ_N_06:'assets/audio/SEQ_N_06.ogg',SEQ_N_12:'assets/audio/SEQ_N_12.ogg',HUNT_LOOP_DRAW_LOOP:'assets/audio/draw.ogg'});
 await w.flush();
 w.S.play('spread');await w.flush();
 assert.deepEqual(w.fetched,['assets/audio/spread.ogg']);
 assert.equal(w.started.filter(x=>x!=='synth').length,1);
 w.S.play('hit');await w.flush(); // 음원이 없는 소리는 합성음
 assert.ok(w.started.includes('synth'));
 // 사냥: 원작 곡 음원이 있으면 합성 환경음을 끄고 곡을 반복한다
 w.S.setHunt('대초원',false);await w.flush();
 const bgm=w.started.at(-1);
 assert.equal(bgm.loop,true);assert.equal(bgm.buffer.name,'assets/audio/SEQ_N_06.ogg');
 assert.ok(!w.window.ambienceField);
 w.S.setHunt('다이나 초원',true);await w.flush(); // 같은 곡이면 이어서 튼다
 assert.equal(w.started.at(-1),bgm);
 w.S.setHunt('기계 공장',false);await w.flush(); // 곡 음원이 없는 사냥터는 합성 환경음
 assert.equal(bgm.stopped,true);assert.equal(w.window.ambienceField,'기계 공장');
 w.S.setHunt(null);
 // 배틀 맵 곡 → 정지
 w.S.setMusic(w.S.cues.battleBgm[10]);await w.flush();
 const dome=w.started.at(-1);assert.equal(dome.buffer.name,'assets/audio/SEQ_N_12.ogg');
 w.S.setMusic(null);assert.equal(dome.stopped,true);
 // 선 긋기 반복음
 w.S.setLoop('draw',true);await w.flush();
 const draw=w.started.at(-1);assert.equal(draw.loop,true);
 w.S.setLoop('draw',false);assert.equal(draw.stopped,true);
});

test('배틀 명중음은 기술 레코드별 원작 이름, 기본 화면·메뉴 창 곡은 우선순위대로 바뀐다',async()=>{
 const sk=JSON.parse(fs.readFileSync('web/assets/battle/skill-sounds.js','utf8').replace(/^window.BATTLE_SKILL_SOUNDS=|;\s*$/g,''));
 const [rec,hitName]=Object.entries(sk.hit)[0];
 const w=audioWorld({[hitName]:'assets/audio/hit.ogg',SEQ_U_06:'assets/audio/farm.ogg',SEQ_U_21:'assets/audio/shop.ogg',SEQ_N_09:'assets/audio/arena.ogg'});
 await w.flush();
 w.S.play('hit',{record:+rec});await w.flush();
 assert.deepEqual(w.fetched,['assets/audio/hit.ogg']);
 w.S.setBase(w.S.cues.sceneBgm.farm);await w.flush();
 const farm=w.started.at(-1);assert.equal(farm.buffer.name,'assets/audio/farm.ogg');
 w.S.setMenu(w.S.cues.sceneBgm.shop);await w.flush();
 assert.equal(farm.stopped,true);const shop=w.started.at(-1);assert.equal(shop.buffer.name,'assets/audio/shop.ogg');
 w.S.setMusic(w.S.cues.battleBgm[0]);await w.flush(); // 배틀이 메뉴 창보다 먼저
 assert.equal(shop.stopped,true);assert.equal(w.started.at(-1).buffer.name,'assets/audio/arena.ogg');
 w.S.setMusic(null);w.S.setMenu(null);await w.flush();
 assert.equal(w.started.at(-1).buffer.name,'assets/audio/farm.ogg');
 w.S.setMenu(w.S.SILENCE);await w.flush(); // 하루 결과 창: 육성 곡을 멈춘다
 assert.equal(w.started.at(-1).stopped,true);
 w.S.setMenu(null);await w.flush();
 assert.equal(w.started.at(-1).buffer.name,'assets/audio/farm.ogg');
 w.S.setHunt('기계 공장');await w.flush(); // 사냥 중엔 육성 곡을 내린다
 assert.equal(w.started.at(-1).stopped,true);
});

test('배포 음원 목록: 대응표의 모든 이름에 MP3가 있고 반복 구간은 원본 길이 안에 있다',()=>{
 const c=vm.createContext({window:{}});
 for(const f of ['sound-cues.js','assets/battle/skill-sounds.js','assets/audio/manifest.js'])vm.runInContext(fs.readFileSync('web/'+f,'utf8'),c);
 const {ORIGINAL_SOUND_CUES:cu,BATTLE_SKILL_SOUNDS:sk,ORIGINAL_SOUND_FILES:F}=c.window;
 const used=[...Object.values(cu.huntBgm),...cu.battleBgm,...Object.values(cu.resultBgm),...Object.values(cu.sceneBgm),...Object.values(cu.effects),...Object.values(cu.loops),...Object.values(sk.hit),...Object.values(sk.cast),sk.guard];
 for(const n of used)assert.ok(F[n],n);
 for(const [n,e] of Object.entries(F)){
  assert.ok(inventory.has(n),n);
  assert.ok(fs.statSync('web/'+e.src).size>0,e.src);
  if(e.loop)assert.ok(e.loop[0]>=0&&e.loop[0]<e.loop[1]&&e.loop[1]<=e.dur+1e-3,n);
 }
 // 배경곡은 첫 곡(오프닝 SEQ_N_00)만 반복하지 않는다. 사냥 선 긋기는 반복음
 assert.deepEqual(Object.keys(F).filter(n=>n.startsWith('SEQ_')&&!F[n].loop),['SEQ_N_00']);
 assert.ok(F.HUNT_LOOP_DRAW_LOOP.loop);
});

test('반복 구간이 있는 곡은 그 구간만 반복하고, 반복 없는 곡은 한 번만 튼다',async()=>{
 const w=audioWorld({SEQ_U_06:{src:'assets/audio/SEQ_U_06.mp3',dur:110.333,loop:[55.007,110.02]},SEQ_N_00:{src:'assets/audio/SEQ_N_00.mp3',dur:34.9247},SEQ_U_21:{src:'assets/audio/SEQ_U_21.mp3',dur:52.997,loop:[26.485,52.976]}});
 w.window.decodedDuration=110.333;
 await w.flush();
 w.S.setBase('SEQ_U_06');await w.flush();
 const farm=w.started.at(-1);
 assert.equal(farm.loop,true);assert.equal(farm.loopStart,55.007);assert.equal(farm.loopEnd,110.02);
 w.S.setMusic('SEQ_N_00');await w.flush();
 assert.equal(w.started.at(-1).loop,false);
 // MP3 앞 공백을 남기는 디코더(원본보다 길다)면 반복 지점을 그만큼 민다
 w.window.decodedDuration=52.997+0.06;
 w.S.setMusic('SEQ_U_21');await w.flush();
 const shop=w.started.at(-1);
 assert.ok(Math.abs(shop.loopStart-(26.485+1105/32000))<1e-9);
});
