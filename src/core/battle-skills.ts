import original from '../data/battle-skills.json';
import { getSpecies } from './data';
import { pick, type Rng } from './rng';

export interface BattleSkill {
  /** 원본 공격 표의 레코드 번호. 이름과 소유 종은 원본에서 확인. */
  record: number;
  name: string;
  slot: 0 | 1 | 2;
  /** 기본 공격10 / 스킬7~9는 사용자 확인. 슬롯 순서와7~9의 대응은 웹판 임시 정책. */
  animation: 'attack1' | 'attack2' | 'attack3';
}

const TABLE: Readonly<Record<string, { basicRecord: number | null; skills: { record: number; name: string }[] }>> = original;
const ANIMATIONS = ['attack1', 'attack2', 'attack3'] as const;

/** 영문 기술명은 원본 표기 그대로 사용한다. 한글 텍스트 표는 순서가 달라 별도 대조가 필요하다. */
export function battleSkills(speciesId: string): BattleSkill[] {
  return (TABLE[getSpecies(speciesId).name]?.skills ?? []).map((skill, index) => ({
    ...skill, slot: index as 0 | 1 | 2, animation: ANIMATIONS[index],
  }));
}

/** 웹판 정책: 보유 기술을 동일 확률로 선택. 원본 AI·기술별 TP/위력은 아직 미확인. */
export function pickBattleSkill(speciesId: string, rng: Rng): BattleSkill | null {
  const skills = battleSkills(speciesId);
  return skills.length ? pick(rng, skills) : null;
}
