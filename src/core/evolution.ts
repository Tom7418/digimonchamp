import { getSpecies, STAGE_LABEL } from './data';
import type { EvolutionRequirement, Monster, StatKey } from './types';

const STAT_LABEL: Record<StatKey, string> = { hp: 'HP', atk: '공격', def: '방어', spd: '속도', int: '지능' };

export interface RequirementCheck {
  label: string;
  met: boolean;
}

/** 요구 조건 하나하나를 사람이 읽을 수 있는 문장과 충족 여부로 풀어낸다 (힌트 UI용) */
export function explainRequirement(m: Monster, req: EvolutionRequirement): RequirementCheck[] {
  const out: RequirementCheck[] = [];
  if (req.dominant) {
    const keys: StatKey[] = ['atk', 'def', 'spd', 'int'];
    const top = Math.max(...keys.map((k) => m.stats[k]));
    out.push({ label: `${STAT_LABEL[req.dominant]}이(가) 가장 높음`, met: m.stats[req.dominant] >= top });
  }
  if (req.minStats) {
    for (const [k, v] of Object.entries(req.minStats) as [StatKey, number][]) {
      out.push({ label: `${STAT_LABEL[k]} ${v} 이상`, met: m.stats[k] >= v });
    }
  }
  if (req.maxCareMistakes !== undefined)
    out.push({ label: `돌봄 실수 ${req.maxCareMistakes}회 이하`, met: m.careMistakes <= req.maxCareMistakes });
  if (req.minCareMistakes !== undefined)
    out.push({ label: `돌봄 실수 ${req.minCareMistakes}회 이상`, met: m.careMistakes >= req.minCareMistakes });
  if (req.minTrainings !== undefined)
    out.push({ label: `훈련 ${req.minTrainings}회 이상`, met: m.trainings >= req.minTrainings });
  if (req.minBattles !== undefined)
    out.push({ label: `배틀 ${req.minBattles}회 이상`, met: m.battles >= req.minBattles });
  if (req.minWins !== undefined) out.push({ label: `승리 ${req.minWins}회 이상`, met: m.wins >= req.minWins });
  if (req.minWeight !== undefined) out.push({ label: `체중 ${req.minWeight} 이상`, met: m.weight >= req.minWeight });
  if (req.maxWeight !== undefined) out.push({ label: `체중 ${req.maxWeight} 이하`, met: m.weight <= req.maxWeight });
  return out;
}

export function meets(m: Monster, req: EvolutionRequirement): boolean {
  return explainRequirement(m, req).every((c) => c.met);
}

/** 진화할 대상 종 id. 진화 시기가 아니거나 조건을 못 맞추면 null */
export function findEvolution(m: Monster): string | null {
  const sp = getSpecies(m.speciesId);
  if (sp.stageMinutes <= 0 || m.stageAge < sp.stageMinutes) return null;
  for (const opt of sp.evolutions) {
    if (meets(m, opt.req)) return opt.to;
  }
  return null;
}

/** 진화 적용: 종 변경, 기본 능력치 추가, 단계 나이 초기화 */
export function evolve(m: Monster, toId: string): Monster {
  const to = getSpecies(toId);
  const stats = { ...m.stats };
  for (const k of Object.keys(stats) as StatKey[]) stats[k] += to.baseStats[k];
  return { ...m, speciesId: toId, stats, stageAge: 0, energy: 100, sick: false };
}

export interface EvolutionHint {
  /** 이미 키워본 종이면 이름, 아니면 ??? */
  name: string;
  stage: string;
  checks: RequirementCheck[];
  ready: boolean;
}

export function evolutionHints(m: Monster, discovered: Set<string>): EvolutionHint[] {
  const sp = getSpecies(m.speciesId);
  return sp.evolutions.map((opt) => {
    const to = getSpecies(opt.to);
    const checks = explainRequirement(m, opt.req);
    return {
      name: discovered.has(to.id) ? to.name : '???',
      stage: STAGE_LABEL[to.stage],
      checks: checks.length ? checks : [{ label: '조건 없음 (기본 진화)', met: true }],
      ready: checks.every((c) => c.met),
    };
  });
}
