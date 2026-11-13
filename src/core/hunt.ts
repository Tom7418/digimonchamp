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
 * 로프 12종 (원작 텍스트 txt_list #338~349 이름, #384~395 '○○용의 로프. 내구력 N').
 * 원작 도움말(help #89): 로프는 묶어서 대미지를 주고, 끊어져도 몇 번이고 다시 쓸 수 있으며
 * 내구력이 높을수록 끊어질 위험이 적다. 랭크가 오르면 상점에 열린다(형규 확인, 최대 완전체).
 * 임시 값: 가격, 열리는 랭크, 끊어질 확률 공식, 하위 세대에도 쓸 수 있다는 점.
 */
export interface Rope {
  id: string;
  name: string;
  /** 이 로프로 잡을 수 있는 가장 높은 세대 */
  maxStage: number;
  /** 원작 내구력 */
  durability: number;
  price: number;
  minRank: number;
}
const ROPE_FAMILIES = [
  { key: 'digi', name: '디지 로프', maxStage: 2, durability: [10, 15, 20], price: [0, 300, 600], minRank: 1 },
  { key: 'hard', name: '하드 로프', maxStage: 3, durability: [32, 44, 56], price: [1500, 2200, 3000], minRank: 2 },
  { key: 'clone', name: '클론 로프', maxStage: 4, durability: [60, 80, 100], price: [3000, 4000, 5000], minRank: 4 },
  { key: 'ultima', name: '알테마 로프', maxStage: 5, durability: [150, 150, 250], price: [6000, 7000, 9000], minRank: 6 },
];
const GREEK = ['α', 'β', 'γ'];
export const ROPES: Rope[] = ROPE_FAMILIES.flatMap((f) =>
  GREEK.map((g, i) => ({ id: `${f.key}${i + 1}`, name: `${f.name}${g}`, maxStage: f.maxStage, durability: f.durability[i], price: f.price[i], minRank: f.minRank })),
);
export const START_ROPE = 'digi1';

export function ropeOf(id: string | undefined): Rope {
  return ROPES.find((r) => r.id === id) ?? ROPES[0];
}

/** 가진 로프 중 가장 좋은 것 (높은 세대, 같으면 높은 내구력) */
export function bestRope(ids: string[]): string {
  const own = ROPES.filter((r) => ids.includes(r.id));
  own.sort((a, b) => b.maxStage - a.maxStage || b.durability - a.durability);
  return own[0]?.id ?? START_ROPE;
}

/** 이 디지몬을 잡으려면 필요한 로프 계열 이름 (없으면 null = 궁극체) */
export function ropeFor(speciesId: string): { name: string } | null {
  const stage = getSpecies(speciesId).stage;
  const f = ROPE_FAMILIES.find((x) => x.maxStage >= stage);
  return f ? { name: f.name } : null;
}

/** 로프로 몇 번 당겨야 잡히는가 (임시: 유년기I 1, 유년기II 2, 성장기 3, 성숙기 4, 완전체 5) */
export function wildHp(speciesId: string): number {
  return Math.max(1, Math.min(5, getSpecies(speciesId).stage));
}

/** 로프로 한 번 당겼을 때 깎이는 HP. 0이면 이 로프로는 잡을 수 없다 */
export function ropeDamage(save: Pick<SaveData, 'rope'>, speciesId: string): number {
  return getSpecies(speciesId).stage <= ropeOf(save.rope).maxStage ? 1 : 0;
}

/** 세대별 버티는 힘 (임시) */
const PULL_STRENGTH = [0, 2, 4, 16, 40, 100, 250];
/** 당길 때 로프가 끊어질 확률 = 힘 / (내구력 × 4), 최대 60% (임시 공식) */
export function ropeBreakChance(save: Pick<SaveData, 'rope'>, speciesId: string): number {
  const strength = PULL_STRENGTH[getSpecies(speciesId).stage] ?? 250;
  return Math.min(0.6, strength / (ropeOf(save.rope).durability * 4));
}

/** 메모리카드 (원작 텍스트 txt_list #430~435: 사냥으로 32G·64G·96G까지 데려올 수 있다). 가격·랭크는 임시 */
export const MEMORY_CARDS = [
  { id: 'card32', name: '메모리카드 32', size: 32, price: 0, minRank: 1 },
  { id: 'card64', name: '메모리카드 64', size: 64, price: 1200, minRank: 2 },
  { id: 'card96', name: '메모리카드 96', size: 96, price: 3000, minRank: 4 },
];

/** 와이어 한 묶음 (상점) */
export const WIRE_PACK = { count: 10, price: 100 };

// ---------- 사냥 장비: 샷·고기 ----------
// 이름·위력·효과·'6발' 문구는 원작 글(txt_list 350~361, 368~369번과 설명 396~407, 414~415번).
// 임시 값: 가격·해금 랭크·묶음 수, 맞았을 때 멈추는 시간과 HP 감소, 범위, 고기의 유인 범위·시간.
//   원작의 위력 10/20이 실제로 어떻게 계산되는지는 확인하지 못했다.
export interface Shot {
  id: string;
  name: string;
  /** 원작 위력 */
  power: number;
  effect?: '수면' | '마비';
  /** 한 번에 6발 (범위 공격) */
  spread?: boolean;
  /** 연발 가능 */
  rapid?: boolean;
  price: number;
  minRank: number;
}
const SHOT_FAMILIES: { key: string; name: string; effect?: '수면' | '마비'; spread?: boolean; rapid?: boolean; price: number; minRank: number }[] = [
  { key: 'hand', name: '핸드 건', price: 100, minRank: 1 },
  { key: 'rapid', name: '래피드 건', rapid: true, price: 200, minRank: 2 },
  { key: 'sleep', name: '슬립 라이플', effect: '수면', price: 300, minRank: 2 },
  { key: 'stun', name: '스턴 라이플', effect: '마비', price: 300, minRank: 3 },
  { key: 'shotgun', name: '샷 건', spread: true, price: 500, minRank: 4 },
  { key: 'stunshot', name: '스턴 샷', effect: '마비', spread: true, price: 800, minRank: 5 },
];
export const SHOTS: Shot[] = SHOT_FAMILIES.flatMap((f) =>
  ['α', 'β'].map((g, i) => ({ id: `${f.key}${i + 1}`, name: f.name + g, power: 10 * (i + 1), effect: f.effect, spread: f.spread, rapid: f.rapid, price: f.price * (i + 1), minRank: f.minRank + i })),
);
export const shotOf = (id: string) => SHOTS.find((s) => s.id === id);
/** 한 번 살 때 들어오는 탄 수 (임시) */
export const SHOT_PACK = 10;
export const SHOT_SPREAD_RADIUS = 90;
/** 맞은 디지몬이 멈추는 초 (임시): 위력 10당 2초, 수면 3배, 마비 2배 */
export const shotStun = (s: Shot) => (s.power / 10) * 2 * (s.effect === '수면' ? 3 : s.effect === '마비' ? 2 : 1);
/** 맞았을 때 줄어드는 HP (임시): 위력 20 이상이면 1. 샷만으로는 잡히지 않게 HP 1은 남긴다 */
export const shotDamage = (s: Shot, hp: number) => (s.power >= 20 && hp > 1 ? 1 : 0);
/** 다음 발까지의 초 (임시) */
export const shotCooldown = (s: Shot) => (s.rapid ? 0.15 : 0.6);

export interface Bait {
  id: string;
  name: string;
  /** 냄새가 닿는 거리(px) */
  range: number;
  /** 남아 있는 초 */
  seconds: number;
  price: number;
  minRank: number;
}
// 큰 고기는 '보통의 2배 이상 냄새' (원작 글) → 범위 2배
export const BAITS: Bait[] = [
  { id: 'bait1', name: '일반 고기', range: 200, seconds: 12, price: 150, minRank: 1 },
  { id: 'bait2', name: '큰 고기', range: 400, seconds: 12, price: 400, minRank: 3 },
];
export const baitOf = (id: string) => BAITS.find((b) => b.id === id);
export const BAIT_PACK = 5;
/** 장비 수량 */
export const gearCount = (save: { gear?: Record<string, number> }, id: string) => save.gear?.[id] ?? 0;
/** 장비 하나 쓰기. 없으면 null */
export function useGear<T extends { gear?: Record<string, number> }>(save: T, id: string): T | null {
  const n = gearCount(save, id);
  return n > 0 ? { ...save, gear: { ...save.gear, [id]: n - 1 } } : null;
}
