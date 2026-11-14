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
  /** 기본 공격10 / 스킬7~9는 사용자 확인. 슬롯 순서와7~9의 대응은 웹판 임시 정책. */
  animation: 'attack1' | 'attack2' | 'attack3';
}

const TABLE: Readonly<Record<string, { basicRecord: number | null; skills: { record: number; name: string; englishName: string; dbTextIndex: number }[] }>> = original;
const ANIMATIONS = ['attack1', 'attack2', 'attack3'] as const;

/** 한글 이름은 원본 도감의 조회 규칙으로 연결한다. 영문 직역으로 대체하지 않는다. */
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
