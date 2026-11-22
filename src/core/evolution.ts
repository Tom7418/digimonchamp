import { getSpecies, LIFESPAN, STAGE_LABEL } from './data';
import type { ApKey, Cond, Digimon, Stage } from './types';

export interface Check {
  label: string;
  met: boolean;
}

/**
 * 요구 수치 배율. 예전에는 위키 설명대로 디지에그화마다 5%씩 줄였지만, 원본 진화 판정(overlay18 0x2115E70~)은
 * 속성·종족 수치를 진화표 값과 그대로 비교한다. 디지에그화 횟수는 능력치 재탄생 보정(ARM9 0x2062684)에만 쓰인다.
 */
export const reqScale = (_d: Digimon) => 1;

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
    const life = lifespanOf(d);
    out.push({ label: '수명이 다할 때까지 다른 조건을 채우지 않음', met: d.stageAge >= life });
  }
  // 별도의 최소 성장 나이는 붙이지 않는다. 시간 경로는 위 cond.time 자체만 검사한다.
  return out;
}

/**
 * 이번 세대의 수명(게임 분). 원본 배우 +0x428: 평소에는 종 표 +0x28(세대마다 같은 값, LIFESPAN)이고,
 * 수명 연장 표시(디지몬 칸 +0x4C)가 서면 0x212B9BC 표[세대] = 다음 세대의 수명이 된다(overlay18 0x2114DEC, 표는 0x212B2B8이 채움).
 * 궁극체는 진화 판정이 바로 끝나(0x2115D9C) 연장되지 않는다.
 */
export function lifespanOf(d: Digimon): number {
  const stage = getSpecies(d.speciesId).stage;
  return d.lifeExtended && stage < 6 ? LIFESPAN[(stage + 1) as Stage] : LIFESPAN[stage];
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
