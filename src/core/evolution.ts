import { getSpecies, LIFESPAN, STAGE_LABEL } from './data';
import type { ApKey, Cond, Digimon, Stage } from './types';

export interface Check {
  label: string;
  met: boolean;
}

/** 디지에그화를 거칠수록 요구 수치가 조금씩 줄어든다 */
export const reqScale = (d: Digimon) => Math.max(0.7, 1 - 0.05 * d.eggs);

export function explain(d: Digimon, cond: Cond): Check[] {
  const out: Check[] = [];
  const k = reqScale(d);
  for (const [key, v] of Object.entries(cond.ap ?? {}) as [ApKey, number][]) {
    const need = Math.ceil(v * k);
    out.push({ label: `${key} ${need} 이상 (현재 ${Math.floor(d.ap[key])})`, met: d.ap[key] >= need });
  }
  if (cond.battles !== undefined) out.push({ label: `배틀 ${cond.battles}회 이상 (현재 ${d.battles})`, met: d.battles >= cond.battles });
  if (cond.winRate !== undefined) {
    const rate = d.battles ? Math.round((d.wins / d.battles) * 100) : 0;
    out.push({ label: `승률 ${cond.winRate}% 이상 (현재 ${rate}%)`, met: rate >= cond.winRate });
  }
  if (cond.penalties !== undefined) out.push({ label: `페널티(발병) ${cond.penalties}회 이상 (현재 ${d.penalties})`, met: d.penalties >= cond.penalties });
  if (cond.eggs !== undefined) out.push({ label: `디지에그화 ${cond.eggs}회 이상 (현재 ${d.eggs})`, met: d.eggs >= cond.eggs });
  if (cond.time) {
    const life = LIFESPAN[getSpecies(d.speciesId).stage];
    out.push({ label: '수명이 다할 때까지 다른 조건을 채우지 않음', met: d.stageAge >= life });
  }
  return out;
}

export const meets = (d: Digimon, cond: Cond) => explain(d, cond).every((c) => c.met);

/** 테이머 랭크로 진화 가능한 최대 세대 */
export function maxStageForRank(rank: number): Stage {
  // 레드 테이머(랭크 4)에서 성숙기 허용은 영상 확인, 완전체·궁극체 기준은 임시
  // 레드(랭크 3)에서 성숙기 허용만 영상 확인. 브론즈 완전체·골드 궁극체는 임시
  if (rank >= 7) return 6;
  if (rank >= 5) return 5;
  if (rank >= 3) return 4;
  return 3;
}

export type EvoResult = { kind: 'evolve'; to: string } | { kind: 'blocked'; to: string; reason: 'rank' | 'capacity' } | null;

/** 지금 진화할 대상. freeCapacity는 사육 용량의 남은 G */
export function findEvolution(d: Digimon, rank: number, freeCapacity: number): EvoResult {
  if (d.isEgg) return null;
  const sp = getSpecies(d.speciesId);
  const life = LIFESPAN[sp.stage];
  if (d.stageAge < life * 0.2) return null;
  for (const evo of sp.evos) {
    if (!meets(d, evo.cond)) continue;
    const to = getSpecies(evo.to);
    if (to.stage > maxStageForRank(rank)) return { kind: 'blocked', to: evo.to, reason: 'rank' };
    if (to.size - sp.size > freeCapacity) return { kind: 'blocked', to: evo.to, reason: 'capacity' };
    return { kind: 'evolve', to: evo.to };
  }
  return null;
}

/** 수명이 다했는데 진화하지 못한 경우: 완전체 이상이거나 배틀 10회 이상이면 디지에그화, 아니면 로스트 */
export function endOfLife(d: Digimon): 'egg' | 'lost' {
  return getSpecies(d.speciesId).stage >= 5 || d.battles >= 10 ? 'egg' : 'lost';
}

export interface Hint {
  name: string;
  stage: string;
  checks: Check[];
  ready: boolean;
}

export function hints(d: Digimon, seen: Set<string>): Hint[] {
  return getSpecies(d.speciesId).evos.map((evo) => {
    const to = getSpecies(evo.to);
    const checks = explain(d, evo.cond);
    return { name: seen.has(to.id) ? to.name : '???', stage: STAGE_LABEL[to.stage], checks, ready: checks.every((c) => c.met) };
  });
}
