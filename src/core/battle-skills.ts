import original from '../data/battle-skills.json';
import { getSpecies } from './data';
import { pick, type Rng } from './rng';

export interface BattleSkill {
  /** 원본 공격 표의 레코드 번호. 이름과 소유 종은 원본에서 확인. */
  record: number;
  name: string;
  /** 원본 도감의 한글 이름과 실행 파일의 영문 이름을 별도로 보존한다. */
  englishName: string;
  dbTextIndex: number;
  slot: 0 | 1 | 2;
  /** 원본 공격 표+16 → 배우 상태8~11 → NANR7~10. 기술 슬롯 순서와는 다르다. */
  sequence: 7 | 8 | 9 | 10;
  animation: 'attack1' | 'attack2' | 'attack3' | 'attack4';
  /** 원본 공격 표+72의u16. 원본 전투 진입 시 부족 검사 후 차감한다. */
  tpCost: number;
}

const TABLE: Readonly<Record<string, { basicRecord: number | null; skills: { record: number; name: string; englishName: string; dbTextIndex: number; sequence: number; tpCost: number }[] }>> = original;
const ANIMATIONS = ['attack1', 'attack2', 'attack3', 'attack4'] as const;

/** 한글 이름은 원본 도감의 조회 규칙으로 연결한다. 영문 직역으로 대체하지 않는다. */
export function battleSkills(speciesId: string): BattleSkill[] {
  return (TABLE[getSpecies(speciesId).id]?.skills ?? []).map((skill, index) => ({
    ...skill, slot: index as 0 | 1 | 2, sequence: skill.sequence as 7 | 8 | 9 | 10,
    animation: ANIMATIONS[skill.sequence - 7],
  }));
}

/** 종의 일반 공격 기록 번호 (공격 기록 표 arm9 0x020D02CC) */
export const basicRecordOf = (speciesId: string): number | null => TABLE[getSpecies(speciesId).id]?.basicRecord ?? null;

/** 사용 가능한 기술을 동일 확률로 선택하는 빈도/AI는 웹판 정책. TP 소비는 원본 값. */
export function pickBattleSkill(speciesId: string, rng: Rng, tp = Infinity, personality?: import('./types').Personality): BattleSkill | null {
  const skills = battleSkills(speciesId).filter(skill => skill.tpCost <= tp);
  if (!skills.length) return null;
  // 희귀도 표는 미확인: 둘 이상인 종의 마지막 슬롯을 희귀 후보로 삼아 가중치3을 준다(웹판 정책).
  if (personality === '솔직' && battleSkills(speciesId).length > 1) {
    const last = battleSkills(speciesId).at(-1)!.record;
    const weights = skills.map(s=>s.record===last?3:1);
    let roll = rng() * weights.reduce((sum,n)=>sum+n,0);
    for(let i=0;i<skills.length;i++){roll-=weights[i];if(roll<0)return skills[i];}
    return skills.at(-1)!;
  }
  return pick(rng, skills);
}
