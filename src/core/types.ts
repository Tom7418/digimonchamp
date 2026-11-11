export type Stage = 'egg' | 'baby1' | 'baby2' | 'rookie' | 'champion' | 'ultimate';

export type StatKey = 'hp' | 'atk' | 'def' | 'spd' | 'int';
export type Stats = Record<StatKey, number>;

export interface EvolutionRequirement {
  /** ATK·DEF·SPD·INT 중 이 능력치가 가장 높아야 함 */
  dominant?: Exclude<StatKey, 'hp'>;
  minStats?: Partial<Stats>;
  maxCareMistakes?: number;
  minCareMistakes?: number;
  minTrainings?: number;
  minBattles?: number;
  minWins?: number;
  maxWeight?: number;
  minWeight?: number;
}

export interface EvolutionOption {
  to: string;
  req: EvolutionRequirement;
}

/** 절차적 그림 사양. 나중에 sprite 경로로 교체할 수 있다. */
export interface ArtSpec {
  body: 'blob' | 'round' | 'beast' | 'drake' | 'golem' | 'spirit';
  color: string;
  accent: string;
  size: number;
  horns?: number;
  wings?: boolean;
  tail?: boolean;
  spikes?: boolean;
  sprite?: string;
}

export interface Species {
  id: string;
  name: string;
  stage: Stage;
  /** 이 단계에 머무는 게임 시간(분). 최종 단계는 0 */
  stageMinutes: number;
  /** 진화 시 더해지는 기본 능력치 */
  baseStats: Stats;
  moves: string[];
  evolutions: EvolutionOption[];
  art: ArtSpec;
  description: string;
}

export interface Move {
  id: string;
  name: string;
  kind: 'physical' | 'special' | 'guard';
  power: number;
  /** 행동 게이지 소모 배율 (1 = 기본) */
  cost: number;
}

export interface Monster {
  speciesId: string;
  nickname: string;
  stats: Stats;
  /** 현재 단계에서 지난 게임 분 */
  stageAge: number;
  /** 태어난 후 전체 게임 분 */
  totalAge: number;
  hunger: number;
  energy: number;
  weight: number;
  poop: number;
  sick: boolean;
  careMistakes: number;
  trainings: number;
  battles: number;
  wins: number;
  /** 실수 중복 집계 방지용 타이머 (게임 분) */
  starvingMinutes: number;
  dirtyMinutes: number;
  sickMinutes: number;
  poopTimer: number;
}

export interface SaveData {
  version: 1;
  monster: Monster;
  /** 게임 내 총 경과 분 */
  clock: number;
  lastSavedAt: number;
}

export type Tactic = 'aggressive' | 'balanced' | 'careful';
