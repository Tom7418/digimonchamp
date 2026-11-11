import { dateOf } from './data';
import type { SaveData, Stage } from './types';

export interface Match {
  id: string;
  name: string;
  minRank: number;
  season: number;
  day: number;
  format: 1 | 3;
  stage: Stage;
  scale: number;
  prize: number;
  needEggs?: number;
}

/** 타이틀 매치. 원작의 타이틀 이름·일정은 확인하지 못해 '인피니티 소울' 외에는 임시 이름이다 */
export const TITLES: Match[] = [
  { id: 't1', name: '루키 컵', minRank: 1, season: 0, day: 3, format: 1, stage: 3, scale: 0.8, prize: 500 },
  { id: 't2', name: '서머 컵', minRank: 1, season: 1, day: 3, format: 3, stage: 3, scale: 1.0, prize: 800 },
  { id: 't3', name: '오텀 컵', minRank: 2, season: 2, day: 8, format: 1, stage: 4, scale: 0.9, prize: 1200 },
  { id: 't4', name: '윈터 컵', minRank: 2, season: 3, day: 3, format: 3, stage: 4, scale: 1.0, prize: 1600 },
  { id: 't5', name: '챔피언 로드', minRank: 3, season: 0, day: 8, format: 3, stage: 4, scale: 1.3, prize: 2200 },
  { id: 't6', name: '얼티밋 컵', minRank: 4, season: 1, day: 8, format: 3, stage: 5, scale: 1.0, prize: 3000 },
  { id: 't7', name: '마스터 컵', minRank: 5, season: 3, day: 8, format: 3, stage: 5, scale: 1.3, prize: 4000 },
  { id: 't8', name: '레전드 컵', minRank: 6, season: 0, day: 5, format: 3, stage: 6, scale: 1.0, prize: 6000 },
  { id: 't9', name: '인피니티 소울', minRank: 9, season: 1, day: 5, format: 3, stage: 6, scale: 1.5, prize: 20000, needEggs: 10 },
];

export const CHAMP_SEASON = 2;
export const CHAMP_DAY = 5;
export const PRELIM: Match = { id: 'prelim', name: '챔피언십 예선', minRank: 1, season: CHAMP_SEASON, day: CHAMP_DAY, format: 3, stage: 5, scale: 1.1, prize: 3000 };
export const FINAL: Match = { id: 'final', name: '챔피언십 본선', minRank: 1, season: CHAMP_SEASON, day: CHAMP_DAY, format: 3, stage: 6, scale: 1.2, prize: 10000 };

export function tamerRank(save: Pick<SaveData, 'titles' | 'champion'>): number {
  const normal = TITLES.filter((t) => t.id !== 't9' && save.titles.includes(t.id)).length;
  if (save.champion) return save.titles.length >= TITLES.length ? 10 : 9;
  return Math.min(8, 1 + normal);
}

/** 오늘 도전할 수 있는 매치 (엔트리는 08:00~15:00) */
export function todaysMatches(save: SaveData): Match[] {
  const d = dateOf(save.clock);
  if (d.hour < 8 || d.hour >= 15) return [];
  const rank = tamerRank(save);
  const out = TITLES.filter((t) => t.season === d.season && t.day === d.day && rank >= t.minRank && !save.titles.includes(t.id));
  if (d.season === CHAMP_SEASON && d.day === CHAMP_DAY && !save.champion) {
    if (save.qualifiedYear !== null && d.year > save.qualifiedYear) out.push(FINAL);
    else if (save.qualifiedYear === null) out.push(PRELIM);
  }
  return out;
}

export function upcoming(save: SaveData): string[] {
  const rank = tamerRank(save);
  const lines = TITLES.filter((t) => rank >= t.minRank && !save.titles.includes(t.id)).map(
    (t) => `${t.name}: ${['봄', '여름', '가을', '겨울'][t.season]} ${t.day}일 (${t.format}:${t.format})`,
  );
  if (!save.champion) lines.push(`챔피언십 ${save.qualifiedYear === null ? '예선' : '본선'}: 가을 ${CHAMP_DAY}일`);
  return lines;
}

export function applyWin(save: SaveData, m: Match): SaveData {
  const d = dateOf(save.clock);
  if (m.id === 'prelim') return { ...save, qualifiedYear: d.year, bits: save.bits + m.prize };
  if (m.id === 'final') return { ...save, champion: true, bits: save.bits + m.prize };
  return { ...save, titles: [...save.titles, m.id], bits: save.bits + m.prize };
}
