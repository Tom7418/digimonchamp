import { dateOf } from './data';
import titlesRaw from '../data/titles.txt?raw';
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
  /** 상대 인원 (없으면 format과 같다). 원작에는 3 VS 1, 1 VS 3 같은 경기가 있다 */
  foes?: number;
  /** 등급 0~4 (4는 빅7) */
  grade?: number;
  /** 참가 디지몬 세대 제한 */
  limitStage?: Stage;
  /** 아직 검사하지 않는 참가 제한 (표시용) */
  limitNote?: string;
}

/**
 * 타이틀 매치 61개. 이름·계절·날짜·필요 랭크·등급·상금·인원·참가 제한은 원본 실행 코드의 표와 설명 글에서 읽었다
 * (src/data/titles.txt, tools/extract_titles.py. 계절·날짜는 원작 편지와 대조해 확인, 랭크·등급·상금의 뜻은 추정).
 * 임시 값: 상대 세대(설명에 홀더 세대가 없으면 필요 랭크로 정함), 상대 강도(등급별 배율),
 *   상금 배율(상점 가격이 아직 임시라 원본 상금의 1/5), 랭크가 오르는 규칙.
 * 표시만 하고 아직 검사하지 않는 참가 제한: 속성·종족·타입·성격 한정(limitNote).
 */
export const PRIZE_SCALE = 0.2;
const STAGE_NAME: Record<number, string> = { 2: '유년기', 3: '성장기', 4: '성숙기', 5: '완전체', 6: '궁극체' };
const HOLDER_STAGE: Record<string, Stage> = { 유년기: 2, 성장기: 3, 성숙기: 4, 완전체: 5, 궁극체: 6 };
const STAGE_BY_RANK: Stage[] = [3, 3, 3, 3, 4, 4, 5, 5, 6];
const SCALE_BY_GRADE = [0.8, 0.9, 1.0, 1.1, 1.3];
export const TITLES: Match[] = titlesRaw
  .split(/\r?\n/)
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [no, name, season, day, rank, grade, prize, , mine, foes, limit, eggs, holder, other] = l.split('|');
    const m: Match = {
      id: `m${no}`,
      name,
      minRank: Number(rank),
      season: Number(season),
      day: Number(day),
      format: Number(mine) === 1 ? 1 : 3,
      foes: Number(foes),
      stage: HOLDER_STAGE[holder] ?? STAGE_BY_RANK[Number(rank)],
      scale: SCALE_BY_GRADE[Number(grade)],
      prize: Math.round(Number(prize) * PRIZE_SCALE),
      grade: Number(grade),
    };
    if (limit) m.limitStage = HOLDER_STAGE[limit];
    if (eggs) m.needEggs = Number(eggs);
    if (other) m.limitNote = `${other} 한정`;
    return m;
  })
  .sort((a, b) => a.minRank - b.minRank || a.season - b.season || a.day - b.day);
/** 예전 임시 타이틀 9개 → 원작 타이틀 (저장 이전용). 랭크가 유지되도록 쉬운 것부터 8개, 인피니티 소울은 무한의 영혼 */
export const OLD_TITLE_IDS: Record<string, string> = Object.fromEntries([
  ...TITLES.slice(0, 8).map((m, i) => [`t${i + 1}`, m.id]),
  ['t9', 'm52'],
]);

/** 랭크 이름. 레드 테이머(랭크 4 = 타이틀 3개)만 영상으로 확인, 나머지는 임시 */
export function rankName(rank: number): string {
  return ['', '루키 테이머', '테이머 랭크 2', '테이머 랭크 3', '레드 테이머', '테이머 랭크 5', '테이머 랭크 6', '테이머 랭크 7', '테이머 랭크 8', '챔피언', '그랜드 챔피언'][rank] ?? `랭크 ${rank}`;
}

/** 랭크별 최대 사육 용량(G). 레드 테이머 96G만 영상 확인 값 */
export const CAPACITY_BY_RANK = [0, 32, 48, 74, 96, 120, 144, 172, 200, 200, 200];
/** 랭크별 케이지 공간(칸). 레드 테이머 16칸만 영상 확인 값 */
export const CAGE_SPACE_BY_RANK = [0, 8, 10, 12, 16, 20, 24, 28, 30, 30, 30];
export const capacityOf = (save: Pick<SaveData, 'titles' | 'champion'>) => CAPACITY_BY_RANK[tamerRank(save)] ?? 200;
export const cageSpaceOf = (save: Pick<SaveData, 'titles' | 'champion'>) => CAGE_SPACE_BY_RANK[tamerRank(save)] ?? 30;

// ---------- 챔피언십 ----------
// 원작(기획 문서): 가을에 5일간 예선 → 다음 해 본선, 우승하면 랭크 9.
// 임시 값: 예선 참가 랭크 4(레드 테이머), 예선 3승 통과, 본선 날짜(가을 5일)와 3라운드 구성, 상대 세대·상금.
export const CHAMP_SEASON = 2;
export const PRELIM_DAYS = [1, 2, 3, 4, 5];
export const CHAMP_DAY = 5;
export const PRELIM_MIN_RANK = 4;
export const PRELIM_WINS = 3;
export const PRELIM: Match = { id: 'prelim', name: '챔피언십 예선', minRank: PRELIM_MIN_RANK, season: CHAMP_SEASON, day: 1, format: 3, stage: 4, scale: 1.15, prize: 1500 };
export const FINAL_ROUNDS: Match[] = [
  { id: 'final', name: '챔피언십 본선 8강', minRank: 1, season: CHAMP_SEASON, day: CHAMP_DAY, format: 3, stage: 5, scale: 1.0, prize: 3000 },
  { id: 'final', name: '챔피언십 본선 4강', minRank: 1, season: CHAMP_SEASON, day: CHAMP_DAY, format: 3, stage: 5, scale: 1.2, prize: 5000 },
  { id: 'final', name: '챔피언십 결승', minRank: 1, season: CHAMP_SEASON, day: CHAMP_DAY, format: 3, stage: 6, scale: 1.1, prize: 10000 },
];
/** 이전 코드·테스트 호환용: 결승전 */
export const FINAL = FINAL_ROUNDS[FINAL_ROUNDS.length - 1];

/** 올해 예선 기록 (해가 바뀌면 새로 시작) */
function prelimOf(save: SaveData, year: number) {
  return save.prelim && save.prelim.year === year ? save.prelim : { year, days: [] as number[], wins: 0 };
}

export function tamerRank(save: Pick<SaveData, 'titles' | 'champion'>): number {
  // 임시 규칙: 타이틀 하나마다 랭크 +1 (세 번째 타이틀에서 레드 테이머가 되는 것만 영상 확인), 최대 8.
  // 챔피언은 9, 빅7(등급 4)까지 모두 따면 10.
  const won = TITLES.filter((t) => save.titles.includes(t.id));
  if (save.champion) return TITLES.filter((t) => t.grade === 4).every((t) => save.titles.includes(t.id)) ? 10 : 9;
  return Math.min(8, 1 + won.length);
}

/** 타이틀 매치 엔트리 시간 (원작 텍스트 txt_list #634: 7:00~15:00) */
export const ENTRY_OPEN_HOUR = 7;
export const ENTRY_CLOSE_HOUR = 15;

/** 오늘 도전할 수 있는 매치 */
export function todaysMatches(save: SaveData): Match[] {
  const d = dateOf(save.clock);
  if (d.hour < ENTRY_OPEN_HOUR || d.hour >= ENTRY_CLOSE_HOUR) return [];
  const rank = tamerRank(save);
  const out = TITLES.filter((t) => t.season === d.season && t.day === d.day && rank >= t.minRank && !save.titles.includes(t.id));
  if (d.season === CHAMP_SEASON && !save.champion) {
    const qualifiedBefore = save.qualifiedYear !== null && d.year > save.qualifiedYear;
    if (qualifiedBefore && d.day === CHAMP_DAY) {
      const round = save.finalRound ?? 0;
      if (round < FINAL_ROUNDS.length) out.push(FINAL_ROUNDS[round]);
    } else if (save.qualifiedYear === null && rank >= PRELIM_MIN_RANK && PRELIM_DAYS.includes(d.day)) {
      const p = prelimOf(save, d.year);
      const left = PRELIM_DAYS.filter((x) => x >= d.day).length;
      // 오늘 아직 안 치렀고, 남은 경기로 통과가 가능할 때만
      if (!p.days.includes(d.day) && p.wins + left >= PRELIM_WINS) out.push({ ...PRELIM, day: d.day, name: `챔피언십 예선 ${p.days.length + 1}전` });
    }
  }
  return out;
}

export function upcoming(save: SaveData): string[] {
  const rank = tamerRank(save);
  // 61개를 다 늘어놓지 않고, 오늘부터 가까운 순서로 6개만
  const today = dateOf(save.clock);
  const ahead = (t: Match) => ((t.season - today.season + 4) % 4) * 8 + (t.day - today.day) + (t.season === today.season && t.day < today.day ? 32 : 0);
  const lines = TITLES.filter((t) => rank >= t.minRank && !save.titles.includes(t.id))
    .sort((a, b) => ahead(a) - ahead(b))
    .slice(0, 6)
    .map((t) => `${t.name}: ${['봄', '여름', '가을', '겨울'][t.season]} ${t.day}일 (${t.format} VS ${t.foes ?? t.format}${t.limitStage ? ` · ${STAGE_NAME[t.limitStage]} 한정` : ''}${t.limitNote ? ` · ${t.limitNote}` : ''})`);
  if (!save.champion) {
    if (save.qualifiedYear !== null) lines.push(`챔피언십 본선: ${save.qualifiedYear + 1}년차 가을 ${CHAMP_DAY}일 (8강·4강·결승)`);
    else if (rank < PRELIM_MIN_RANK) lines.push(`챔피언십 예선: 가을 1~5일 (${rankName(PRELIM_MIN_RANK)}부터 참가)`);
    else {
      const p = save.prelim;
      lines.push(`챔피언십 예선: 가을 1~5일, ${PRELIM_WINS}승 통과${p ? ` (올해 ${p.wins}승 ${p.days.length - p.wins}패)` : ''}`);
    }
  }
  return lines;
}

/** 웹판 안내 정책: 접속 시점에도 참가 가능한 경기만 날짜별 한 번 안내한다.
 * 읽음 표시는 화면에서 편지를 닫았을 때 저장하므로 읽기 전 새로고침으로 유실되지 않는다.
 */
export function matchEntryNotice(save: SaveData, readKey: string | null = null) {
  const d = dateOf(save.clock);
  const key = `${d.year}:${d.season}:${d.day}`;
  const matches = todaysMatches(save);
  if (readKey === key || !matches.length) return null;
  return { key, names: matches.map((m) => m.name) };
}

/** 매치 결과 반영. 타이틀은 이겼을 때만 의미가 있고, 예선·본선은 진 것도 기록한다 */
export function applyMatch(save: SaveData, m: Match, won: boolean): SaveData {
  const d = dateOf(save.clock);
  if (m.id === 'prelim') {
    const p = prelimOf(save, d.year);
    const next = { year: d.year, days: [...p.days, d.day], wins: p.wins + (won ? 1 : 0) };
    const qualified = next.wins >= PRELIM_WINS;
    return { ...save, prelim: next, qualifiedYear: qualified ? d.year : save.qualifiedYear, bits: save.bits + (won ? m.prize : 0) };
  }
  if (m.id === 'final') {
    if (!won) return { ...save, qualifiedYear: null, finalRound: 0, prelim: null };
    const round = (save.finalRound ?? 0) + 1;
    const champion = round >= FINAL_ROUNDS.length;
    return { ...save, finalRound: champion ? 0 : round, champion: save.champion || champion, bits: save.bits + m.prize };
  }
  return won ? { ...save, titles: [...save.titles, m.id], bits: save.bits + m.prize } : save;
}

export function applyWin(save: SaveData, m: Match): SaveData {
  return applyMatch(save, m, true);
}
