'use strict';
// 육각 격자는 축 좌표(q, r)를 사용한다. 이미지 픽셀 좌표와 배치 규칙을 분리한다.
// 원본 시설 배경의 외곽과 점유 모양을 맞춘다. 정원은 별도의 게임 규칙이다.
window.CageLayout = {
  types: {
    // 원작 케이지 (이름·수용 수는 원작 글, 모양·그림은 root/training/field_cmNN_01에서 tools/extract_cage_fields.py로 얻은 값).
    // core: 규칙 엔진(web/core.js)의 케이지 이름. img: assets/facilities의 그림. fit: 점유 칸 상자에 꽉 맞춰 그린다.
    // 그림은 육각 점유 모양에 맞춘 전용 그림(<이름>-hex.png, tools/make_hex_facilities.py. clinic·field는 Codex가 만든 것).
    // 시설 크기는 개별 확인한다. 기본 케이지 4칸, 미니 운동장 3칸 (사용자 확인).
    // free·clinic·field·gym은 예전 저장과 맞추려고 남긴 이름이다 (field=미니 운동장, gym=미니 체육관).
    free: {name:'기본 케이지',core:'기본 케이지',img:'free-four-hex',fit:true,cells:[[0,0],[1,0],[0,1],[1,1]],capacity:99},
    cm01: {name:'공터',core:'공터',img:'cm01',fit:true,cells:[[0,0]],capacity:2},
    cm02: {name:'운동장',core:'운동장',img:'cm02-hex',fit:true,cells:[[0,0],[1,0],[0,1]],capacity:6},
    cm03: {name:'경기장',core:'경기장',img:'cm03-hex',fit:true,cells:[[0,0],[1,0],[2,0],[0,1],[1,1]],capacity:10},
    cm04: {name:'도장',core:'도장',img:'cm04-hex',fit:true,cells:[[0,0],[1,0],[2,0]],capacity:6},
    cm05: {name:'체육관',core:'체육관',img:'cm05-hex',fit:true,cells:[[0,0],[1,0],[-1,1],[0,1]],capacity:8},
    cm06: {name:'연구소',core:'연구소',img:'cm06-hex',fit:true,cells:[[0,0],[1,0],[-2,1],[-1,1]],capacity:8},
    cm07: {name:'화산',core:'화산',img:'cm07-hex',fit:true,cells:[[0,0],[1,0],[0,1],[1,1]],capacity:8},
    cm08: {name:'초원',core:'초원',img:'cm08-hex',fit:true,cells:[[0,0],[0,1],[1,1]],capacity:6},
    cm09: {name:'해변',core:'해변',img:'cm09-hex',fit:true,cells:[[0,0],[2,0],[0,1],[1,1]],capacity:8},
    cm10: {name:'고산',core:'고산',img:'cm10-hex',fit:true,cells:[[0,0],[2,0],[0,1],[1,1]],capacity:8},
    cm11: {name:'숲',core:'숲',img:'cm11-hex',fit:true,cells:[[0,0],[-2,1],[-1,1]],capacity:6},
    cm12: {name:'정글',core:'정글',img:'cm12-hex',fit:true,cells:[[0,0],[1,0],[1,1]],capacity:6},
    cm14: {name:'묘지',core:'묘지',img:'cm14-hex',fit:true,cells:[[0,0],[1,0],[1,1]],capacity:6},
    cm15: {name:'공장',core:'공장',img:'cm15-hex',fit:true,cells:[[0,0],[0,1],[1,1]],capacity:6},
    clinic: {name:'미니 양호실',core:'미니 양호실',img:'clinic-hex',fit:true,cells:[[0,0]],capacity:2},
    cm17: {name:'병원',core:'병원',img:'cm17-hex',fit:true,cells:[[0,0],[-1,1],[0,1]],capacity:6},
    cm18: {name:'화원',core:'화원',img:'cm18-hex',fit:true,cells:[[0,0],[-1,1]],capacity:4},
    cm19: {name:'온천',core:'온천',img:'cm19-hex',fit:true,cells:[[0,0],[1,0],[2,0],[3,0]],capacity:8},
    cm23: {name:'가스실',core:'가스실',img:'cm23-hex',fit:true,cells:[[0,0],[0,1]],capacity:4},
    cm24: {name:'절',core:'절',img:'cm24-hex',fit:true,cells:[[0,0]],capacity:2},
    cm25: {name:'동물원',core:'동물원',img:'cm25-hex',fit:true,cells:[[0,0],[1,0]],capacity:2},
    cm26: {name:'목장',core:'목장',img:'cm26-hex',fit:true,cells:[[0,0],[1,0],[-1,1],[0,1]],capacity:8},
    cm27: {name:'링',core:'링',img:'cm27-hex',fit:true,cells:[[0,0],[-1,1],[0,1]],capacity:6},
    field: {name:'미니 운동장',core:'미니 운동장',img:'field-hex',fit:true,cells:[[0,0],[1,0],[0,1]],capacity:2},
    cm31: {name:'양호실',core:'양호실',img:'cm31-hex',fit:true,cells:[[0,0],[1,0]],capacity:6},
    cm32: {name:'미니 화원',core:'미니 화원',img:'cm32',fit:true,cells:[[0,0]],capacity:2},
    cm33: {name:'미니 숲',core:'미니 숲',img:'cm33',fit:true,cells:[[0,0]],capacity:2},
    gym: {name:'미니 체육관',core:'미니 체육관',img:'cm34',fit:true,cells:[[0,0]],capacity:2},
    cm35: {name:'미니 화산',core:'미니 화산',img:'cm35',fit:true,cells:[[0,0]],capacity:2},
    cm37: {name:'미니 고산',core:'미니 고산',img:'cm37',fit:true,cells:[[0,0]],capacity:2},
    cm38: {name:'미니 공장',core:'미니 공장',img:'cm38',fit:true,cells:[[0,0]],capacity:2},
    cm39: {name:'미니 해변',core:'미니 해변',img:'cm39',fit:true,cells:[[0,0]],capacity:2},
  },
  // 예전 임시 시설 이름 → 원작 시설 (저장된 배치 이전용)
  aliases: {vacant:'cm01',volcano:'cm35',flower:'cm32',pool:'cm39',aviary:'cm37',grave:'cm14',labV:'cm17',labD:'cm06',labX:'cm23',stadium:'cm02'},
  rename(kind){return this.aliases[kind]||kind;},
  // 게임 화면이 채워 넣는 선택 규칙. 비워 두면 제한 없음 (테스트 기본값).
  // space: 랭크별 케이지 공간(칸), canPlace(item, items): 새 시설 설치 허용 여부(보유 확인)
  space: null,
  canPlace: null,
  // 60도 회전: 축 좌표의 세 번째 축은 -q-r이다.
  cells(item){return this.types[item.kind].cells.map(([q,r])=>{for(let n=0;n<(item.rotation||0);n++)[q,r]=[-r,q+r];return [q+item.q,r+item.r];});},
  valid(items,item){
    if(!this.types[item.kind]||!Number.isInteger(item.q)||!Number.isInteger(item.r)||!Number.isInteger(item.rotation)||item.rotation<0||item.rotation>5)return false;
    const cells=this.cells(item);
    if(cells.some(([q,r])=>q<0||q>=6||r<0||r>=5))return false;
    const others=items.filter(c=>c.id!==item.id);
    if(this.space!=null&&others.reduce((n,c)=>n+this.cells(c).length,0)+cells.length>(typeof this.space==='function'?this.space():this.space))return false;
    if(this.canPlace&&!items.some(c=>c.id===item.id)&&!this.canPlace(item,items))return false;
    const used=new Set(items.filter(c=>c.id!==item.id).flatMap(c=>this.cells(c).map(p=>p.join(','))));
    return cells.every(p=>!used.has(p.join(',')));
  },
  at(items,q,r){return items.find(c=>this.cells(c).some(p=>p[0]===q&&p[1]===r));},
  // 잘못되거나 오래된 저장 배치는 안전한 항목만 복원한다.
  restore(raw){const out=[];for(const c of Array.isArray(raw)?raw:[]){if(c&&typeof c.id==='string'&&!out.some(x=>x.id===c.id)&&this.valid(out,c))out.push({...c});}return out;},
  // 구버전의 잘못된 모양을 바꿀 때 충돌한 시설은 빈자리로 이동한다.
  // 자리가 없으면 보관함으로 돌려보내며 원래 배치는 호출자가 백업한다.
  migrate(raw){const placed=[],stored=[];for(const original of Array.isArray(raw)?raw:[]){if(!original||!this.types[original.kind])continue;let c={...original};if(!this.valid(placed,c)){let found=false;for(let r=0;r<5&&!found;r++)for(let q=0;q<6&&!found;q++)for(let rotation=0;rotation<6;rotation++){const next={...c,q,r,rotation};if(this.valid(placed,next)){c=next;found=true;break;}}if(!found){stored.push(c);continue;}}placed.push(c);}return {placed,stored};},
  // 케이지에 정원보다 많이 들어가 있는가
  over(state,id){const cage=state.layout.find(c=>c.id===id);return !!cage&&state.team.filter(p=>p.cageId===id).length>this.types[cage.kind].capacity;},
  // 정원을 넘긴 케이지에 있는 디지몬 uid 목록
  crowded(state){return state.team.filter(p=>p.cageId&&this.over(state,p.cageId)).map(p=>p.uid);},
  assign(state,pet,id){
    const cage=state.layout.find(c=>c.id===id);
    if(!cage)return false;
    // 원작처럼 정원을 넘겨도 넣을 수 있다. 넘긴 채 하루가 지나면 스트레스를 받는다 (crowded 참고)
    pet.cageId=id;pet.cage=cage.kind;pet.cageSeconds=0;return true;
  }
};
