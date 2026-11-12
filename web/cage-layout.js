'use strict';
// 육각 격자는 축 좌표(q, r)를 사용한다. 이미지 픽셀 좌표와 배치 규칙을 분리한다.
// 원본 시설 배경의 외곽과 점유 모양을 맞춘다. 정원은 별도의 게임 규칙이다.
window.CageLayout = {
  types: {
    free: {name:'기본 케이지',frame:0,cells:[[0,0]],capacity:1},
    gym: {name:'체육관',frame:3,cells:[[0,0],[1,0],[2,0]],capacity:2},
    field: {name:'운동장',frame:1,cells:[[0,0],[1,0],[0,1]],capacity:2},
    clinic: {name:'양호실',frame:15,cells:[[0,0]],capacity:3}
  },
  // 60도 회전: 축 좌표의 세 번째 축은 -q-r이다.
  cells(item){return this.types[item.kind].cells.map(([q,r])=>{for(let n=0;n<(item.rotation||0);n++)[q,r]=[-r,q+r];return [q+item.q,r+item.r];});},
  valid(items,item){
    if(!this.types[item.kind]||!Number.isInteger(item.q)||!Number.isInteger(item.r)||!Number.isInteger(item.rotation)||item.rotation<0||item.rotation>5)return false;
    const cells=this.cells(item);
    if(cells.some(([q,r])=>q<0||q>=6||r<0||r>=5))return false;
    const used=new Set(items.filter(c=>c.id!==item.id).flatMap(c=>this.cells(c).map(p=>p.join(','))));
    return cells.every(p=>!used.has(p.join(',')));
  },
  at(items,q,r){return items.find(c=>this.cells(c).some(p=>p[0]===q&&p[1]===r));},
  // 잘못되거나 오래된 저장 배치는 안전한 항목만 복원한다.
  restore(raw){const out=[];for(const c of Array.isArray(raw)?raw:[]){if(c&&typeof c.id==='string'&&!out.some(x=>x.id===c.id)&&this.valid(out,c))out.push({...c});}return out;},
  // 구버전의 잘못된 모양을 바꿀 때 충돌한 시설은 빈자리로 이동한다.
  // 자리가 없으면 보관함으로 돌려보내며 원래 배치는 호출자가 백업한다.
  migrate(raw){const placed=[],stored=[];for(const original of Array.isArray(raw)?raw:[]){if(!original||!this.types[original.kind])continue;let c={...original};if(!this.valid(placed,c)){let found=false;for(let r=0;r<5&&!found;r++)for(let q=0;q<6&&!found;q++)for(let rotation=0;rotation<6;rotation++){const next={...c,q,r,rotation};if(this.valid(placed,next)){c=next;found=true;break;}}if(!found){stored.push(c);continue;}}placed.push(c);}return {placed,stored};},
  assign(state,pet,id){
    const cage=state.layout.find(c=>c.id===id);
    if(!cage)return false;
    const occupied=state.team.filter(p=>p!==pet&&p.cageId===id).length;
    if(occupied>=this.types[cage.kind].capacity)return false;
    pet.cageId=id;pet.cage=cage.kind;pet.cageSeconds=0;return true;
  }
};
