import { getSpecies, stageIndex } from './data';
import { evolve, findEvolution } from './evolution';
import { defaultRng, type Rng } from './rng';
import type { Monster, StatKey } from './types';

export const OFFLINE_CAP_MINUTES = 12 * 60;
const POOP_MAX = 5;

export function newMonster(): Monster {
  return {
    speciesId: 'egg',
    nickname: '',
    stats: { hp: 0, atk: 0, def: 0, spd: 0, int: 0 },
    stageAge: 0,
    totalAge: 0,
    hunger: 80,
    energy: 100,
    weight: 5,
    poop: 0,
    sick: false,
    careMistakes: 0,
    trainings: 0,
    battles: 0,
    wins: 0,
    starvingMinutes: 0,
    dirtyMinutes: 0,
    sickMinutes: 0,
    poopTimer: 0,
  };
}

export type CareEvent =
  | { type: 'hatched' | 'evolved'; from: string; to: string }
  | { type: 'poop' }
  | { type: 'mistake'; reason: string }
  | { type: 'sick' };

function isBaby(m: Monster) {
  const st = getSpecies(m.speciesId).stage;
  return st === 'baby1' || st === 'baby2';
}

/** 게임 시간 1분을 진행한다. 상태가 변하는 순수 함수 */
export function tickMinute(prev: Monster, rng: Rng = defaultRng): { monster: Monster; events: CareEvent[] } {
  const m: Monster = { ...prev, stats: { ...prev.stats } };
  const events: CareEvent[] = [];
  m.stageAge += 1;
  m.totalAge += 1;

  if (m.speciesId !== 'egg') {
    m.hunger = Math.max(0, m.hunger - (isBaby(m) ? 0.15 : 0.1));
    m.energy = Math.min(100, m.energy + 0.15);

    m.poopTimer += 1;
    const interval = isBaby(m) ? 90 : 180;
    if (m.poopTimer >= interval) {
      m.poopTimer = 0;
      if (m.poop < POOP_MAX) {
        m.poop += 1;
        events.push({ type: 'poop' });
      }
    }

    if (m.hunger <= 0) {
      m.starvingMinutes += 1;
      if (m.starvingMinutes >= 60) {
        m.starvingMinutes = 0;
        m.careMistakes += 1;
        m.weight = Math.max(1, m.weight - 1);
        events.push({ type: 'mistake', reason: '배고픔 방치' });
      }
    } else m.starvingMinutes = 0;

    if (m.poop >= 3) {
      m.dirtyMinutes += 1;
      if (m.dirtyMinutes >= 60) {
        m.dirtyMinutes = 0;
        m.careMistakes += 1;
        events.push({ type: 'mistake', reason: '똥 방치' });
        if (!m.sick && rng() < 0.6) {
          m.sick = true;
          events.push({ type: 'sick' });
        }
      }
    } else m.dirtyMinutes = 0;

    if (m.sick) {
      m.sickMinutes += 1;
      if (m.sickMinutes >= 120) {
        m.sickMinutes = 0;
        m.careMistakes += 1;
        events.push({ type: 'mistake', reason: '아픔 방치' });
      }
    } else m.sickMinutes = 0;
  }

  // 진화 검사: 시기가 됐는데 조건 미달이면 60분마다 재검사
  const sp = getSpecies(m.speciesId);
  if (sp.stageMinutes > 0 && m.stageAge >= sp.stageMinutes && (m.stageAge - sp.stageMinutes) % 60 === 0) {
    const to = findEvolution(m);
    if (to) {
      const evolved = evolve(m, to);
      events.push({ type: m.speciesId === 'egg' ? 'hatched' : 'evolved', from: m.speciesId, to });
      return { monster: evolved, events };
    }
  }
  return { monster: m, events };
}

export function advance(m: Monster, minutes: number, rng: Rng = defaultRng) {
  const events: CareEvent[] = [];
  let cur = m;
  for (let i = 0; i < minutes; i++) {
    const r = tickMinute(cur, rng);
    cur = r.monster;
    events.push(...r.events);
  }
  return { monster: cur, events };
}

export interface ActionResult {
  ok: boolean;
  message: string;
  monster: Monster;
}

function fail(m: Monster, message: string): ActionResult {
  return { ok: false, message, monster: m };
}

export function feed(m: Monster): ActionResult {
  if (m.speciesId === 'egg') return fail(m, '아직 알이에요.');
  if (m.hunger >= 100) return fail(m, '배가 불러서 안 먹어요.');
  return { ok: true, message: '냠냠! 고기를 먹었다.', monster: { ...m, hunger: Math.min(100, m.hunger + 30), weight: m.weight + 1 } };
}

export function vitamin(m: Monster): ActionResult {
  if (m.speciesId === 'egg') return fail(m, '아직 알이에요.');
  if (m.hunger >= 100) return fail(m, '배가 불러서 안 먹어요.');
  return {
    ok: true,
    message: '영양제를 먹었다. HP +5',
    monster: { ...m, hunger: Math.min(100, m.hunger + 10), weight: m.weight + 2, stats: { ...m.stats, hp: m.stats.hp + 5 } },
  };
}

const TRAIN_GAIN = [0, 1, 2, 3, 5, 7];
export const TRAIN_LABEL: Record<Exclude<StatKey, 'hp'>, string> = { atk: '힘', def: '방어', spd: '속도', int: '지능' };

export function train(m: Monster, stat: Exclude<StatKey, 'hp'>, rng: Rng = defaultRng): ActionResult {
  if (m.speciesId === 'egg') return fail(m, '아직 알이에요.');
  if (m.sick) return fail(m, '아파서 훈련할 수 없어요.');
  if (m.energy < 15) return fail(m, '너무 지쳤어요. 쉬게 해 주세요.');
  if (m.hunger < 10) return fail(m, '배가 고파서 힘이 안 나요.');
  const gain = TRAIN_GAIN[stageIndex(getSpecies(m.speciesId).stage)];
  const success = rng() < 0.85;
  const amount = success ? gain : 1;
  const stats = { ...m.stats, [stat]: m.stats[stat] + amount, hp: m.stats.hp + (success ? 1 : 0) };
  return {
    ok: true,
    message: success ? `${TRAIN_LABEL[stat]} 훈련 성공! +${amount}` : `${TRAIN_LABEL[stat]} 훈련 실패… +1`,
    monster: {
      ...m,
      stats,
      energy: m.energy - 15,
      hunger: Math.max(0, m.hunger - 5),
      weight: Math.max(1, m.weight - 1),
      trainings: m.trainings + 1,
    },
  };
}

export function clean(m: Monster): ActionResult {
  if (m.poop === 0) return fail(m, '이미 깨끗해요.');
  return { ok: true, message: '깨끗하게 치웠다!', monster: { ...m, poop: 0, dirtyMinutes: 0 } };
}

export function heal(m: Monster): ActionResult {
  if (!m.sick) return fail(m, '아프지 않아요.');
  return { ok: true, message: '약을 먹고 나았다.', monster: { ...m, sick: false, sickMinutes: 0 } };
}

export function rest(m: Monster): ActionResult {
  if (m.speciesId === 'egg') return fail(m, '아직 알이에요.');
  if (m.energy >= 100) return fail(m, '기운이 넘쳐요.');
  return {
    ok: true,
    message: '푹 쉬었다. 기력 회복!',
    monster: { ...m, energy: Math.min(100, m.energy + 35), hunger: Math.max(0, m.hunger - 10) },
  };
}
