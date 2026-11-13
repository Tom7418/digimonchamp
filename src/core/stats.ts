import table from '../data/training.json';
import { initialStats, statBounds } from './data';
import { STAT_KEYS, type Digimon, type Stats } from './types';
import type { Rng } from './rng';

/** 원본 재탄생 횟수 보정표. 99의 별도 분기 공백도 임의로 보정하지 않는다. */
export function rebirthPercent(eggs: number): number {
  const count = Math.max(0, Math.min(100, Math.trunc(eggs)));
  if (!count) return 0;
  if (count < 20) return table.rebirthBonus[count];
  if (count < 99) return 25;
  return count === 99 ? 99 : 50;
}

/** 새 종 초기값 + 재탄생 보정 + 이전 종에서 훈련한 몫의 일부, 마지막으로 새 범위 제한.
 * ARM9 0x02062698~0x02062e7c의 정수 나눗셈·HP 절사를 따른다.
 * from=null은 첫 부화: 이전 종 훈련 이월이 없다. 알 내부 능력치 재현은 별도 후속이다.
 */
export function evolvedStats(from: Digimon | null, to: string, eggs: number, rng: Rng): Stats {
  const stats = initialStats(to, rng), percent = rebirthPercent(eggs);
  for (const key of STAT_KEYS) {
    const bounds = statBounds(to, key), span = bounds.max - bounds.min;
    const rebirth = key === 'hp' ? Math.trunc(span / 100) * percent
      : Math.trunc(Math.trunc(span * 10 / 100) * percent / 10);
    let carried = 0;
    if (from && !from.isEgg) {
      const old = statBounds(from.speciesId, key), width = old.max - old.min;
      const trained = width > 0 ? Math.trunc(100 * (from.stats[key] - old.min) / width) : 0;
      carried = Math.trunc(width * Math.trunc(trained / 4) / 100);
      if (key === 'hp') carried = Math.max(10, Math.trunc(carried / 10) * 10);
    }
    stats[key] = Math.max(bounds.min, Math.min(bounds.max, stats[key] + rebirth + carried));
  }
  return stats;
}

/** 구버전의 단위·진화 경로를 복원할 수 없으므로 결정적으로 이전한다(웹판 정책).
 * 원래 수치는 별도 보존하고, 새 초기 중앙값보다 낮으면 올리며 새 상한을 넘으면 제한한다.
 * 시각·재고·훈련/진화 조건·배치·저장 버전2는 그대로 유지한다.
 */
export function upgradeStats(d: Digimon): Digimon {
  if (d.statVersion === 1) return d;
  const baseline = initialStats(d.speciesId, () => 0.5);
  const stats = Object.fromEntries(STAT_KEYS.map(key => {
    const old = Number.isFinite(d.stats[key]) ? d.stats[key] : baseline[key];
    const bounds = statBounds(d.speciesId, key);
    return [key, d.isEgg ? 0 : Math.max(bounds.min, Math.min(bounds.max, Math.round(Math.max(old, baseline[key]))))];
  })) as Stats;
  return { ...d, stats, statVersion: 1, legacyStats: d.legacyStats ?? { ...d.stats } };
}
