// 사냥 규칙. 화면(web/game.js)은 이 함수들의 결과만 보고 그린다.
//
// 플레이 영상으로 확인한 것
// - 로프로 디지몬을 둘러싸 당기면 HP가 깎이고, HP를 다 깎아야 포획된다. 강한 개체는 여러 번 둘러야 한다.
// - 초반 로프로는 유년기만 잡힌다. 랭크가 오르며 성장기·성숙기·완전체 로프가 열린다 (완전체까지는 형규 원작 확인).
// - 와이어를 깔아 길을 막을 수 있고, 맞은 디지몬은 맵 밖·동굴로 도망간다.
// - 용량이 가득 차면 잡을 수 없다 ('용량이 가득 찼습니다').
// 출현표: 나무위키 진화 목록의 출현 장소(src/data/habitats.txt). 성숙기·완전체는 그 단계 로프가 있어야 잡힌다.
// 임시 값: 세대별 HP(유년기I 1, 유년기II 2, 성장기 3), 성장기 25%·성숙기 이상 10% 출현, 밤 18시~, 드묾 1/5, 와이어 가격·개수.
import { dateOf, FIELDS, getSpecies, originalSpecies, SEASON_CODE, typicalStats, type Field } from './data';
import { rankName, tamerRank, TITLES } from './titles';
import shopRaw from '../data/shop.txt?raw';
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
/** 사냥 지도 전체(1024×1024)를 탐험할 때 동시에 있는 야생 디지몬 수. 화면 하나(960×560)에 5마리였던 밀도를 지도 넓이에 맞춘 임시 값 */
export const HUNT_WILD_COUNT = 10;

export interface HuntField extends Field {
  open: boolean;
  reason?: string;
}

export function huntFields(save: SaveData): HuntField[] {
  const rank = tamerRank(save);
  return FIELDS.map((f) => {
    if (rank < f.minRank) return { ...f, open: false, reason: `${rankName(f.minRank)}부터 열림` };
    if (f.needTitle && !save.titles.includes(f.needTitle)) return { ...f, open: false, reason: `타이틀 '${TITLES.find((t) => t.id === f.needTitle)?.name}' 획득 시 열림` };
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
 * 가격·열리는 조건은 원본 상점 표, 게이지·체력 감소는 원본 로프 표(아래). 끊기는 거리 식만 임시.
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

/** 야생 디지몬의 체력 칸 수 (임시: 세대 1~5). 로프는 이 체력을 시간에 따라 깎고, 0이면 기절한다 */
export function wildHp(speciesId: string): number {
  return Math.max(1, Math.min(5, getSpecies(speciesId).stage));
}

/**
 * 기절한 야생 디지몬의 회복.
 *  - 회복량: overlay9_0 0x149C. 프레임마다 1/5 확률로 HP +1(평균 초당 12), 최대치의 8/10에 닿으면 회복 상태를 끝낸다.
 *    원본 야생 체력은 그 개체의 HP 능력치(+0x110 구조체 +0x50/+0x58)라, 칸 비율은 종 표준 초기 HP로 환산한다.
 *  - 언제 회복하는가: 로프로 기절시킨 뒤 테이머가 5초 동안 아무것도 하지 않으면 회복을 시작한다(형규 지정).
 *  - 회복 중 움직임(형규 지정, 원작 플레이 관찰): 10%에서 일어나 졸릴 때처럼 천천히 달아나고, 40%부터 걷고,
 *    80%(원본 회복 종료)가 되면 처음 로프에 묶였을 때처럼 뛰어 달아난다. 10% 전까지는 쓰러져 있어 누르면 포획된다.
 */
export const WILD_REGEN_PER_SECOND = 12;
export const FAINT_RECOVER_DELAY = 5;
export const WILD_WAKE_RATIO = 0.1;
export const WILD_WALK_RATIO = 0.4;
export const WILD_RUN_RATIO = 0.8;
export function wildRegen(speciesId: string, hp: number, max: number, dt: number): number {
  const cap = max * WILD_RUN_RATIO;
  if (hp >= cap) return hp;
  return Math.min(cap, hp + (max * WILD_REGEN_PER_SECOND * dt) / typicalStats(speciesId).hp);
}
/** 기절한 뒤 그 비율(0.1 일어남 · 0.4 걷기 · 0.8 뛰기)에 닿기까지 걸리는 초 (5초 대기 포함) */
export const faintWakeSeconds = (speciesId: string, ratio = WILD_RUN_RATIO) => FAINT_RECOVER_DELAY + (typicalStats(speciesId).hp * ratio) / WILD_REGEN_PER_SECOND;

/**
 * 원본 로프 표 arm9.bin 0xC8DCC (40바이트 × 12, 디지α~알테마γ). overlay9_0에서 읽는 곳을 확인했다.
 *  - +4 u8: 로프 게이지 초 (α 6 · β 12 · γ 17, ×60프레임). 0xA798에서 게이지 최대치로 쓴다.
 *  - +16 u16×12: 체력 감소 표. 세대 묶음(유년기 / 성장기 / 성숙기 / 완전체)마다 크기 등급 1·2·3 값 3개.
 *    0xA4E4: 묶인 디지몬의 체력이 최대치에서 0까지 깎이는 프레임 = 값 × (유년기I 3, 그 밖 6). 값 0 = 못 감는다.
 *  - 궁극체는 크기 등급이 0이라 어떤 로프로도 못 잡는다.
 */
const ROPE_HOLD_SECONDS = [6, 12, 17];
const ROPE_DRAIN: Record<string, number[][]> = {
  digi: [[80, 130, 250]],
  hard: [[50, 100, 150], [80, 130, 250]],
  clone: [[50, 50, 50], [50, 100, 150], [80, 130, 250]],
  ultima: [[50, 50, 50], [50, 50, 50], [50, 100, 150], [80, 130, 250]],
};
/**
 * 0x9C28 매 프레임 판정. 거리는 묶인 디지몬과 테이머가 쥔 로프 끝(터치 지점) 사이.
 *  - 40px 미만: 게이지 프레임당 +10 (최대치까지)
 *  - 40~80px: 게이지 −1 (힘 등급 2면 −2), 체력 감소
 *  - 80px 이상: 게이지 −1 (힘 2면 −3), 체력 2배 감소, 디지몬이 로프 끝 쪽으로 프레임당 3.5px 끌려온다
 *  - 원본은 160px 넘으면 즉시 끊긴다. 이 저장소는 형규 지시로 끊기는 거리를 내구력으로 정한다(임시 식).
 */
export const ROPE_SAFE_DISTANCE = 40;
export const ROPE_PULL_DISTANCE = 80;
export const ROPE_DRAG_SPEED = 3.5 * 60;
/** 끊기는 거리 = 100 + 내구력 (임시, 원본 고정값 160 대신 내구력 10~250을 거리로 쓴다) */
export const ropeSnapDistance = (save: Pick<SaveData, 'rope'>) => 100 + ropeOf(save.rope).durability;
export const ropeHoldSeconds = (save: Pick<SaveData, 'rope'>) => ROPE_HOLD_SECONDS[(Number(ropeOf(save.rope).id.slice(-1)) || 1) - 1];

/** 이 로프로 체력을 다 깎는 데 걸리는 초 (중간 거리 기준). 0이면 감을 수 없다 */
export function ropeDrainSeconds(save: Pick<SaveData, 'rope'>, speciesId: string): number {
  const sp = getSpecies(speciesId);
  const size = originalSpecies(speciesId)?.ropeSize ?? Math.min(3, Math.max(1, Math.ceil(sp.size / 8)));
  if (!size || sp.stage < 1 || sp.stage > 5) return 0;
  const family = ropeOf(save.rope).id.replace(/\d$/, '');
  const group = Math.max(0, sp.stage - 2);
  const value = ROPE_DRAIN[family]?.[group]?.[size - 1] ?? 0;
  return value ? (value * (sp.stage === 1 ? 3 : 6)) / 60 : 0;
}

/** 감을 수 있으면 1, 없으면 0 (예전 이름 유지) */
export function ropeDamage(save: Pick<SaveData, 'rope'>, speciesId: string): number {
  return ropeDrainSeconds(save, speciesId) > 0 ? 1 : 0;
}

export type RopeZone = 'safe' | 'tense' | 'pull' | 'snap';
/**
 * 로프 한 틱. gauge는 남은 게이지(초), hp는 체력(0이면 기절).
 * 원본 프레임 단위를 초 단위로 바꿨다(프레임당 1 = 초당 1초).
 */
export function ropeTick(save: Pick<SaveData, 'rope'>, speciesId: string, state: { gauge: number; hp: number; max: number }, distance: number, dt: number) {
  const hold = ropeHoldSeconds(save);
  const strong = (originalSpecies(speciesId)?.ropePower ?? 1) === 2;
  const drain = ropeDrainSeconds(save, speciesId);
  let { gauge, hp } = state;
  let zone: RopeZone;
  if (distance > ropeSnapDistance(save)) { zone = 'snap'; gauge = 0; }
  else if (distance < ROPE_SAFE_DISTANCE) { zone = 'safe'; gauge = Math.min(hold, gauge + 10 * dt); }
  else {
    const pull = distance >= ROPE_PULL_DISTANCE;
    zone = pull ? 'pull' : 'tense';
    gauge -= (1 + (strong ? (pull ? 2 : 1) : 0)) * dt;
    if (drain) hp = Math.max(0, hp - (state.max * dt * (pull ? 2 : 1)) / drain);
  }
  return { gauge: Math.max(0, gauge), hp, zone };
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
// 임시 값: 묶음 수, 산탄 범위, 고기가 남는 시간. 발사 간격·멈추는 시간·고기 냄새 거리는 원본.
//   샷은 맞은 디지몬에게 메시지 0x2E(위력, 효과, 샷 내성)를 보내 멈추게만 한다(0x2125ED8 → 0x2111CBC).
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
/**
 * 샷에 맞아 멈추는 초 (원본 overlay9_0 0x2111CBC): 샷 내성 등급(종 표 +118, 0은 1) × (위력 1이면 1초, 2면 2초).
 * 멈춰 있는 동안 또 맞으면 더해지고 15초(900프레임)를 넘지 않는다. 샷은 HP를 깎지 않는다(대미지 처리 없음).
 */
export const shotStun = (s: Shot, speciesId?: string) => (speciesId ? itemResist(speciesId, 'shot') : 1) * (s.power / 10);
export const SHOT_STOP_MAX = 15;
/** 효과 없는 샷으로 멈춘 뒤에는 ±128px 안의 아무 곳으로 달아난다 (0x2111D48) */
export const SHOT_SCATTER = 128;
/** 다음 발까지의 초 (원본 overlay9_0 0x2125D08: 보통 30프레임, 연사 5프레임, 산탄 60프레임) */
export const shotCooldown = (s: Shot) => (s.rapid ? 5 / 60 : s.spread ? 1 : 0.5);

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
// 냄새 거리는 원본 고기 표 +4 (일반 128, 큰 고기 256). 남아 있는 초는 임시
export const BAITS: Bait[] = [
  { id: 'bait1', name: '일반 고기', range: 128, seconds: 12, price: 150, minRank: 1 },
  { id: 'bait2', name: '큰 고기', range: 256, seconds: 12, price: 400, minRank: 3 },
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

// ---------- 사냥 장비: 와이어·특수 고기·미끼·라이트·폭탄·마인·함정 ----------
// 이름·길이·위력·효과·'밤에만'은 원작 글(txt_list 362~383번, 설명 408~429번).
// 임시 값: 묶음 수, 수면 지속 시간, 함정 범위, 마인이 터지는 거리, 남는 시간. 와이어 최대 길이(64·128px)·폭발 반경(96·256px)은 원본.
//   대미지·확률·끌리는 거리는 아래 '사냥 아이템의 원본 효과'(원본 표)를 쓴다. power·range 일부는 원작 글 값으로 표시용이다.
export type GearKind = 'wire' | 'bait' | 'toy' | 'light' | 'bomb' | 'mine' | 'trap';
export type GearEffect = '수면' | '마비' | '독' | '눈가리기';
export interface Gear {
  id: string;
  name: string;
  kind: GearKind;
  power?: number;
  effect?: GearEffect;
  /** 와이어 길이 (원작 수치) */
  length?: number;
  /** 달라붙는 와이어 */
  sticky?: boolean;
  /** 영향 범위(px) */
  range?: number;
  /** 놓여 있는 초 */
  seconds?: number;
  nightOnly?: boolean;
  /** 움직이는 장난감의 속도(px/초) */
  speed?: number;
  /** 함정이 붙잡는 마릿수 */
  holds?: number;
  price: number;
  minRank: number;
  pack: number;
}
export const GEARS: Gear[] = [
  { id: 'wire2', name: '노멀 와이어β', kind: 'wire', length: 48, price: 300, minRank: 2, pack: 5 },
  { id: 'magnet1', name: '마그넷 와이어α', kind: 'wire', length: 24, sticky: true, price: 400, minRank: 2, pack: 5 },
  { id: 'magnet2', name: '마그넷 와이어β', kind: 'wire', length: 48, sticky: true, price: 800, minRank: 4, pack: 5 },
  { id: 'spark1', name: '스파크 와이어α', kind: 'wire', length: 24, power: 10, price: 500, minRank: 3, pack: 5 },
  { id: 'spark2', name: '스파크 와이어β', kind: 'wire', length: 48, power: 20, price: 1000, minRank: 5, pack: 5 },
  { id: 'bait3', name: '독 고기', kind: 'bait', effect: '독', range: 128, seconds: 12, price: 400, minRank: 3, pack: 5 },
  { id: 'bait4', name: '마비 고기', kind: 'bait', effect: '마비', range: 128, seconds: 12, price: 400, minRank: 3, pack: 5 },
  { id: 'toy1', name: '미끼', kind: 'toy', range: 96, seconds: 15, speed: 30, price: 300, minRank: 2, pack: 3 },
  { id: 'toy2', name: '미끼EV', kind: 'toy', range: 96, seconds: 20, speed: 40, price: 700, minRank: 4, pack: 3 },
  { id: 'light1', name: '옐로우 라이트', kind: 'light', range: 128, seconds: 15, nightOnly: true, price: 400, minRank: 2, pack: 3 },
  { id: 'light2', name: '블루 라이트', kind: 'light', range: 128, seconds: 15, nightOnly: true, price: 800, minRank: 4, pack: 3 },
  { id: 'bomb1', name: '일반 폭탄', kind: 'bomb', power: 40, range: 96, price: 400, minRank: 3, pack: 3 },
  { id: 'bomb2', name: '슬립 폭탄', kind: 'bomb', power: 40, effect: '수면', range: 96, price: 600, minRank: 4, pack: 3 },
  { id: 'bomb3', name: '스턴 폭탄', kind: 'bomb', power: 40, effect: '마비', range: 96, price: 600, minRank: 4, pack: 3 },
  { id: 'bomb4', name: '플래시 폭탄', kind: 'bomb', power: 40, effect: '눈가리기', range: 256, price: 600, minRank: 5, pack: 3 },
  { id: 'mine1', name: '일반 마인', kind: 'mine', power: 50, range: 96, price: 500, minRank: 4, pack: 3 },
  { id: 'mine2', name: '휴즈 마인', kind: 'mine', power: 70, range: 96, price: 900, minRank: 6, pack: 3 },
  { id: 'trap1', name: '디지 캐치', kind: 'trap', range: 30, seconds: 15, holds: 1, price: 600, minRank: 3, pack: 2 },
  { id: 'trap2', name: '디지 프리즌', kind: 'trap', range: 60, seconds: 15, holds: 4, price: 1500, minRank: 6, pack: 2 },
];
export const gearOf = (id: string) => GEARS.find((g) => g.id === id);
/** 원작 글의 길이 1이 사냥 지도에서 차지하는 px: 원본 와이어 표 +4의 최대 길이가 α 64px·β 128px(0x21270E4)라 24 → 64 */
export const WIRE_UNIT = 64 / 24;

// ---------- 사냥 아이템의 원본 효과 ----------
/**
 * 원본 아이템별 효과 표(arm9.bin, 0x2066084가 분류·번호로 고르는 표)와 overlay9_0의 판정 코드에서 확인한 값.
 *   샷 0x20C90CC(16B: 종류 0 보통·1 연사·2 산탄, 위력 1·2, 효과 0 없음·1 수면·2 마비)
 *   와이어 0x20C9498(24B: 길이 64·128, 종류 0 보통·1 마그넷·2 스파크, +7~9 달라붙는 초, +10~12 전격 %)
 *   고기 0x20C931C(24B: 냄새 거리 128·256, 효과 0·1 독·2 마비, +7~9 독 확률, +10~12 먹을 확률)
 *   미끼 0x20C929C(20B: +4~6 끌릴 확률) · 라이트 0x20C93A8(16B: +4~6 끌릴 확률)
 *   폭탄 0x20C9228(20B: +4~6 대미지 %, +7 효과 0~3, +8~10 눈가리기 확률) · 마인 0x20C93F0(20B: +7~9 대미지 %)
 * 세 칸짜리 값은 야생 디지몬의 아이템 내성 등급(종 표 +118~+129, 1~3)으로 고른다: 등급 1 → 첫 칸.
 * %는 그 디지몬 HP 최대치에 대한 비율이고(0x210F968, 0 미만은 0 = 기절할 수 있다), 확률은 rand(100) < 값.
 */
export type ItemResistKind = 'shot' | 'bomb' | 'meat' | 'light' | 'lure' | 'mine' | 'sleep' | 'poison' | 'paralysis' | 'flash' | 'magnet';
/** 0x2112618의 번호 n → 종 표 +117+n */
const ITEM_RESIST_INDEX: Record<ItemResistKind, number> = { shot: 1, bomb: 2, meat: 4, light: 5, lure: 6, mine: 7, sleep: 8, poison: 9, paralysis: 10, flash: 11, magnet: 12 };
/** 야생 디지몬의 아이템 내성 등급 1~3 (원본 0은 1과 같게 쓰인다: 표 칸 = 등급−1, 음수는 0) */
export function itemResist(speciesId: string, kind: ItemResistKind): 1 | 2 | 3 {
  const v = originalSpecies(speciesId)?.itemResist?.[ITEM_RESIST_INDEX[kind] - 1] ?? 1;
  return Math.min(3, Math.max(1, v)) as 1 | 2 | 3;
}
const byLevel = (values: readonly number[], level: number) => values[Math.max(0, level - 1)] ?? 0;
/** 원본 표의 등급별 값 */
export const ITEM_EFFECT = {
  /** 폭탄 4종 대미지 % (0x2115F44) */
  bombDamage: [40, 20, 10],
  /** 마인 대미지 % (0x2115FBC) */
  mineDamage: { mine1: [50, 30, 10], mine2: [70, 40, 10] } as Record<string, number[]>,
  /** 스파크 와이어 대미지 % (0x2112120, α·β 같음). 등급 3은 전격을 받지 않는다(0x2111988) */
  sparkDamage: [20, 10, 0],
  /** 플래시 폭탄 눈가리기 확률 % (0x2112310) */
  flashChance: [70, 0, 0],
  /** 미끼에 끌릴 확률 % (0x21123B0), 96px 안에서 */
  lureChance: { toy1: [60, 10, 0], toy2: [100, 40, 0] } as Record<string, number[]>,
  /** 라이트에 끌릴 확률 % (0x211252C), 128px 안에서. 옐로우는 등급 1, 블루는 등급 2만 끌린다 */
  lightChance: { light1: [60, 0, 0], light2: [0, 60, 0] } as Record<string, number[]>,
  /** 배고픈(포만감 절반 이하) 디지몬이 1초마다 고기를 먹으러 갈 확률 % (0x21129E8, 고기 4종 같음) */
  meatChance: [90, 50, 0],
  /** 독 고기를 먹고 독에 걸릴 확률 % (0x2113C38) */
  poisonChance: [100, 50, 0],
} as const;
/** 샷·폭탄의 수면·마비: 등급 1 반드시, 2는 반반(rand%2), 3은 듣지 않는다 (0x2111DBC 수면, 0x2111E80 마비, 0x21121F0 폭탄) */
export const STATUS_CHANCE = [100, 50, 0];
export const LURE_REACH = 96;
export const LIGHT_REACH = 128;
/** 고기 냄새 거리 px (원본 고기 표 +4: 일반 128, 큰 고기 256) */
export const MEAT_REACH = { normal: 128, big: 256 };
/** 플래시 폭탄 눈가리기 초: 10 + rand(20) (0x2112378) */
export const flashSeconds = (rng: () => number = Math.random) => 10 + Math.floor(rng() * 20);
/** 독: 먹고 4초 뒤(240프레임) 독이 돌기 시작해 10 + rand(50)초 동안 3초마다 HP 최대치의 3% (0x211097C, 0x2110A48) */
export const POISON_DELAY = 4;
export const POISON_TICK = 3;
export const POISON_TICK_PERCENT = 3;
export const poisonSeconds = (rng: () => number = Math.random) => 10 + Math.floor(rng() * 50);
/** 마비 고기: 등급 3이 아니면 먹고 2초 뒤(120프레임) 마비 (0x2113C90) */
export const PARALYSIS_MEAT_DELAY = 2;

/** rand(100) < 값 */
const rollPercent = (pct: number, rng: () => number) => pct >= 100 || (pct > 0 && Math.floor(rng() * 100) < pct);

/** 폭탄·마인·스파크 와이어 대미지 (HP 최대치 기준). 0이면 대미지 없음 */
export function itemDamage(speciesId: string, itemId: string, max: number): number {
  const g = gearOf(itemId);
  let pct = 0;
  // 플래시 폭탄은 빛(메시지 0x37)만 내고 폭발 대미지(0x35)는 없다 (폭탄 관리 0x2124B6C)
  if (g?.kind === 'bomb') pct = g.effect === '눈가리기' ? 0 : byLevel(ITEM_EFFECT.bombDamage, itemResist(speciesId, 'bomb'));
  else if (g?.kind === 'mine') pct = byLevel(ITEM_EFFECT.mineDamage[itemId] ?? [], itemResist(speciesId, 'mine'));
  else if (g?.kind === 'wire' && g.power) pct = itemResist(speciesId, 'paralysis') === 3 ? 0 : byLevel(ITEM_EFFECT.sparkDamage, itemResist(speciesId, 'paralysis'));
  return (max * pct) / 100;
}

/** 수면·마비·눈가리기가 걸리는가 (샷·폭탄). 독은 독 고기를 먹을 때 따로 판정한다 */
export function effectLands(speciesId: string, effect: GearEffect, rng: () => number = Math.random): boolean {
  if (effect === '눈가리기') return rollPercent(byLevel(ITEM_EFFECT.flashChance, itemResist(speciesId, 'flash')), rng);
  if (effect === '독') return rollPercent(byLevel(ITEM_EFFECT.poisonChance, itemResist(speciesId, 'poison')), rng);
  const level = itemResist(speciesId, effect === '수면' ? 'sleep' : 'paralysis');
  return level === 3 ? false : level === 2 ? rng() < 0.5 : true;
}

/**
 * 마그넷 와이어에 달라붙는가 (0x2111910: 등급 1·2는 상태 13, 3은 튕김).
 * 상태 13은 그 와이어가 없어질 때까지 이어진다(0x2115804). 표 +7(27)은 몸부림 간격 프레임÷60으로, 등급 2는 0이라 매 프레임 몸부림친다.
 */
export const magnetSticks = (speciesId: string) => itemResist(speciesId, 'magnet') < 3;

/** 미끼·라이트·고기에 끌리는가. 고기는 포만감이 절반 이하일 때만 (1초마다 다시 판정) */
export function attracted(speciesId: string, itemId: string, rng: () => number = Math.random, hungry = true): boolean {
  const g = gearOf(itemId);
  if (g?.kind === 'toy') return rollPercent(byLevel(ITEM_EFFECT.lureChance[itemId] ?? [], itemResist(speciesId, 'lure')), rng);
  if (g?.kind === 'light') return rollPercent(byLevel(ITEM_EFFECT.lightChance[itemId] ?? [], itemResist(speciesId, 'light')), rng);
  return hungry && rollPercent(byLevel(ITEM_EFFECT.meatChance, itemResist(speciesId, 'meat')), rng);
}

/**
 * 야생 디지몬의 졸음 (원본 overlay9_0).
 *  - 졸음 최대치(+0x51C) = 종 표 +38(u16, 육성의 각성 범위 둘째 값) ÷ 10초 (0x210EFD8: ÷10 × 60프레임)
 *  - 깨어 있는 동안(상태 1·2) 1초에 1씩 오른다(0x2113140·0x2113548). 최대치의 80% 이상이면 졸려서 천천히 걷고(0x2112A94),
 *    최대치에 닿으면 잠든다(상태 4, 0x2112AE8).
 *  - 잠은 10 + rand(20)초(0x2113AF0) 뒤 졸음 0으로 깬다(0x2113AD4). 자는 동안 샷·폭탄·와이어 등을 맞으면
 *    졸음을 최대치의 70%로 낮추고 깬다(0x21138C0 등).
 *  - 수면 샷·수면 폭탄은 졸음을 최대치의 80%로 맞춘다(0x2111DE4) — 바로 잠들지 않고 졸린 상태가 되어, 남은 20%가 차면 잔다.
 *  처음 졸음 값은 원본 생성 함수(디지몬 칸 +0x0C = 0, arm9 0x02061A8x)를 따라 0으로 둔다.
 */
export const wildSleepMax = (speciesId: string) => Math.floor((originalSpecies(speciesId)?.awake?.[1] ?? 600) / 10);
export const SLEEP_DROWSY_RATIO = 0.8;
export const SLEEP_HIT_RATIO = 0.7;
export const wildSleepSeconds = (rng: () => number = Math.random) => 10 + Math.floor(rng() * 20);
/** 마비(상태 17) 초: 20 + rand(10) (원본 0x21163B0 진입, 0x21161FC에서 매 프레임 줄여 0이면 풀림) */
export const paralysisSeconds = (rng: () => number = Math.random) => 20 + Math.floor(rng() * 10);
/** 스파크 와이어 감전(상태 14) 0.5초 뒤 마비로 넘어간다 (0x2115A68 30프레임, 0x2115864) */
export const SPARK_SHOCK = 0.5;
/** 폭탄: 놓고 약 4.2초 뒤 터진다 (원본 폭탄 관리 0x2124A90: 240프레임 + 6 + 6) */
export const BOMB_FUSE = 253 / 60;
/** 폭발이 닿는 거리 px: 폭탄·마인 96, 플래시 폭탄 256 (메시지 0x35·0x3A 반경 0x60, 0x37 반경 0x100 — 0x2112840) */
export const BLAST_RADIUS = 96;
export const FLASH_RADIUS = 256;
/** 사냥터에 동시에 놓을 수 있는 와이어 수 (원본 와이어 관리 칸 2개, 0x2126C1C) */
export const HUNT_WIRE_MAX = 2;
/** 마그넷·스파크 와이어에 한 번 걸린 뒤 다시 걸리기까지의 초 (임시) */
export const WIRE_COOLDOWN = 3;

// ---------- 원본 가격·해금 조건 ----------
// 원본 실행 코드의 아이템 표 값으로 위 목록의 가격을 덮어쓴다 (src/data/shop.txt, tools/extract_shop.py).
// 가격은 한 개 값이다. 묶음으로 파는 것은 한 개 값 × 묶음 수(묶음 수는 이 게임의 편의).
// 해금: 0 처음부터, 1 테이머 랭크(값 1~8 → 이 게임의 랭크 2~9), 2 타이틀(그 번호의 타이틀을 따면 열린다).
export interface OriginalItem { price: number; kind: number; value: number; start: number; max: number }
export const ORIGINAL_ITEMS: Record<string, OriginalItem> = {};
for (const line of shopRaw.split(/\r?\n/)) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [name, price, kind, value, start, max] = line.split('|');
  ORIGINAL_ITEMS[name] = { price: Number(price), kind: Number(kind), value: Number(value), start: Number(start), max: Number(max) };
}
const priceOf = (name: string, fallback: number, pack = 1) => (ORIGINAL_ITEMS[name] ? ORIGINAL_ITEMS[name].price * pack : fallback);
for (const r of ROPES) r.price = priceOf(r.name, r.price);
for (const x of SHOTS) x.price = priceOf(x.name, x.price, SHOT_PACK);
for (const x of BAITS) x.price = priceOf(x.name, x.price, BAIT_PACK);
for (const x of GEARS) x.price = priceOf(x.name, x.price, x.pack);
for (const c of MEMORY_CARDS) c.price = priceOf(c.name, c.price);
WIRE_PACK.price = priceOf('노멀 와이어α', WIRE_PACK.price, WIRE_PACK.count);
/** 이 물품이 상점에 열렸는가 (원본 해금 조건). 표에 없는 물품은 열려 있다 */
export function itemUnlocked(save: Pick<SaveData, 'titles' | 'champion'>, name: string): boolean {
  const o = ORIGINAL_ITEMS[name];
  if (!o || o.kind === 0) return true;
  if (o.kind === 1) return tamerRank(save) >= o.value + 1;
  return save.titles.includes(`m${o.value}`);
}
/** 해금 조건 설명 (상점 안내용) */
export function unlockText(name: string): string {
  const o = ORIGINAL_ITEMS[name];
  if (!o || o.kind === 0) return '';
  if (o.kind === 1) return `${rankName(o.value + 1)}부터`;
  return `타이틀 '${TITLES.find((t) => t.id === `m${o.value}`)?.name ?? o.value}' 획득 시`;
}

// ---------- 사냥 아이템 장비 칸 (원본 5칸 고정) ----------
/**
 * 원작은 사냥 전에 쓸 아이템 종류를 장비한다. 칸은 랭크와 상관없이 5칸이다:
 * 테이머 +0xA00부터 8바이트 × 5(분류·번호). 장비 화면 overlay9_12 0x2113584~0x21135C4, 사냥 화면 HUD overlay9_0 0x2119F30~0x211A0CC가
 * 5칸을 돈다. 분류 2 샷 · 3 와이어 · 4 고기 · 5 미끼 · 6 라이트 · 7 폭탄 · 8 마인 · 9 함정(아이템 표 분류와 같음).
 * 로프와 웹판 기본 와이어 묶음은 칸과 별개(웹판).
 */
export const HUNT_ITEM_SLOTS = 5;
export const HUNT_ITEM_IDS: readonly string[] = [...SHOTS.map((s) => s.id), ...BAITS.map((b) => b.id), ...GEARS.map((g) => g.id)];
type ItemSave = { gear?: Record<string, number>; huntItems?: string[] };
/**
 * 장비한 사냥 아이템. 한 번도 고른 적이 없는 저장(huntItems 없음)은 가진 아이템 앞에서부터 5종을 자동으로 넣는다(웹판, 기존 저장 호환).
 * 다 써서 0개가 된 종류도 칸에는 남는다(원본 HUD는 0개 칸을 빈 칸으로 그린다 — 0x2119F58).
 */
export function huntItems(save: ItemSave): string[] {
  const list = save.huntItems ?? HUNT_ITEM_IDS.filter((id) => gearCount(save, id) > 0);
  return [...new Set(list)].filter((id) => HUNT_ITEM_IDS.includes(id)).slice(0, HUNT_ITEM_SLOTS);
}
/** 아이템을 칸에 넣거나 뺀다. 가지지 않았거나 칸이 다 찼으면 그대로 */
export function toggleHuntItem<T extends ItemSave>(save: T, id: string): T {
  const now = huntItems(save);
  if (now.includes(id)) return { ...save, huntItems: now.filter((x) => x !== id) };
  if (now.length >= HUNT_ITEM_SLOTS || gearCount(save, id) <= 0) return { ...save, huntItems: now };
  return { ...save, huntItems: [...now, id] };
}
