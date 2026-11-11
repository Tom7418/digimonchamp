export type Stage = 1 | 2 | 3 | 4 | 5 | 6;

export const FAMILIES = ['용', '짐승', '물', '새', '벌레풀', '기계', '성', '암흑'] as const;
export const ATTRS = ['백신', '데이터', '바이러스'] as const;
export type Family = (typeof FAMILIES)[number];
export type Attr = (typeof ATTRS)[number];
export type ApKey = Family | Attr;

export const STAT_KEYS = ['hp', 'tp', 'atk', 'def', 'int', 'spd'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;
export const STAT_LABEL: Record<StatKey, string> = { hp: 'HP', tp: 'TP', atk: '공격', def: '방어', int: '지능', spd: '민첩' };

export interface Cond {
  ap?: Partial<Record<ApKey, number>>;
  battles?: number;
  winRate?: number;
  penalties?: number;
  eggs?: number;
  /** 수명이 다할 때까지 다른 조건을 채우지 않으면 진화 */
  time?: boolean;
}

export interface Evo {
  to: string;
  cond: Cond;
}

export interface Species {
  id: string;
  name: string;
  stage: Stage;
  family: Family;
  attr: Attr;
  /** 용량(G) */
  size: number;
  evos: Evo[];
}

export const PERSONALITIES = ['솔직', '쿨', '열혈', '대담', '겁쟁이', '게으름', '성급한', '제멋대로'] as const;
export type Personality = (typeof PERSONALITIES)[number];

export interface Digimon {
  uid: number;
  speciesId: string;
  isEgg: boolean;
  /** 디지에그화 후 다시 태어날 유년기I */
  originBaby: string;
  personality: Personality;
  stats: Stats;
  ap: Record<ApKey, number>;
  /** 현재 단계에서 지난 게임 분 */
  stageAge: number;
  hunger: number;
  fatigue: number;
  poop: number;
  sick: boolean;
  injured: boolean;
  /** 발병 횟수 (페널티) */
  penalties: number;
  battles: number;
  wins: number;
  /** 디지에그화 횟수 */
  eggs: number;
  cage: string;
  rottenEaten: number;
  starvingMinutes: number;
  dirtyMinutes: number;
  sickMinutes: number;
  poopTimer: number;
}

export interface SaveData {
  version: 2;
  /** 게임 내 총 경과 분 */
  clock: number;
  bits: number;
  meat: number;
  pills: number;
  rotten: number;
  ropeLevel: number;
  cages: string[];
  digimon: Digimon[];
  titles: string[];
  /** 챔피언십 예선 통과 연도 (본선은 다음 해) */
  qualifiedYear: number | null;
  champion: boolean;
  nextUid: number;
  seen: string[];
  lastSavedAt: number;
}

export type AttackMode = '일반' | '지원' | '특수';
