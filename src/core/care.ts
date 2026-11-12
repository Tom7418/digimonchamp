import { CAGES, dateOf, DAY_END_HOUR, DAY_START_HOUR, EGG_MINUTES, evolutionBonus, getCage, getSpecies, LIFESPAN, MIN_PER_DAY, START_CAGES, START_CLOCK, typicalStats } from './data';
import { endOfLife, findEvolution } from './evolution';
import { defaultRng, pick, type Rng } from './rng';
import { capacityOf, tamerRank } from './titles';
import { ROPES, WIRE_PACK } from './hunt';
import { ATTRS, FAMILIES, PERSONALITIES, STAT_KEYS, STAT_LABEL, type ApKey, type Digimon, type SaveData, type Stats } from './types';

/** 최대치. 실제 용량은 랭크에 따라 capacityOf(save) */
export const CAPACITY = 200;
export const OFFLINE_CAP_MINUTES = 12 * 60;

const zeroAp = () => Object.fromEntries([...FAMILIES, ...ATTRS].map((k) => [k, 0])) as Record<ApKey, number>;
const addStats = (a: Stats, b: Stats): Stats => Object.fromEntries(STAT_KEYS.map((k) => [k, a[k] + b[k]])) as Stats;

export function newDigimon(uid: number, speciesId: string, rng: Rng = defaultRng, wild = false): Digimon {
  return {
    uid,
    speciesId,
    isEgg: false,
    originBaby: getSpecies(speciesId).stage === 1 ? speciesId : '깜몬',
    personality: pick(rng, PERSONALITIES),
    stats: wild ? typicalStats(speciesId) : evolutionBonus(speciesId),
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

export function freshSave(now = Date.now()): SaveData {
  return {
    version: 2,
    clock: START_CLOCK,
    bits: 500,
    meat: 10,
    pills: 2,
    rotten: 0,
    ropeLevel: 1,
    wires: 5,
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
  | { type: 'poop'; uid: number }
  /** 훈련 케이지에서 1시간마다 오른·내린 능력치 (예: 'HP +3, 방어 -1') */
  | { type: 'trained'; uid: number; name: string; changes: string }
  | { type: 'blocked'; uid: number; name: string; reason: 'rank' | 'capacity' };

function makeSick(d: Digimon, events: FarmEvent[]) {
  if (d.sick) return;
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
    eggs: countEgg ? d.eggs + 1 : d.eggs,
    stageAge: 0,
    // 디지에그화하면 능력치 일부를 이어받는다
    stats: Object.fromEntries(STAT_KEYS.map((k) => [k, Math.round(d.stats[k] * 0.15)])) as Stats,
    ap: zeroAp(),
    battles: 0,
    wins: 0,
    penalties: 0,
    sick: false,
    injured: false,
    poop: 0,
    hunger: 70,
    fatigue: 0,
    cage: '기본 케이지',
  };
}

/** 디지몬 한 마리의 게임 시간 1분. null이면 로스트 */
function tickOne(prev: Digimon, ctx: { rank: number; free: number; isLast: boolean; rng: Rng; sleep?: boolean }, events: FarmEvent[]): Digimon | null {
  let d: Digimon = { ...prev, stats: { ...prev.stats }, ap: { ...prev.ap } };
  d.stageAge += 1;

  if (d.isEgg) {
    if (d.stageAge >= EGG_MINUTES) {
      events.push({ type: 'hatched', uid: d.uid, from: '디지에그', to: d.originBaby });
      d = { ...d, isEgg: false, speciesId: d.originBaby, stageAge: 0, stats: addStats(d.stats, evolutionBonus(d.originBaby)) };
    }
    return d;
  }

  const sp = getSpecies(d.speciesId);
  const cage = getCage(d.cage);
  if (ctx.sleep) {
    // 밤에는 잔다: 배고픔·똥·훈련 없이 피로만 풀린다. 병·부상은 계속 진행된다
    d.fatigue = Math.max(0, d.fatigue - 0.3);
  } else {
    d.hunger = Math.max(0, d.hunger - (d.personality === '열혈' ? 0.11 : 0.08));
    d.fatigue = Math.max(0, d.fatigue - (cage.rest ? 0.5 : 0.04));
    d.poopTimer += 1;
  }
  if (d.poopTimer >= (sp.stage <= 2 ? 120 : 240)) {
    d.poopTimer = 0;
    if (d.poop < 5) {
      d.poop += 1;
      events.push({ type: 'poop', uid: d.uid });
    }
  }
  d.starvingMinutes = d.hunger <= 0 && !ctx.sleep ? d.starvingMinutes + 1 : 0;
  d.dirtyMinutes = d.poop >= 3 && !ctx.sleep ? d.dirtyMinutes + 1 : 0;
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
    // 병·부상을 이틀 방치하면 죽어서 디지에그(디지타마)로 돌아간다 (로스트되지 않음)
    if (d.sickMinutes >= 2880) {
      events.push({ type: 'egg', uid: d.uid, from: sp.id, reason: 'sick' });
      return toEgg(d, false);
    }
  }

  if (d.stageAge % 60 === 0) {
    // 훈련 케이지: 정해진 능력치가 랜덤하게 오른다
    if (!ctx.sleep && !d.sick && !d.injured && d.hunger > 0 && d.fatigue < 90 && (cage.up || cage.apUp)) {
      const speed = d.personality === '솔직' ? 1.3 : d.personality === '성급한' ? 0.8 : 1;
      const changes: string[] = [];
      for (const k of cage.up ?? []) {
        const n = Math.max(1, Math.round((1 + ctx.rng() * (sp.stage + 1)) * speed));
        d.stats[k] += n;
        changes.push(`${STAT_LABEL[k]} +${n}`);
      }
      for (const k of cage.down ?? []) {
        if (d.stats[k] > 1) changes.push(`${STAT_LABEL[k]} -1`);
        d.stats[k] = Math.max(1, d.stats[k] - 1);
      }
      if (changes.length) events.push({ type: 'trained', uid: d.uid, name: sp.name, changes: changes.join(', ') });
      for (const k of cage.apUp ?? []) d.ap[k] = Math.min(99, d.ap[k] + 3 * speed);
      for (const k of cage.apDown ?? []) d.ap[k] = Math.max(0, d.ap[k] - 1);
      d.fatigue = Math.min(100, d.fatigue + 5);
    }
    const evo = findEvolution(d, ctx.rank, ctx.free);
    if (evo?.kind === 'evolve') {
      events.push({ type: 'evolved', uid: d.uid, from: sp.id, to: evo.to });
      // 진화하면 쌓아 둔 종족·속성 수치는 절반만 이어진다
      const ap = Object.fromEntries(Object.entries(d.ap).map(([k, v]) => [k, Math.floor(v / 2)])) as Record<ApKey, number>;
      return { ...d, speciesId: evo.to, stageAge: 0, stats: addStats(d.stats, evolutionBonus(evo.to)), ap, rottenEaten: 0 };
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
  let free = capacityOf(save) - usedCapacity(save);
  const next: Digimon[] = [];
  const seen = new Set(save.seen);
  save.digimon.forEach((d, i) => {
    const before = d.isEgg ? 0 : getSpecies(d.speciesId).size;
    const isLast = next.length + (save.digimon.length - i) <= 1;
    const r = tickOne(d, { rank, free, isLast, rng, sleep }, events);
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

/** 밤 9시가 지났는가 (하루 마감) */
export function isNight(save: SaveData): boolean {
  const h = dateOf(save.clock).hour;
  return h >= DAY_END_HOUR || h < DAY_START_HOUR;
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
export function endDay(save: SaveData, rng: Rng = defaultRng) {
  const morning = nextMorningClock(save);
  const events: FarmEvent[] = [];
  let cur = save;
  while (cur.clock < morning) {
    const r = tickFarm(cur, rng, true);
    cur = r.save;
    events.push(...r.events);
  }
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
  if (!d || d.isEgg) return fail(save, '먹이를 줄 수 없어요.');
  if (save.meat <= 0) return fail(save, '고기가 없어요. 상점에서 사세요.');
  if (d.hunger >= 100) return fail(save, '배가 불러서 안 먹어요.');
  return { ok: true, message: '고기를 먹었다.', save: { ...update(save, uid, (x) => ({ ...x, hunger: Math.min(100, x.hunger + 35) })), meat: save.meat - 1 } };
}

/** 썩은 고기 두 개를 먹으면 병에 걸린다 (페널티 진화용) */
export function feedRotten(save: SaveData, uid: number): ActionResult {
  const d = find(save, uid);
  if (!d || d.isEgg) return fail(save, '먹이를 줄 수 없어요.');
  if (save.rotten <= 0) return fail(save, '썩은 고기가 없어요.');
  if (d.sick) return fail(save, '이미 병에 걸려 있어요.');
  const events: FarmEvent[] = [];
  const s = update(save, uid, (x) => {
    const y = { ...x, hunger: Math.min(100, x.hunger + 15), rottenEaten: x.rottenEaten + 1 };
    if (y.rottenEaten >= 2) {
      y.rottenEaten = 0;
      makeSick(y, events);
    }
    return y;
  });
  return { ok: true, message: events.length ? '썩은 고기를 먹고 병에 걸렸다! (페널티 +1)' : '썩은 고기를 먹었다…', save: { ...s, rotten: save.rotten - 1 } };
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

export function heal(save: SaveData, uid: number): ActionResult {
  const d = find(save, uid);
  if (!d || (!d.sick && !d.injured)) return fail(save, '아프지 않아요.');
  if (save.pills <= 0) return fail(save, '알약이 없어요. 상점에서 사세요.');
  return { ok: true, message: '알약을 먹고 나았다.', save: { ...update(save, uid, (x) => ({ ...x, sick: false, injured: false, sickMinutes: 0 })), pills: save.pills - 1 } };
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

export function capture(save: SaveData, speciesId: string, rng: Rng = defaultRng): ActionResult {
  const size = getSpecies(speciesId).size;
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
    { id: 'pill', name: '알약 ×1', price: 80, apply: (s) => ({ ...s, pills: s.pills + 1 }), available: () => true },
    { id: 'rotten', name: '썩은 고기 ×2', price: 20, apply: (s) => ({ ...s, rotten: s.rotten + 2 }), available: () => true },
    { id: 'wire', name: `노멀 와이어 ×${WIRE_PACK.count}`, price: WIRE_PACK.price, apply: (s) => ({ ...s, wires: (s.wires ?? 0) + WIRE_PACK.count }), available: () => true },
  ];
  // 다음 단계 로프만 상점에 나온다 (단계를 건너뛰지 않음)
  for (const r of ROPES)
    if (r.level > 1)
      items.push({ id: `rope${r.level}`, name: r.name, price: r.price, apply: (s) => ({ ...s, ropeLevel: Math.max(s.ropeLevel, r.level) }), available: (s) => s.ropeLevel === r.level - 1 && rank >= r.minRank });
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
