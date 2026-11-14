import statTable from '../data/training.json';
import type { Rng } from './rng';
import raw from '../data/evolutions.txt?raw';
import habitatRaw from '../data/habitats.txt?raw';
import speciesRaw from '../data/species.txt?raw';
import speciesApiRaw from '../data/species-api.txt?raw';
import { ATTRS, FAMILIES, STAT_KEYS, type ApKey, type Attr, type Cond, type Family, type Species, type SpeciesAttr, type Stage, type StatKey, type Stats } from './types';

export const STAGE_LABEL: Record<Stage, string> = { 1: '유년기I', 2: '유년기II', 3: '성장기', 4: '성숙기', 5: '완전체', 6: '궁극체' };
/** 단계별 수명(게임 분) */
/**
 * 세대별 지속 시간(분): 1·4·8·12·17·21일.
 * 값은 원본 실행 코드의 디지몬 표(+44, 세대마다 모든 종이 같다)이고, '수명'이라는 뜻은 추정이다 (형규 지시로 적용).
 */
export const LIFESPAN: Record<Stage, number> = { 1: 1440, 2: 5760, 3: 11520, 4: 17280, 5: 24480, 6: 30240 };
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

/** 원본 표의 속성·종족 (이름 → 값) */
const ORIGINAL: Record<string, { attr: SpeciesAttr; family: string; stage: number; size: number; life: number; stats: number[]; speed: number; awake: number[]; sleep: number[] }> = {};
for (const line of speciesRaw.split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [name, attr, family, stage, , size, life, stats, speed, awake, sleep] = line.split('|');
  ORIGINAL[name] = { attr: attr as SpeciesAttr, family, stage: Number(stage), size: Number(size), life: Number(life), stats: stats.split(',').map(Number), speed: Number(speed), awake: awake.split(',').map(Number), sleep: sleep.split(',').map(Number) };
}
export const originalSpecies = (id: string) => ORIGINAL[id];
/** 원본에서 프리·없음인 종의 속성을 디지몬 API 값으로 보완한 표 (src/data/species-api.txt) */
const API_ATTR: Record<string, SpeciesAttr> = {};
for (const line of speciesApiRaw.split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [name, attr] = line.split('|');
  API_ATTR[name] = attr as SpeciesAttr;
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

  // 아래 추정값(진화 조건에 쓰이는 수치로 투표)은 원본 표에 값이 없을 때만 쓴다
  const top = <K extends string>(v: Partial<Record<K, number>> | undefined): K | null => {
    const e = Object.entries(v ?? {}) as [K, number][];
    return e.length ? e.sort((a, b) => b[1] - a[1])[0][0] : null;
  };
  const ordered = Object.values(out).sort((a, b) => a.stage - b.stage);
  for (const sp of ordered) {
    const p = parent[sp.id] ? out[parent[sp.id]] : null;
    // 속성·종족은 원본 실행 코드의 디지몬 표 값이다 (src/data/species.txt).
    // 표에 종족이 없는 유년기1과 표에 없는 종만 예전처럼 진화 조건에서 추정한다.
    const real = ORIGINAL[sp.id];
    const guessed = top(famVotes[sp.id]) ?? (p && sp.stage > 2 ? p.family : FAMILIES[hash(sp.id) % FAMILIES.length]);
    sp.family = real && isFamily(real.family) ? real.family : guessed;
    sp.attr = real ? real.attr : (top(attrVotes[sp.id]) ?? ATTRS[hash(sp.id + '속성') % ATTRS.length]);
    // 원본이 프리·없음일 때만 디지몬 API 값으로 보완한다
    if ((sp.attr === '프리' || sp.attr === '없음') && API_ATTR[sp.id]) sp.attr = API_ATTR[sp.id];
    const dragon = sp.family === '용';
    // 용량은 원본 표(+32) 값. 표에 없는 종만 예전 임시 값
    sp.size = real ? real.size : { 1: 4, 2: 6, 3: 10, 4: 16, 5: dragon ? 24 : 20, 6: dragon ? 32 : 24 }[sp.stage];
  }
  return out;
}

export const SPECIES = build();

export function getSpecies(id: string): Species {
  const s = SPECIES[id];
  if (!s) throw new Error(`Unknown species: ${id}`);
  return s;
}

/** 원본 종별 곡선 인덱스가 가리키는 기본 훈련 범위. */
export function statBounds(id: string, key: StatKey): { min: number; max: number } {
  const column = STAT_KEYS.indexOf(key), index = ORIGINAL[id]?.stats[column] ?? 0;
  return { min: statTable.curves[index][column], max: statTable.curves[Math.min(24, index + 3)][column] - (key === 'hp' ? 10 : 1) };
}

/** ARM9 0x0206159c: 시작 곡선 값 + 다음 곡선 간격 절반 안의 난수. HP는10단위. */
export function initialStats(id: string, rng: Rng = Math.random): Stats {
  getSpecies(id); // 알 수 없는 종을 조용히 생성하지 않는다.
  return Object.fromEntries(STAT_KEYS.map((key, column) => {
    const index = ORIGINAL[id]?.stats[column] ?? 0, step = key === 'hp' ? 10 : 1;
    const start = statTable.curves[index][column], next = statTable.curves[Math.min(24, index + 1)][column];
    const slots = Math.trunc(Math.trunc((next - start) / 2) / step);
    const roll = Math.min(0.999999999, Math.max(0, rng()));
    return [key, start + (slots ? Math.floor(roll * slots) * step : 0)];
  })) as Stats;
}

/** 상대의 표준치는 원본 초기 범위의 중앙. 대회별 배율은 여전히 웹판 난이도 정책이다. */
export function typicalStats(id: string, scale = 1): Stats {
  const stats = initialStats(id, () => 0.5);
  return Object.fromEntries(STAT_KEYS.map(key => [key, Math.max(1, Math.round(stats[key] * scale))])) as Stats;
}

export const speciesByStage = (stage: Stage) => Object.values(SPECIES).filter((s) => s.stage === stage);

// ---------- 달력 ----------
export const SEASONS = ['봄', '여름', '가을', '겨울'] as const;
/** 한 계절 8일 (원작 달력 화면 1~8일 확인) */
export const DAYS_PER_SEASON = 8;
/** 하루는 아침 7시에 시작해 23시59분에 끝난다 (마감은 사용자 지정,7시 시작은 임시) */
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 23;
/** 사용자 지정 하루 마감:23:59. */
export const DAY_END_MINUTE = 23 * 60 + 59;
export const MIN_PER_DAY = 1440;
/** 사용자 지정: 실제10초 = 게임10분(×1). 온라인·오프라인 모두 같은 배율. */
export const MINUTES_PER_SECOND = 1;
/** 실제10초마다 게임10분을 한 번에 진행한다. 내부 돌봄 계산은1분씩 유지. */
export const CLOCK_STEP_MINUTES = 10;
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
  /** 원본 결과표가 없는 시설에서만 쓰는 임시 훈련 배수 */
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
// price·minRank는 임시. 훈련은 training.ts의 원본 결과표가 우선하며,
// up/apUp은 시설 분류·표시용, gain/down/apDown은 원본 표에 없는 시설의 임시 대체에만 사용.
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
