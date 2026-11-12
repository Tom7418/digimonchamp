// 사냥 규칙. 화면(web/game.js)은 이 함수들의 결과만 보고 그린다.
//
// 플레이 영상으로 확인한 것
// - 로프로 디지몬을 둘러싸 당기면 HP가 깎이고, HP를 다 깎아야 포획된다. 강한 개체는 여러 번 둘러야 한다.
// - 초반 로프로는 유년기만 잡힌다. 성장기는 상점의 '성장기 로프'를 사야 HP가 깎인다.
// - 와이어를 깔아 길을 막을 수 있고, 맞은 디지몬은 맵 밖·동굴로 도망간다.
// - 용량이 가득 차면 잡을 수 없다 ('용량이 가득 찼습니다').
// 임시 값: 세대별 HP(유년기I 1, 유년기II 2, 성장기 3), 성장기 출현 확률 25%, 와이어 가격·개수.
import { dateOf, FIELDS, getSpecies, SEASON_CODE, type Field } from './data';
import { tamerRank } from './titles';
import type { SaveData } from './types';

/** 사냥 가능한 시간: 08:00 ~ 22:00 (22시 이후 불가는 원작, 시작 시각은 영상 화면 08:00 기준) */
export const HUNT_OPEN_HOUR = 8;
export const HUNT_CLOSE_HOUR = 22;
/** 성장기가 출현할 확률 (임시) */
export const ROOKIE_CHANCE = 0.25;
/** 한 사냥터에 동시에 나오는 야생 디지몬 수 */
export const WILD_COUNT = 5;

export interface HuntField extends Field {
  open: boolean;
  reason?: string;
}

export function huntFields(save: SaveData): HuntField[] {
  const rank = tamerRank(save);
  return FIELDS.map((f) => (rank >= f.minRank ? { ...f, open: true } : { ...f, open: false, reason: `테이머 랭크 ${f.minRank} 필요` }));
}

export function canHuntNow(save: SaveData): { ok: boolean; reason?: string } {
  const { hour } = dateOf(save.clock);
  if (hour < HUNT_OPEN_HOUR) return { ok: false, reason: `사냥은 ${HUNT_OPEN_HOUR}시부터 할 수 있어요.` };
  if (hour >= HUNT_CLOSE_HOUR) return { ok: false, reason: '22시 이후에는 사냥할 수 없어요.' };
  return { ok: true };
}

/** 이 계절에 이 사냥터에 나오는 유년기와, 그 유년기II가 진화하는 성장기 */
export function huntPool(field: Field, clock: number): { babies: string[]; rookies: string[] } {
  const season = SEASON_CODE[dateOf(clock).season];
  const babies = [...new Set(field.spawns.filter(([, s]) => s.includes(season)).map(([n]) => n))];
  const rookies = new Set<string>();
  for (const b of babies) {
    const sp = getSpecies(b);
    const stage2 = sp.stage === 2 ? [b] : sp.evos.map((e) => e.to).filter((id) => getSpecies(id).stage === 2);
    for (const id of stage2) for (const e of getSpecies(id).evos) if (getSpecies(e.to).stage === 3) rookies.add(e.to);
  }
  return { babies, rookies: [...rookies] };
}

export function pickWild(field: Field, clock: number, rng: () => number): string {
  const { babies, rookies } = huntPool(field, clock);
  const list = rookies.length && rng() < ROOKIE_CHANCE ? rookies : babies;
  return list[Math.floor(rng() * list.length)];
}

/** 로프로 몇 번 둘러야 잡히는가 */
export function wildHp(speciesId: string): number {
  return Math.max(1, Math.min(3, getSpecies(speciesId).stage));
}

/** 로프로 한 번 둘렀을 때 깎이는 HP. 0이면 이 로프로는 잡을 수 없다 */
export function ropeDamage(save: Pick<SaveData, 'ropeLevel'>, speciesId: string): number {
  const stage = getSpecies(speciesId).stage;
  if (stage >= 4) return 0;
  if (stage === 3 && save.ropeLevel < 2) return 0;
  return 1;
}

/** 와이어 한 묶음 (상점) */
export const WIRE_PACK = { count: 10, price: 100 };
