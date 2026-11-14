import { applyTraining } from './training';
import { evolvedStats, upgradeStats } from './stats';
import { CAGE_RENAMES, CAGES, dateOf, DAY_END_MINUTE, DAY_START_HOUR, EGG_MINUTES, initialStats, getCage, getSpecies, originalSpecies, LIFESPAN, MIN_PER_DAY, START_CAGES, START_CLOCK } from './data';
import { endOfLife, findEvolution } from './evolution';
import { defaultRng, pick, type Rng } from './rng';
import { capacityOf, migrateTitleIds, tamerRank } from './titles';
import { bestRope, MEMORY_CARDS, ROPES, START_ROPE, WIRE_PACK, BAIT_PACK, BAITS, GEARS, gearCount, itemUnlocked, SHOT_PACK, SHOTS } from './hunt';
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
    poopTimer:Number.isFinite(d.poopTimer)?Math.max(0,d.poopTimer):0}));
  return s;
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
  | { type: 'hatched' | 'evolved'; uid: number; from: string; to: string }
  | { type: 'egg'; uid: number; from: string; reason?: 'sick' }
  | { type: 'lost'; uid: number; name: string; reason: string }
  | { type: 'sick'; uid: number; name: string }
  | { type: 'injured'; uid: number; name: string }
  | { type: 'poop'; uid: number }
  /** 훈련 완료 후 실제로 오른·내린 능력치 (예: 'HP +3, 방어 -1') */
  | { type: 'trained'; uid: number; name: string; changes: string }
  | { type: 'blocked'; uid: number; name: string; reason: 'rank' | 'capacity' };

/**
 * 스트레스 (원작 도움말 help #127: 쌓이면 병에 걸린다. 수치는 화면에 나오지 않는다).
 * 값은 형규가 정함: 정원 초과로 하루가 지날 때마다 +20, 상한 먹이 +50, 병 +40, 훈련 한 번마다 +5,
 * 배고픔 20 미만부터 1 내려갈 때마다 +1.5 (배고픔 0에서 합계 +30). 70 이상이면 말풍선 표시.
 * 게임 1시간마다 -1, 쉬는 케이지(온천·미니 양호실·양호실·동물원·미니 동물원)에서는 -5.
 * 임시(Claude가 정함): 100이 되면 병.
 */
export const STRESS = { crowdedPerDay: 20, rotten: 50, sick: 40, training: 5, hungerBelow: 20, perHunger: 1.5, show: 70, reliefPerHour: 5, autoCarePerHour: 3, restPerHour: 1 };
/** 훈련 한 번에 걸리는 게임 분 */
export const TRAINING_MINUTES = 15;
/** 병·부상을 방치해 로스트되기까지의 게임 분 (임시: 이틀) */
export const NEGLECT_MINUTES = 2880;
/**
 * 계절 (원작 도움말 help #136: 여름은 트레이닝 효과가 높고, 겨울은 부상 확률이 오른다).
 * 트레이닝 부상 (help #140: 배틀이나 트레이닝을 할 때 부상당할 수 있다).
 * 배수·확률은 임시 값.
 */
export const SUMMER = 1;
export const WINTER = 3;
export const WINTER_INJURY = 2;
export const TRAIN_INJURY = 0.03;
/** 프로틴을 먹은 채 훈련하면 1개당 부상 확률 +2% (help #138, 수치 임시) */
export const PROTEIN_TRAIN_INJURY = 0.02;
/** 쓰다듬기 (help #143: 손 아이콘으로 쓰다듬을 수 있다). 효과는 원작에서 확인 못 한 임시 값: 게임 1시간에 한 번 스트레스 -3 */
export const PET = { relief: 3, cooldown: 60 };
/** 동물원·목장이 먹이를 주는 배고픔 기준 (임시) */
export const AUTO_FEED_BELOW = 50;
/** 스트레스가 풀리는 케이지. 온천·양호실·동물원·미니 동물원은 아직 게임에 없지만 추가되면 바로 적용된다 */
/** 쉬는 시설: 시간당 -5 */
export const STRESS_RELIEF_CAGES = ['온천', '미니 양호실', '양호실'];
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

/** countEgg=false: 병·부상 방치로 죽어 알로 돌아간 경우. 디지에그화 횟수(진화 조건)는 늘지 않는다 */
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
  };
}

/** 디지몬 한 마리의 게임 시간 1분. null이면 로스트 */
function tickOne(prev: Digimon, ctx: { rank: number; free: number; isLast: boolean; rng: Rng; clock: number; sleep?: boolean; season?: number }, events: FarmEvent[]): Digimon | null {
  let d: Digimon = { ...prev, stats: { ...prev.stats }, ap: { ...prev.ap } };
  d.stageAge += 1;

  if (d.isEgg) {
    if (d.stageAge >= EGG_MINUTES) {
      events.push({ type: 'hatched', uid: d.uid, from: '디지에그', to: d.originBaby });
      d = { ...d, isEgg: false, speciesId: d.originBaby, stageAge: 0, stats: evolvedStats(null, d.originBaby, d.eggs, ctx.rng), statVersion: 1 };
    }
    return d;
  }

  const sp = getSpecies(d.speciesId);
  const cage = getCage(d.cage);
  const sleeping = tickRestCycle(d, ctx.rng, !!ctx.sleep) || !!ctx.sleep;
  d.bowel = bowelAt(d, ctx.clock);
  if (sleeping) {
    // 밤과 종별 낮잠: 배고픔·똥·훈련 없이 피로만 풀린다. 병·부상은 계속 진행된다
    d.fatigue = Math.max(0, d.fatigue - 0.3);
  } else {
    d.hunger = Math.max(0, d.hunger - (d.personality === '열혈' ? 0.11 : 0.08));
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
  d.starvingMinutes = d.hunger <= 0 && !sleeping ? d.starvingMinutes + 1 : 0;
  d.dirtyMinutes = d.poop >= 3 && !sleeping ? d.dirtyMinutes + 1 : 0;
  if (d.starvingMinutes >= 240 || d.dirtyMinutes >= 180 || (d.fatigue >= 95 && ctx.rng() < 0.01)) {
    d.starvingMinutes = 0;
    d.dirtyMinutes = 0;
    makeSick(d, events);
  }
  if (d.sick || d.injured) {
    d.sickMinutes += 1;
    if (cage.rest && d.injured && d.sickMinutes >= 120) {
      d.injured = false;
      d.sickMinutes = d.sick ? d.sickMinutes : 0;
    }
    // 병·부상을 이틀 방치하면 로스트된다 (원작 도움말 help #142: 두 번 다시 돌아오지 않는다.
    // 단, 일정 조건을 채웠다면 디지에그로 다시 태어난다 → 수명 때와 같은 조건을 쓴다).
    // 이틀이라는 시간은 임시 값. 마지막 한 마리는 게임이 막히지 않도록 디지에그로 남긴다 (임시)
    if (d.sickMinutes >= NEGLECT_MINUTES) {
      if (endOfLife(d) === 'egg' || ctx.isLast) {
        events.push({ type: 'egg', uid: d.uid, from: sp.id, reason: 'sick' });
        return toEgg(d, false);
      }
      events.push({ type: 'lost', uid: d.uid, name: sp.name, reason: '병·부상 방치' });
      return null;
    }
  }

  // 훈련: 테이머가 훈련 케이지에 넣으면 15분 훈련을 한 번 한다. 끝나면 훈련 케이지가 아닌 곳에
  // 두었다가 다시 넣기 전에는 훈련하지 않는다 (형규가 정함. 15분은 게임 시간)
  if (cage.up || cage.apUp || cage.battleUp) {
    if (!d.trainDone && !sleeping && !d.sick && !d.injured && d.hunger > 0 && d.fatigue < 90) {
      d.trainMinutes = (d.trainMinutes ?? 0) + 1;
      if (d.trainMinutes >= TRAINING_MINUTES) {
        d.trainMinutes = 0;
        d.trainDone = true;
        const changes = applyTraining(d, cage, ctx.season ?? 0, ctx.rng);
        events.push({ type: 'trained', uid: d.uid, name: sp.name, changes: changes.join(', ') });
        d.fatigue = Math.min(100, d.fatigue + 5);
        addStress(d, STRESS.training);
        const risk = (TRAIN_INJURY + (d.protein ?? 0) * PROTEIN_TRAIN_INJURY) * (ctx.season === WINTER ? WINTER_INJURY : 1);
        if (!d.injured && ctx.rng() < risk) {
          d.injured = true;
          d.sickMinutes = 0;
          events.push({ type: 'injured', uid: d.uid, name: sp.name });
        }
      }
    }
  } else {
    d.trainDone = false;
    d.trainMinutes = 0;
  }

  if (d.stageAge % 60 === 0) {
    // 어디서든 1시간에 1, 동물원·목장 3, 쉬는 케이지 5 회복 (겹치지 않음)
    addStress(d, -(STRESS_RELIEF_CAGES.includes(cage.id) ? STRESS.reliefPerHour : cage.autoCare ? STRESS.autoCarePerHour : STRESS.restPerHour));
    const evo = findEvolution(d, ctx.rank, ctx.free);
    if (evo?.kind === 'evolve') {
      events.push({ type: 'evolved', uid: d.uid, from: sp.id, to: evo.to });
      // 진화하면 쌓아 둔 종족·속성 수치는 절반만 이어진다
      const ap = Object.fromEntries(Object.entries(d.ap).map(([k, v]) => [k, Math.floor(v / 2)])) as Record<ApKey, number>;
      return { ...d, speciesId: evo.to, stageAge: 0, stats: evolvedStats(d, evo.to, d.eggs, ctx.rng), statVersion: 1, ap, rottenEaten: 0 };
    }
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
export function tickFarm(save: SaveData, rng: Rng = defaultRng, sleep = false): { save: SaveData; events: FarmEvent[] } {
  const events: FarmEvent[] = [];
  const rank = tamerRank(save);
  const season = dateOf(save.clock).season;
  let free = capacityOf(save) - usedCapacity(save);
  const next: Digimon[] = [];
  const seen = new Set(save.seen);
  save.digimon.forEach((d, i) => {
    const before = d.isEgg ? 0 : getSpecies(d.speciesId).size;
    const isLast = next.length + (save.digimon.length - i) <= 1;
    const r = tickOne(d, { rank, free, isLast, rng, sleep, season, clock: save.clock + 1 }, events);
    if (!r) {
      free += before;
      return;
    }
    free -= (r.isEgg ? 0 : getSpecies(r.speciesId).size) - before;
    seen.add(r.speciesId);
    next.push(r);
  });
  return { save: { ...save, clock: save.clock + 1, digimon: next, seen: [...seen] }, events };
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
/** crowded = 정원을 넘긴 케이지에 있는 디지몬 uid (케이지 배치는 화면 쪽이 안다) */
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
      if (crowded.includes(d.uid)) addStress(d, STRESS.crowdedPerDay);
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
  return { ok: true, message: '고기를 먹었다.', save: { ...update(save, uid, (x) => scheduleMealPoop({ ...x, hunger: Math.min(100, x.hunger + 35) },save.clock)), meat: save.meat - 1 } };
}

/** 썩은 고기 두 개를 먹으면 병에 걸린다 (페널티 진화용) */
export function feedRotten(save: SaveData, uid: number): ActionResult {
  const d = find(save, uid);
  if (!d || d.isEgg || isSleeping(d)) return fail(save, '먹이를 줄 수 없어요.');
  if (save.rotten <= 0) return fail(save, '썩은 고기가 없어요.');
  if (d.sick) return fail(save, '이미 병에 걸려 있어요.');
  const events: FarmEvent[] = [];
  const s = update(save, uid, (x) => {
    const y = scheduleMealPoop({ ...x, hunger: Math.min(100, x.hunger + 15), rottenEaten: x.rottenEaten + 1 },save.clock);
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
export function pet(save: SaveData, uid: number): ActionResult & { soothed?: boolean } {
  const d = find(save, uid);
  if (!d || d.isEgg) return fail(save, '아직 쓰다듬을 수 없어요.');
  const name = getSpecies(d.speciesId).name;
  if (d.pettedAt != null && save.clock - d.pettedAt < PET.cooldown) return { ok: true, save, message: `${name}(은)는 기분이 좋아 보인다.` };
  return { ok: true, soothed: true, message: `${name}(을)를 쓰다듬었다.`, save: update(save, uid, (x) => ({ ...x, pettedAt: save.clock, stress: Math.max(0, (x.stress ?? 0) - PET.relief) })) };
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

/** 약이 들을 확률. 원작 문장: 세대가 낮으면 나을 확률이 낮아지기도 한다 (값은 임시) */
export const CURE_CHANCE = [0, 0.7, 0.8, 0.9, 1, 1, 1];
/** 상처약이 들을 확률. 원작 문장: 세대가 높으면 나을 확률이 낮아지기도 한다 (값은 임시) */
export const TREAT_CHANCE = [0, 1, 1, 1, 0.9, 0.8, 0.7];

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
  return { ok: true, message: '상처가 나았다!', save: update(used, uid, (x) => ({ ...x, injured: false })) };
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
export function capture(save: SaveData, speciesId: string, rng: Rng = defaultRng, carried = 0): ActionResult {
  const size = getSpecies(speciesId).size;
  if (carried + size > save.memoryCard) return fail(save, `메모리카드 용량이 가득 찼습니다. (${carried}/${save.memoryCard}G)`);
  if (usedCapacity(save) + size > capacityOf(save)) return fail(save, '용량이 가득 찼습니다. 디지몬을 줄여 주세요.');
  const d = newDigimon(save.nextUid, speciesId, rng, true);
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
  for (const c of MEMORY_CARDS)
    if (c.price > 0)
      items.push({ id: `card:${c.id}`, name: c.name, price: c.price, apply: (s) => ({ ...s, memoryCard: Math.max(s.memoryCard, c.size) }), available: (s) => s.memoryCard < c.size && itemUnlocked(s, c.name) });
  for (const c of CAGES) {
    if (c.price > 0)
      items.push({ id: `cage:${c.id}`, name: `케이지: ${c.id}`, price: c.price, apply: (s) => ({ ...s, cages: [...s.cages, c.id] }), available: (s) => !s.cages.includes(c.id) && rank >= c.minRank });
  }
  return items.filter((i) => i.available(save));
}

export function buy(save: SaveData, item: ShopItem): ActionResult {
  if (save.bits < item.price) return fail(save, 'bit가 부족해요.');
  return { ok: true, message: `${item.name} 구입!`, save: { ...item.apply(save), bits: save.bits - item.price } };
}
