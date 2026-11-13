import table from '../data/training.json';
import { statBounds, type Cage } from './data';
import type { Rng } from './rng';
import { STAT_KEYS, STAT_LABEL, type Digimon, type ApKey } from './types';

// overlay18 0x02117274의 항목 순서. 표시명은 txt_list #19~40과 대응한다.
const AP_ORDER: ApKey[] = ['바이러스', '백신', '데이터', '용', '짐승', '물', '새', '기계', '성', '벌레풀', '암흑'];
export const RESIST_KEYS = ['열', '추위', '천둥', '빛', '어둠'] as const;
const outcomes = table.facilities as Record<string, { weight: number; changes: number[][] }[]>;
const percentile = (rng: Rng) => Math.min(99, Math.max(0, Math.floor(rng() * 100)));

/** 초기화·진화와 같은 범위를 공유한다. */
export const trainingBounds = statBounds;

/** 원본 시설 결과표 + 여름/겨울 가산 + 항목별 난수 폭. 시설 모드 배수는 미연결(기본0). */
export function trainingDelta(key: number, base: number, season: number, rng: Rng): number {
  let value = base + (season === 1 ? table.summerAdd[key] : season === 3 ? table.winterAdd[key] : 0);
  // 원작 여름 보정으로 -2가 0이 되는 경우에도 감소를 남긴다.
  if (season === 1 && value === 0) value = -1;
  const width = table.variance[key];
  const variation = Math.trunc((2 * width - 1) * percentile(rng) / 100) - width;
  if (variation !== 0 && value + variation !== 0) value += variation;
  // HP 증감은 부호를 보존하여 10 단위로 반올림한다.
  return key === 16 ? Math.trunc((value + (value < 0 ? -5 : 5)) / 10) * 10 : value;
}

/** 실제 적용 뒤의 차이만 표시한다. 기존 저장이 원작 범위 밖이면 경계로 강제 이동시키지 않는다. */
export function applyTraining(d: Digimon, cage: Cage, season: number, rng: Rng): string[] {
  const choices = outcomes[String(cage.no)];
  let changes: number[][] = [];
  if (choices) {
    let roll = percentile(rng);
    for (const choice of choices) {
      if (roll < choice.weight) { changes = choice.changes; break; }
      roll -= choice.weight;
    }
  } else {
    // 원본 표에 없는 미니 숲/공장 등은 기존 임시 효과를 유지하며 원본이라고 주장하지 않는다.
    changes = [
      ...(cage.up ?? []).map(k => [16 + STAT_KEYS.indexOf(k), cage.gain ?? 1]),
      ...(cage.down ?? []).map(k => [16 + STAT_KEYS.indexOf(k), -1]),
      ...(cage.apUp ?? []).map(k => [AP_ORDER.indexOf(k), 3 * (cage.gain ?? 1)]),
      ...(cage.apDown ?? []).map(k => [AP_ORDER.indexOf(k), -1]),
    ];
  }
  const result: string[] = [];
  for (const [key, base] of changes) {
    const amount = choices ? trainingDelta(key, base, season, rng) : base;
    let before: number, after: number, label: string;
    if (key < 11) {
      const k = AP_ORDER[key];
      before = d.ap[k]; after = Math.max(0, Math.min(99, before + amount)); // AP 0~99는 웹판 정책
      d.ap[k] = after; label = `${k} 수치`;
    } else if (key < 16) {
      const k = RESIST_KEYS[key - 11];
      d.resistance = { ...d.resistance };
      before = d.resistance[k] ?? 0;
      after = Math.max(0, Math.min(310, before + amount)); // 내성 상한은 후속 검증
      d.resistance[k] = after; label = `${k} 내성`;
    } else {
      const k = STAT_KEYS[key - 16], bounds = trainingBounds(d.speciesId, k);
      before = d.stats[k];
      // 원작 최저/최대와 기존 웹의 다른 능력치 단위를 함께 다룬다. 범위 밖 수치는 보존한다.
      after = Math.max(Math.min(before, bounds.min), Math.min(Math.max(before, bounds.max), before + amount));
      d.stats[k] = after; label = STAT_LABEL[k];
    }
    const delta = after - before;
    result.push(`${label} ${delta >= 0 ? '+' : ''}${delta}${delta === 0 && amount !== 0 ? amount > 0 ? ' (상한)' : ' (하한)' : ''}`);
  }
  // 링의 배틀 수는 원본 부가 효과 명령 해석과 분리된 기존 웹 정책이다.
  if (cage.battleUp) { d.battles += cage.battleUp; result.push(`배틀 수 +${cage.battleUp}`); }
  return result.length ? result : ['변화 없음'];
}
