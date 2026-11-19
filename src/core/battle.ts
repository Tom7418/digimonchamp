import { getSpecies, originalSpecies, speciesByStage, STAT_CURVES, typicalStats } from './data';
import { battleSkills, pickBattleSkill, type BattleSkill } from './battle-skills';
import { supportSkills, useSupport, reviveSupport, buffMultiplier, battleElement, type BattleBuff, type SupportSkill } from './support-skills';
import { pick, range, seeded, type Rng } from './rng';
import freeRaw from '../data/free-battles.txt?raw';
import { PERSONALITIES, type AttackMode, type SpeciesAttr, type Digimon, type Personality, type Stage, type Stats } from './types';

export const ARENA = { w: 480, h: 250 };
export const TIME_LIMIT = 90;
const DT = 0.1;

// ---------- 프리 배틀 (원본 대진·상금, tools/extract_free_battles.py → free-battles.txt) ----------
export interface FreeFoe { no: number; nick: string; speciesId: string; level: number; prize: number; curves: number[] }
export interface FreeBattle { label: string; format: 1 | 3; level: number; stage: Stage; foes: FreeFoe[]; prize: number }
export const FREE_FOES = new Map<number, FreeFoe>();
/** 후보표 [레벨 0~9][계절 0~3, 4=공통] (원본 0x020C7E24) */
export const FREE_POOLS: number[][][] = Array.from({ length: 10 }, () => Array.from({ length: 5 }, () => []));
for (const line of freeRaw.split('\n')) {
  if (!line || line.startsWith('#')) continue;
  const f = line.split('|');
  if (f[0] === 'pool') FREE_POOLS[+f[1]][+f[2]] = f[3] ? f[3].split(',').map(Number) : [];
  else FREE_FOES.set(+f[0], { no: +f[0], nick: f[1], speciesId: f[2], level: +f[3], prize: +f[4], curves: (f[5] ?? '').split(',').filter(Boolean).map(Number) });
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
/** 프리 배틀 상대를 배틀 참가자로 만든다. 성격·공격 방식은 웹판 임시(NPC 표의 해당 칸은 미해석) */
export function freeBattleFoes(b: FreeBattle, rng: Rng): Entrant[] {
  return b.foes.map((f) => ({
    speciesId: f.speciesId,
    stats: f.curves.length === 5 ? freeFoeStats(f) : typicalStats(f.speciesId),
    personality: pick(rng, PERSONALITIES),
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
  taunt?: {from:number;until:number};
  revived?: boolean;
}

export type BattleEvent =
  | { type: 'hit'; from: number; to: number; damage: number; special: boolean; skill?: BattleSkill }
  | { type: 'heal'; from: number; to: number; amount: number; support?: SupportSkill }
  | { type: 'support'; from:number; targets:number[]; skill:SupportSkill }
  | { type: 'ko'; id: number };

export interface BattleState {
  units: Unit[];
  t: number;
  over: boolean;
  winner: 0 | 1 | null;
  reason: 'ko' | 'timeout' | null;
}

export interface Entrant {
  uid?: number;
  speciesId: string;
  stats: Stats;
  personality: Personality;
  mode: AttackMode;
  /** 시작 HP. 원본은 배틀을 현재 HP로 시작한다(overlay19 0x21179DC). 없으면 가득 */
  hp?: number;
}

/** 알약(프로틴) 하나당 공격 +15%, 최대 3개분 (임시 값) */
export const PROTEIN_ATK = 0.15;
export const PROTEIN_SAFE = 3;
export const entrantOf = (d: Digimon, mode: AttackMode): Entrant => ({
  uid: d.uid,
  speciesId: d.speciesId,
  stats: d.protein ? { ...d.stats, atk: Math.round(d.stats.atk * (1 + PROTEIN_ATK * Math.min(PROTEIN_SAFE, d.protein))) } : d.stats,
  personality: d.personality,
  mode,
  hp: d.hpNow,
});

export function makeEnemies(stage: Stage, count: number, scale: number, rng: Rng): Entrant[] {
  const pool = speciesByStage(stage);
  return Array.from({ length: count }, () => {
    const sp = pick(rng, pool);
    return {
      speciesId: sp.id,
      stats: typicalStats(sp.id, scale * range(rng, 0.9, 1.1)),
      personality: pick(rng, PERSONALITIES),
      mode: pick(rng, ['일반', '일반', '특수', '지원'] as AttackMode[]),
    };
  });
}

export function createBattle(mine: Entrant[], foes: Entrant[]): BattleState {
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
      });
    });
  place(mine, 0);
  place(foes, 1);
  return { units, t: 0, over: false, winner: null, reason: null };
}

/** 백신 > 바이러스 > 데이터 > 백신 */
function attrMult(a: SpeciesAttr, b: SpeciesAttr) {
  // 프리·없음은 상성이 없다 (임시)
  if (a === '프리' || a === '없음' || b === '프리' || b === '없음') return 1;
  if ((a === '백신' && b === '바이러스') || (a === '바이러스' && b === '데이터') || (a === '데이터' && b === '백신')) return 1.2;
  if (a === b) return 1;
  return 0.9;
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
    u.cd -= DT;
    u.retreat -= DT;
    const foes = s.units.filter((o) => o.alive && o.team !== u.team);
    const allies = s.units.filter((o) => o.alive && o.team === u.team);
    if (!foes.length) break;
    const near = ((u.taunt?.until??0)>s.t && foes.find(f=>f.id===u.taunt?.from)) || foes.reduce((a, b) => (dist(u, a) <= dist(u, b) ? a : b));
    // 사용자 지정: 게으름은 항상0.85배, 대담은 항상1.1배. 피격 여부로 행동을 막지 않는다.
    const speed = (40 + Math.min(80, u.stats.spd * buffMultiplier(u,'spd',s.t) * 0.4)) * (u.personality === '게으름' ? 0.85 : u.personality === '대담' ? 1.1 : 1);
    const d = dist(u, near);

    // 겁쟁이도70px 안의 적에게 맞선다. 성급한은 대기 중에만 치고 빠진다.
    // 용기는 도주를 막는 소유형 SP로 처리한다(효과 해석은 웹판 정책).
    const courage=supportSkills(u.speciesId,u.personality).some(sk=>sk.id===30);
    const coward = !courage && u.personality === '겁쟁이' && foes.length > allies.length;
    if ((coward && d > 70) || (!courage && u.retreat > 0 && u.cd > 0 && d < 110)) {
      move(u,near.x,near.y,speed,true);continue;
    }
    const supportReady=u.cd<=0&&supportSkills(u.speciesId,u.personality).some(sk=>sk.id<28&&sk.tpCost<=u.tp)&&(u.mode==='지원'||rng()<(u.mode==='일반'?.25:.1));
    if(!(coward&&d<=70)&&supportReady&&useSupport(s,u,events))continue;
    if(u.mode==='지원'&&!(coward&&d<=70)&&u.cd>0&&battleSkills(u.speciesId).some(skill=>skill.tpCost<=u.tp)){
      if(d<110)move(u,near.x,near.y,speed,true);
      else if(d>145)move(u,near.x,near.y,speed);
      continue;
    }

    // 빈도·위력·사거리는 웹판 임시 공식. 기술별 동작/소비TP/이름은 원본 표 값.
    const base = Math.min(0.6, 0.1 + u.stats.int * buffMultiplier(u,'int',s.t) / 600);
    const pSpecial = base * (u.mode === '특수' ? 3 : u.mode === '일반' ? 0.4 : 0.3) * (u.personality === '쿨' ? 1.6 : u.personality === '솔직' ? 1.2 : 1);
    const wantsSpecial = u.cd <= 0 && d <= 150 && battleSkills(u.speciesId).some(skill => skill.tpCost <= u.tp) && rng() < pSpecial;
    if (!wantsSpecial && d > 42) {
      // 지원도 특수 공격을 선택하지 못하면 기본 공격 사거리로 직접 접근한다.
      move(u, near.x, near.y, speed);
      continue;
    }
    if (u.cd > 0) continue;

    const special = wantsSpecial;
    const skill = special ? pickBattleSkill(u.speciesId, rng, u.tp, u.personality) : null;
    const attack = u.stats.atk * buffMultiplier(u,'atk',s.t), intelligence=u.stats.int*buffMultiplier(u,'int',s.t);
    const power = special ? (attack + intelligence) / 2 : attack;
    let dmg = (8 + power * 0.9) * (100 / (100 + near.stats.def * buffMultiplier(near,'def',s.t))) * range(rng, 0.85, 1.15) * attrMult(u.attr, near.attr);
    if (special) dmg *= 2.2;
    if (u.personality === '열혈') dmg *= 1.2;
    // 기존 제멋대로 전투 장점은 유지하고, 동거 스트레스는 별도로 추가한다.
    if (u.personality === '제멋대로') dmg *= 1.1;
    const element=skill?battleElement(skill.record):undefined;
    if(element&&(near.buffs?.[element]??0)>s.t)dmg*=.85; // 내성SP 피해 경감15%는 웹판 정책
    if (u.mode === '지원') dmg *= 0.6;
    const damage = Math.max(1, Math.round(dmg));
    near.hp = Math.max(0, near.hp - damage);
    near.wasHit = true;
    if (skill) u.tp -= skill.tpCost;
    u.cd = (1.3 - Math.min(0.6, u.stats.spd * buffMultiplier(u,'spd',s.t) / 400)) * (['대담','제멋대로'].includes(u.personality) ? 0.9 : 1);
    if (u.personality === '성급한') u.retreat = 0.8;
    events.push({ type: 'hit', from: u.id, to: near.id, damage, special, ...(skill ? { skill } : {}) });
    if (near.hp <= 0) {
      near.alive = false;
      events.push({ type: 'ko', id: near.id });
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
