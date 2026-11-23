const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const c=vm.createContext({window:{},Image:function(){this.complete=true;this.naturalWidth=2048;}});for(const p of ['assets/battle/skill-effects.js','assets/battle/lob-effects.js','skill-effects-player.js'])vm.runInContext(fs.readFileSync('web/'+p,'utf8'),c);return {data:c.window.BATTLE_SKILL_EFFECTS,lobs:c.window.BATTLE_LOB_EFFECTS,fx:c.window.createBattleSkillEffects()};}
const units=()=>[{id:0,x:40,y:90,hp:100,alive:true},{id:1,x:180,y:100,hp:0,alive:false}];
const event=record=>({type:'hit',special:true,from:0,to:1,skill:{record},damage:100});
test('기존 그림을 가진 여섯 기술이 준비·곡선 비행·도착 그림을 재생한다',()=>{
 const {data,lobs}=setup();
 const flights=Object.entries(lobs).filter(([,record])=>record.kind==='lob');
 assert.deepEqual(flights.map(([n])=>Number(n)),[90,221,242,249,300,340]);
 for(const [n,record] of flights){
  const {fx}=setup(),u=units(),e=event(+n),positions=[];
  const ctx={save(){},restore(){},translate(x,y){positions.push([x,y]);},scale(){},drawImage(){}};
  for(const [bank,seq] of [record.flight,record.finish]) assert.ok(data.banks[bank].sequences[seq]);
  const before=new Map([[1,{...u[1],hp:100,alive:true}]]),windup=.1;
  const timing=fx.add(e,u,before,1,windup);
  fx.draw(ctx);assert.equal(positions.length,0);
  fx.tick(windup);
  fx.draw(ctx);const startY=positions[0][1];
  positions.length=0;
  fx.tick((timing.lead-windup)*.5);
  fx.draw(ctx);
  assert.equal(positions.length,1);
  assert.ok(positions[0][1]<(startY+u[1].y-10)/2);
  assert.equal(fx.visualUnit(u[1]).hp,100);
  assert.equal(fx.drain().length,0);
  fx.tick((timing.lead-windup)*.5+.001);
  positions.length=0;fx.draw(ctx);
  assert.deepEqual(positions[0],[u[1].x,u[1].y-10]);
  assert.equal(fx.visualUnit(u[1]).hp,0);
  assert.equal(fx.drain()[0],e);
  assert.equal(fx.drain().length,0);
 }
 // 같은 계열이어도 도착·비행 그림을 아직 보유하지 않은 기술에는 잘못된 그림을 붙이지 않는다.
 assert.equal(setup().fx.add(event(88),units()),null);
});

test('체리 봄과 비트 봄의 일치하는 도착 셀은 준비가 끝난 뒤 6틱 간격으로 표시된다',()=>{
 for(const record of [346,385]){
  const {fx,data,lobs}=setup(),u=units(),e=event(record);
  const [bank,seq]=lobs[record].finish,art=data.banks[bank],draws=[];
  const ctx={save(){},restore(){},translate(){},scale(){},drawImage(_img,x,y){draws.push([x,y]);}};
  const timing=fx.add(e,u,new Map([[1,{...u[1],hp:100}]]),1,.2);
  assert.equal(timing.lead,.2);assert.equal(fx.visualUnit(u[1]).hp,100);
  fx.tick(.19);fx.draw(ctx);assert.equal(draws.length,0);
  fx.tick(.011);assert.equal(fx.drain()[0],e);
  const [first,second]=art.sequences[seq].frames.map(([id])=>art.cells[id]);
  fx.draw(ctx);assert.deepEqual(draws[0],[first.x,first.y]);
  draws.length=0;fx.tick(.09);fx.draw(ctx);
  assert.deepEqual(draws[0],[first.x,first.y]);
  draws.length=0;fx.tick(.012);fx.draw(ctx);
  assert.deepEqual(draws[0],[second.x,second.y]);
 }
});
test('361개 기술의 참조는 실제 원본 NANR/셀과 무손실 아틀라스 안에 있다',()=>{
 const {data}=setup();assert.equal(Object.keys(data.records).length,361);assert.equal(Object.values(data.records).filter(x=>x.kind==='projectile').length,122);
 for(const d of Object.values(data.records))for(const key of ['muzzle','flight','finish','impact','head','hitHead','origin'])if(d[key]){
  const [bank,seq]=d[key],b=data.banks[bank],s=b.sequences[seq];assert.ok(s.frames.length);
  for(const [ci,t] of s.frames){const c=b.cells[ci];assert.ok(t>0&&c.x+c.w<=2048&&c.y+c.h<=318);}
 }
});
test('아구몬·토이아구몬은 전용 불꽃을 사용하고 비행/명중 시퀀스를 구별한다',()=>{
 const {data}=setup(),a=data.records[60],toy=data.records[99];assert.equal(data.banks[a.flight[0]].name,'e003_fireball00');assert.equal(data.banks[toy.flight[0]].name,'e003_toyfire00');
 assert.deepEqual(Array.from(a.muzzle),[7,0]);assert.deepEqual(Array.from(a.flight),[7,1]);assert.deepEqual(Array.from(a.finish),[7,2]);assert.equal(a.speed,2.5);
});
test('투사체 도착까지 HP/쓰러짐을 숨기고 도착 이벤트는 한 번만 발생한다',()=>{
 const {fx}=setup(),u=units(),before=new Map([[1,{...u[1],hp:100,alive:true}]]),e=event(60),snapshot=JSON.stringify(u),t=fx.add(e,u,before);
 assert.ok(t.lead>0);assert.equal(fx.busy,true);assert.equal(fx.visualUnit(u[1]).hp,100);fx.tick(0);assert.equal(fx.drain().length,0);
 fx.tick(t.lead-.001);assert.equal(fx.visualUnit(u[1]).alive,true);fx.tick(.002);assert.equal(fx.busy,false);assert.equal(fx.visualUnit(u[1]).hp,0);assert.equal(fx.drain()[0],e);assert.equal(fx.drain().length,0);assert.equal(JSON.stringify(u),snapshot);
 fx.tick(t.hold+1);assert.equal(fx.count,0);
});
test('오른쪽에서 왼쪽으로 발사해도 대상에 도착하며 일시정지 중 프레임은 유지한다',()=>{
 const {fx}=setup(),u=units();u[0].x=220;u[1].x=40;const t=fx.add(event(60),u),calls=[];
 const ctx={save(){},restore(){},translate(...a){calls.push(['p',...a]);},scale(...a){calls.push(['s',...a]);},drawImage(...a){calls.push(['d',...a.slice(1)]);}};
 fx.draw(ctx);const first=JSON.stringify(calls);calls.length=0;fx.tick(0);fx.draw(ctx);assert.equal(JSON.stringify(calls),first);assert.ok(calls.some(x=>x[0]==='s'&&x[1]>0));fx.tick(t.lead);assert.equal(fx.drain().length,1);
});
test('해석되지 않은 기술을 투사체로 꾸미지 않고 기본 공격은 기존 경로에 맡긴다',()=>{
 const {fx}=setup();assert.equal(fx.add({type:'hit',special:false},units()),null);assert.equal(fx.add(event(99999),units()),null);
});

test('막힌 투사체도 도착 알림은 보내며 전용 타격 그림만 생략한다',()=>{
 const {data}=setup();
 const record=Number(Object.keys(data.records).find(k=>data.records[k].kind==='projectile'&&data.records[k].finish&&data.records[k].impact));
 const run=damage=>{
  const {fx}=setup(),u=units(),e={...event(record),damage},draws=[];
  const ctx={save(){},restore(){},translate(){},scale(){},drawImage(...a){draws.push(a);}};
  const time=fx.add(e,u,undefined,1,.1);
  fx.tick(time.lead+.001);assert.equal(fx.drain()[0],e);
  fx.draw(ctx);
  return draws.length;
 };
 assert.equal(run(10),run(0)+1);
 assert.ok(run(0)>0);
});

test('왼쪽 기준 투사체는 오른쪽 표적일 때만 반전하고 출발 오프셋은 진행 방향을 따른다',()=>{
 for(const right of [true,false]){
  const {fx}=setup(),u=units();u[0].x=150;u[1].x=right?290:10;fx.add(event(60),u);const scales=[],positions=[];
  fx.draw({save(){},restore(){},translate:(x,y)=>positions.push([x,y]),scale:x=>scales.push(x),drawImage(){}});
  assert.ok(scales.length>0);assert.ok(scales.every(x=>right?x<0:x>0));assert.ok(right?positions.at(-1)[0]>150:positions.at(-1)[0]<150);
 }
});

function captureBeam(fx){const out={draws:[],scales:[],angles:[],positions:[]};fx.draw({save(){},restore(){},translate:(...a)=>out.positions.push(a),scale:(...a)=>out.scales.push(a),rotate:a=>out.angles.push(a),drawImage:(...a)=>out.draws.push(a.slice(1))});return out;}
test('빔31종은 원본 몸통·끝·명중 끝·발사점 셀을 각각 연결한다',()=>{
 const {data}=setup();assert.equal(Object.values(data.records).filter(x=>x.kind==='beam').length,31);
 const b=data.records[61];assert.equal(b.kind,'beam');assert.equal(data.banks[b.flight[0]].name,'e003_beam01');
 assert.deepEqual(Array.from(b.flight),[13,0]);assert.deepEqual(Array.from(b.head),[13,1]);assert.deepEqual(Array.from(b.hitHead),[13,2]);assert.deepEqual(Array.from(b.origin),[13,3]);assert.equal(b.speed,9);
});
test('빔은 자라며 두꺼워지고 짧은 단발 NANR도 명중·소멸 전까지 유지한다',()=>{
 const {fx}=setup(),u=units(),t=fx.add(event(61),u);const first=captureBeam(fx);assert.ok(first.draws.length>=3);fx.tick(8/60);const next=captureBeam(fx);assert.ok(next.draws.length>=3);assert.ok(next.scales[0][0]>first.scales[0][0]);
 fx.tick(2/60);const grown=captureBeam(fx);assert.ok(grown.scales[0][1]>first.scales[0][1]);const same=JSON.stringify(grown);fx.tick(0);assert.equal(JSON.stringify(captureBeam(fx)),same);
 fx.tick(t.hold+1);assert.equal(fx.count,0);
});
test('빔 명중은 한 번만 통지하고 끝부분을6프레임 교체한 뒤 소멸까지 다음 행동을 보류한다',()=>{
 const {fx,data}=setup(),u=units(),t=fx.add(event(61),u);assert.equal(t.lockActor,true);fx.tick(t.lead);assert.equal(fx.drain().length,1);assert.equal(fx.busy,true);
 const b=data.records[61],bank=data.banks[b.head[0]],hit=bank.cells[bank.sequences[b.hitHead[1]].frames[0][0]],normal=bank.cells[bank.sequences[b.head[1]].frames[0][0]];
 assert.equal(captureBeam(fx).draws[1][0],hit.x);fx.tick(6/60+.00001);assert.equal(captureBeam(fx).draws[1][0],normal.x);assert.equal(fx.drain().length,0);
 fx.tick(t.hold);assert.equal(fx.busy,false);assert.equal(fx.count,0);
});
test('빔은 +X 원본을 목표 각도로 회전하며 좌우 반전을 중복하지 않는다',()=>{
 for(const [dx,dy] of [[120,0],[-120,0],[80,80],[-80,-80]]){
  const {fx}=setup(),u=units();u[0].x=160;u[0].y=120;u[1].x=160+dx;u[1].y=120+dy;fx.add(event(61),u);fx.tick(.05);const out=captureBeam(fx);
  assert.ok(out.scales.slice(0,3).every(x=>x[0]>0));
  if(dx<0)assert.ok(out.angles.some(x=>Math.abs(x)>Math.PI/2));else if(dy)assert.ok(out.angles.some(x=>x>0&&x<Math.PI/2));else assert.equal(out.angles.length,0);
 }
});

test('발끝 정렬과 종별 NCER 원점을 반영해 배율이 달라도 입 근처에서 발사한다',()=>{
 const {fx,data}=setup(),u=units();u[0].speciesId='아구몬';assert.deepEqual(Array.from(data.actorOrigins['아구몬']),[0,-2]);
 fx.add(event(61),u,undefined,1.5);const out=captureBeam(fx);assert.equal(out.positions[0][0],40+16*1.5);assert.equal(out.positions[0][1],90+14+(-2-10)*1.5);
 const b=setup();b.fx.add(event(60),u,undefined,1.5);const shots=captureBeam(b.fx);assert.equal(shots.positions[0][0],shots.positions[1][0]);assert.equal(shots.positions[0][1],shots.positions[1][1]);
});

test('준비 동작 동안 기술 그림·피해를 보류하고 입이 열린 뒤에만 비행을 시작한다',()=>{
 for(const record of [60,61]){
  const {fx}=setup(),u=units(),before=new Map([[1,{...u[1],hp:100,alive:true}]]),wait=.25,t=fx.add(event(record),u,before,1,wait);
  assert.equal(captureBeam(fx).draws.length,0);assert.equal(fx.visualUnit(u[1]).hp,100);fx.tick(wait-.001);assert.equal(captureBeam(fx).draws.length,0);assert.equal(fx.drain().length,0);
  fx.tick(.002);assert.ok(captureBeam(fx).draws.length>0);assert.equal(fx.visualUnit(u[1]).hp,100);
  fx.tick(t.lead-wait);assert.equal(fx.drain().length,1);assert.equal(fx.visualUnit(u[1]).hp,0);
 }
});
