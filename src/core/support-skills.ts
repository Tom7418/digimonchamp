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
/** 공격 표 +88 속성 1~5. 피해 계산(overlay19 0x2118254)이 속성 3은 빛 강화(8), 4는 어둠(9), 5는 천둥(7)과 짝지어 확인됨 */
export const battleElement = (record: number): BattleBuff | undefined => ({1:'열',2:'추위',3:'빛',4:'어둠',5:'천둥'} as const)[DATA.elements[String(record)] as 1|2|3|4|5];
export const buffMultiplier = (u: Unit, key: BattleBuff, time: number) => (u.buffs?.[key] ?? 0)>time ? 1.15 : 1;
const buffKey = (id:number):BattleBuff|undefined => ({10:'atk',11:'atk',12:'def',13:'def',14:'spd',15:'spd',16:'int',17:'int',18:'열',19:'열',20:'추위',21:'추위',22:'천둥',23:'천둥',24:'빛',25:'빛',26:'어둠',27:'어둠'} as Record<number,BattleBuff>)[id];

/** 소유/이름/TP·회복량·부활량·15초 지속·강화 한 칸·시도 순서와 조건은 원본(overlay19 0x211932C~0x2119654).
 *  강화 번호(효과 21~29 → 버프 1~9): 1 공격업 2 방어업 3 민첩업 4 크리티컬업·명중업 5 화염 6 물(추위) 7 천둥 8 빛 9 어둠 */
/** 지원 기술 분류 (전투 시작 때 나누는 표 0x2117748): 1 단일 치료, 2 전원 치료, 3 회복, 4 전원 회복, 5 단일 강화, 6 전원 강화·도발, 7 부활, 8 용기 */
export const supportCategory = (id: number) => id >= 2 && id <= 4 ? 1 : id >= 5 && id <= 7 ? 2 : id === 8 ? 3 : id === 9 ? 4 : id === 1 ? 6 : id >= 10 && id <= 27 ? (id % 2 === 0 ? 5 : 6) : id === 28 || id === 29 ? 7 : id === 30 ? 8 : 0;
/** 상태이상의 위급도 (0x2115CEC): 분노·공포·슬로우 1, 소극적·독·얼음·수면·마비·눈가림 2, 혼란·석화·저주 3, 다운 0 */
const statusWeight = (a: Unit, t: number) => !a.status || a.status.until <= t ? 0 : [1, 2, 6].includes(a.status.id) ? 1 : [5, 12, 13].includes(a.status.id) ? 3 : a.status.id === 14 ? 0 : 2;
const pct = (a: Unit) => Math.trunc((a.hp * 100) / a.maxHp);
/** 시도 순서: 전원 치료 → 단일 치료 → 전원 회복 → 회복 → 전원 강화·도발 → 단일 강화. 각 분류의 첫 기술이 소비 TP < 예산일 때만 쓴다 */
const ORDER = [2, 1, 4, 3, 6, 5];
export function useSupport(s: BattleState,u:Unit,events:BattleEvent[],budget=u.tp+1,rng:()=>number=()=>0): boolean {
  if(u.cd>0)return false;
  const allies=s.units.filter(a=>a.team===u.team&&a.alive),foes=s.units.filter(a=>a.team!==u.team&&a.alive);
  const owned=supportSkills(u.speciesId,u.personality);
  const myBuff=Object.entries(u.buffs??{}).find(([,until])=>until>s.t)?.[0];
  for(const cat of ORDER){
    const skill=owned.find(sk=>supportCategory(sk.id)===cat&&sk.tpCost<Math.min(budget,u.tp+1));
    if(!skill)continue;
    let targets:Unit[]=[],amounts:number[]=[];
    if(cat===2){
      // 전원 치료: 모두 HP 60% 미만, 또는 누군가 40% 미만, 또는 누군가 50% 미만이면서 모두 80% 미만 (0x2115D98~)
      const ps=allies.map(pct);
      if(!(ps.every(p=>p<60)||ps.some(p=>p<40)||(ps.some(p=>p<50)&&ps.every(p=>p<80))))continue;
      targets=allies;
    }else if(cat===1){
      // 단일 치료: HP 20% 미만(2) > 40% 미만(1) 순으로 가장 급한 편 (0x2115CA0)
      const need=(a:Unit)=>pct(a)<20?2:pct(a)<40?1:0;
      const best=allies.reduce<Unit|undefined>((x,a)=>need(a)>(x?need(x):0)?a:x,undefined);
      if(!best)continue;targets=[best];
    }
    if(cat===1||cat===2){
      // 원본 회복량 고정값 (0x2118D54~): 치료 300·900·2100, 전원 치료 200·600·1400
      const amount=[300,900,2100,200,600,1400][skill.id-2];
      amounts=targets.map(a=>Math.min(a.maxHp-a.hp,amount));
      targets.forEach((a,i)=>{a.hp+=amounts[i];events.push({type:'heal',from:u.id,to:a.id,amount:amounts[i],support:skill});});
    }else if(cat===3||cat===4){
      // 회복: 상태이상(+0x158)을 지운다 (0x2117CF4). 회복은 위급도가 가장 높은 편 하나, 전원 회복은 모두. 웹판은 도발도 함께 푼다
      const ill=allies.filter(a=>statusWeight(a,s.t)>0||(a.taunt?.until??0)>s.t);
      if(!ill.length)continue;
      targets=cat===4?ill:[ill.reduce((x,a)=>statusWeight(a,s.t)>statusWeight(x,s.t)?a:x)];
      targets.forEach(a=>{a.status=undefined;a.taunt=undefined;});
    }else if(skill.id===1){
      // 도발: 원본은 전원 강화와 같은 분류라 자기가 무언가 강화 중일 때만 쓴다(표 0x2133A34). 원작 실수로 보고 웹판은 강화와 상관없이 쓴다(형규 결정)
      targets=foes.filter(a=>a.taunt?.from!==u.id||(a.taunt?.until??0)<=s.t);
      if(!targets.length)continue;
      targets.forEach(a=>a.taunt={from:u.id,until:s.t+15});
    }else{
      const key=buffKey(skill.id);if(!key)continue;
      if(cat===6){
        // 전원 강화: 자기에게 같은 강화가 걸려 있지 않을 때 편 전체에
        if(myBuff===key)continue;
        targets=allies;
      }else{
        // 단일 강화: 강화가 하나도 없는 편에게. 원본은 그중 무작위(0x2119584~), 웹판은 자기가 비어 있으면 자기 먼저(형규 결정)
        const free=allies.filter(a=>!Object.values(a.buffs??{}).some(until=>until>s.t));
        if(!free.length)continue;
        targets=[free.includes(u)?u:free[Math.floor(rng()*216)%free.length]];
      }
      // 배우마다 강화 칸이 하나(+0x160)라 새 강화가 이전 강화를 덮는다. 지속 900프레임=15초 (0x2117FB0)
      targets.forEach(a=>a.buffs={[key]:s.t+15});
    }
    u.tp-=skill.tpCost;u.cd=2;
    if(!amounts.length)events.push({type:'support',from:u.id,targets:targets.map(a=>a.id),skill});
    return true;
  }
  return false;
}
/** 원작 도움말: 부활 SP는 HP0 직후 자신을 한 번 되살린다. 회복은 최대 HP의 부활α 5%, 부활β 30% (overlay19 0x21173A8) */
export function reviveSupport(s:BattleState,u:Unit,events:BattleEvent[]): boolean {
  if(u.revived)return false;
  const skill=supportSkills(u.speciesId,u.personality).find(sk=>[28,29].includes(sk.id)&&sk.tpCost<=u.tp);
  if(!skill)return false;
  u.revived=true;u.alive=true;u.tp-=skill.tpCost;u.hp=Math.max(1,Math.trunc(u.maxHp*(skill.id===29?30:5)/100));
  u.cd=2;events.push({type:'support',from:u.id,targets:[u.id],skill});return true;
}
