import { advance, newMonster, OFFLINE_CAP_MINUTES } from './care';
import type { SaveData } from './types';

const KEY = 'champion-tamer/save';
const DISCOVERED_KEY = 'champion-tamer/discovered';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function freshSave(): SaveData {
  return { version: 1, monster: newMonster(), clock: 0, lastSavedAt: Date.now() };
}

/** 저장 불러오기 + 꺼져 있던 동안의 시간 반영 (현실 1초 = 게임 1분, 최대 12시간) */
export function loadGame(now = Date.now()): { save: SaveData; offlineMinutes: number } {
  let save: SaveData | null = null;
  try {
    const raw = storage()?.getItem(KEY);
    if (raw) save = JSON.parse(raw) as SaveData;
  } catch {
    save = null;
  }
  if (!save || save.version !== 1) return { save: freshSave(), offlineMinutes: 0 };

  const elapsedSec = Math.max(0, Math.floor((now - save.lastSavedAt) / 1000));
  const offlineMinutes = Math.min(OFFLINE_CAP_MINUTES, elapsedSec);
  if (offlineMinutes > 0) {
    const r = advance(save.monster, offlineMinutes);
    save = { ...save, monster: r.monster, clock: save.clock + offlineMinutes };
  }
  return { save: { ...save, lastSavedAt: now }, offlineMinutes };
}

export function saveGame(save: SaveData) {
  try {
    storage()?.setItem(KEY, JSON.stringify({ ...save, lastSavedAt: Date.now() }));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function resetGame() {
  try {
    storage()?.removeItem(KEY);
  } catch {
    /* noop */
  }
}

export function loadDiscovered(): Set<string> {
  try {
    const raw = storage()?.getItem(DISCOVERED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : ['egg']);
  } catch {
    return new Set(['egg']);
  }
}

export function saveDiscovered(set: Set<string>) {
  try {
    storage()?.setItem(DISCOVERED_KEY, JSON.stringify([...set]));
  } catch {
    /* noop */
  }
}
