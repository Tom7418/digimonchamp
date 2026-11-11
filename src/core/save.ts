import { advance, freshSave, OFFLINE_CAP_MINUTES } from './care';
import type { SaveData } from './types';

const KEY = 'champion-tamer/save-v2';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
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
  if (!save || save.version !== 2 || !save.digimon?.length) return { save: freshSave(now), offlineMinutes: 0 };
  const offlineMinutes = Math.min(OFFLINE_CAP_MINUTES, Math.max(0, Math.floor((now - save.lastSavedAt) / 1000)));
  if (offlineMinutes > 0) save = advance(save, offlineMinutes).save;
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
