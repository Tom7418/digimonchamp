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
  /** 오늘 먹은 알약(프로틴) 수. 다음 배틀 공격 상승, 많으면 부상 위험. 배틀 뒤·밤에 0 */
  protein?: number;
  /** 스트레스 0~100. 화면에는 수치 없이 80 이상일 때 말풍선으로만 보인다 */
  stress?: number;
  /** 이번 배고픔(20 미만) 동안 이미 더한 스트레스 */
  hungerStress?: number;
  /** 스트레스 100으로 이미 병이 났는가 (100 아래로 내려가면 풀림) */
  stressSick?: boolean;
  /** 이번 배치에서 훈련한 게임 분 */
  trainMinutes?: number;
  /** 이번 배치의 훈련을 마쳤는가. 훈련 케이지 밖에 두면 풀린다 */
  trainDone?: boolean;
  /** 마지막으로 쓰다듬은 시각(게임 분) */
  pettedAt?: number;
}

export interface SaveData {
  version: 2;
  /** 게임 내 총 경과 분 */
  clock: number;
  bits: number;
  meat: number;
  /** 알약 = 원작 '프로틴'(txt_list #271·#275): 바닥에 놓으면 먹고, 다음 배틀에서 공격이 오른다 */
  pills: number;
  /** 약(txt_list #272·#276): 병을 고친다. 주사기로 사용 */
  medicine: number;
  /** 상처약(txt_list #273·#277): 부상을 치료한다 */
  salve: number;
  rotten: number;
  /** 가진 로프 id (hunt.ts ROPES) */
  ropes: string[];
  /** 사냥에 들고 가는 로프 id */
  rope: string;
  /** 메모리카드 용량(G): 한 번 사냥에서 데려올 수 있는 양 */
  memoryCard: number;
  /** 옛 저장 형식(로프 단계 1~4). upgradeSave가 ropes로 바꾼다 */
  ropeLevel?: number;
  /** 사냥에서 길을 막는 와이어 개수 */
  wires: number;
  /** 사냥 장비(샷·고기) 수량. 키는 hunt.ts의 SHOTS·BAITS id */
  gear?: Record<string, number>;
  cages: string[];
  digimon: Digimon[];
  titles: string[];
  /** 챔피언십 예선 통과 연도 (본선은 다음 해) */
  qualifiedYear: number | null;
  /** 올해 챔피언십 예선 진행: 치른 날짜와 승수 */
  prelim?: { year: number; days: number[]; wins: number } | null;
  /** 본선에서 이긴 라운드 수 (같은 날 8강 → 4강 → 결승) */
  finalRound?: number;
  champion: boolean;
  nextUid: number;
  seen: string[];
  lastSavedAt: number;
}

export type AttackMode = '일반' | '지원' | '특수';
