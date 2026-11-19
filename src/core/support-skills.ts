import table from '../data/support-skills.json';
import { getSpecies } from './data';
import type { Personality } from './types';
import type { BattleState, BattleEvent, Unit } from './battle';

export interface SupportSkill { id: number; name: string; tpCost: number }
export type BattleBuff = 'atk' | 'def' | 'spd' | 'int' | '열' | '추위' | '천둥' | '빛' | '어둠';
const DATA = table as {skills:SupportSkill[];species:Record<string,{personalities:string[];pairs:number[][]}>;elements:Record<string,number>};
/** 원본 종 표의 두 성격 조건을 순서대로 비교하고, 불일치하면 기본 두 칸을 사용한다. */
export function supportSkills(speciesId: string, personality: Personality): SupportSkill[] {
  const row=DATA.species[getSpecies(speciesId).id];
  if(!row)return [];
  const match=row.personalities.indexOf(personality),ids=row.pairs[match<0?2:match];
  return [...new Set(ids)].filter(id=>id>0).map(id=>DATA.skills.find(skill=>skill.id===id)!).filter(Boolean);
}
/** 공격 표+88의 값과 알려진 기술명을 대조한 속성 대응 추정. 실행 코드의 enum 의미는 미확인. */
export const battleElement = (record: number): BattleBuff | undefined => ({1:'열',2:'추위',3:'빛',4:'어둠',5:'천둥'} as const)[DATA.elements[String(record)] as 1|2|3|4|5];
export const buffMultiplier = (u: Unit, key: BattleBuff, time: number) => (u.buffs?.[key] ?? 0)>time ? 1.15 : 1;
const active = (u: Unit,key:BattleBuff,s:BattleState) => (u.buffs?.[key]??0)>s.t;
const buffKey = (id:number):BattleBuff|undefined => ({10:'atk',11:'atk',12:'def',13:'def',14:'spd',15:'spd',16:'int',17:'int',18:'열',19:'열',20:'추위',21:'추위',22:'천둥',23:'천둥',24:'빛',25:'빛',26:'어둠',27:'어둠'} as Record<number,BattleBuff>)[id];

/** 소유/이름/TP는 원본, 효과량·15초 지속·AI 우선순위는 웹판 임시 정책이다. */
export function useSupport(s: BattleState,u:Unit,events:BattleEvent[]): boolean {
  if(u.cd>0)return false;
  const allies=s.units.filter(a=>a.team===u.team&&a.alive),foes=s.units.filter(a=>a.team!==u.team&&a.alive);
  for(const skill of supportSkills(u.speciesId,u.personality)){
    if(skill.tpCost>u.tp||skill.id>=28)continue; // 부활은 KO 직후 자동 발동한다.
    let targets:Unit[]=[],amounts:number[]=[];
    if(skill.id>=2&&skill.id<=7){
      const weak=allies.filter(a=>a.hp/a.maxHp<0.7).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp);
      if(!weak.length)continue;
      targets=skill.id>=5?allies.filter(a=>a.hp<a.maxHp):[weak[0]];
      const grade=(skill.id-2)%3;
      amounts=targets.map(a=>Math.min(a.maxHp-a.hp,Math.round(a.maxHp*[.12,.24,.4][grade]+u.stats.int*buffMultiplier(u,'int',s.t)*.5)));
      targets.forEach((a,i)=>{a.hp+=amounts[i];events.push({type:'heal',from:u.id,to:a.id,amount:amounts[i],support:skill});});
    }else if(skill.id===1){
      targets=foes.filter(a=>a.taunt?.from!==u.id||(a.taunt?.until??0)<=s.t);
      if(!targets.length)continue;
      targets.forEach(a=>a.taunt={from:u.id,until:s.t+15});
    }else if(skill.id===8||skill.id===9){
      // 전투에 현재 존재하는 후퇴/도발 방해를 해소한다. 없는 상태이상 때문에 TP를 쓰지 않는다.
      targets=allies.filter(a=>a.retreat>0||(a.taunt?.until??0)>s.t);
      if(!targets.length)continue;
      if(skill.id===8)targets=targets.slice(0,1);
      targets.forEach(a=>{a.retreat=0;a.taunt=undefined;});
    }else{
      const key=buffKey(skill.id);if(!key)continue;
      const all=skill.id%2===1;
      targets=allies.filter(a=>!active(a,key,s));if(!targets.length)continue;
      if(!all)targets=[targets.includes(u)?u:targets[0]];
      targets.forEach(a=>a.buffs={...a.buffs,[key]:s.t+15});
    }
    u.tp-=skill.tpCost;u.cd=2;
    // 회복은 기존 heal 연출/기록을 쓰며 나머지 SP는 지원 이벤트로 표시한다.
    if(!amounts.length)events.push({type:'support',from:u.id,targets:targets.map(a=>a.id),skill});
    return true;
  }
  return false;
}
/** 원작 도움말: 부활 SP는 HP0 직후 자신을 한 번 되살린다. 회복 비율은 임시50/75%. */
export function reviveSupport(s:BattleState,u:Unit,events:BattleEvent[]): boolean {
  if(u.revived)return false;
  const skill=supportSkills(u.speciesId,u.personality).find(sk=>[28,29].includes(sk.id)&&sk.tpCost<=u.tp);
  if(!skill)return false;
  u.revived=true;u.alive=true;u.tp-=skill.tpCost;u.hp=Math.max(1,Math.round(u.maxHp*(skill.id===29?.75:.5)));
  u.cd=2;events.push({type:'support',from:u.id,targets:[u.id],skill});return true;
}
