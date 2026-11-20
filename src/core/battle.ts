import { baseResist, getSpecies, originalSpecies, RESIST_CURVE, RESIST_ORDER, speciesByStage, STAT_CURVES, typicalStats, type ResistKey } from './data';
import { basicRecordOf, battleSkills, pickBattleSkill, type BattleSkill } from './battle-skills';
import formula from '../data/battle-formula.json';
import { supportSkills, useSupport, reviveSupport, buffMultiplier, battleElement, type BattleBuff, type SupportSkill } from './support-skills';
import { pick, range, seeded, type Rng } from './rng';
import freeRaw from '../data/free-battles.txt?raw';
import { PERSONALITIES, type AttackMode, type SpeciesAttr, type Digimon, type Personality, type Stage, type Stats } from './types';

export const ARENA = { w: 480, h: 250 };
/** 배틀 제한 시간(초): 원본은 7200프레임(120초)을 넘으면 시간 종료 (overlay19 0x2113FB4) */
export const TIME_LIMIT = 120;
const DT = 0.1;

// ---------- 프리 배틀 (원본 대진·상금, tools/extract_free_battles.py → free-battles.txt) ----------
export interface FreeFoe { no: number; nick: string; speciesId: string; level: number; prize: number; curves: number[]; resist: number[] }
export interface FreeBattle { label: string; format: 1 | 3; level: number; stage: Stage; foes: FreeFoe[]; prize: number }
export const FREE_FOES = new Map<number, FreeFoe>();
/** 후보표 [레벨 0~9][계절 0~3, 4=공통] (원본 0x020C7E24) */
export const FREE_POOLS: number[][][] = Array.from({ length: 10 }, () => Array.from({ length: 5 }, () => []));
for (const line of freeRaw.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const f = line.split('|');
  if (f[0] === 'pool') FREE_POOLS[+f[1]][+f[2]] = f[3] ? f[3].split(',').map(Number) : [];
  else FREE_FOES.set(+f[0], { no: +f[0], nick: f[1], speciesId: f[2], level: +f[3], prize: +f[4], curves: (f[5] ?? '').split(',').filter(Boolean).map(Number), resist: (f[6] ?? '').split(',').filter(Boolean).map(Number) });
}
const candidates = (level: number, season: number) => [...FREE_POOLS[level][season], ...FREE_POOLS[level][4]];

/** 그날의 프리 배틀 대진 (원본 0x02067F04). 1:1·3:3 각각 레벨 슬롯 0·2·4·6·8 + 무작위 0~4칸.
 *  같은 날에는 같은 대진이 나오도록 날짜로 난수를 고정한다(웹판 정책: 원본은 하루 시작에 한 번 만들어 저장).
 *  계절 칸 번호는 웹판 계절(0 봄~3 겨울)과 같다고 본다(추정). 상금 = 상대 디지몬 상금의 합(0x02088334). */
export function freeBattleLineup(year: number, season: number, day: number): FreeBattle[] {
  const rng = seeded(((year * 4 + season) * 32 + day) * 2654435761);
  const int = (n: number) => Math.floor(rng() * n);
  const slots = () => {
    const extra = int(5);
    return [0, 2, 4, 6, 8, ...Array.from({ length: extra }, () => int(10))].sort((a, b) => a - b);
  };
  const make = (format: 1 | 3, level: number, ids: number[]): FreeBattle => {
    const foes = ids.map((id) => FREE_FOES.get(id)!);
    return { label: `Lv${level + 1} ${foes[0].nick}`, format, level: level + 1, stage: getSpecies(foes[0].speciesId).stage as Stage, foes, prize: foes.reduce((n, f) => n + f.prize, 0) };
  };
  const out: FreeBattle[] = [];
  const used1: number[] = [];
  for (const lv of slots()) {
    const list = candidates(lv, season).filter((id) => !used1.includes(id));
    if (!list.length) continue;
    const id = list[int(list.length)];
    used1.push(id);
    out.push(make(1, lv, [id]));
  }
  const leads: number[] = [];
  for (const lv of slots()) {
    const list = candidates(lv, season).filter((id) => !leads.includes(id));
    if (!list.length) continue;
    const lead = list[int(list.length)];
    leads.push(lead);
    // 나머지 둘은 한 단계 위 레벨(레벨 9는 8)의 후보에서, 다른 대진의 대표는 빼고 고른다
    const mates = candidates(lv < 9 ? lv + 1 : lv - 1, season).filter((id) => !leads.includes(id));
    const pickMate = () => (mates.length ? mates[int(mates.length)] : lead);
    out.push(make(3, lv, [lead, pickMate(), pickMate()]));
  }
  return out;
}

/** 프리 배틀 상대의 원본 능력치 (arm9 0x02061DA8): HP는 종 HP 곡선의 시작값, 나머지는 NPC 표의 곡선 번호 값. 난수 없음 */
export function freeFoeStats(f: FreeFoe): Stats {
  const hpIndex = originalSpecies(f.speciesId)?.stats[0] ?? 0;
  const [tp, atk, def, int, spd] = f.curves.map((lv, k) => STAT_CURVES[Math.min(24, lv)][k + 1]);
  return { hp: STAT_CURVES[Math.min(24, hpIndex)][0], tp, atk, def, int, spd };
}
/** 프리 배틀 상대의 내성 (NPC 표 +0x28~+0x38 곡선 번호 → 내성 곡선 값) */
export const freeFoeResist = (f: FreeFoe): Record<ResistKey, number> =>
  f.resist.length === 5 ? Object.fromEntries(RESIST_ORDER.map((k, i) => [k, RESIST_CURVE[Math.min(24, f.resist[i])]])) as Record<ResistKey, number> : baseResist(f.speciesId);
/** 프리 배틀 상대를 배틀 참가자로 만든다. 성격은 원본 규칙(foePersonality), 공격 방식은 웹판 임시 */
export function freeBattleFoes(b: FreeBattle, rng: Rng): Entrant[] {
  return b.foes.map((f) => ({
    speciesId: f.speciesId,
    resist: freeFoeResist(f),
    stats: f.curves.length === 5 ? freeFoeStats(f) : typicalStats(f.speciesId),
    personality: foePersonality(f.speciesId, rng),
    mode: pick(rng, ['일반', '일반', '특수', '지원'] as AttackMode[]),
  }));
}

export interface Unit {
  id: number;
  team: 0 | 1;
  uid?: number;
  name: string;
  speciesId: string;
  attr: SpeciesAttr;
  stats: Stats;
  personality: Personality;
  mode: AttackMode;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  tp: number;
  maxTp: number;
  cd: number;
  retreat: number;
  wasHit: boolean;
  alive: boolean;
  buffs?: Partial<Record<BattleBuff,number>>;
  resist: Record<ResistKey, number>;
  taunt?: {from:number;until:number};
  /** 상태이상 (원본 배우 +0x158 번호, +0x15C 남은 프레임) */
  status?: { id: StatusId; until: number; nextTick?: number };
  /** 분노 게이지 (원본 +0x22): 맞으면 쌓이고 성격별 한도를 넘으면 분노 */
  rage?: number;
  /** 노리는 상대 (성격별 규칙으로 행동을 정할 때 고른다) */
  target?: number;
  /** 원본 배우 +0x1C: 시작 1, 일반 공격 +60·필살기 +120. 솔직·쿨의 대상 고르기에 쓴다 */
  aggro?: number;
  /** 정해 둔 다음 행동 (사거리에 들어가면 실행) */
  intent?: { kind: 'basic' } | { kind: 'special'; skill: BattleSkill };
  revived?: boolean;
}

export type BattleEvent =
  | { type: 'hit'; from: number; to: number; damage: number; special: boolean; critical?: boolean; skill?: BattleSkill }
  | { type: 'heal'; from: number; to: number; amount: number; support?: SupportSkill }
  | { type: 'support'; from:number; targets:number[]; skill:SupportSkill }
  | { type: 'ko'; id: number }
  | { type: 'status'; id: number; status: StatusName }
  | { type: 'statusDamage'; id: number; damage: number; status: StatusName };

export interface BattleState {
  units: Unit[];
  t: number;
  over: boolean;
  winner: 0 | 1 | null;
  reason: 'ko' | 'timeout' | null;
  /** 배틀 맵 번호 (지형 상성 표의 열). 없으면 일반 경기장 0 */
  field?: number;
}

export interface Entrant {
  uid?: number;
  speciesId: string;
  stats: Stats;
  personality: Personality;
  mode: AttackMode;
  /** 시작 HP. 원본은 배틀을 현재 HP로 시작한다(overlay19 0x21179DC). 없으면 가득 */
  hp?: number;
  /** 내성 값(열·추위·빛·어둠·천둥). 없으면 종 기본값 */
  resist?: Record<ResistKey, number>;
}

/** 알약(프로틴) 하나당 공격 +15%, 최대 3개분 (임시 값) */
export const PROTEIN_ATK = 0.15;
export const PROTEIN_SAFE = 3;
export const entrantOf = (d: Digimon, mode: AttackMode = d.tactic ?? '일반'): Entrant => ({
  uid: d.uid,
  speciesId: d.speciesId,
  stats: d.protein ? { ...d.stats, atk: Math.round(d.stats.atk * (1 + PROTEIN_ATK * Math.min(PROTEIN_SAFE, d.protein))) } : d.stats,
  personality: d.personality,
  mode,
  hp: d.hpNow,
  resist: digimonResist(d),
});
/** 내 디지몬의 내성 = 종 기본값 + 훈련으로 얻은 값 */
export function digimonResist(d: Digimon): Record<ResistKey, number> {
  const base = baseResist(d.speciesId);
  return Object.fromEntries(RESIST_ORDER.map((k) => [k, base[k] + (d.resistance?.[k] ?? 0)])) as Record<ResistKey, number>;
}
/**
 * 배틀 상대의 성격 (원본 arm9 0x02061DA8, 성격 인자 -1일 때). 0~180 난수 r로
 *  백신: r=0 대담, 1~4 쿨, 그 밖 r%8(쿨·대담이면 솔직) · 바이러스: r=0 열혈, 1~4 대담, 그 밖 r%8(열혈·대담이면 솔직)
 *  데이터: r=0 쿨, 1~4 열혈, 그 밖 r%8(열혈·쿨이면 솔직) · 그 밖 속성: r%8.
 *  원본 성격 번호 0 솔직 1 제멋대로 2 성급한 3 게으름 4 열혈 5 쿨 6 대담 7 겁쟁이 (txt_list #445~452)
 */
const ORIGINAL_PERSONALITY: Personality[] = ['솔직', '제멋대로', '성급한', '게으름', '열혈', '쿨', '대담', '겁쟁이'];
export function foePersonality(speciesId: string, rng: Rng): Personality {
  const r = Math.min(180, Math.floor(rng() * 181));
  const attr = originalSpecies(speciesId)?.attr;
  const rule: Record<string, [number, number, number[]]> = { 백신: [6, 5, [5, 6]], 바이러스: [4, 6, [4, 6]], 데이터: [5, 4, [4, 5]] };
  const x = rule[attr ?? ''];
  if (!x) return ORIGINAL_PERSONALITY[r % 8];
  if (r === 0) return ORIGINAL_PERSONALITY[x[0]];
  if (r <= 4) return ORIGINAL_PERSONALITY[x[1]];
  return ORIGINAL_PERSONALITY[x[2].includes(r % 8) ? 0 : r % 8];
}

export function makeEnemies(stage: Stage, count: number, scale: number, rng: Rng): Entrant[] {
  const pool = speciesByStage(stage);
  return Array.from({ length: count }, () => {
    const sp = pick(rng, pool);
    return {
      speciesId: sp.id,
      stats: typicalStats(sp.id, scale * range(rng, 0.9, 1.1)),
      personality: foePersonality(sp.id, rng),
      mode: pick(rng, ['일반', '일반', '특수', '지원'] as AttackMode[]),
    };
  });
}

export function createBattle(mine: Entrant[], foes: Entrant[], field = 0): BattleState {
  const units: Unit[] = [];
  const place = (list: Entrant[], team: 0 | 1) =>
    list.forEach((e, i) => {
      const sp = getSpecies(e.speciesId);
      // 능력치가 원본 단위이므로 예전 임시 HP×3+40 / TP+20 보정을 중복하지 않는다.
      const maxHp = Math.max(1, e.stats.hp);
      const maxTp = Math.max(0, e.stats.tp);
      units.push({
        id: units.length,
        team,
        uid: e.uid,
        name: sp.name,
        speciesId: sp.id,
        attr: sp.attr,
        stats: e.stats,
        personality: e.personality,
        mode: e.mode,
        x: team === 0 ? 70 : ARENA.w - 70,
        y: (ARENA.h / (list.length + 1)) * (i + 1),
        hp: e.hp === undefined ? maxHp : Math.max(0, Math.min(maxHp, e.hp)),
        maxHp,
        tp: maxTp,
        maxTp,
        cd: 0.5 + i * 0.2,
        retreat: 0,
        wasHit: false,
        alive: true,
        resist: e.resist ?? baseResist(sp.id),
      });
    });
  place(mine, 0);
  place(foes, 1);
  return { units, t: 0, over: false, winner: null, reason: null, field };
}

/** 백신 > 바이러스 > 데이터 > 백신 */
// ---------- 원본 피해 계산 (overlay19 0x2118218~0x21184EC, 표는 tools/extract_battle_formula.py) ----------
const FORMULA = formula as { statusChance: number[]; downChance: number[]; statusFrames: number[]; rageLimit: number[]; fearAction: number[]; records: Record<string, { power: number; kind: number; element: number; time: number[]; effect?: number }>; terrain: number[][]; critTable: number[]; critRoll: number; habitat: Record<string, number>; critLevel: Record<string, number>; tactics: number[][]; tpBudget: number[][] };
/** 공격 기록의 위력(+0x4A). 일반 공격 100, 필살기 280~500 등 */
export const attackPower = (record: number | null | undefined) => (record == null ? 100 : FORMULA.records[String(record)]?.power ?? 100);
/** 강화 기술은 곡선 번호를 한 칸 올린다(원본 +1). 웹판 능력치는 값이라, 지금 값이 놓인 곡선 칸의 다음 칸과의 차이만큼 더한다 */
export function curveStep(value: number, column: number | 'resist'): number {
  const curve = column === 'resist' ? RESIST_CURVE : STAT_CURVES.map((row) => row[column]);
  let i = 0;
  while (i + 1 < curve.length && curve[i + 1] <= value) i++;
  return Math.max(1, (curve[Math.min(curve.length - 1, i + 1)] ?? value) - (curve[i] ?? value));
}
/** 지형 상성: 종의 지형 번호(종 표 +72) × 배틀 맵 번호 → +1 유리, -1 불리 */
export const terrainOf = (speciesId: string, field: number) => FORMULA.terrain[FORMULA.habitat[getSpecies(speciesId).id] ?? 0]?.[field] ?? 0;
/**
 * 원본 피해 = ⌊(⌊공격×5/2⌋ − 방어) × 위력 / 100⌋. 속성 공격은 방어 대신 그 속성 내성.
 * 공격 쪽이 유리한 지형이면 ×1.2, 맞는 쪽이 불리한 지형이면 ×1.2. 0 이하이면 튕겨 낸다(피해 0).
 * 크리티컬 216분의 2(크리티컬업이면 3) → ×1.5. 마지막에 (0~215 난수 % 100)/1000만큼 더한다(최대 +9.9%).
 * 크리티컬 단계는 맞는 쪽 종의 값(종 표 +63, 0~2 → 216분의 2·3·5). 공격하는 쪽이 크리티컬업이면 +1.
 * 원본 코드(0x211845C)는 맞는 쪽의 강화를 읽어서 크리티컬업을 쓰면 오히려 더 맞는다 — 원작 실수로 보고 웹판은 공격 쪽으로 고쳤다(형규 결정).
 */
// ---------- 상태이상 (원본 overlay19, 2026-11-20 해석) ----------
/** 원본 상태 번호 → 이름. 글(txt_list #1828~1840)은 공격 효과 번호 순서로 붙어 있다 */
export const STATUS_NAMES = { 1: '분노', 2: '공포', 4: '소극적', 5: '혼란', 6: '슬로우', 7: '독', 8: '얼음', 9: '수면', 10: '마비', 11: '눈가림', 12: '석화', 13: '저주', 14: '다운' } as const;
export type StatusId = keyof typeof STATUS_NAMES;
export type StatusName = (typeof STATUS_NAMES)[StatusId];
/** 공격 기록 +0x5C 효과 1~13 → 상태 번호 (0x2118B94) */
const EFFECT_STATUS: Record<number, StatusId> = { 1: 5, 2: 7, 3: 10, 4: 9, 5: 11, 6: 8, 7: 6, 8: 12, 9: 13, 10: 2, 11: 1, 12: 4, 13: 14 };
/** 효과별로 걸리기 어렵게 하는 쪽 (0x2118AB8): 'guard' = 이번 피해에 쓴 방어·내성 곡선 번호, 내성 이름 = 그 내성, null = 걸리지 않음 */
const EFFECT_BLOCK: Record<number, 'guard' | ResistKey | null> = { 1: 'guard', 2: '어둠', 3: '천둥', 4: 'guard', 5: '빛', 6: null, 7: 'guard', 8: 'guard', 9: '어둠', 10: '어둠', 11: null, 12: null, 13: '빛' };
/** 공격 기록의 상태이상 효과 번호 (없으면 0) */
export const attackEffect = (record: number | null | undefined) => (record == null ? 0 : FORMULA.records[String(record)]?.effect ?? 0);
/** 내성 값이 놓인 곡선 칸 번호 */
const resistIndexOf = (value: number) => { let i = 0; while (i + 1 < RESIST_CURVE.length && RESIST_CURVE[i + 1] <= value) i++; return i; };
/** 상태이상이 걸릴 확률(216분의): 표[clamp(공격 곡선 번호 − 막는 곡선 번호, −4, 4) + 4] */
export function statusChance(effect: number, atkIndex: number, blockIndex: number | null) {
  if (!EFFECT_STATUS[effect] || EFFECT_BLOCK[effect] === null || blockIndex == null) return 0;
  const k = Math.max(-4, Math.min(4, atkIndex - blockIndex)) + 4;
  return (effect === 13 ? FORMULA.downChance : FORMULA.statusChance)[k];
}
/** 상태 걸기 (0x2117D88): 지속은 표대로(10초, 석화·저주·다운 15초), 분노 게이지 +10 */
export function inflictStatus(u: Unit, id: StatusId, t: number, events: BattleEvent[]) {
  if (!u.alive) return;
  u.status = { id, until: t + FORMULA.statusFrames[id] / 60, nextTick: t };
  u.rage = (u.rage ?? 0) + 10;
  if (id === 8 || id === 9 || id === 10 || id === 12) { u.intent = undefined; }
  events.push({ type: 'status', id: u.id, status: STATUS_NAMES[id] });
}
export const hasStatus = (u: Unit, t: number, ...ids: StatusId[]) => !!u.status && u.status.until > t && ids.includes(u.status.id);
/** 상태 진행 (0x2110D58): 독·저주 3초마다 최대 HP 3%, 다운 10프레임마다 5%. 분노 게이지가 성격 한도를 넘으면 분노 */
function tickStatus(s: BattleState, u: Unit, events: BattleEvent[], rng: Rng) {
  if (u.status && u.status.until <= s.t) u.status = undefined;
  if (u.status) {
    const every = u.status.id === 14 ? 10 / 60 : u.status.id === 7 || u.status.id === 13 ? 3 : 0;
    if (every && s.t >= (u.status.nextTick ?? s.t) + every) {
      u.status.nextTick = (u.status.nextTick ?? s.t) + every;
      const damage = Math.trunc((u.maxHp * (u.status.id === 14 ? 5 : 3)) / 100);
      u.hp = Math.max(0, u.hp - damage);
      events.push({ type: 'statusDamage', id: u.id, damage, status: STATUS_NAMES[u.status.id] });
      if (u.hp <= 0) { u.alive = false; u.status = undefined; events.push({ type: 'ko', id: u.id }); reviveSupport(s, u, events); }
    }
    return;
  }
  const limit = FORMULA.rageLimit[ORIGINAL_PERSONALITY.indexOf(u.personality)] ?? 9999;
  if ((u.rage ?? 0) > limit) { u.rage = 0; inflictStatus(u, 1, s.t, events); void rng; }
}

/** 곡선에서 이 값이 놓인 칸 번호 (원본 배틀은 능력치 대신 곡선 번호를 읽는다) */
export function curveIndexOf(value: number, column: number): number {
  let i = 0;
  while (i + 1 < STAT_CURVES.length && STAT_CURVES[i + 1][column] <= value) i++;
  return i;
}
/** 다음 행동까지 기다리는 시간(초): 90 − 2×지능 곡선 번호 프레임 (overlay19 0x2119114), 민첩업이면 ×0.8 */
export function thinkSeconds(intValue: number, quick = false) {
  const frames = Math.max(0, 90 - Math.trunc((curveIndexOf(intValue, 4) * 48) / 24));
  return ((quick ? Math.trunc((frames * 80) / 100) : frames) / 60);
}
/** 행동 하나에 걸리는 시간(초): 기록 +0x4C + +0x4E × (1 − 민첩 곡선 번호/24) 프레임 (0x211FE2C). 지원 기술은 120프레임 */
export function actionSeconds(record: number | null | undefined, spdValue: number) {
  const r = record == null ? undefined : FORMULA.records[String(record)];
  if (r?.kind === 2) return 120 / 60;
  const [base, varying] = r?.time ?? [120, 30];
  return (base + varying - Math.trunc((varying * curveIndexOf(spdValue, 5)) / 24)) / 60;
}
/** 맞는 쪽 종의 크리티컬 단계 (종 표 +63, 0~2) */
export const critLevelOf = (speciesId: string) => FORMULA.critLevel[getSpecies(speciesId).id] ?? 0;
/** 작전 행 번호: 0 특수 · 1 일반 · 2 지원 (overlay19 0x021338E8) */
const TACTIC_ROW: Record<AttackMode, number> = { 특수: 0, 일반: 1, 지원: 2 };
/** 작전과 경과 시간으로 쓸 수 있는 TP 예산 (최대 TP × 표 %, 15초마다 단계 +1, 0x21191A4) */
export function tpBudget(mode: AttackMode, maxTp: number, tp: number, t: number) {
  const phase = Math.min(7, Math.floor(t / 15));
  return Math.min(tp, Math.trunc((maxTp * FORMULA.tpBudget[TACTIC_ROW[mode]][phase]) / 100));
}
/**
 * 성격별 대상 고르기 (overlay19 0x21156EC, 성격→규칙 표 0x0213384C = 0·12·8·12·1·5·2·8).
 *  솔직: 활동량(+0x1C, 도발 중 +3000) 최대 · 쿨: 활동량 최소 · 열혈: 공격 최고 · 대담: 방어 최고
 *  성급한·겁쟁이: 현재 HP 최저 · 제멋대로·게으름: 무작위. 같은 값이면 앞쪽.
 */
export function chooseTarget(u: Unit, foes: Unit[], t: number, rng: Rng): Unit {
  const score = (f: Unit) => (f.aggro ?? 1) + (u.taunt && u.taunt.until > t && u.taunt.from === f.id ? 3000 : 0);
  const best = (value: (f: Unit) => number, most: boolean) => foes.reduce((a, b) => (most ? value(b) > value(a) : value(b) < value(a)) ? b : a);
  switch (u.personality) {
    case '솔직': return best(score, true);
    case '쿨': return best(score, false);
    case '열혈': return best((f) => f.stats.atk, true);
    case '대담': return best((f) => f.stats.def, true);
    case '성급한': case '겁쟁이': return best((f) => f.hp, false);
    default: return foes[Math.floor(rng() * 216) % foes.length];
  }
}

/** 216 난수 하나로 행동을 고른다 (0x2119224~): 필살기 → 일반 공격 → 지원 기술 → 그 밖은 이동 */
export function chooseAction(mode: AttackMode, roll: number, specialScale = 1): 'special' | 'basic' | 'support' | 'move' {
  const [, b, c, , e] = FORMULA.tactics[TACTIC_ROW[mode]];
  // 형규가 정한 성격 효과: 솔직 1.2배·쿨 1.6배로 필살기 구간을 넓힌다(일반 공격 구간 안에서)
  if (roll < Math.min(c, b * specialScale)) return 'special';
  if (roll < c) return 'basic';
  if (roll < e) return 'support';
  return 'move';
}
export function originalDamage(attack: number, guard: number, power: number, rng: Rng, opts: { attackerTerrain?: number; targetTerrain?: number; critUp?: boolean; critLevel?: number } = {}) {
  let dmg = Math.trunc(((Math.trunc((attack * 5) / 2) - guard) * power) / 100);
  if (dmg <= 0) return { damage: 0, critical: false };
  if ((opts.attackerTerrain ?? 0) > 0) dmg = Math.trunc((dmg * 120) / 100);
  if ((opts.targetTerrain ?? 0) < 0) dmg = Math.trunc((dmg * 120) / 100);
  const critical = Math.floor(rng() * FORMULA.critRoll) < FORMULA.critTable[Math.min(3, (opts.critLevel ?? 0) + (opts.critUp ? 1 : 0))];
  if (critical) dmg = Math.trunc((dmg * 15) / 10);
  const roll = Math.floor(rng() * 216) % 100;
  dmg += Math.trunc((dmg * roll) / 1000);
  return { damage: dmg, critical };
}

const dist = (a: Unit, b: Unit) => Math.hypot(a.x - b.x, a.y - b.y);

function move(u: Unit, tx: number, ty: number, speed: number, away = false) {
  const dx = tx - u.x;
  const dy = ty - u.y;
  const len = Math.hypot(dx, dy) || 1;
  const k = (speed * DT * (away ? -1 : 1)) / len;
  u.x = Math.min(ARENA.w - 20, Math.max(20, u.x + dx * k));
  u.y = Math.min(ARENA.h - 20, Math.max(20, u.y + dy * k));
}

/** 전투를 0.1초 진행한다. state를 직접 바꾸고 이번 스텝의 이벤트를 돌려준다 */
export function stepBattle(s: BattleState, rng: Rng): BattleEvent[] {
  const events: BattleEvent[] = [];
  if (s.over) return events;
  s.t += DT;
  for (const u of s.units) {
    if (!u.alive) continue;
    tickStatus(s, u, events, rng);
    if (!u.alive) continue;
    u.cd -= DT;
    u.retreat -= DT;
    // 얼음·수면·마비·석화는 움직이지도 행동하지도 못한다 (0x2116B08 상태 동작)
    if (hasStatus(u, s.t, 8, 9, 10, 12)) continue;
    const foes = s.units.filter((o) => o.alive && o.team !== u.team);
    const allies = s.units.filter((o) => o.alive && o.team === u.team);
    if (!foes.length) break;
    // 도발에 걸리면 시전자, 아니면 성격 규칙으로 고른 상대(쓰러졌거나 아직 없으면 가장 가까운 상대)
    const chosen = foes.find((f) => f.id === u.target);
    let near = ((u.taunt?.until??0)>s.t && foes.find(f=>f.id===u.taunt?.from)) || chosen || foes.reduce((a, b) => (dist(u, a) <= dist(u, b) ? a : b));
    // 사용자 지정: 게으름은 항상0.85배, 대담은 항상1.1배. 피격 여부로 행동을 막지 않는다.
    // 원본: 슬로우·저주면 이동 속도 절반, 민첩업이면 ×1.25 (0x2116210). 기본 속도 식은 웹판
    const speed = (40 + Math.min(80, u.stats.spd * 0.4)) * (u.personality === '게으름' ? 0.85 : u.personality === '대담' ? 1.1 : 1)
      * (buffMultiplier(u,'spd',s.t) > 1 ? 1.25 : 1) * (hasStatus(u, s.t, 6, 13) ? 0.5 : 1);
    // 혼란은 아무 데로나 걷고, 공포·소극적은 상대에게서 떨어진다 (행동 결정 0x2118F8C — 동작 세부는 추정)
    if (hasStatus(u, s.t, 5)) { if (u.cd <= 0) { u.cd = 1; u.intent = undefined; } const a = rng() * Math.PI * 2; move(u, u.x + Math.cos(a) * 40, u.y + Math.sin(a) * 40, speed); continue; }
    let d = dist(u, near);

    // 겁쟁이도70px 안의 적에게 맞선다. 성급한은 대기 중에만 치고 빠진다.
    // 용기는 도주를 막는 소유형 SP로 처리한다(효과 해석은 웹판 정책).
    const courage=supportSkills(u.speciesId,u.personality).some(sk=>sk.id===30);
    const coward = !courage && u.personality === '겁쟁이' && foes.length > allies.length;
    if ((coward && d > 70) || (!courage && u.retreat > 0 && u.cd > 0 && d < 110)) {
      move(u,near.x,near.y,speed,true);continue;
    }
    // 원본 AI (overlay19 0x2118F84·0x211919C): 기다림이 끝나면 216 난수와 작전 표로 행동을 정한다.
    if (u.cd <= 0 && !u.intent) {
      const roll = Math.floor(rng() * 216);
      // 공포 중에는 공포용 행동 표(0x21337A0: 필살기 10·지원 ~30, 나머지 이동), 소극적은 공격하지 않는다(추정)
      const action = hasStatus(u, s.t, 2) ? (roll < FORMULA.fearAction[1] ? 'special' : roll < FORMULA.fearAction[4] ? 'support' : 'move')
        : hasStatus(u, s.t, 4) ? 'move'
        : chooseAction(u.mode, roll, u.personality === '쿨' ? 1.6 : u.personality === '솔직' ? 1.2 : 1);
      if (!((u.taunt?.until ?? 0) > s.t)) { near = chooseTarget(u, foes, s.t, rng); u.target = near.id; d = dist(u, near); }
      const wait = thinkSeconds(u.stats.int, buffMultiplier(u, 'spd', s.t) > 1) * (['대담','제멋대로'].includes(u.personality) ? 0.9 : 1);
      if (action === 'special') {
        // 예산 안에서 고를 기술이 없으면 원본처럼 일반 공격으로 넘어간다 (cost < 예산)
        const budget = tpBudget(u.mode, u.maxTp, u.tp, s.t);
        const skill = budget > 0 ? pickBattleSkill(u.speciesId, rng, budget - 1, u.personality) : null;
        u.intent = skill ? { kind: 'special', skill } : { kind: 'basic' };
      } else if (action === 'basic') u.intent = { kind: 'basic' };
      else if (action === 'support' && !(coward && d <= 70) && useSupport(s, u, events)) { u.cd = actionSeconds(null, u.stats.spd) + wait; continue; }
      else u.cd = wait;
    }
    if (!u.intent) {
      // 기다리는 동안은 움직인다. 지원 작전·공포·소극적은 거리를 둔다.
      if (hasStatus(u, s.t, 2, 4)) { if (d < 160) move(u, near.x, near.y, speed, true); }
      else if (u.mode === '지원') { if (d < 110) move(u, near.x, near.y, speed, true); else if (d > 145) move(u, near.x, near.y, speed); }
      else if (d > 42) move(u, near.x, near.y, speed);
      continue;
    }
    const wantsSpecial = u.intent.kind === 'special';
    if (d > (wantsSpecial ? 150 : 42)) { move(u, near.x, near.y, speed); continue; }
    const special = wantsSpecial;
    const skill = u.intent.kind === 'special' && u.intent.skill.tpCost <= u.tp ? u.intent.skill : null;
    u.intent = undefined;
    // 원본 피해 계산: 공격 곡선 값(공격업이면 한 칸 위), 방어 또는 속성 내성(방어업·내성업이면 한 칸 위), 기술 위력
    const element = skill ? battleElement(skill.record) : undefined;
    // 공격업 또는 분노면 공격 곡선 한 칸 위 (0x2118218: 강화 1번 또는 상태 1번)
    const attackUp = buffMultiplier(u, 'atk', s.t) > 1 || hasStatus(u, s.t, 1);
    const attack = u.stats.atk + (attackUp ? curveStep(u.stats.atk, 2) : 0);
    const resistKey = element as ResistKey | undefined;
    const guardBase = resistKey ? near.resist[resistKey] ?? near.stats.def : near.stats.def;
    const guardUp = resistKey ? (near.buffs?.[element!] ?? 0) > s.t : buffMultiplier(near, 'def', s.t) > 1;
    const guard = guardBase + (guardUp ? curveStep(guardBase, resistKey ? 'resist' : 3) : 0);
    const hit = originalDamage(attack, guard, attackPower(skill ? skill.record : basicRecordOf(u.speciesId)), rng, {
      attackerTerrain: terrainOf(u.speciesId, s.field ?? 0), targetTerrain: terrainOf(near.speciesId, s.field ?? 0), critUp: buffMultiplier(u, 'int', s.t) > 1, critLevel: critLevelOf(near.speciesId),
    });
    // 형규가 정한 성격 효과는 원본 피해 위에 그대로 곱한다: 열혈 ×1.2, 제멋대로 ×1.1
    const dmg = hit.damage * (u.personality === '열혈' ? 1.2 : 1) * (u.personality === '제멋대로' ? 1.1 : 1);
    const damage = Math.max(0, Math.round(dmg));
    u.aggro = (u.aggro ?? 1) + (special ? 120 : 60); // 원본 +0x1C 가산 (0x211A3DC +60, 0x211A5B8 +120 — 어느 쪽이 필살기인지는 추정)
    near.hp = Math.max(0, near.hp - damage);
    near.wasHit = true;
    if (skill) u.tp -= skill.tpCost;
    // 행동 시간(민첩) + 다음 행동까지 기다림(지능). 형규가 정한 대담·제멋대로 0.9배 유지
    u.cd = (actionSeconds(skill ? skill.record : basicRecordOf(u.speciesId), u.stats.spd) + thinkSeconds(u.stats.int, buffMultiplier(u, 'spd', s.t) > 1)) * (['대담','제멋대로'].includes(u.personality) ? 0.9 : 1);
    if (u.personality === '성급한') u.retreat = 0.8;
    events.push({ type: 'hit', from: u.id, to: near.id, damage, special, ...(hit.critical ? { critical: true } : {}), ...(skill ? { skill } : {}) });
    // 분노 게이지: 일반 공격에 맞으면 +1, 필살기 +10 (0x21184F0)
    near.rage = (near.rage ?? 0) + (special ? 10 : 1);
    const atkIndex = curveIndexOf(attack, 2);
    const guardIndex = resistKey ? resistIndexOf(guard) : curveIndexOf(guard, 3);
    if (damage <= 0) {
      // 막혔는데 공격 곡선 번호 + 3 ≤ 막는 번호면 공포 (0x211851C — 걸리는 쪽은 공격한 쪽으로 봄, 추정)
      if (atkIndex + 3 <= guardIndex && !u.status) inflictStatus(u, 2, s.t, events);
    } else if (!hit.critical && near.hp > 0) {
      // 필살기의 상태이상 (0x2118AA8): 크리티컬이 아니고 대상이 살아 있을 때, 216분의 표 확률
      const effect = attackEffect(skill?.record);
      const block = EFFECT_BLOCK[effect];
      const blockIndex = block === undefined || block === null ? null : block === 'guard' ? guardIndex : resistIndexOf(near.resist[block]);
      if (Math.floor(rng() * 216) < statusChance(effect, atkIndex, blockIndex)) inflictStatus(near, EFFECT_STATUS[effect], s.t, events);
    }
    if (near.hp <= 0) {
      near.alive = false;
      near.status = undefined;
      events.push({ type: 'ko', id: near.id });
      // 같은 편이 쓰러지면 남은 편의 분노 게이지 +20 (0x2115E6C)
      for (const a of s.units) if (a.alive && a.team === near.team) a.rage = (a.rage ?? 0) + 20;
      reviveSupport(s,near,events);
    }
  }
  const alive = [0, 1].map((t) => s.units.some((u) => u.alive && u.team === t));
  if (!alive[0] || !alive[1]) {
    s.over = true;
    s.winner = alive[0] ? 0 : 1;
    s.reason = 'ko';
  } else if (s.t >= TIME_LIMIT) {
    const ratio = (t: number) => s.units.filter((u) => u.team === t).reduce((a, u) => a + u.hp / u.maxHp, 0);
    s.over = true;
    s.winner = ratio(0) >= ratio(1) ? 0 : 1;
    s.reason = 'timeout';
  }
  return events;
}

export function runBattle(mine: Entrant[], foes: Entrant[], rng: Rng): BattleState {
  const s = createBattle(mine, foes);
  while (!s.over) stepBattle(s, rng);
  return s;
}

/** 배틀 결과를 디지몬에게 반영: 횟수·승수, 피로, 쓰러진 디지몬의 부상 */
/** endHp: 배틀이 끝났을 때 남은 HP. 원본처럼 그대로 현재 HP로 남는다 */
export function applyBattleResult(d: Digimon, won: boolean, ko: boolean, rng: Rng, winter = false, endHp?: number): Digimon {
  // 원작 문장: 알약(프로틴)을 과식하면 부상 위험이 늘어난다. 3개 넘게 먹으면 1개당 +15% (임시)
  const overeat = Math.max(0, (d.protein ?? 0) - PROTEIN_SAFE) * 0.15;
  // 겨울에는 부상 확률이 오른다 (원작 도움말 help #136, 배수 2는 임시)
  const injuryChance = Math.min(1, ((ko ? (d.personality === '대담' ? 0.35 : 0.25) : 0) + overeat) * (winter ? 2 : 1));
  return {
    ...d,
    protein: 0,
    battles: d.battles + 1,
    wins: d.wins + (won ? 1 : 0),
    fatigue: Math.min(100, d.fatigue + 20),
    hunger: Math.max(0, d.hunger - 10),
    injured: d.injured || rng() < injuryChance,
    ...(endHp === undefined ? {} : { hpNow: Math.max(0, Math.min(d.stats.hp, Math.round(endHp))) }),
  };
}
