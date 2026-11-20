import { applyTraining } from './training';
import facilityEffects from '../data/facility-effects.json';
import { evolvedStats, upgradeStats } from './stats';
import { CAGE_LEVEL_FACTOR, CAGE_LEVEL_ROWS, CAGE_LEVEL_SIDE_FACTOR, CAGE_SHOP, CAGE_RENAMES, CAGES, dateOf, DAY_END_MINUTE, DAY_START_HOUR, EGG_MINUTES, initialStats, getCage, getSpecies, originalSpecies, LIFESPAN, MIN_PER_DAY, START_CAGES, START_CLOCK } from './data';
import { endOfLife, findEvolution, type EvoResult } from './evolution';
import { defaultRng, pick, type Rng } from './rng';
import { capacityOf, migrateTitleIds, tamerRank } from './titles';
import { bestRope, MEMORY_CARDS, ROPES, START_ROPE, WIRE_PACK, BAIT_PACK, BAITS, GEARS, gearCount, itemUnlocked, SHOT_PACK, SHOTS } from './hunt';
import { pluginPrice, shopPlugins, togglePlugin } from './plugins';
import { ATTRS, FAMILIES, PERSONALITIES, STAT_KEYS, type ApKey, type Digimon, type SaveData, type Stats } from './types';

/** 최대치. 실제 용량은 랭크에 따라 capacityOf(save) */
export const CAPACITY = 200;
export const OFFLINE_CAP_MINUTES = 12 * 60;

const zeroAp = () => Object.fromEntries([...FAMILIES, ...ATTRS].map((k) => [k, 0])) as Record<ApKey, number>;

export function newDigimon(uid: number, speciesId: string, rng: Rng = defaultRng, wild = false): Digimon {
  return {
    uid,
    speciesId,
    isEgg: false,
    originBaby: getSpecies(speciesId).stage === 1 ? speciesId : '깜몬',
    personality: pick(rng, PERSONALITIES),
    // 사육·포획 모두 같은 원본 초기 범위. 야생 여부로 임시 능력치 배수를 주지 않는다.
    stats: initialStats(speciesId, rng),
    statVersion: 1,
    ap: zeroAp(),
    stageAge: 0,
    hunger: 70,
    fatigue: 0,
    resistVersion: 1,
    poop: 0,
    sick: false,
    injured: false,
    penalties: 0,
    battles: 0,
    wins: 0,
    eggs: 0,
    cage: '기본 케이지',
    rottenEaten: 0,
    starvingMinutes: 0,
    dirtyMinutes: 0,
    sickMinutes: 0,
    poopTimer: 0,
  };
}

/** 사용자 지정 균형값. 원작 수치가 아니다. 깨어 있는5시간마다 기본 배설, 하루 최대4회. */
export const POOP_INTERVAL = { baby: 300, grown: 300 };
export const POOP_LIMIT_PER_DAY = 4;
export const MEAL_POOP_DELAY = { min: 120, max: 180 };
export function poopInterval(_stage: number): number {
  return POOP_INTERVAL.baby;
}

function bowelAt(d: Digimon, clock: number): NonNullable<Digimon['bowel']> {
  const day = Math.floor(clock / MIN_PER_DAY), old = d.bowel;
  return { day, count: old?.day === day && Number.isFinite(old.count) ? Math.max(0,Math.min(POOP_LIMIT_PER_DAY,Math.floor(old.count))) : 0,
    ...(Number.isFinite(old?.mealDueAt) ? {mealDueAt:old!.mealDueAt} : {}) };
}

/** 한 입마다 늘리지 않고 첫 식사 예약을 유지한다. 이후 섭취로 기한을 미루지 않는다. */
export function scheduleMealPoop(d: Digimon, clock: number, rng: Rng = defaultRng): Digimon {
  const bowel = bowelAt(d, clock);
  if (bowel.mealDueAt === undefined)
    bowel.mealDueAt = clock + MEAL_POOP_DELAY.min + Math.floor(rng() * (MEAL_POOP_DELAY.max - MEAL_POOP_DELAY.min + 1));
  return {...d,bowel};
}

/** 원본 표의 각성/수면 범위. 분 단위 진행과 야간 일괄 수면의 병합은 웹판 정책이다. */
const cycleMinutes = (range: number[], rng: Rng) => range[0] + Math.floor(rng() * Math.max(1, range[1] - range[0]));
export const isSleeping = (d: Digimon): boolean => !d.isEgg && d.restCycle?.species === d.speciesId && d.restCycle.sleepLeft > 0;
/** 훈련 상태 판정은 화면의 성급한 달리기와 실제 훈련이 공유한다. */
export function isTraining(d: Digimon): boolean {
  const cage=getCage(d.cage);
  return !!(cage.up||cage.apUp||cage.battleUp)&&!d.isEgg&&!d.trainDone&&!isSleeping(d)&&!d.sick&&!d.injured&&!d.dying&&d.hunger>0&&d.fatigue<90;
}
function tickRestCycle(d: Digimon, rng: Rng, night: boolean): boolean {
  const real = originalSpecies(d.speciesId);
  if (!real) return false;
  // 밤에는 기존 하루 마감을 유지한다. 낮잠 잔여를 아침으로 넘기지 않고 각성 주기를 새로 시작.
  if (night) {
    d.restCycle = undefined;
    return true;
  }
  const old = d.restCycle;
  const cycle = d.restCycle = old?.species === d.speciesId
    ? { ...old } : { species: d.speciesId, awakeLeft: cycleMinutes(real.awake, rng), sleepLeft: 0 };
  if (cycle.sleepLeft > 0) {
    cycle.sleepLeft -= 1;
    if (!cycle.sleepLeft) cycle.awakeLeft = cycleMinutes(real.awake, rng);
  } else if (--cycle.awakeLeft <= 0) {
    cycle.awakeLeft = 0;
    cycle.sleepLeft = cycleMinutes(real.sleep, rng);
  }
  return isSleeping(d);
}

export function upgradeSave(save: SaveData): SaveData {
  const s = { ...save, wires: save.wires ?? 0 };
  if (!Array.isArray(s.ropes) || !s.ropes.length) {
    const level = Math.max(1, Math.min(4, s.ropeLevel ?? 1));
    s.ropes = ['digi1', 'hard1', 'clone1', 'ultima1'].slice(0, level);
  }
  if (!s.ropes.includes(s.rope)) s.rope = bestRope(s.ropes);
  if (!s.memoryCard) s.memoryCard = MEMORY_CARDS[0].size;
  // 예전 알약은 병·부상 치료용이었다 → 약으로 옮기고, 알약은 이제 프로틴(강화)
  if (s.medicine == null) {
    s.medicine = s.pills ?? 0;
    s.salve = 1;
    s.pills = 0;
  }
  if (s.salve == null) s.salve = 0;
  if (!s.gear) s.gear = {};
  delete s.ropeLevel;
  // 보유 타이틀만 이전한다. 랭크·용량·진화 제한은 새 타이틀/랭크 규칙으로 재계산한다.
  s.titles = migrateTitleIds(s.titles);
  // 예전 임시 케이지 이름을 원작 이름으로 옮긴다
  const renamed = (id: string) => CAGE_RENAMES[id] ?? id;
  if (s.cages.some((c) => CAGE_RENAMES[c])) s.cages = [...new Set(s.cages.map(renamed))];
  if (s.digimon.some((d) => CAGE_RENAMES[d.cage])) s.digimon = s.digimon.map((d) => (CAGE_RENAMES[d.cage] ? { ...d, cage: renamed(d.cage) } : d));
  // 기존 바닥 똥/배치/능력치는 보존한다. 새 예약/일일 횟수만 추가하며 재접속으로 초기화하지 않는다.
  s.digimon = s.digimon.map(d => ({...upgradeStats(d),bowel:bowelAt(d,s.clock),
    poopTimer:Number.isFinite(d.poopTimer)?Math.max(0,d.poopTimer):0, ...fixResistNames(d)}));
  return s;
}

/** 예전 훈련 기록은 빛·어둠 내성 이름이 서로 바뀌어 있었다. 한 번만 맞바꾸고 resistVersion 1을 붙인다 */
function fixResistNames(d: Digimon): Partial<Digimon> {
  if (d.resistVersion === 1) return {};
  const r = d.resistance;
  if (!r || (r.빛 === undefined && r.어둠 === undefined)) return { resistVersion: 1 };
  const fixed = { ...r };
  delete fixed.빛; delete fixed.어둠;
  if (r.어둠 !== undefined) fixed.빛 = r.어둠;
  if (r.빛 !== undefined) fixed.어둠 = r.빛;
  return { resistance: fixed, resistVersion: 1 };
}

export function freshSave(now = Date.now()): SaveData {
  return {
    version: 2,
    clock: START_CLOCK,
    bits: 500,
    meat: 10,
    pills: 2,
    medicine: 2,
    salve: 1,
    rotten: 0,
    ropes: [START_ROPE],
    rope: START_ROPE,
    memoryCard: MEMORY_CARDS[0].size,
    // 시작 장비는 원본 아이템 표의 '처음 가진 수': 핸드 건α 20, 일반 고기 10 (노멀 와이어는 블루부터)
    wires: 0,
    gear: { hand1: 20, bait1: 10 },
    cages: [...START_CAGES],
    // 원작처럼 디지에그에서 시작한다 (30분 뒤 깜몬 부화)
    digimon: [{ ...newDigimon(1, '깜몬'), isEgg: true, stats: { hp: 0, tp: 0, atk: 0, def: 0, int: 0, spd: 0 } }],
    titles: [],
    qualifiedYear: null,
    champion: false,
    nextUid: 2,
    seen: ['깜몬'],
    lastSavedAt: now,
  };
}

export const usedCapacity = (save: SaveData) => save.digimon.reduce((s, d) => s + (d.isEgg ? 0 : getSpecies(d.speciesId).size), 0);

export type FarmEvent =
  | { type: 'hatched' | 'evolved'; uid: number; from: string; to: string; memory?: boolean }
  | { type: 'egg'; uid: number; from: string; reason?: 'sick' }
  | { type: 'lost'; uid: number; name: string; reason: string }
  | { type: 'sick'; uid: number; name: string }
  | { type: 'injured'; uid: number; name: string }
  | { type: 'dying'; uid: number; name: string; cause: 'sick' | 'injured' | 'hunger' | 'hp' }
  | { type: 'revived'; uid: number; name: string }
  | { type: 'poop'; uid: number }
  /** 훈련 완료 후 실제로 오른·내린 능력치 (예: 'HP +3, 방어 -1') */
  | { type: 'trained'; uid: number; name: string; changes: string }
  | { type: 'blocked'; uid: number; name: string; reason: 'rank' | 'capacity' };

/**
 * 기억 기록 (원본 ARM9 0x2062E80~0x2062F2C): 진화·디지에그화로 모습이 바뀔 때마다 바뀌기 전 종을
 * 그 세대 칸에 적는다. 이전 기억(first)은 second로 밀린다.
 */
export function remember(d: Digimon): Digimon['memory'] {
  const stage = getSpecies(d.speciesId).stage;
  const m = d.memory ?? { first: {}, second: {} };
  return { first: { ...m.first, [stage]: d.speciesId }, second: { ...m.second, ...(m.first[stage] ? { [stage]: m.first[stage] } : {}) } };
}

/**
 * 기억 진화 (원본 사육 overlay18 0x21165A4~0x21167A0, 0x21167E4). 세대 수명이 다했을 때만 적용한다.
 *  - 진화할 곳이 정해졌을 때: 다음 세대의 기억이 두 칸이면 1/3씩 둘째 기억·첫째 기억·원래 진화, 첫째만 있으면 1/2로 첫째 기억.
 *  - 진화 조건을 하나도 못 채웠을 때: 첫째 기억이 있으면 그 모습으로 진화한다.
 */
export function memoryEvolution(d: Digimon, normal: string | null, rng: Rng): string | null {
  const next = getSpecies(d.speciesId).stage + 1;
  const first = d.memory?.first[next], second = d.memory?.second[next];
  if (normal === null) return first ?? null;
  if (first && second) {
    const r = Math.floor(rng() * 3);
    return r === 0 ? second : r === 1 ? first : null;
  }
  if (first) return rng() < 0.5 ? first : null;
  return null;
}

/** 진화 시 능력치/속성 이월은 사육 틱과 배틀 직후에 같은 규칙을 사용한다. */
function evolveDigimon(d: Digimon, to: string, rng: Rng): Digimon {
  // 원본 ARM9 0x2062258: 새 종 구조체(속성·종족 수치 0)를 만들고 능력치만 이월한다 → 진화하면 속성·종족 수치는 0부터
  const ap = Object.fromEntries(Object.keys(d.ap).map((k) => [k, 0])) as Record<ApKey, number>;
  // 부상 위험도(원본 +0x40)는 이월하지 않아 진화하면 0 (ARM9 0x2062258)
  return { ...d, speciesId: to, stageAge: 0, stats: evolvedStats(d, to, d.eggs, rng), statVersion: 1, ap, rottenEaten: 0, memory: remember(d), injuryRisk: 0 };
}

/** 수명이 다한 뒤의 판정에 기억 진화를 덧씌운다. 기억 진화는 원본처럼 랭크 제한을 다시 보지 않고 용량만 확인한다 */
function lifespanEvolution(d: Digimon, evo: EvoResult, free: number, rng: Rng): (NonNullable<EvoResult> & { memory?: boolean }) | null {
  if (d.isEgg) return evo;
  const sp = getSpecies(d.speciesId);
  if (d.stageAge < LIFESPAN[sp.stage] || sp.stage >= 6) return evo;
  const to = memoryEvolution(d, evo?.kind === 'evolve' ? evo.to : null, rng);
  if (!to || (evo?.kind === 'evolve' && to === evo.to)) return evo;
  if (getSpecies(to).size - sp.size > free) return evo;
  return { kind: 'evolve', to, memory: true };
}

/** 시간/포만감 등을 진행하지 않고 조건만 평가한다. 한 번에 개체당 한 단계만 진화한다. */
export function evaluateEvolutions(save: SaveData, rng: Rng = defaultRng, uids?: ReadonlySet<number>): { save: SaveData; events: FarmEvent[] } {
  const events: FarmEvent[] = [], seen = new Set(save.seen);
  const rank = tamerRank(save);
  let free = capacityOf(save) - usedCapacity(save);
  const digimon = [...save.digimon], evolved = new Set<number>();
  let changed = true;
  // 뒤쪽 개체가 더 작은 종으로 진화해 용량을 비우면, 앞에서 막혔던 개체도 같은 평가에서 재시도한다.
  while (changed) {
    changed = false;
    digimon.forEach((d, i) => {
      if ((uids && !uids.has(d.uid)) || evolved.has(d.uid)) return;
      const evo = lifespanEvolution(d, findEvolution(d, rank, free), free, rng);
      if (evo?.kind !== 'evolve') return;
      free -= getSpecies(evo.to).size - getSpecies(d.speciesId).size;
      events.push({ type: 'evolved', uid: d.uid, from: d.speciesId, to: evo.to, ...(evo.memory ? { memory: true } : {}) });
      seen.add(evo.to);evolved.add(d.uid);changed = true;
      digimon[i] = evolveDigimon(d, evo.to, rng);
    });
  }
  return { save: events.length ? { ...save, digimon, seen: [...seen] } : save, events };
}

/**
 * 스트레스 (원작 도움말 help #127: 쌓이면 병에 걸린다. 수치는 화면에 나오지 않는다).
 * 값은 형규가 정함: 정원 초과로 하루가 지날 때마다 +20, 상한 먹이 +50, 병 +40, 훈련 한 번마다 +5,
 * 배고픔 20 미만부터 1 내려갈 때마다 +1.5 (배고픔 0에서 합계 +30). 70 이상이면 말풍선 표시.
 * 게임 1시간마다 -1, 쉬는 케이지(온천·미니 양호실·양호실·동물원·미니 동물원)에서는 -5.
 * 임시(Claude가 정함): 100이 되면 병.
 */
export const STRESS = { rotten: 50, sick: 40, hungerBelow: 20, perHunger: 1.5, show: 70, restPerHour: 1 };
/** 훈련 한 번에 걸리는 게임 분 */
export const TRAINING_MINUTES = 15;
/** 병·부상을 방치해 로스트되기까지의 게임 분 (임시: 이틀) */
export const NEGLECT_MINUTES = 2880;
/**
 * 빈사 (원작 글: help #124·#137·#140~142, mail #97~99). 시간은 원본 사육 overlay18에서 확인.
 *  - 0x2118188~0x2118214: 병 또는 부상인 동안 +0x180, 배고픈 동안(잠든 때 제외) +0x184가 게임 분마다 는다.
 *  - 0x211B108: 둘 중 하나가 20×60분(20시간) 이상이거나 HP가 최대의 1/10 이하면 빈사(+0x13c=1).
 *  - 0x211F2A0: 빈사 시간(+0x188)이 12시간을 넘으면 상태가 한 번 바뀌고, 24시간을 넘으면 로스트/디지에그 처리.
 *  - 0x2119A50: 약·상처약으로 고치면 +0x180이 0, 먹이를 먹으면 +0x184가 0 → 세 조건이 모두 풀리면 빈사 해제.
 * 이 게임은 사육 중 HP가 줄지 않아 'HP 1/10 이하' 조건은 아직 없다.
 */
export const DYING_AFTER_MINUTES = 1200;
export const DYING_LOST_MINUTES = 1440;
/**
 * 현재 HP (원본 디지몬 구조체 +0x50, 최대 +0x58 = stats.hp).
 *  - 배틀은 현재 HP로 시작하고 끝난 HP가 그대로 남는다(배틀 overlay19 0x21179DC: 시작 때 가득 채우지 않음).
 *  - 자연 회복: HP가 최대보다 낮으면 10분이 넘을 때마다 최대의 1%(사육 overlay18 0x21186BC).
 *  - 잠에서 깰 때 최대의 1/30(0x2120048).
 *  - 시설 상시 효과(0x2118648 → 0x2117F54, 표 facility-effects.json 명령6): 간격마다 HP·피로 등 가감.
 *  - 훈련 부가 명령1(0x2117E0C): 훈련 한 번에 HP 감소, 최소 1.
 *  - HP가 최대의 1/10 이하면 빈사(0x211B16C), 1/10을 넘고 다른 원인이 없으면 회복(0x211892C).
 */
export const hpOf = (d: Digimon) => Math.max(0, Math.min(d.stats.hp, d.hpNow ?? d.stats.hp));
const EFFECTS = facilityEffects as Record<string, { command: number; args: number[] }[]>;
/** 훈련 한 번의 HP 증감 (부가 명령1 기본값. 계절·난수 폭 표는 아직 연결하지 않음) */
export const trainingHpCost = (cageNo: number) => (EFFECTS[String(cageNo)] ?? []).filter((c) => c.command === 1).reduce((n, c) => n + c.args[0], 0);
/** 시설 상시 효과 [간격 분, 종류, 값] (종류 1 = HP) */
export const facilityHpEffects = (cageNo: number) => facilityPeriodic(cageNo, 1);
/** 시설 상시 효과 중 한 종류. 종류 번호는 훈련 부가 명령과 같다(1 HP, 2 스트레스) */
export const facilityPeriodic = (cageNo: number, type: number) => (EFFECTS[String(cageNo)] ?? []).filter((c) => c.command === 6 && c.args[1] === type).map((c) => ({ every: c.args[0], amount: c.args[2] }));
/**
 * 훈련 부가 명령 (overlay18 0x2117BE4~0x2117F30, 표 facility-effects.json). 병·부상·빈사면 적용하지 않는다.
 *  명령0 포만감(원본 단위 1 = 종 용량 G분의 1) · 1 현재 HP(최소 1) · 2 스트레스(+0x1C, 0~100) · 5 부상 위험도(0~100).
 *  +0x1C가 스트레스인 근거: 같은 칸이 케이지 인원 수만큼 늘고(0x211AE94), 변비 때 +3(0x211B95C), 100이 되면 병(help #127·mail #96).
 *  명령 번호+22 칸의 계절 가산(겨울 부상 위험도 +1)과 난수 폭(HP ±50, 피로 ±1)을 원본 표(arm9 0x209FCF4·0x209FBA4·0x209FB34)대로.
 *  명령4(배틀 횟수, 링)는 기존 cage.battleUp과 같아 따로 더하지 않는다. 명령3은 쓰는 시설이 없다.
 *  훈련 뒤 배가 비면 부상 위험도 +3(0x211D8C8). 0x211D8F4의 +3 조건(+0x404 플래그)은 미해석이라 웹판은 피로 90 이상으로 둔다(임시).
 */
const SIDE_WINTER = [0, 0, 0, 0, 0, 1];
const SIDE_VARIANCE = [0, 50, 1, 0, 0, 0];
export function trainingSideDelta(command: number, base: number, season: number, rng: Rng): number {
  let value = base + (season === WINTER ? SIDE_WINTER[command] ?? 0 : 0);
  const width = SIDE_VARIANCE[command] ?? 0;
  if (width) {
    const p = Math.min(99, Math.max(0, Math.floor(rng() * 100)));
    const variation = Math.trunc(((2 * width - 1) * p) / 100) - width;
    if (variation !== 0) value += variation;
  }
  return value;
}
function applyTrainingSideEffects(d: Digimon, cageNo: number, season: number, rng: Rng, level = 0): string[] {
  const out: string[] = [];
  if (d.sick || d.injured || d.dying) return out;
  for (const c of EFFECTS[String(cageNo)] ?? []) {
    if (c.command > 5) continue;
    const v = trainingSideDelta(c.command, c.args[0] * (CAGE_LEVEL_SIDE_FACTOR[level]?.[c.command] ?? 1), season, rng);
    if (c.command === 0) {
      d.hunger = Math.max(0, Math.min(100, d.hunger + (v * 100) / Math.max(1, getSpecies(d.speciesId).size)));
      out.push(`포만감 ${v > 0 ? '+' : ''}${v}칸`);
    } else if (c.command === 1) {
      d.hpNow = Math.min(d.stats.hp, Math.max(1, hpOf(d) + v));
      out.push(`현재 HP ${v > 0 ? '+' : ''}${v}`);
    } else if (c.command === 2) {
      addStress(d, v);
      out.push(`스트레스 ${v > 0 ? '+' : ''}${v}`);
    } else if (c.command === 5) {
      d.injuryRisk = Math.max(0, Math.min(100, (d.injuryRisk ?? 0) + v));
    }
  }
  if (d.fatigue >= 90) d.injuryRisk = Math.min(100, (d.injuryRisk ?? 0) + 3);
  if (d.hunger <= 0) d.injuryRisk = Math.min(100, (d.injuryRisk ?? 0) + 3);
  return out;
}

/**
 * 먹으면 HP가 찬다 (원본 overlay18 0x211BD38~0x211BDCC·0x212559C~): 네 입마다 포만감 1칸과 최대 HP의 1%.
 * 이 게임의 포만감은 0~100이라, 원본 1칸(종 용량 G분의 1)을 채울 때마다 1%로 환산해 더한다.
 */
export function eatHp(d: Digimon, hungerGain: number): Digimon {
  if (d.isEgg || hungerGain <= 0) return d;
  const unit = 100 / Math.max(1, getSpecies(d.speciesId).size);
  const gain = Math.trunc((d.stats.hp / 100) * (hungerGain / unit));
  return gain > 0 ? { ...d, hpNow: Math.min(d.stats.hp, hpOf(d) + gain) } : d;
}

const lowHp = (d: Digimon) => hpOf(d) <= Math.trunc(d.stats.hp / 10);

/** 원본 0x2119B2C: 디지에그 그림 번호 = 디지에그화 횟수(최대 7). 0은 처음 받은 흰 알 e000 */
export const eggSpriteIndex = (eggs: number) => Math.max(0, Math.min(7, Math.floor(eggs || 0)));
/**
 * 계절 (원작 도움말 help #136: 여름은 트레이닝 효과가 높고, 겨울은 부상 확률이 오른다).
 * 트레이닝 부상 (help #140: 배틀이나 트레이닝을 할 때 부상당할 수 있다).
 * 배수·확률은 임시 값.
 */
export const SUMMER = 1;
export const WINTER = 3;
/** 프로틴을 먹은 채 훈련하면 1개당 부상 확률 +2% (help #138, 수치 임시) */
export const PROTEIN_TRAIN_INJURY = 0.02;
/** 쓰다듬기 (help #143: 손 아이콘으로 쓰다듬을 수 있다). 효과는 원작에서 확인 못 한 임시 값: 게임 1시간에 한 번 스트레스 -3 */
export const PET = { relief: 3, cooldown: 60 };
/** 동물원·목장이 먹이를 주는 배고픔 기준 (임시) */
export const AUTO_FEED_BELOW = 50;
/** 스트레스가 풀리는 케이지. 온천·양호실·동물원·미니 동물원은 아직 게임에 없지만 추가되면 바로 적용된다 */
/** 쉬는 시설: 시간당 -5 */
/** 동물원·목장: 쉬는 시설보다 약하게 시간당 -3, 피로도 조금 빨리 풀린다 (형규가 정한 방향, 수치는 임시) */
export const AUTO_CARE_REST = 0.2;
export function addStress(d: Digimon, amount: number) {
  d.stress = Math.max(0, Math.min(100, (d.stress ?? 0) + amount));
}

function makeSick(d: Digimon, events: FarmEvent[], stress = STRESS.sick) {
  if (d.sick) return;
  addStress(d, stress);
  d.sick = true;
  d.sickMinutes = 0;
  d.penalties += 1;
  events.push({ type: 'sick', uid: d.uid, name: getSpecies(d.speciesId).name });
}

/**
 * 디지에그로 되돌린다. 원본 사육 overlay18 0x2119B2C: 완전체·궁극체이거나 배틀 10회 이상이면 디지에그,
 * 아니면 로스트. 수명이든 빈사 방치든 같은 함수를 지나며 디지에그화 횟수(+0x3c)를 1 올린다(최대 100).
 */
function toEgg(d: Digimon, countEgg = true): Digimon {
  return {
    ...d,
    isEgg: true,
    eggs: countEgg ? Math.min(100, d.eggs + 1) : d.eggs,
    stageAge: 0,
    // 옛 임시15% 잔여는 폐기. 부화 때 재탄생 횟수 보정을 새 종 범위 안에서 적용한다.
    stats: Object.fromEntries(STAT_KEYS.map(k => [k, 0])) as Stats,
    ap: zeroAp(),
    battles: 0,
    wins: 0,
    penalties: 0,
    sick: false,
    injured: false,
    stress: 0,
    hungerStress: 0,
    stressSick: false,
    poop: 0,
    poopTimer: 0,
    bowel: undefined,
    hunger: 70,
    fatigue: 0,
    cage: '기본 케이지',
    restCycle: undefined,
    resistance: undefined,
    // 원본 0x2062258: 디지에그가 될 때도 마지막 모습을 그 세대 기억에 적는다. 부상 위험도는 0
    memory: remember(d),
    injuryRisk: 0,
  };
}

/** 디지몬 한 마리의 게임 시간 1분. null이면 로스트 */
function tickOne(prev: Digimon, ctx: { rank: number; free: number; isLast: boolean; rng: Rng; clock: number; sleep?: boolean; season?: number; dirty?: boolean; cageLevels?: Record<string, number> }, events: FarmEvent[]): Digimon | null {
  let d: Digimon = { ...prev, stats: { ...prev.stats }, ap: { ...prev.ap } };
  d.stageAge += 1;

  if (d.isEgg) {
    if (d.stageAge >= EGG_MINUTES) {
      // 원본 overlay18 0x211A400: 유년기I 기억이 두 칸이면 1/2씩, 한 칸이면 그 종으로 태어난다
      const first = d.memory?.first[1], second = d.memory?.second[1];
      const baby = first && second ? (ctx.rng() < 0.5 ? second : first) : first ?? d.originBaby;
      events.push({ type: 'hatched', uid: d.uid, from: '디지에그', to: baby });
      d = { ...d, isEgg: false, speciesId: baby, stageAge: 0, stats: evolvedStats(null, baby, d.eggs, ctx.rng), statVersion: 1 };
    }
    return d;
  }

  const sp = getSpecies(d.speciesId);
  const cage = getCage(d.cage);
  const wasSleeping = isSleeping(prev);
  const sleeping = tickRestCycle(d, ctx.rng, !!ctx.sleep) || !!ctx.sleep;
  // 현재 HP 회복
  const maxHp = d.stats.hp;
  let hp = hpOf(d);
  if (wasSleeping && !sleeping) hp += Math.trunc(maxHp / 30);
  if (hp < maxHp) {
    d.hpRegenMinutes = (d.hpRegenMinutes ?? 0) + 1;
    if (d.hpRegenMinutes > 10) {
      d.hpRegenMinutes = 0;
      hp += Math.trunc(maxHp / 100);
    }
  } else d.hpRegenMinutes = 0;
  // 양호실 등 쉬는 시설의 HP 회복에도 케이지 레벨 배율(×2·×3)을 붙인다 — 사용자 결정(원본 미확인)
  const hpFactor = CAGE_LEVEL_FACTOR[ctx.cageLevels?.[cage.id] ?? 0] ?? 1;
  for (const e of facilityHpEffects(cage.no)) if (ctx.clock % e.every === 0) hp += e.amount * hpFactor;
  // 시설 상시 스트레스 (원본 시설 표 명령6 종류2): 미니 양호실·목장·양호실 6분마다 -1, 온천 3분마다 -1, 동물원 4시간마다 +1. 배율은 HP와 같게(형규 지정)
  for (const e of facilityPeriodic(cage.no, 2)) if (ctx.clock % e.every === 0) addStress(d, e.amount * hpFactor);
  d.hpNow = Math.min(maxHp, Math.max(0, hp));
  d.bowel = bowelAt(d, ctx.clock);
  if (sleeping) {
    // 밤과 종별 낮잠: 배고픔·똥·훈련 없이 피로만 풀린다. 병·부상은 계속 진행된다
    d.fatigue = Math.max(0, d.fatigue - 0.3);
  } else {
    d.hunger = Math.max(0, d.hunger - (0.08 * (d.personality === '열혈' ? 1.3 : 1)));
    d.fatigue = Math.max(0, d.fatigue - (cage.rest ? 0.5 : cage.autoCare ? AUTO_CARE_REST : 0.04));
    if (d.bowel.count < POOP_LIMIT_PER_DAY) d.poopTimer += 1;
  }
  // 동물원·목장: 먹이와 배설물을 알아서 처리한다 (원작 설명). 고기는 쓰지 않는다 (임시)
  if (cage.autoCare) {
    d.poopTimer = 0;
    d.bowel.mealDueAt = undefined;
    if (d.hunger < AUTO_FEED_BELOW) d.hunger = 100;
  }
  const poopDue = d.bowel.mealDueAt !== undefined ? ctx.clock >= d.bowel.mealDueAt : d.poopTimer >= poopInterval(sp.stage);
  if (!sleeping && !cage.autoCare && d.bowel.count < POOP_LIMIT_PER_DAY && poopDue) {
    d.poopTimer = 0;
    d.bowel.mealDueAt = undefined;
    if (d.poop < 5) {
      d.bowel.count += 1;
      d.poop += 1;
      events.push({ type: 'poop', uid: d.uid });
    }
  }
  // 배고픔 스트레스: 20 아래로 내려간 만큼만 한 번씩 더한다. 배가 차면 다음 배고픔 때 다시 센다
  if (d.hunger < STRESS.hungerBelow) {
    const due = (STRESS.hungerBelow - d.hunger) * STRESS.perHunger;
    if (due > (d.hungerStress ?? 0)) {
      addStress(d, due - (d.hungerStress ?? 0));
      d.hungerStress = due;
    }
  } else d.hungerStress = 0;
  if ((d.stress ?? 0) < 100) d.stressSick = false;
  else if (!d.stressSick) {
    d.stressSick = true;
    makeSick(d, events, 0);
  }
  // 굶주림 시간은 잠든 동안 멈추기만 하고 지우지 않는다 (밤을 넘겨도 이어진다)
  d.starvingMinutes = d.hunger <= 0 ? d.starvingMinutes + (sleeping ? 0 : 1) : 0;
  // 배설물이나 상한 먹이가 있는 케이지에 오래 있으면 병 (help #139·#141). 상한 먹이는 화면이 케이지별로 알려 준다
  d.dirtyMinutes = (d.poop >= 3 || ctx.dirty) && !sleeping ? d.dirtyMinutes + 1 : 0;
  if ((d.starvingMinutes === 240 && !sleeping) || d.dirtyMinutes >= 180 || (d.fatigue >= 95 && ctx.rng() < 0.01)) {
    d.dirtyMinutes = 0;
    makeSick(d, events);
  }
  if (d.sick || d.injured) {
    d.sickMinutes += 1;
    if (cage.rest && d.injured && d.sickMinutes >= 120) {
      d.injured = false;
      d.sickMinutes = d.sick ? d.sickMinutes : 0;
    }
    if (!d.dying && d.sickMinutes >= DYING_AFTER_MINUTES) {
      d.dying = true;
      d.dyingMinutes = 0;
      events.push({ type: 'dying', uid: d.uid, name: sp.name, cause: d.sick ? 'sick' : 'injured' });
    }
  }
  if (!d.dying && d.hunger <= 0 && d.starvingMinutes >= DYING_AFTER_MINUTES) {
    d.dying = true;
    d.dyingMinutes = 0;
    events.push({ type: 'dying', uid: d.uid, name: sp.name, cause: 'hunger' });
  }
  if (!d.dying && lowHp(d)) {
    d.dying = true;
    d.dyingMinutes = 0;
    events.push({ type: 'dying', uid: d.uid, name: sp.name, cause: 'hp' });
  }
  if (d.dying) {
    if (!d.sick && !d.injured && d.hunger > 0 && !lowHp(d)) {
      // 원인을 모두 고치면 빈사에서 벗어난다 (원작 메일 #97~99: 약·상처약·먹이로 치료)
      d.dying = false;
      d.dyingMinutes = 0;
      events.push({ type: 'revived', uid: d.uid, name: sp.name });
    } else {
      d.dyingMinutes = (d.dyingMinutes ?? 0) + 1;
      // 빈사를 방치하면 로스트 (help #142). 일정 조건을 채웠다면 디지에그 → 수명 때와 같은 조건.
      // 마지막 한 마리는 게임이 막히지 않도록 디지에그로 남긴다 (임시)
      if (d.dyingMinutes >= DYING_LOST_MINUTES) {
        if (endOfLife(d) === 'egg' || ctx.isLast) {
          events.push({ type: 'egg', uid: d.uid, from: sp.id, reason: 'sick' });
          return toEgg({ ...d, dying: false, dyingMinutes: 0 });
        }
        events.push({ type: 'lost', uid: d.uid, name: sp.name, reason: '빈사 방치' });
        return null;
      }
    }
  }

  // 훈련: 테이머가 훈련 케이지에 넣으면 15분 훈련을 한 번 한다. 끝나면 훈련 케이지가 아닌 곳에
  // 두었다가 다시 넣기 전에는 훈련하지 않는다 (형규가 정함. 15분은 게임 시간)
  if (cage.up || cage.apUp || cage.battleUp) {
    if (!d.trainDone && !sleeping && !d.sick && !d.injured && !d.dying && d.hunger > 0 && d.fatigue < 90) {
      d.trainMinutes = (d.trainMinutes ?? 0) + 1;
      if (d.trainMinutes >= TRAINING_MINUTES) {
        d.trainMinutes = 0;
        d.trainDone = true;
        const level = ctx.cageLevels?.[cage.id] ?? 0;
        const changes = applyTraining(d, cage, ctx.season ?? 0, ctx.rng, CAGE_LEVEL_FACTOR[level] ?? 1);
        changes.push(...applyTrainingSideEffects(d, cage.no, ctx.season ?? 0, ctx.rng, level));
        events.push({ type: 'trained', uid: d.uid, name: sp.name, changes: changes.join(', ') });
        // 부상 (원본 overlay18 0x211D5F8): 부상 위험도가 30을 넘으면 그 % 확률로 부상, 페널티 +1(최대 7은 원본 칸 크기).
        // 프로틴을 먹은 채 훈련하면 1개당 +2%p는 웹판 임시(help #138).
        const risk = d.injuryRisk ?? 0;
        const chance = (risk > 30 ? risk / 100 : 0) + (d.protein ?? 0) * PROTEIN_TRAIN_INJURY;
        if (!d.injured && chance > 0 && ctx.rng() < chance) {
          d.injured = true;
          d.sickMinutes = 0;
          d.penalties += 1;
          events.push({ type: 'injured', uid: d.uid, name: sp.name });
        }
      }
    }
  } else {
    d.trainDone = false;
    d.trainMinutes = 0;
  }

  if (d.stageAge % 60 === 0) {
    // 어디서든 1시간에 1 회복 (웹판 임시). 쉬는 시설의 회복은 위의 원본 시설 효과가 맡는다
    addStress(d, -STRESS.restPerHour);
  }
  // 훈련/발병/나이 등 이번 분에 바뀐 조건을 곧바로 평가한다. 한 시간 경계까지 기다리지 않는다.
  const evo = lifespanEvolution(d, findEvolution(d, ctx.rank, ctx.free), ctx.free, ctx.rng);
  if (evo?.kind === 'evolve') {
    events.push({ type: 'evolved', uid: d.uid, from: sp.id, to: evo.to, ...(evo.memory ? { memory: true } : {}) });
    return evolveDigimon(d, evo.to, ctx.rng);
  }
  if (d.stageAge % 60 === 0) {
    if (d.stageAge >= LIFESPAN[sp.stage]) {
      if (evo?.kind === 'blocked' && d.stageAge === LIFESPAN[sp.stage]) events.push({ type: 'blocked', uid: d.uid, name: sp.name, reason: evo.reason });
      // 수명이 다한 뒤 하루의 유예가 지나면 디지에그화 또는 로스트
      if (d.stageAge >= LIFESPAN[sp.stage] + 1440 || !evo) {
        if (endOfLife(d) === 'egg' || ctx.isLast) {
          events.push({ type: 'egg', uid: d.uid, from: sp.id });
          return toEgg(d);
        }
        events.push({ type: 'lost', uid: d.uid, name: sp.name, reason: '수명' });
        return null;
      }
    }
  }
  return d;
}

/** 사육장 전체의 게임 시간 1분 */
/** dirtyCages: 상한 먹이가 놓인 설치 시설 ID (바닥 먹이는 화면이 관리한다) */
export function tickFarm(save: SaveData, rng: Rng = defaultRng, sleep = false, dirtyCages: readonly string[] = []): { save: SaveData; events: FarmEvent[] } {
  const events: FarmEvent[] = [];
  const rank = tamerRank(save);
  const season = dateOf(save.clock).season;
  let free = capacityOf(save) - usedCapacity(save);
  // 같은 종류의 케이지 두 개를 혼동하지 않는다. 다수의 제멋대로도 하루 가산10으로 제한한다.
  const group = (d: Digimon) => d.cageInstance === null ? null : d.cageInstance ?? d.cage;
  const socialDay = Math.floor((save.clock + 1) / MIN_PER_DAY);
  const next: Digimon[] = [];
  const seen = new Set(save.seen);
  // 정원 초과 (원본 overlay18 0x211AE00~0x211AEB0): 1시간마다 정원을 넘긴 케이지의 디지몬은 '그 케이지의 디지몬 수 - 1'만큼 스트레스
  const crowdHour = (save.clock + 1) % 60 === 0;
  const headcount = new Map<string, number>();
  if (crowdHour) for (const d of save.digimon) { const k = group(d); if (!d.isEgg && k) headcount.set(k, (headcount.get(k) ?? 0) + 1); }
  save.digimon.forEach((d, i) => {
    const before = d.isEgg ? 0 : getSpecies(d.speciesId).size;
    const isLast = next.length + (save.digimon.length - i) <= 1;
    const key = group(d), old = d.socialStress;
    const social = old?.day === socialDay ? {...old} : {day:socialDay,added:0};
    const sharing = !d.isEgg && key !== null && save.digimon.some(other => other.uid !== d.uid && !other.isEgg && other.personality === '제멋대로' && group(other) === key);
    const extra = sharing ? Math.max(0,Math.min(10 - social.added,10 / MIN_PER_DAY)) : 0;
    social.added = Math.min(10,social.added + extra);
    const candidate = {...d,socialStress:social};
    if(extra>0)addStress(candidate,extra);
    const inCage = key ? headcount.get(key) ?? 0 : 0;
    if (crowdHour && !d.isEgg && inCage > getCage(d.cage).capacity) addStress(candidate, inCage - 1);
    const dirty = !!d.cageInstance && dirtyCages.includes(d.cageInstance);
    const r = tickOne(candidate, { rank, free, isLast, rng, sleep, season, clock: save.clock + 1, dirty, cageLevels: save.cageLevels }, events);
    if (!r) {
      free += before;
      return;
    }
    free -= (r.isEgg ? 0 : getSpecies(r.speciesId).size) - before;
    seen.add(r.speciesId);
    next.push(r);
  });
  const current = { ...save, clock: save.clock + 1, digimon: next, seen: [...seen] };
  // 같은 틱에서 로스트/디지에그화/작은 종으로 진화해 비워진 용량도 반영한다. 이미 변한 개체는 제외한다.
  const changedIds = new Set(events.filter(e => e.type === 'evolved' || e.type === 'hatched' || e.type === 'egg').map(e => e.uid));
  const pending = new Set(next.filter(d => !changedIds.has(d.uid)).map(d => d.uid));
  const ready = evaluateEvolutions(current, rng, pending);
  return { save: ready.save, events: [...events, ...ready.events] };
}

export function advance(save: SaveData, minutes: number, rng: Rng = defaultRng) {
  const events: FarmEvent[] = [];
  let cur = save;
  for (let i = 0; i < minutes; i++) {
    const r = tickFarm(cur, rng);
    cur = r.save;
    events.push(...r.events);
  }
  return { save: cur, events };
}

/**23:59 이후 또는 아침7시 이전은 하루 마감/수면 구간이다. */
export function isNight(save: SaveData): boolean {
  const h = dateOf(save.clock).hour;
  return ((save.clock % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY >= DAY_END_MINUTE || h < DAY_START_HOUR;
}

/** 달력 예고와 실제 수면 종료가 같은 날짜를 사용한다. 새벽이면 그날 아침이다. */
export function nextMorningClock(save: SaveData): number {
  const d = dateOf(save.clock);
  const startOfDay = save.clock - d.hour * 60 - d.minute;
  return (d.hour < DAY_START_HOUR ? startOfDay : startOfDay + MIN_PER_DAY) + DAY_START_HOUR * 60;
}

/** 웹판 임시 정책: 오프라인 진행도 하루 마감에서 멈춰 달력과 경기 날을 건너뛰지 않는다. */
export function advanceOffline(save: SaveData, minutes: number, rng: Rng = defaultRng) {
  const limit = Number.isFinite(minutes) ? Math.min(OFFLINE_CAP_MINUTES, Math.max(0, Math.floor(minutes))) : 0;
  const events: FarmEvent[] = [];
  let cur = save;
  for (let i = 0; i < limit && !isNight(cur); i++) {
    const r = tickFarm(cur, rng);
    cur = r.save;
    events.push(...r.events);
  }
  return { save: cur, events, elapsedMinutes: cur.clock - save.clock };
}

/** 하루 마감: 다음 날 아침 7시까지 잠잔다 (수명·병은 흐르고, 배고픔·똥·훈련은 멈춘다) */
/** crowded는 예전 하루 단위 정원 초과용(지금은 tickFarm에서 1시간마다 처리, 인자는 호환용으로만 남김) */
export function endDay(save: SaveData, rng: Rng = defaultRng, crowded: number[] = []) {
  const morning = nextMorningClock(save);
  const events: FarmEvent[] = [];
  let cur = save;
  while (cur.clock < morning) {
    const r = tickFarm(cur, rng, true);
    cur = r.save;
    events.push(...r.events);
  }
  // 알약(프로틴) 효과는 하루만 간다 (임시). 하루가 지날 때 스트레스: 정원 초과 +20
  cur = {
    ...cur,
    digimon: cur.digimon.map((x) => {
      const d = { ...x, protein: 0 };
      if (d.isEgg) return d;
      // 다음 날 아침에는 HP가 가득 찬다 (형규 지정. 원본 기상 처리 0x2120048은 1/30이지만 이 게임은 하루 마감 뒤 완전 회복)
      d.hpNow = d.stats.hp;
      return d;
    }),
  };
  return { save: cur, events };
}

// ---------- 행동 ----------
export interface ActionResult {
  ok: boolean;
  message: string;
  save: SaveData;
}
const fail = (save: SaveData, message: string): ActionResult => ({ ok: false, message, save });
const update = (save: SaveData, uid: number, fn: (d: Digimon) => Digimon): SaveData => ({
  ...save,
  digimon: save.digimon.map((d) => (d.uid === uid ? fn(d) : d)),
});
const find = (save: SaveData, uid: number) => save.digimon.find((d) => d.uid === uid);

export function feed(save: SaveData, uid: number): ActionResult {
  const d = find(save, uid);
  if (!d || d.isEgg || isSleeping(d)) return fail(save, '먹이를 줄 수 없어요.');
  if (save.meat <= 0) return fail(save, '고기가 없어요. 상점에서 사세요.');
  if (d.hunger >= 100) return fail(save, '배가 불러서 안 먹어요.');
  return { ok: true, message: '고기를 먹었다.', save: { ...update(save, uid, (x) => scheduleMealPoop(eatHp({ ...x, hunger: Math.min(100, x.hunger + 35) }, Math.min(100, x.hunger + 35) - x.hunger),save.clock)), meat: save.meat - 1 } };
}

/** 썩은 고기 두 개를 먹으면 병에 걸린다 (페널티 진화용) */
export function feedRotten(save: SaveData, uid: number): ActionResult {
  const d = find(save, uid);
  if (!d || d.isEgg || isSleeping(d)) return fail(save, '먹이를 줄 수 없어요.');
  if (save.rotten <= 0) return fail(save, '썩은 고기가 없어요.');
  if (d.sick) return fail(save, '이미 병에 걸려 있어요.');
  const events: FarmEvent[] = [];
  const s = update(save, uid, (x) => {
    const y = scheduleMealPoop(eatHp({ ...x, hunger: Math.min(100, x.hunger + 15), rottenEaten: x.rottenEaten + 1 }, Math.min(100, x.hunger + 15) - x.hunger),save.clock);
    addStress(y, STRESS.rotten);
    if (y.rottenEaten >= 2) {
      y.rottenEaten = 0;
      makeSick(y, events, 0); // 상한 먹이 스트레스에 병 스트레스를 겹치지 않는다
    }
    return y;
  });
  return { ok: true, message: events.length ? '썩은 고기를 먹고 병에 걸렸다! (페널티 +1)' : '썩은 고기를 먹었다…', save: { ...s, rotten: save.rotten - 1 } };
}

/** 쓰다듬기: 게임 1시간에 한 번 스트레스가 조금 풀린다 */
export function pet(save: SaveData, uid: number, rng: Rng = defaultRng): ActionResult & { soothed?: boolean; awakened?: boolean } {
  const d = find(save, uid);
  if (!d || d.isEgg) return fail(save, '아직 쓰다듬을 수 없어요.');
  const name = getSpecies(d.speciesId).name;
  // 원작의 '게으름은 터치해도 잘 깨지 않음'. 성공률20%는 웹판 임시 값, 밤에는 깨우지 않는다.
  let awakened = false;
  if (isSleeping(d)) {
    if (isNight(save) || (d.personality === '게으름' && rng() >= 0.2)) return {ok:true,save,awakened:false,message:`${name}(은)는 아직 깊이 잠들어 있다.`};
    save = update(save,uid,x=>({...x,restCycle:{species:x.speciesId,sleepLeft:0,awakeLeft:cycleMinutes(originalSpecies(x.speciesId)?.awake ?? [120,180],rng)}}));
    awakened = true;
  }
  if (d.pettedAt != null && save.clock - d.pettedAt < PET.cooldown) return { ok: true, save, awakened, message: awakened ? `${name}(이)가 잠에서 깨어났다.` : `${name}(은)는 기분이 좋아 보인다.` };
  return { ok: true, soothed: true, awakened, message: `${name}(을)를 쓰다듬었다.`, save: update(save, uid, (x) => ({ ...x, pettedAt: save.clock, stress: Math.max(0, (x.stress ?? 0) - PET.relief) })) };
}

/** 바닥의 똥 하나 치우기 */
export function cleanOne(save: SaveData, uid: number): ActionResult {
  const d = find(save, uid);
  if (!d || d.poop === 0) return fail(save, '치울 것이 없어요.');
  return { ok: true, message: '똥을 치웠다.', save: update(save, uid, (x) => ({ ...x, poop: x.poop - 1, dirtyMinutes: x.poop - 1 >= 3 ? x.dirtyMinutes : 0 })) };
}

export function clean(save: SaveData, uid: number): ActionResult {
  const d = find(save, uid);
  if (!d || d.poop === 0) return fail(save, '치울 것이 없어요.');
  return { ok: true, message: '깨끗하게 치웠다!', save: update(save, uid, (x) => ({ ...x, poop: 0, dirtyMinutes: 0 })) };
}

/** 약(병)이 들을 확률 — 사용자 결정으로 모든 세대 100%.
 *  (원본 overlay18 표 0x2129AA4는 세대 1~6: 50·50·60·80·90·100%, 0x2119990에서 사용) */
export const CURE_CHANCE = [0, 1, 1, 1, 1, 1, 1];
/** 상처약(부상)이 들을 확률 — 원본 표 0x2129ADC(100·100·90·80·60·50%) */
export const TREAT_CHANCE = [0, 1, 1, 0.9, 0.8, 0.6, 0.5];

/** 약(주사기)으로 병을 고친다. 실패해도 약은 쓴다 */
export function cure(save: SaveData, uid: number, rng: Rng = defaultRng): ActionResult {
  const d = find(save, uid);
  if (!d || !d.sick) return fail(save, '병에 걸리지 않았어요.');
  if (save.medicine <= 0) return fail(save, '약이 없어요. 상점에서 사세요.');
  const used = { ...save, medicine: save.medicine - 1 };
  if (rng() >= CURE_CHANCE[getSpecies(d.speciesId).stage]) return { ok: true, message: '약을 놓았지만 아직 낫지 않았다…', save: used };
  return { ok: true, message: '병이 나았다!', save: update(used, uid, (x) => ({ ...x, sick: false, sickMinutes: 0 })) };
}

/** 상처약으로 부상을 치료한다. 실패해도 상처약은 쓴다 */
export function treat(save: SaveData, uid: number, rng: Rng = defaultRng): ActionResult {
  const d = find(save, uid);
  if (!d || !d.injured) return fail(save, '다치지 않았어요.');
  if (save.salve <= 0) return fail(save, '상처약이 없어요. 상점에서 사세요.');
  const used = { ...save, salve: save.salve - 1 };
  if (rng() >= TREAT_CHANCE[getSpecies(d.speciesId).stage]) return { ok: true, message: '상처약을 발랐지만 아직 낫지 않았다…', save: used };
  // 원본 0x2119A40: 치료하면 방치 시간과 부상 위험도가 0으로 (어느 약이 위험도를 지우는지는 추정)
  return { ok: true, message: '상처가 나았다!', save: update(used, uid, (x) => ({ ...x, injured: false, sickMinutes: 0, injuryRisk: 0 })) };
}

/** 예전 '치료' 버튼 호환: 병이면 약, 다쳤으면 상처약 */
export function heal(save: SaveData, uid: number, rng: Rng = defaultRng): ActionResult {
  const d = find(save, uid);
  if (d?.sick) return cure(save, uid, rng);
  if (d?.injured) return treat(save, uid, rng);
  return fail(save, '아프지 않아요.');
}

export function setCage(save: SaveData, uid: number, cageId: string): ActionResult {
  const cage = CAGES.find((c) => c.id === cageId);
  if (!cage || !save.cages.includes(cageId)) return fail(save, '가지고 있지 않은 케이지예요.');
  const count = save.digimon.filter((d) => d.cage === cageId && d.uid !== uid).length;
  if (count >= cage.capacity) return fail(save, `${cageId}은(는) ${cage.capacity}마리까지 들어가요.`);
  return { ok: true, message: `${cageId}(으)로 옮겼다.`, save: update(save, uid, (x) => ({ ...x, cage: cageId })) };
}

export function release(save: SaveData, uid: number): ActionResult {
  if (save.digimon.length <= 1) return fail(save, '마지막 디지몬은 놓아줄 수 없어요.');
  return { ok: true, message: '디지몬을 놓아주었다.', save: { ...save, digimon: save.digimon.filter((d) => d.uid !== uid) } };
}

/** 사냥에서 잡기. carried = 이번 사냥에서 이미 메모리카드에 넣은 용량(G) */
/** personality: 사냥터에서 미리 정해 둔 성격 (정신 애널라이저로 본 값과 같게) */
export function capture(save: SaveData, speciesId: string, rng: Rng = defaultRng, carried = 0, personality?: Digimon['personality']): ActionResult {
  const size = getSpecies(speciesId).size;
  if (carried + size > save.memoryCard) return fail(save, `메모리카드 용량이 가득 찼습니다. (${carried}/${save.memoryCard}G)`);
  if (usedCapacity(save) + size > capacityOf(save)) return fail(save, '용량이 가득 찼습니다. 디지몬을 줄여 주세요.');
  const d = newDigimon(save.nextUid, speciesId, rng, true);
  if (personality) d.personality = personality;
  return {
    ok: true,
    message: `${getSpecies(speciesId).name}을(를) 잡았다!`,
    save: { ...save, digimon: [...save.digimon, d], nextUid: save.nextUid + 1, seen: [...new Set([...save.seen, speciesId])] },
  };
}

export interface ShopItem {
  id: string;
  name: string;
  price: number;
  apply: (s: SaveData) => SaveData;
  available: (s: SaveData) => boolean;
}

export function shopItems(save: SaveData): ShopItem[] {
  const rank = tamerRank(save);
  const items: ShopItem[] = [
    { id: 'meat', name: '고기 ×5', price: 50, apply: (s) => ({ ...s, meat: s.meat + 5 }), available: () => true },
    { id: 'pill', name: '알약(프로틴) ×1', price: 120, apply: (s) => ({ ...s, pills: s.pills + 1 }), available: () => true },
    { id: 'medicine', name: '약(주사) ×1', price: 80, apply: (s) => ({ ...s, medicine: s.medicine + 1 }), available: () => true },
    { id: 'salve', name: '상처약 ×1', price: 80, apply: (s) => ({ ...s, salve: s.salve + 1 }), available: () => true },
    { id: 'rotten', name: '썩은 고기 ×2', price: 20, apply: (s) => ({ ...s, rotten: s.rotten + 2 }), available: () => true },
    { id: 'wire', name: `노멀 와이어 ×${WIRE_PACK.count}`, price: WIRE_PACK.price, apply: (s) => ({ ...s, wires: (s.wires ?? 0) + WIRE_PACK.count }), available: () => itemUnlocked(save, '노멀 와이어α') },
  ];
  // 로프: 랭크가 되면 그 계열(α·β·γ)이 상점에 열린다. 사면 가진 것 중 가장 좋은 로프를 든다.
  const addGear = (id: string, n: number) => (s: SaveData) => ({ ...s, gear: { ...s.gear, [id]: gearCount(s, id) + n } });
  for (const g of SHOTS) items.push({ id: `gear:${g.id}`, name: `${g.name} ×${SHOT_PACK} (위력 ${g.power}${g.spread ? '×6' : ''}${g.effect ? ' · ' + g.effect : ''})`, price: g.price, apply: addGear(g.id, SHOT_PACK), available: () => itemUnlocked(save, g.name) });
  for (const b of BAITS) items.push({ id: `gear:${b.id}`, name: `${b.name} ×${BAIT_PACK} (사냥 미끼)`, price: b.price, apply: addGear(b.id, BAIT_PACK), available: () => itemUnlocked(save, b.name) });
  for (const g of GEARS) items.push({ id: `gear:${g.id}`, name: `${g.name} ×${g.pack}${g.power ? ` (위력 ${g.power})` : ''}${g.effect ? ` · ${g.effect}` : ''}${g.nightOnly ? ' · 밤 전용' : ''}`, price: g.price, apply: addGear(g.id, g.pack), available: () => itemUnlocked(save, g.name) });
  for (const r of ROPES)
    if (r.price > 0)
      items.push({
        id: `rope:${r.id}`,
        name: `${r.name} (내구력 ${r.durability})`,
        price: r.price,
        apply: (s) => {
          const ropes = [...new Set([...s.ropes, r.id])];
          return { ...s, ropes, rope: bestRope(ropes) };
        },
        available: (s) => !s.ropes.includes(r.id) && itemUnlocked(s, r.name),
      });
  // 플러그인 (원본 아이템 표, 하나씩만 가진다). 사면 빈 칸이 있으면 바로 장비한다
  for (const pl of shopPlugins(save))
    items.push({ id: `plugin:${pl.id}`, name: `플러그인: ${pl.name}`, price: pluginPrice(pl), apply: (s) => togglePlugin({ ...s, plugins: [...(s.plugins ?? []), pl.id] }, pl.id), available: (s) => !(s.plugins ?? []).includes(pl.id) });
  for (const c of MEMORY_CARDS)
    if (c.price > 0)
      items.push({ id: `card:${c.id}`, name: c.name, price: c.price, apply: (s) => ({ ...s, memoryCard: Math.max(s.memoryCard, c.size) }), available: (s) => s.memoryCard < c.size && itemUnlocked(s, c.name) });
  for (const c of CAGES) {
    if (c.price > 0)
      items.push({ id: `cage:${c.id}`, name: `케이지: ${c.id}`, price: c.price, apply: (s) => ({ ...s, cages: [...s.cages, c.id] }), available: (s) => !s.cages.includes(c.id) && rank >= c.minRank });
    // 케이지 레벨 업 (원본 상점 overlay9_17 0x2110D90): 가진 케이지만, 랭크가 허락하는 레벨까지
    const up = cageLevelUp(save, c.id);
    if (up.ok)
      items.push({ id: `cagelv:${c.id}`, name: `케이지 레벨 업: ${c.id} Lv${up.next} (훈련 효과 ×${CAGE_LEVEL_FACTOR[up.next]})`, price: up.price, apply: (s) => ({ ...s, cageLevels: { ...s.cageLevels, [c.id]: up.next } }), available: () => true });
  }
  return items.filter((i) => i.available(save));
}

export const cageLevelOf = (save: Pick<SaveData, 'cageLevels'>, cageId: string) => save.cageLevels?.[cageId] ?? 0;
/**
 * 케이지 레벨 업 가능 여부와 값 (원본 상점 overlay9_17 0x2110D90~0x2110EA0, 랭크 표 arm9 0xE214C).
 * 다음 레벨 n(1·2)이 랭크 줄의 '최대 레벨 칸'보다 작아야 한다. 값 = n × 레벨 업 값, n=2면 그 절반을 뺀다.
 */
export function cageLevelUp(save: SaveData, cageId: string): { ok: true; next: number; price: number } | { ok: false; reason: string } {
  const shop = CAGE_SHOP[cageId];
  if (!shop || !shop.levelPrice) return { ok: false, reason: '레벨 업할 수 없는 케이지입니다.' };
  if (!save.cages.includes(cageId)) return { ok: false, reason: '가진 케이지가 아닙니다.' };
  const next = cageLevelOf(save, cageId) + 1;
  if (next >= 3) return { ok: false, reason: '이 이상의 케이지는 레벨 업 할 수 없습니다.' };
  const row = CAGE_LEVEL_ROWS[Math.max(0, Math.min(CAGE_LEVEL_ROWS.length - 1, tamerRank(save) - 1))] ?? 1;
  if (next >= row) return { ok: false, reason: '지금의 테이머 랭크로는 레벨 업 할 수 없습니다.' };
  return { ok: true, next, price: next * shop.levelPrice - (next === 2 ? shop.levelPrice >> 1 : 0) };
}

export function buy(save: SaveData, item: ShopItem): ActionResult {
  if (save.bits < item.price) return fail(save, 'bit가 부족해요.');
  return { ok: true, message: `${item.name} 구입!`, save: { ...item.apply(save), bits: save.bits - item.price } };
}
