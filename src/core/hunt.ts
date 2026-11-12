// 사냥 규칙. 화면(web/game.js)은 이 함수들의 결과만 보고 그린다.
//
// 플레이 영상으로 확인한 것
// - 로프로 디지몬을 둘러싸 당기면 HP가 깎이고, HP를 다 깎아야 포획된다. 강한 개체는 여러 번 둘러야 한다.
// - 초반 로프로는 유년기만 잡힌다. 랭크가 오르며 성장기·성숙기·완전체 로프가 열린다 (완전체까지는 형규 원작 확인).
// - 와이어를 깔아 길을 막을 수 있고, 맞은 디지몬은 맵 밖·동굴로 도망간다.
// - 용량이 가득 차면 잡을 수 없다 ('용량이 가득 찼습니다').
// 출현표: 나무위키 진화 목록의 출현 장소(src/data/habitats.txt). 성숙기·완전체는 그 단계 로프가 있어야 잡힌다.
// 임시 값: 세대별 HP(유년기I 1, 유년기II 2, 성장기 3), 성장기 25%·성숙기 이상 10% 출현, 밤 18시~, 드묾 1/5, 와이어 가격·개수.
import { dateOf, FIELDS, getSpecies, SEASON_CODE, type Field } from './data';
import { tamerRank } from './titles';
import type { SaveData } from './types';

/** 사냥 가능한 시간: 08:00 ~ 22:00 (22시 이후 불가는 원작, 시작 시각은 영상 화면 08:00 기준) */
export const HUNT_OPEN_HOUR = 8;
export const HUNT_CLOSE_HOUR = 22;
/** 성장기가 출현할 확률 (임시) */
export const ROOKIE_CHANCE = 0.25;
/** 성숙기 이상이 출현할 확률 (임시) */
export const STRONG_CHANCE = 0.1;
/** 이 시각부터 '밤'에만 나오는 디지몬이 나오고 밤 지도를 쓴다 (임시) */
export const HUNT_NIGHT_HOUR = 18;
/** '드묾' 표시 디지몬의 상대 가중치 (임시) */
export const RARE_WEIGHT = 0.2;
/** 한 사냥터에 동시에 나오는 야생 디지몬 수 */
export const WILD_COUNT = 5;

export interface HuntField extends Field {
  open: boolean;
  reason?: string;
}

export function huntFields(save: SaveData): HuntField[] {
  const rank = tamerRank(save);
  return FIELDS.map((f) => {
    if (rank < f.minRank) return { ...f, open: false, reason: f.minRank >= 9 ? '챔피언십 우승 뒤 열림' : `테이머 랭크 ${f.minRank} 필요` };
    const p = huntPool(f, save.clock);
    if (!p.babies.length && !p.rookies.length && !p.strong.length) return { ...f, open: false, reason: '지금은 디지몬이 없음' };
    return { ...f, open: true };
  });
}

export function canHuntNow(save: SaveData): { ok: boolean; reason?: string } {
  const { hour } = dateOf(save.clock);
  if (hour < HUNT_OPEN_HOUR) return { ok: false, reason: `사냥은 ${HUNT_OPEN_HOUR}시부터 할 수 있어요.` };
  if (hour >= HUNT_CLOSE_HOUR) return { ok: false, reason: '22시 이후에는 사냥할 수 없어요.' };
  return { ok: true };
}

export interface HuntPool {
  /** 유년기I·II */
  babies: string[];
  /** 성장기 */
  rookies: string[];
  /** 성숙기 이상 (로프로 못 잡음) */
  strong: string[];
  /** '드묾' 표시 */
  rare: string[];
}

/** 이 계절·시간대에 이 사냥터에 나오는 디지몬을 세대별로 나눈다 */
export function huntPool(field: Field, clock: number): HuntPool {
  const { season, hour } = dateOf(clock);
  const code = SEASON_CODE[season];
  const night = hour >= HUNT_NIGHT_HOUR;
  const here = field.spawns.filter(([, w]) => w.includes(code) && !(w.includes('밤') && !night) && !(w.includes('낮') && night));
  const names = [...new Set(here.map(([n]) => n))];
  const by = (ok: (stage: number) => boolean) => names.filter((n) => ok(getSpecies(n).stage));
  return {
    babies: by((s) => s <= 2),
    rookies: by((s) => s === 3),
    strong: by((s) => s >= 4),
    rare: [...new Set(here.filter(([, w]) => w.includes('드묾')).map(([n]) => n))],
  };
}

function pickWeighted(list: string[], rare: string[], rng: () => number): string {
  const weights = list.map((n) => (rare.includes(n) ? RARE_WEIGHT : 1));
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < list.length; i++) if ((r -= weights[i]) < 0) return list[i];
  return list[list.length - 1];
}

/** 사냥터에 새로 나타날 디지몬. 나올 디지몬이 없으면 null */
export function pickWild(field: Field, clock: number, rng: () => number): string | null {
  const p = huntPool(field, clock);
  const roll = rng();
  const order =
    roll < ROOKIE_CHANCE ? [p.rookies, p.babies, p.strong] : roll < ROOKIE_CHANCE + STRONG_CHANCE ? [p.strong, p.babies, p.rookies] : [p.babies, p.rookies, p.strong];
  const list = order.find((l) => l.length);
  return list ? pickWeighted(list, p.rare, rng) : null;
}

/**
 * 로프 단계. 테이머 랭크가 오르면 상점에 다음 로프가 열리고, 최대 완전체까지 잡을 수 있다 (형규 원작 확인).
 * 궁극체는 잡을 수 없다. 가격·열리는 랭크는 임시 값.
 */
export const ROPES = [
  { level: 1, name: '유년기 로프', maxStage: 2, price: 0, minRank: 1 },
  { level: 2, name: '성장기 로프', maxStage: 3, price: 1500, minRank: 2 },
  { level: 3, name: '성숙기 로프', maxStage: 4, price: 3000, minRank: 4 },
  { level: 4, name: '완전체 로프', maxStage: 5, price: 6000, minRank: 6 },
] as const;

export function ropeOf(level: number) {
  return ROPES[Math.max(0, Math.min(ROPES.length - 1, level - 1))];
}

/** 이 디지몬을 잡으려면 필요한 로프 (없으면 null = 궁극체) */
export function ropeFor(speciesId: string) {
  const stage = getSpecies(speciesId).stage;
  return ROPES.find((r) => r.maxStage >= stage) ?? null;
}

/** 로프로 몇 번 둘러야 잡히는가 (임시: 유년기I 1, 유년기II 2, 성장기 3, 성숙기 4, 완전체 5) */
export function wildHp(speciesId: string): number {
  return Math.max(1, Math.min(5, getSpecies(speciesId).stage));
}

/** 로프로 한 번 둘렀을 때 깎이는 HP. 0이면 이 로프로는 잡을 수 없다 */
export function ropeDamage(save: Pick<SaveData, 'ropeLevel'>, speciesId: string): number {
  return getSpecies(speciesId).stage <= ropeOf(save.ropeLevel).maxStage ? 1 : 0;
}

/** 와이어 한 묶음 (상점) */
export const WIRE_PACK = { count: 10, price: 100 };
