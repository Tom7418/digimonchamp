const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {createHash}=require('node:crypto');

test('열여섯 사냥터의 환경음은 서로 다르고 야간 교체와 퇴장 시 기존 루프를 정리한다',()=>{
 const c=vm.createContext({window:{}});
 for(const file of ['core.js','hunt-audio.js'])vm.runInContext(fs.readFileSync('web/'+file,'utf8'),c);
 const sources=[];
 const noop=()=>{};
 const context={
  currentTime:0,
  createBuffer(channels, length, rate){
   assert.equal(channels,1);assert.equal(rate,16000);
   const pcm=new Float32Array(length);
   return {pcm,getChannelData:()=>pcm};
  },
  createGain:()=>({gain:{setValueAtTime:noop,linearRampToValueAtTime:noop,cancelScheduledValues:noop},connect:noop,disconnect:noop}),
  createBufferSource(){
   const source={connect:noop,disconnect:noop,start:noop,stop(time){this.stoppedAt=time;}};
   sources.push(source);return source;
  },
 };
 const ambience=c.window.createHuntAmbience(context,{});
 const fieldNames=vm.runInContext('ChampCore.FIELDS.map(field=>field.id)',c);
 function fingerprint(buffer){
  const pcm=buffer.pcm;
  assert.equal(Math.abs(pcm[0]),0);
  assert.ok(pcm.some(sample=>Math.abs(sample)>.04));
  return createHash('sha256').update(Buffer.from(pcm.buffer)).digest('hex');
 }
 for(const field of fieldNames){
  ambience.set(field);
  ambience.set(field); // 프레임마다 동일한 장면을 받아도 루프를 다시 시작하지 않는다.
  context.currentTime++;
 }
 assert.equal(sources.length,16);
 assert.equal(new Set(sources.map(source=>fingerprint(source.buffer))).size,16);
 assert.equal(sources.every(source=>source.loop),true);
 const previous=sources.at(-1);
 ambience.set(fieldNames.at(-1),true);
 assert.notEqual(fingerprint(sources.at(-1).buffer),fingerprint(previous.buffer));
 assert.equal(previous.stoppedAt,context.currentTime+.2);
 const night=sources.at(-1);
 context.currentTime++;
 ambience.set(null);
 ambience.set(null);
 assert.equal(night.stoppedAt,context.currentTime+.2);
 assert.equal(sources.length,17);
});

test('실제 게임 프레임이 현재 사냥터, 야간, 일시 정지를 환경음에 전달한다',()=>{
 const source=fs.readFileSync('web/game.js','utf8').replaceAll('\r\n','\n');
 const start=source.indexOf('  function frame(now)');
 const frame=source.slice(start,source.indexOf("  document.addEventListener('visibilitychange',",start));
 const night=source.match(/  function huntUsesNightMap\(field\) \{[\s\S]*?\n  \}/)[0];
 const hour=source.match(/  const huntIsNight = .*?;/)[0];
 const calls=[],noop=()=>{},c=vm.createContext({
  window:{},document:{hidden:false},ChampSound:{setHunt:(...args)=>calls.push(args)},
  titleOpen:false,battle:null,paused:false,board:{editing:false},mailOpen:false,dayEnding:false,selectedItem:null,
  lastTime:1,speed:1,clock:0,hunt:{field:{id:'다이나 초원'}},huntTick:noop,drawHunt:noop,drawPortrait:noop,requestAnimationFrame:noop,
 });
 vm.runInContext(fs.readFileSync('web/core.js','utf8'),c);
 vm.runInContext(`const C=ChampCore,MINUTES_PER_SECOND=C.MINUTES_PER_SECOND,HUNT_MAP=C.HUNT_MAP;
  const HUNT_NO_NIGHT=['09','10','11'];globalThis.save={clock:17*60};`+hour+night+frame,c);
 c.frame(17);
 c.save.clock=18*60;
 c.frame(33);
 c.hunt.field.id='크롬 광산';
 c.frame(49);
 c.paused=true;
 c.frame(65);
 assert.deepEqual(calls,[['다이나 초원',false],['다이나 초원',true],['크롬 광산',false],[null,false]]);
});
