import raw from '../data/evolutions.txt?raw';
import { ATTRS, FAMILIES, type ApKey, type Attr, type Cond, type Family, type Species, type Stage, type Stats } from './types';

export const STAGE_LABEL: Record<Stage, string> = { 1: '유년기I', 2: '유년기II', 3: '성장기', 4: '성숙기', 5: '완전체', 6: '궁극체' };
/** 단계별 수명(게임 분) */
export const LIFESPAN: Record<Stage, number> = { 1: 12 * 60, 2: 24 * 60, 3: 72 * 60, 4: 120 * 60, 5: 192 * 60, 6: 240 * 60 };
export const EGG_MINUTES = 30;

const isFamily = (s: string): s is Family => (FAMILIES as readonly string[]).includes(s);
const isAttr = (s: string): s is Attr => (ATTRS as readonly string[]).includes(s);

export function parseCond(text: string): Cond {
  const c: Cond = {};
  for (const tok of text.split('+')) {
    const m = /^(\D+?)(\d+)?$/.exec(tok.trim());
    if (!m) continue;
    const [, key, numText] = m;
    const n = Number(numText ?? 0);
    if (key === '시간') c.time = true;
    else if (key === '배틀') c.battles = n;
    else if (key === '승률') c.winRate = n;
    else if (key === '페널티') c.penalties = n;
    else if (key === '에그') c.eggs = n;
    else if (isFamily(key) || isAttr(key)) (c.ap ??= {})[key] = n;
    else throw new Error(`알 수 없는 진화 조건: ${tok}`);
  }
  return c;
}

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function build(): Record<string, Species> {
  const out: Record<string, Species> = {};
  const famVotes: Record<string, Partial<Record<Family, number>>> = {};
  const attrVotes: Record<string, Partial<Record<Attr, number>>> = {};
  const parent: Record<string, string> = {};
  const ensure = (name: string, stage: Stage) =>
    (out[name] ??= { id: name, name, stage, family: '짐승', attr: '데이터', size: 0, evos: [] });
  const vote = (name: string, cond: Cond, w: number) => {
    for (const [k, v] of Object.entries(cond.ap ?? {}) as [ApKey, number][]) {
      if (isFamily(k)) (famVotes[name] ??= {})[k] = (famVotes[name]![k] ?? 0) + v * w;
      else (attrVotes[name] ??= {})[k] = (attrVotes[name]![k] ?? 0) + v * w;
    }
  };

  for (const line of raw.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [stageText, name, evoText] = line.split('|');
    const stage = Number(stageText) as Stage;
    const sp = ensure(name, stage);
    sp.stage = stage;
    for (const part of (evoText ?? '').split(',').filter(Boolean)) {
      const [to, condText] = part.split(':');
      const cond = parseCond(condText);
      sp.evos.push({ to, cond });
      ensure(to, Math.min(6, stage + 1) as Stage);
      parent[to] ??= name;
      vote(to, cond, 2);
      vote(name, cond, 1);
    }
  }

  // 종족·속성은 진화 조건에 쓰이는 수치에서 추정한다 (원작 수치를 옮긴 것이 아님)
  const top = <K extends string>(v: Partial<Record<K, number>> | undefined): K | null => {
    const e = Object.entries(v ?? {}) as [K, number][];
    return e.length ? e.sort((a, b) => b[1] - a[1])[0][0] : null;
  };
  const ordered = Object.values(out).sort((a, b) => a.stage - b.stage);
  for (const sp of ordered) {
    const p = parent[sp.id] ? out[parent[sp.id]] : null;
    sp.family = top(famVotes[sp.id]) ?? (p && sp.stage > 2 ? p.family : FAMILIES[hash(sp.id) % FAMILIES.length]);
    sp.attr = top(attrVotes[sp.id]) ?? ATTRS[hash(sp.id + '속성') % ATTRS.length];
    const dragon = sp.family === '용';
    sp.size = { 1: 4, 2: 6, 3: 10, 4: 16, 5: dragon ? 24 : 20, 6: dragon ? 32 : 24 }[sp.stage];
  }
  return out;
}

export const SPECIES = build();

export function getSpecies(id: string): Species {
  const s = SPECIES[id];
  if (!s) throw new Error(`Unknown species: ${id}`);
  return s;
}

/** 종족별 능력치 성향 (합 6) */
const PROFILE: Record<Family, Stats> = {
  용: { hp: 1.1, tp: 0.7, atk: 1.5, def: 1.0, int: 0.8, spd: 0.9 },
  짐승: { hp: 1.0, tp: 0.7, atk: 1.2, def: 0.8, int: 0.8, spd: 1.5 },
  물: { hp: 1.4, tp: 0.9, atk: 0.9, def: 1.3, int: 0.9, spd: 0.6 },
  새: { hp: 0.8, tp: 1.0, atk: 1.0, def: 0.7, int: 1.1, spd: 1.4 },
  벌레풀: { hp: 1.2, tp: 0.9, atk: 1.0, def: 1.3, int: 0.8, spd: 0.8 },
  기계: { hp: 1.0, tp: 0.8, atk: 1.2, def: 1.5, int: 0.9, spd: 0.6 },
  성: { hp: 0.9, tp: 1.4, atk: 0.8, def: 0.9, int: 1.4, spd: 0.6 },
  암흑: { hp: 0.9, tp: 1.2, atk: 1.2, def: 0.7, int: 1.3, spd: 0.7 },
};
const STAGE_BONUS: Record<Stage, number> = { 1: 8, 2: 10, 3: 25, 4: 55, 5: 110, 6: 200 };

/** 해당 종으로 진화(또는 부화)할 때 더해지는 능력치 */
export function evolutionBonus(id: string): Stats {
  const sp = getSpecies(id);
  const p = PROFILE[sp.family];
  const b = STAGE_BONUS[sp.stage];
  return { hp: Math.round(p.hp * b), tp: Math.round(p.tp * b), atk: Math.round(p.atk * b), def: Math.round(p.def * b), int: Math.round(p.int * b), spd: Math.round(p.spd * b) };
}

/** 야생/상대 디지몬의 표준 능력치 */
export function typicalStats(id: string, scale = 1): Stats {
  const sp = getSpecies(id);
  const total = [0, 8, 18, 45, 110, 240, 460][sp.stage] * scale;
  const p = PROFILE[sp.family];
  return { hp: Math.round(p.hp * total), tp: Math.round(p.tp * total), atk: Math.round(p.atk * total), def: Math.round(p.def * total), int: Math.round(p.int * total), spd: Math.round(p.spd * total) };
}

export const speciesByStage = (stage: Stage) => Object.values(SPECIES).filter((s) => s.stage === stage);

// ---------- 달력 ----------
export const SEASONS = ['봄', '여름', '가을', '겨울'] as const;
/** 한 계절 8일 (원작 달력 화면 1~8일 확인) */
export const DAYS_PER_SEASON = 8;
/** 하루는 아침 7시에 시작해 밤 9시에 끝난다 (밤 9시 마감은 영상 확인, 7시 시작은 임시) */
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 21;
export const MIN_PER_DAY = 1440;
export const START_CLOCK = 8 * 60;

export function dateOf(clock: number) {
  const dayIndex = Math.floor(clock / MIN_PER_DAY);
  const year = Math.floor(dayIndex / (DAYS_PER_SEASON * 4)) + 1;
  const season = Math.floor(dayIndex / DAYS_PER_SEASON) % 4;
  const day = (dayIndex % DAYS_PER_SEASON) + 1;
  const hour = Math.floor((clock % MIN_PER_DAY) / 60);
  const minute = clock % 60;
  return { dayIndex, year, season, seasonName: SEASONS[season], day, hour, minute };
}

// ---------- 케이지 ----------
export interface Cage {
  id: string;
  price: number;
  minRank: number;
  capacity: number;
  up?: StatKey2[];
  down?: StatKey2[];
  apUp?: ApKey[];
  apDown?: ApKey[];
  rest?: boolean;
  /** 위키에 표가 없어 이 프로젝트에서 채워 넣은 케이지 */
  supplemental?: boolean;
}
type StatKey2 = keyof Stats;

export const CAGES: Cage[] = [
  { id: '기본 케이지', price: 0, minRank: 1, capacity: 99 },
  { id: '미니 양호실', price: 0, minRank: 1, capacity: 2, rest: true },
  { id: '공터', price: 0, minRank: 1, capacity: 2, up: ['def'], down: ['atk'], apUp: ['벌레풀'], apDown: ['기계'] },
  { id: '미니 운동장', price: 0, minRank: 1, capacity: 2, up: ['hp'], down: ['tp'], apUp: ['짐승'], apDown: ['용'] },
  { id: '미니 체육관', price: 300, minRank: 1, capacity: 2, up: ['atk'], down: ['def'], apUp: ['기계'], apDown: ['벌레풀'] },
  { id: '미니 화산', price: 400, minRank: 1, capacity: 2, up: ['atk'], down: ['def'], apUp: ['용'], apDown: ['짐승'] },
  { id: '미니 화원', price: 400, minRank: 1, capacity: 2, up: ['int'], down: ['atk'], apUp: ['성', '벌레풀'], apDown: ['암흑', '기계'] },
  { id: '미니 수영장', price: 400, minRank: 1, capacity: 2, up: ['hp'], down: ['spd'], apUp: ['물'], apDown: ['새'], supplemental: true },
  { id: '미니 새장', price: 400, minRank: 1, capacity: 2, up: ['spd'], down: ['def'], apUp: ['새'], apDown: ['물'], supplemental: true },
  { id: '미니 묘지', price: 400, minRank: 1, capacity: 2, up: ['int'], down: ['hp'], apUp: ['암흑'], apDown: ['성'], supplemental: true },
  { id: '백신 연구실', price: 800, minRank: 2, capacity: 2, up: ['tp'], apUp: ['백신'], apDown: ['바이러스'], supplemental: true },
  { id: '데이터 연구실', price: 800, minRank: 2, capacity: 2, up: ['tp'], apUp: ['데이터'], apDown: ['백신'], supplemental: true },
  { id: '바이러스 연구실', price: 800, minRank: 2, capacity: 2, up: ['tp'], apUp: ['바이러스'], apDown: ['데이터'], supplemental: true },
  { id: '운동장', price: 1500, minRank: 3, capacity: 6, up: ['spd'], supplemental: false },
];
export const getCage = (id: string) => CAGES.find((c) => c.id === id) ?? CAGES[0];
export const START_CAGES = ['기본 케이지', '미니 양호실', '공터', '미니 운동장'];

// ---------- 사냥터 (유년기 서식지) ----------
export interface Field {
  id: string;
  minRank: number;
  fee: number;
  /** [이름, 출현 계절(봄여가겨)] */
  spawns: [string, string][];
}
export const FIELDS: Field[] = [
  { id: '다이나 초원', minRank: 1, fee: 0, spawns: [['새싹몬', '봄'], ['뽀글몬', '가겨'], ['푸니몬', '봄'], ['포요몬', '가겨'], ['뿔몬', '봄'], ['토코몬', '가겨'], ['야옹몬', '봄여'], ['어니몬', '봄여']] },
  { id: '미끌미끌 늪', minRank: 1, fee: 0, spawns: [['즈루몬', '봄여'], ['뽀글몬', '봄가겨'], ['피치몬', '봄여가겨'], ['포요몬', '봄여겨'], ['시드몬', '봄'], ['둥실몬', '가겨'], ['모티몬', '봄겨']] },
  { id: '모쥬라의 숲', minRank: 2, fee: 100, spawns: [['즈루몬', '가겨'], ['새싹몬', '봄'], ['뽀글몬', '가겨'], ['유라몬', '가겨'], ['시드몬', '봄'], ['야옹몬', '봄여'], ['퍼그몬', '봄여']] },
  { id: '하수도', minRank: 2, fee: 100, spawns: [['즈루몬', '여가'], ['뽈뽈몬', '봄여가'], ['포요몬', '봄가'], ['카프리몬', '봄']] },
  { id: '이글이글 사막', minRank: 3, fee: 200, spawns: [['즈루몬', '가'], ['푸니몬', '봄여'], ['모크몬', '봄여'], ['카프리몬', '가'], ['뿔몬', '봄'], ['쁘띠메라몬', '봄'], ['문몬', '가']] },
  { id: '대초원', minRank: 3, fee: 200, spawns: [['뽈뽈몬', '여'], ['새싹몬', '봄가'], ['깜몬', '봄가겨']] },
  { id: '용암지대', minRank: 4, fee: 300, spawns: [['깜몬', '여'], ['모크몬', '봄여가'], ['코로몬', '봄여']] },
  { id: '부츠 정글', minRank: 4, fee: 300, spawns: [['시드몬', '봄여'], ['어니몬', '가'], ['모티몬', '가']] },
  { id: '눈의 왕국', minRank: 5, fee: 400, spawns: [['하얀몬', '겨'], ['둥실몬', '여겨']] },
  { id: '잉카 유적', minRank: 5, fee: 400, spawns: [['산몬', '여'], ['문몬', '가'], ['유라몬', '가']] },
];
export const SEASON_CODE = ['봄', '여', '가', '겨'];
