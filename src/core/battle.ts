import { getSpecies, speciesByStage, typicalStats } from './data';
import { pick, range, type Rng } from './rng';
import { PERSONALITIES, type AttackMode, type SpeciesAttr, type Digimon, type Personality, type Stage, type Stats } from './types';

export const ARENA = { w: 480, h: 250 };
export const TIME_LIMIT = 90;
const DT = 0.1;

/** 웹판 프리 배틀.입문은 사용자 요청으로 유년기Ⅱ 상대를 추가, 상금은 임시30/60비트.
 * 기존 ★1~3의 상대 세대·상금은 유지한다.
 */
export const FREE_BATTLES = [0, 1, 2, 3].flatMap(stars => ([1, 3] as const).map(format => ({
  label: stars === 0 ? '입문' : '★'.repeat(stars),
  format, stage: (stars === 0 ? 2 : 2 + stars) as Stage,
  prize: (stars === 0 ? 30 : 60 * stars) * (format === 3 ? 2 : 1),
})));

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
}

export type BattleEvent =
  | { type: 'hit'; from: number; to: number; damage: number; special: boolean }
  | { type: 'heal'; from: number; to: number; amount: number }
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
        hp: maxHp,
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
    const near = foes.reduce((a, b) => (dist(u, a) <= dist(u, b) ? a : b));
    const speed = 40 + Math.min(80, u.stats.spd * 0.4);
    const d = dist(u, near);

    if (u.personality === '게으름' && !u.wasHit) continue;
    const fleeing = (u.personality === '겁쟁이' && foes.length > allies.length) || u.retreat > 0;

    if (u.mode === '지원') {
      const weak = allies.filter((a) => a.hp / a.maxHp < 0.7).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (weak && u.tp >= 15 && u.cd <= 0) {
        const amount = Math.round(weak.maxHp * 0.12 + u.stats.int * 0.5);
        weak.hp = Math.min(weak.maxHp, weak.hp + amount);
        u.tp -= 15;
        u.cd = 2;
        events.push({ type: 'heal', from: u.id, to: weak.id, amount });
        continue;
      }
      if (d < 130) {
        move(u, near.x, near.y, speed, true);
        if (d > 45) continue;
      } else if (d > 190) {
        move(u, near.x, near.y, speed);
        continue;
      }
    } else if (fleeing && d > 45) {
      move(u, near.x, near.y, speed, true);
      continue;
    }

    // 필살기: 지능이 사용 빈도를 정하고 TP를 쓴다
    const base = Math.min(0.6, 0.1 + u.stats.int / 600);
    const pSpecial = base * (u.mode === '특수' ? 3 : u.mode === '일반' ? 0.4 : 0.3) * (u.personality === '쿨' ? 1.6 : u.personality === '솔직' ? 1.2 : 1);
    const wantsSpecial = u.cd <= 0 && u.tp >= 20 && d <= 150 && rng() < pSpecial;
    if (!wantsSpecial && d > 42) {
      if (u.mode !== '지원') move(u, near.x, near.y, speed);
      continue;
    }
    if (u.cd > 0) continue;

    const special = wantsSpecial;
    const power = special ? (u.stats.atk + u.stats.int) / 2 : u.stats.atk;
    let dmg = (8 + power * 0.9) * (100 / (100 + near.stats.def)) * range(rng, 0.85, 1.15) * attrMult(u.attr, near.attr);
    if (special) dmg *= 2.2;
    if (u.personality === '열혈') dmg *= 1.2;
    if (u.personality === '제멋대로') dmg *= 1.1;
    if (u.mode === '지원') dmg *= 0.6;
    const damage = Math.max(1, Math.round(dmg));
    near.hp = Math.max(0, near.hp - damage);
    near.wasHit = true;
    if (special) u.tp -= 20;
    u.cd = (1.3 - Math.min(0.6, u.stats.spd / 400)) * (u.personality === '제멋대로' ? 0.9 : 1);
    if (u.personality === '성급한') u.retreat = 0.8;
    events.push({ type: 'hit', from: u.id, to: near.id, damage, special });
    if (near.hp <= 0) {
      near.alive = false;
      events.push({ type: 'ko', id: near.id });
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
export function applyBattleResult(d: Digimon, won: boolean, ko: boolean, rng: Rng, winter = false): Digimon {
  // 원작 문장: 알약(프로틴)을 과식하면 부상 위험이 늘어난다. 3개 넘게 먹으면 1개당 +15% (임시)
  const overeat = Math.max(0, (d.protein ?? 0) - PROTEIN_SAFE) * 0.15;
  // 겨울에는 부상 확률이 오른다 (원작 도움말 help #136, 배수 2는 임시)
  const injuryChance = Math.min(1, ((ko ? (d.personality === '대담' ? 0.6 : 0.3) : 0) + overeat) * (winter ? 2 : 1));
  return {
    ...d,
    protein: 0,
    battles: d.battles + 1,
    wins: d.wins + (won ? 1 : 0),
    fatigue: Math.min(100, d.fatigue + 20),
    hunger: Math.max(0, d.hunger - 10),
    injured: d.injured || rng() < injuryChance,
  };
}
