import { feed, feedRotten, type ActionResult } from './care';
import type { SaveData } from './types';

export type FoodKind = 'meat' | 'rotten';
export interface FloorFood { kind: FoodKind; x: number; y: number }

/** 바닥 먹이는 기존 저장 방식대로 재고 안에서 예약한다. 먹을 때만 재고를 차감한다. */
export function availableFood(save: SaveData, foods: readonly FloorFood[], kind: FoodKind): number {
  return Math.max(0, save[kind] - foods.filter((f) => f.kind === kind).length);
}

/** 이전 버전에서 중복 사용한 예약·잘못된 좌표만 정리하며 남은 먹이는 순서대로 보존한다. */
export function restoreFloorFood(save: SaveData, raw: unknown): FloorFood[] {
  const foods: FloorFood[] = [];
  if (!Array.isArray(raw)) return foods;
  for (const f of raw) {
    if (!f || (f.kind !== 'meat' && f.kind !== 'rotten') || !Number.isFinite(f.x) || !Number.isFinite(f.y)) continue;
    if (availableFood(save, foods, f.kind) > 0) foods.push({ kind: f.kind, x: Math.min(900, Math.max(60, f.x)), y: Math.min(520, Math.max(120, f.y)) });
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
