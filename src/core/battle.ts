import { getMove, getSpecies, SPECIES } from './data';
import { pick, range, type Rng } from './rng';
import type { Move, Stage, Stats, Tactic } from './types';

export interface Fighter {
  name: string;
  speciesId: string;
  stats: Stats;
  moves: string[];
  tactic: Tactic;
}

export type BattleEvent =
  | { t: number; type: 'attack'; side: 0 | 1; move: string; damage: number; crit: boolean; hp: [number, number] }
  | { t: number; type: 'miss'; side: 0 | 1; move: string }
  | { t: number; type: 'guard'; side: 0 | 1; move: string }
  | { t: number; type: 'end'; winner: 0 | 1; reason: 'ko' | 'timeout' };

export interface BattleResult {
  maxHp: [number, number];
  events: BattleEvent[];
  winner: 0 | 1;
}

export const maxHpOf = (s: Stats) => Math.round(30 + s.hp * 2 + s.def * 0.5);

const MAX_TICKS = 900;

function chooseMove(f: Fighter, hpRatio: number, rng: Rng): Move {
  const moves = (f.moves.length ? f.moves : ['headbutt']).map(getMove);
  const attacks = moves.filter((m) => m.kind !== 'guard');
  const guard = moves.find((m) => m.kind === 'guard');
  const list = attacks.length ? attacks : moves;

  if (f.tactic === 'aggressive') {
    const sorted = [...list].sort((a, b) => b.power - a.power);
    return pick(rng, sorted.slice(0, 2));
  }
  if (f.tactic === 'careful') {
    if (guard && hpRatio < 0.6 && rng() < 0.35) return guard;
    const sorted = [...list].sort((a, b) => b.power / b.cost - a.power / a.cost);
    return rng() < 0.7 ? sorted[0] : pick(rng, list);
  }
  if (guard && hpRatio < 0.5 && rng() < 0.15) return guard;
  // 균형형: 위력 비례 가중치
  const total = list.reduce((s, m) => s + m.power, 0);
  let r = rng() * total;
  for (const m of list) {
    r -= m.power;
    if (r <= 0) return m;
  }
  return list[0];
}

/** 자동 배틀 시뮬레이션. 같은 rng 시드면 같은 결과 */
export function simulateBattle(a: Fighter, b: Fighter, rng: Rng): BattleResult {
  const fighters = [a, b] as const;
  const maxHp: [number, number] = [maxHpOf(a.stats), maxHpOf(b.stats)];
  const hp: [number, number] = [...maxHp];
  const gauge = [rng() * 30, rng() * 30];
  const guarding = [false, false];
  const events: BattleEvent[] = [];

  for (let t = 0; t < MAX_TICKS; t++) {
    for (const side of [0, 1] as const) {
      const me = fighters[side];
      gauge[side] += 4 + me.stats.spd * 0.25;
      if (gauge[side] < 100) continue;

      const foeSide = (1 - side) as 0 | 1;
      const foe = fighters[foeSide];
      const move = chooseMove(me, hp[side] / maxHp[side], rng);
      gauge[side] -= 100 * move.cost;

      if (move.kind === 'guard') {
        guarding[side] = true;
        events.push({ t, type: 'guard', side, move: move.id });
        continue;
      }
      guarding[side] = false;

      const missChance = Math.min(0.3, Math.max(0.03, 0.06 + (foe.stats.spd - me.stats.spd) / 400));
      if (rng() < missChance) {
        events.push({ t, type: 'miss', side, move: move.id });
        continue;
      }

      const atk = move.kind === 'physical' ? me.stats.atk : me.stats.int;
      const def = move.kind === 'physical' ? foe.stats.def : (foe.stats.def + foe.stats.int) / 2;
      const crit = rng() < 0.05 + me.stats.int / 1000;
      let dmg = move.power * (atk + 5) / (atk + def + 10) * 2 * (1 + atk / 120) * range(rng, 0.85, 1.15);
      if (crit) dmg *= 1.5;
      if (guarding[foeSide]) {
        dmg *= 0.4;
        guarding[foeSide] = false;
      }
      const damage = Math.max(1, Math.round(dmg));
      hp[foeSide] = Math.max(0, hp[foeSide] - damage);
      events.push({ t, type: 'attack', side, move: move.id, damage, crit, hp: [hp[0], hp[1]] });

      if (hp[foeSide] <= 0) {
        events.push({ t, type: 'end', winner: side, reason: 'ko' });
        return { maxHp, events, winner: side };
      }
    }
  }
  const winner: 0 | 1 = hp[0] / maxHp[0] >= hp[1] / maxHp[1] ? 0 : 1;
  events.push({ t: MAX_TICKS, type: 'end', winner, reason: 'timeout' });
  return { maxHp, events, winner };
}

export type Rank = 'novice' | 'regular' | 'expert';
export const RANK_INFO: Record<Rank, { label: string; stage: Stage; base: number }> = {
  novice: { label: '초급', stage: 'rookie', base: 22 },
  regular: { label: '중급', stage: 'champion', base: 70 },
  expert: { label: '상급', stage: 'ultimate', base: 160 },
};

/** 랭크에 맞는 상대 생성 */
export function makeOpponent(rank: Rank, rng: Rng): Fighter {
  const info = RANK_INFO[rank];
  const pool = Object.values(SPECIES).filter((s) => s.stage === info.stage);
  const sp = pick(rng, pool);
  const keys = ['atk', 'def', 'spd', 'int'] as const;
  const top = keys.reduce((best, k) => (sp.baseStats[k] > sp.baseStats[best] ? k : best), keys[0]);
  const stat = (k: keyof Stats) => Math.round(info.base * range(rng, 0.85, 1.15) * (k === top ? 1.3 : 1));
  const tactics: Tactic[] = ['aggressive', 'balanced', 'careful'];
  return {
    name: sp.name,
    speciesId: sp.id,
    stats: { hp: Math.round(info.base * 0.6), atk: stat('atk'), def: stat('def'), spd: stat('spd'), int: stat('int') },
    moves: sp.moves,
    tactic: pick(rng, tactics),
  };
}

export function fighterName(speciesId: string) {
  return getSpecies(speciesId).name;
}
