const {test}=require('node:test');const assert=require('node:assert/strict');global.window={};require('../web/cage-layout.js');const L=window.CageLayout;
const cage=(id,kind,q,r,rotation=0)=>({id,kind,q,r,rotation});
test('설치 시 겹침과 경계 이탈을 거부한다',()=>{const a=cage('a','clinic',0,0);assert.ok(L.valid([],a));assert.equal(L.valid([a],cage('b','cm04',0,0)),false);assert.equal(L.valid([],cage('b','cm02',5,0)),false);});
test('자기 칸을 제외하고 이동과 회전을 판정한다',()=>{const a=cage('a','cm04',2,2);assert.ok(L.valid([a],{...a,q:3}));for(let rotation=0;rotation<6;rotation++){const cells=L.cells({...a,rotation});assert.equal(new Set(cells.map(x=>x.join(','))).size,3);}});
test('정원을 넘겨도 들어가고, 넘긴 케이지의 디지몬을 알려 준다',()=>{const a=cage('a','gym',1,1),p={uid:3,cage:'free'},s={layout:[a],team:[{uid:1,cageId:'a'},{uid:2,cageId:'a'},p]};assert.deepEqual(L.crowded(s),[]);assert.ok(L.assign(s,p,'a'));assert.equal(p.cage,'gym');assert.ok(L.over(s,'a'));assert.deepEqual(L.crowded(s),[1,2,3]);});
test('저장된 겹침과 유효하지 않은 시설을 복원하지 않는다',()=>{const a=cage('a','clinic',0,0);assert.deepEqual(L.restore([a,cage('b','cm04',0,0),cage('c','missing',2,2),null]),[a]);});
test('배치 데이터의 JSON 저장 후 좌표와 회전이 유지된다',()=>{const a=cage('a','cm02',2,2,2);assert.deepEqual(L.restore(JSON.parse(JSON.stringify([a]))),[a]);});
test('양호실은 회전해도 한 칸만 점유한다',()=>{for(let rotation=0;rotation<6;rotation++)assert.deepEqual(L.cells(cage('a','clinic',2,3,rotation)),[[2,3]]);});
test('공터와 미니 시설은 원작 한 칸으로 복원한다',()=>{for(const k of ['cm01','gym','cm32','cm33','cm35','cm37','cm38','cm39','clinic'])assert.deepEqual(L.types[k].cells,[[0,0]]);assert.equal(L.types.cm02.cells.length,3);});
test('예전 임시 시설 이름은 원작 시설로 바뀐다',()=>{assert.equal(L.rename('grave'),'cm14');assert.equal(L.rename('gym'),'gym');for(const k of Object.values(L.aliases))assert.ok(L.types[k]);});
test('모양 변경 마이그레이션은 시설을 잃지 않는다',()=>{const old=[cage('a','cm04',5,4),cage('b','clinic',1,1),cage('c','cm02',1,1)];const result=L.migrate(old);assert.equal(result.placed.length+result.stored.length,old.length);result.placed.forEach(c=>assert.ok(L.valid(result.placed,c)));});

test('사용자 확인 크기: 기본 케이지 4칸, 미니 운동장 3칸',()=>{assert.equal(L.types.free.cells.length,4);assert.equal(L.types.field.cells.length,3);});
