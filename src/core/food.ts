import { feed, feedRotten, type ActionResult } from './care';
import { getSpecies } from './data';
import type { SaveData } from './types';

export type FoodKind = 'meat' | 'rotten' | 'pill';
/** 바닥 먹이 종류 → 저장의 재고 칸 */
const STOCK: Record<FoodKind, 'meat' | 'rotten' | 'pills'> = { meat: 'meat', rotten: 'rotten', pill: 'pills' };
export interface FloorFood { kind: FoodKind; x: number; y: number; remaining?: number; /** 바닥에 놓인 게임 분 */ age?: number }
/** 바닥에 둔 고기·프로틴이 상하기까지의 게임 분 (원작 도움말 help #138·#141: 남기면 상한다. 4시간은 임시) */
export const SPOIL_MINUTES = 240;
export interface FoodBounds { x0: number; x1: number; y0: number; y1: number }

/** 바닥 먹이는 기존 저장 방식대로 재고 안에서 예약한다. 먹을 때만 재고를 차감한다. */
export function availableFood(save: SaveData, foods: readonly FloorFood[], kind: FoodKind): number {
  return Math.max(0, save[STOCK[kind]] - foods.filter((f) => f.kind === kind).length);
}

/** 이전 버전에서 중복 사용한 예약·잘못된 좌표만 정리하며 남은 먹이는 순서대로 보존한다. */
export function restoreFloorFood(save: SaveData, raw: unknown, bounds: FoodBounds = { x0: 60, x1: 900, y0: 120, y1: 520 }): FloorFood[] {
  const foods: FloorFood[] = [];
  if (!Array.isArray(raw)) return foods;
  for (const f of raw) {
    if (!f || !Object.hasOwn(STOCK, f.kind) || !Number.isFinite(f.x) || !Number.isFinite(f.y)) continue;
    if (f.remaining !== undefined && (!Number.isFinite(f.remaining) || f.remaining <= 0)) continue;
    if (availableFood(save, foods, f.kind) > 0) foods.push({ ...(f.remaining === undefined ? {} : {remaining: Math.min(100, f.remaining)}), ...(Number.isFinite(f.age) && f.age > 0 ? {age: f.age} : {}), kind: f.kind, x: Math.min(bounds.x1, Math.max(bounds.x0, f.x)), y: Math.min(bounds.y1, Math.max(bounds.y0, f.y)) });
  }
  return foods;
}

/** 직접 급여도 바닥에 예약한 수량을 제외한다. 버튼과 끌어 주기가 같은 규칙을 쓴다. */
export function feedFromTray(save: SaveData, foods: readonly FloorFood[], uid: number, kind: FoodKind): ActionResult {
  if (availableFood(save, foods, kind) <= 0) return { ok: false, save, message: '사용 가능한 먹이가 없어요. 바닥에 놓인 먹이는 따로 예약되어 있어요.' };
  return kind === 'meat' ? feed(save, uid) : feedRotten(save, uid);
}

/** 실패한 급여는 바닥 먹이와 재고를 그대로 둔다. 성공할 때만 한 개를 함께 소비한다. */
export function eatFloorFood(save: SaveData, foods: readonly FloorFood[], uid: number, index: number) {
  const food = foods[index];
  const result: ActionResult = food
    ? (food.kind === 'meat' ? feed(save, uid) : feedRotten(save, uid))
    : { ok: false, save, message: '먹이가 없어요.' };
  return { ...result, foods: result.ok ? foods.filter((_, i) => i !== index) : foods };
}

/** 한 입 단위 섭취. 유년기 5/10은 사용자 요청, 이후 세대 잔량 10/20/25/50은 임시 균형값.
 * 기존 저장의 remaining 누락은 100으로 취급한다. 재고는 완전히 먹은 시점에 한 번 차감한다.
 */
export function biteFloorFood(save: SaveData, foods: readonly FloorFood[], uid: number, index: number) {
  const food = foods[index], d = save.digimon.find(d => d.uid === uid);
  if (!food || !d || d.isEgg || save[STOCK[food.kind]] <= 0 || (food.kind !== 'pill' && d.hunger >= 100))
    return {ok: false, save, foods, message: '지금은 먹을 수 없어요.'};
  // 알약(프로틴)은 원작 그림처럼 네 입(i000_item 6~9)에 다 먹고, 배는 차지 않지만 힘이 오른다.
  if (food.kind === 'pill') {
    const rest = (food.remaining ?? 100) - 25;
    if (rest > 0) return {ok: true, save, foods: foods.map((f, i) => i === index ? {...f, remaining: rest} : f), message: '알약을 깨물었다.'};
    const next = {...save, pills: save.pills - 1, digimon: save.digimon.map(p => p.uid === uid ? {...p, protein: (p.protein ?? 0) + 1} : p)};
    return {ok: true, save: next, foods: foods.filter((_, i) => i !== index), message: '알약을 다 먹고 힘이 솟는다!', boosted: true};
  }
  if (food.kind === 'rotten') return eatFloorFood(save, foods, uid, index);
  const amount = [0, 5, 5, 10, 20, 25, 50][getSpecies(d.speciesId).stage];
  const remaining = food.remaining ?? 100;
  // 마지막 조각과 포만감 상한에도 실제 먹은 양에 비례한다.
  const bite = Math.min(amount, remaining, (100 - d.hunger) / 2);
  const rest = remaining - bite;
  const next = {...save, meat: save.meat - (rest <= 0 ? 1 : 0),
    digimon: save.digimon.map(p => p.uid === uid ? {...p, hunger: p.hunger + bite * 2, starvingMinutes: 0} : p)};
  return {ok: true, save: next,
    foods: rest <= 0 ? foods.filter((_, i) => i !== index) : foods.map((f, i) => i === index ? {...f, remaining: rest} : f),
    message: '고기를 한 입 먹었다.'};
}

/** 바닥 먹이의 시간을 흘려보낸다. 오래 둔 고기·프로틴은 상한 먹이가 된다 (재고도 상한 먹이로 옮긴다). */
export function ageFloorFood(save: SaveData, foods: readonly FloorFood[], minutes = 1): { save: SaveData; foods: FloorFood[]; spoiled: number } {
  let next = save, spoiled = 0;
  const out = foods.map((f) => {
    if (f.kind === 'rotten') return f;
    const age = (f.age ?? 0) + minutes;
    if (age < SPOIL_MINUTES || next[STOCK[f.kind]] <= 0) return { ...f, age };
    spoiled += 1;
    next = { ...next, [STOCK[f.kind]]: next[STOCK[f.kind]] - 1, rotten: next.rotten + 1 };
    return { kind: 'rotten' as const, x: f.x, y: f.y };
  });
  return { save: next, foods: out, spoiled };
}
