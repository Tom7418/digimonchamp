import raw from '../data/evolutions.txt?raw';
import habitatRaw from '../data/habitats.txt?raw';
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

  // Windows 체크아웃의 CRLF도 처리한다. 궁극체의 빈 진화칸에 '\r'이 남으면 조건 파싱이 실패한다.
  for (const line of raw.split(/\r?\n/)) {
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
  /** 원작 번호 (0은 이 게임에만 있는 자유 활동 구역) */
  no: number;
  /** 훈련 한 번의 상승 배수 (임시) */
  gain?: number;
  /** 먹이·배설물을 알아서 처리 (동물원·목장) */
  autoCare?: boolean;
  /** 훈련 한 번에 늘어나는 배틀 수 (링) */
  battleUp?: number;
  /** 올려 주는 내성 (규칙 미구현) */
  resist?: string;
  /** 위키에 표가 없어 이 프로젝트에서 채워 넣은 케이지 */
  supplemental?: boolean;
}
type StatKey2 = keyof Stats;

// 케이지 40종: 이름·순서·효과·수용 수는 원작 글(root/ui/txt txt_list 487~566번)에서 확인.
//   no는 원작 번호이자 그림 번호(root/training/field_cmNN_01).
// 임시 값: price·minRank, gain(훈련 한 번의 상승 배수: 미니·1칸 1, 큰 시설 2),
//   down·apDown(원작 글에는 내려가는 값이 없다. 예전 임시 규칙을 미니 시설에만 남김).
// 내성(빛·열·추위·천둥·어둠) 시설은 내성 규칙이 아직 없어 팔지 않는다(price 0). 대기실(28)·덮개(29)는 설명이 없어 뺐다.
export const CAGES: Cage[] = [
  { id: '기본 케이지', no: 0, price: 0, minRank: 1, capacity: 99 },
  { id: '공터', no: 1, price: 0, minRank: 1, capacity: 2, up: ['def'], down: ['atk'] },
  { id: '운동장', no: 2, price: 2000, minRank: 3, capacity: 6, up: ['hp'], gain: 2 },
  { id: '경기장', no: 3, price: 4500, minRank: 5, capacity: 10, up: ['spd'], gain: 2 },
  { id: '도장', no: 4, price: 2000, minRank: 3, capacity: 6, up: ['tp'], gain: 2 },
  { id: '체육관', no: 5, price: 3000, minRank: 4, capacity: 8, up: ['atk'], gain: 2 },
  { id: '연구소', no: 6, price: 3000, minRank: 4, capacity: 8, apUp: ['데이터'], gain: 2 },
  { id: '화산', no: 7, price: 3000, minRank: 4, capacity: 8, apUp: ['용'], gain: 2 },
  { id: '초원', no: 8, price: 2000, minRank: 3, capacity: 6, apUp: ['짐승'], gain: 2 },
  { id: '해변', no: 9, price: 3000, minRank: 4, capacity: 8, apUp: ['물'], gain: 2 },
  { id: '고산', no: 10, price: 3000, minRank: 4, capacity: 8, apUp: ['새'], gain: 2 },
  { id: '숲', no: 11, price: 2000, minRank: 3, capacity: 6, apUp: ['벌레풀'], gain: 2 },
  { id: '정글', no: 12, price: 2000, minRank: 3, capacity: 6, apUp: ['벌레풀'], gain: 2 },
  { id: '신전', no: 13, price: 0, minRank: 99, capacity: 6, resist: '빛' },
  { id: '묘지', no: 14, price: 2000, minRank: 3, capacity: 6, apUp: ['암흑'], gain: 2 },
  { id: '공장', no: 15, price: 2000, minRank: 3, capacity: 6, apUp: ['기계'], gain: 2 },
  { id: '미니 양호실', no: 16, price: 0, minRank: 1, capacity: 2, rest: true },
  { id: '병원', no: 17, price: 2000, minRank: 3, capacity: 6, apUp: ['백신'], gain: 2 },
  { id: '화원', no: 18, price: 1200, minRank: 2, capacity: 4, apUp: ['성'], gain: 2 },
  { id: '온천', no: 19, price: 3500, minRank: 4, capacity: 8, rest: true },
  { id: '사막', no: 20, price: 0, minRank: 99, capacity: 6, resist: '열' },
  { id: '얼음', no: 21, price: 0, minRank: 99, capacity: 8, resist: '추위' },
  { id: '발전소', no: 22, price: 0, minRank: 99, capacity: 6, resist: '천둥' },
  { id: '가스실', no: 23, price: 1200, minRank: 2, capacity: 4, apUp: ['바이러스'], gain: 2 },
  { id: '절', no: 24, price: 400, minRank: 1, capacity: 2, up: ['int'] },
  { id: '동물원', no: 25, price: 1500, minRank: 2, capacity: 2, autoCare: true },
  { id: '목장', no: 26, price: 4000, minRank: 4, capacity: 8, autoCare: true },
  { id: '링', no: 27, price: 2500, minRank: 3, capacity: 6, battleUp: 1 },
  { id: '미니 운동장', no: 30, price: 0, minRank: 1, capacity: 2, up: ['hp'], down: ['tp'] },
  { id: '양호실', no: 31, price: 2000, minRank: 3, capacity: 6, rest: true },
  { id: '미니 화원', no: 32, price: 400, minRank: 1, capacity: 2, apUp: ['성'], apDown: ['암흑'] },
  { id: '미니 숲', no: 33, price: 400, minRank: 1, capacity: 2, apUp: ['벌레풀'], apDown: ['기계'] },
  { id: '미니 체육관', no: 34, price: 300, minRank: 1, capacity: 2, up: ['atk'], down: ['def'] },
  { id: '미니 화산', no: 35, price: 400, minRank: 1, capacity: 2, apUp: ['용'], apDown: ['짐승'] },
  { id: '미니 얼음', no: 36, price: 0, minRank: 99, capacity: 2, resist: '추위' },
  { id: '미니 고산', no: 37, price: 400, minRank: 1, capacity: 2, apUp: ['새'], apDown: ['물'] },
  { id: '미니 공장', no: 38, price: 400, minRank: 1, capacity: 2, apUp: ['기계'], apDown: ['벌레풀'] },
  { id: '미니 해변', no: 39, price: 400, minRank: 1, capacity: 2, apUp: ['물'], apDown: ['새'] },
  { id: '동굴', no: 40, price: 0, minRank: 99, capacity: 2, resist: '어둠' },
];
/** 예전 임시 케이지 이름 → 원작 이름 (저장 데이터 이전용) */
export const CAGE_RENAMES: Record<string, string> = {
  '미니 수영장': '미니 해변',
  '미니 새장': '미니 고산',
  '미니 묘지': '묘지',
  '백신 연구실': '병원',
  '데이터 연구실': '연구소',
  '바이러스 연구실': '가스실',
};
export const getCage = (id: string) => CAGES.find((c) => c.id === id) ?? CAGES[0];
export const START_CAGES = ['기본 케이지', '미니 양호실', '공터', '미니 운동장'];

// ---------- 사냥터 ----------
// 사냥터 이름·순서: GameFAQs Digimon World Championship FAQ(영문판 14곳 + 잉카 유적)와
// 나무위키 진화 목록의 출현 장소 칸(한글 이름)을 맞춘 것. 출현 디지몬은 src/data/habitats.txt.
// minRank·fee는 원작 값을 확인하지 못한 임시 값 (잉카 유적은 FAQ의 '챔피언십 우승 뒤 열림'을 따름).
export interface Field {
  id: string;
  minRank: number;
  fee: number;
  /** [이름, 출현 계절(봄여가겨) + '밤'/'낮'(그 시간대에만) + '드묾'(낮은 확률)] */
  spawns: [string, string][];
}
const FIELD_LIST: Omit<Field, 'spawns'>[] = [
  { id: '다이나 초원', minRank: 1, fee: 0 },
  { id: '미끌미끌 늪', minRank: 1, fee: 0 },
  { id: '파도치는 해변', minRank: 2, fee: 100 },
  { id: '바위산', minRank: 2, fee: 100 },
  { id: '모쥬라의 숲', minRank: 2, fee: 100 },
  { id: '하수도', minRank: 2, fee: 100 },
  { id: '이글이글 사막', minRank: 3, fee: 200 },
  { id: '대초원', minRank: 3, fee: 200 },
  { id: '오아시스', minRank: 3, fee: 200 },
  { id: '암반 계곡', minRank: 3, fee: 200 },
  { id: '용암지대', minRank: 4, fee: 300 },
  { id: '부츠 정글', minRank: 4, fee: 300 },
  { id: '크롬 광산', minRank: 4, fee: 300 },
  { id: '기계 공장', minRank: 4, fee: 300 },
  { id: '눈의 왕국', minRank: 5, fee: 400 },
  { id: '잉카 유적', minRank: 9, fee: 400 },
];

/** habitats.txt: `이름|장소:계절, 장소:계절` */
export function parseHabitats(text: string): Record<string, [string, string][]> {
  const out: Record<string, [string, string][]> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const [name, rest] = line.split('|');
    for (const part of rest.split(',')) {
      const [place, when] = part.split(':').map((x) => x.trim());
      if (!place || !when) continue;
      (out[place] ??= []).push([name.trim(), when]);
    }
  }
  return out;
}

const HABITATS = parseHabitats(habitatRaw);
export const FIELDS: Field[] = FIELD_LIST.map((f) => ({ ...f, spawns: HABITATS[f.id] ?? [] }));
export const SEASON_CODE = ['봄', '여', '가', '겨'];
