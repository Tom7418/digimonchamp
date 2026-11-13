'use strict';
// 육각 격자는 축 좌표(q, r)를 사용한다. 이미지 픽셀 좌표와 배치 규칙을 분리한다.
// 원본 시설 배경의 외곽과 점유 모양을 맞춘다. 정원은 별도의 게임 규칙이다.
window.CageLayout = {
  types: {
    // core: 규칙 엔진(web/core.js)의 케이지 이름. 훈련·회복 효과는 그쪽 규칙을 따른다.
    // art:false 인 시설은 원본 배경을 아직 변환하지 않아 단색으로 그린다.
    free: {name:'기본 케이지',core:'기본 케이지',frame:0,cells:[[0,0]],capacity:1},
    gym: {name:'미니 체육관',core:'미니 체육관',frame:3,cells:[[0,0],[1,0],[2,0]],capacity:2},
    field: {name:'미니 운동장',core:'미니 운동장',frame:1,cells:[[0,0],[1,0],[0,1]],capacity:2},
    clinic: {name:'미니 양호실',core:'미니 양호실',frame:15,cells:[[0,0]],capacity:3},
    vacant: {name:'공터',core:'공터',art:false,color:'#b9a77a',cells:[[0,0],[1,0]],capacity:2},
    volcano: {name:'미니 화산',core:'미니 화산',art:false,color:'#c46a4a',cells:[[0,0],[1,0]],capacity:2},
    flower: {name:'미니 화원',core:'미니 화원',art:false,color:'#d9a3c0',cells:[[0,0],[1,0]],capacity:2},
    pool: {name:'미니 수영장',core:'미니 수영장',art:false,color:'#5f9fd0',cells:[[0,0],[1,0]],capacity:2},
    aviary: {name:'미니 새장',core:'미니 새장',art:false,color:'#9fcfe0',cells:[[0,0],[1,0]],capacity:2},
    grave: {name:'미니 묘지',core:'미니 묘지',art:false,color:'#6c5f7d',cells:[[0,0],[1,0]],capacity:2},
    labV: {name:'백신 연구실',core:'백신 연구실',art:false,color:'#e8e2b0',cells:[[0,0]],capacity:2},
    labD: {name:'데이터 연구실',core:'데이터 연구실',art:false,color:'#a8d8c0',cells:[[0,0]],capacity:2},
    labX: {name:'바이러스 연구실',core:'바이러스 연구실',art:false,color:'#c9a0d0',cells:[[0,0]],capacity:2},
    stadium: {name:'운동장',core:'운동장',art:false,color:'#c8b07a',cells:[[0,0],[1,0],[0,1],[1,1]],capacity:6}
  },
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
