import { describe, expect, it } from 'vitest';
import { advance, capture, feedRotten, freshSave as freshEggSave, newDigimon, setCage, tickFarm } from '../src/core/care';
import { getSpecies, LIFESPAN, parseCond, SPECIES, dateOf, FIELDS } from '../src/core/data';
import { findEvolution, maxStageForRank } from '../src/core/evolution';
import { createBattle, entrantOf, makeEnemies, runBattle, stepBattle } from '../src/core/battle';
import { applyWin, capacityOf, rankName, tamerRank, TITLES, todaysMatches } from '../src/core/titles';
import { seeded } from '../src/core/rng';
import type { Digimon, SaveData } from '../src/core/types';

/** 테스트는 부화한 깜몬에서 시작한다 */
const freshSave = (now: number): SaveData => ({ ...freshEggSave(now), digimon: [newDigimon(1, '깜몬')] });
const only = (s: SaveData): Digimon => s.digimon[0];
const withMon = (s: SaveData, patch: Partial<Digimon>): SaveData => ({ ...s, digimon: [{ ...s.digimon[0], ...patch }] });

describe('data', () => {
  it('parses the evolution table', () => {
    expect(Object.keys(SPECIES).length).toBeGreaterThan(200);
    expect(getSpecies('아구몬').stage).toBe(3);
    expect(getSpecies('아구몬').evos.map((e) => e.to)).toEqual(['지오그레이몬', '그레이몬', '스카몬', '티라노몬']);
    expect(getSpecies('워그레이몬').stage).toBe(6);
    expect(parseCond('용60+배틀14+승률50+에그1')).toEqual({ ap: { 용: 60 }, battles: 14, winRate: 50, eggs: 1 });
  });
  it('every evolution target and habitat exists, and stages go up by one', () => {
    for (const s of Object.values(SPECIES)) for (const e of s.evos) expect(getSpecies(e.to).stage, `${s.id}>${e.to}`).toBe(s.stage + 1);
    for (const f of FIELDS) for (const [name] of f.spawns) expect(getSpecies(name).stage).toBeLessThanOrEqual(2);
  });
  it('calendar', () => {
    expect(dateOf(480)).toMatchObject({ year: 1, seasonName: '봄', day: 1, hour: 8 });
    expect(dateOf(1440 * 25)).toMatchObject({ seasonName: '가을', day: 6 });
  });
});

describe('evolution', () => {
  it('깜몬 evolves by time into 코로몬 at the end of its lifespan', () => {
    const r = advance(withMon(freshSave(0), { hunger: 100 }), LIFESPAN[1], seeded(1));
    expect(only(r.save).speciesId).toBe('코로몬');
  });
  it('AP from a training cage changes the branch', () => {
    // 성격에 따라 훈련 속도가 달라지므로 고정한다
    let s = withMon(freshSave(0), { hunger: 100, personality: '쿨' });
    s = { ...s, cages: [...s.cages, '미니 묘지'] };
    s = setCage(s, 1, '미니 묘지').save;
    const r = advance(s, 8 * 60, seeded(1));
    expect(only(r.save).speciesId).toBe('퍼그몬');
    expect(only(r.save).ap['암흑']).toBeLessThan(20);
  });
  it('battle count evolves 코로몬 into 아구몬, and rank gates the next stage', () => {
    const base = withMon(freshSave(0), { speciesId: '코로몬', battles: 3, stageAge: 600 });
    expect(findEvolution(only(base), 1, 100)).toEqual({ kind: 'evolve', to: '아구몬' });
    const agu = { ...only(base), speciesId: '아구몬', battles: 6, stageAge: 2000 };
    expect(findEvolution(agu, 1, 100)).toEqual({ kind: 'blocked', to: '그레이몬', reason: 'rank' });
    expect(findEvolution(agu, 3, 100)).toEqual({ kind: 'blocked', to: '그레이몬', reason: 'rank' });
    expect(findEvolution(agu, 4, 100)).toEqual({ kind: 'evolve', to: '그레이몬' });
    expect(findEvolution(agu, 4, 2)).toEqual({ kind: 'blocked', to: '그레이몬', reason: 'capacity' });
    expect(maxStageForRank(8)).toBe(6);
  });
  it('rotten meat causes sickness and a penalty', () => {
    let s = { ...freshSave(0), rotten: 2 };
    s = feedRotten(s, 1).save;
    s = feedRotten(s, 1).save;
    expect(only(s).sick).toBe(true);
    expect(only(s).penalties).toBe(1);
  });
  it('a final-stage Digimon reverts to an egg and hatches as its origin baby', () => {
    let s = withMon(freshSave(0), { speciesId: '워그레이몬', stageAge: LIFESPAN[6] - 1, hunger: 100 });
    s = tickFarm(s, seeded(1)).save;
    expect(only(s).isEgg).toBe(true);
    expect(only(s).eggs).toBe(1);
    s = advance(s, 30, seeded(1)).save;
    expect(only(s).speciesId).toBe('깜몬');
  });
  it('the last Digimon is never lost', () => {
    const s = withMon(freshSave(0), { speciesId: '아구몬', stageAge: LIFESPAN[3] + 1439, hunger: 100, battles: 0 });
    const r = tickFarm(s, seeded(1));
    expect(r.save.digimon.length).toBe(1);
  });
});

describe('battle', () => {
  it('is deterministic and ends', () => {
    const run = () => runBattle(makeEnemies(3, 3, 1, seeded(1)), makeEnemies(3, 3, 1, seeded(2)), seeded(3));
    const a = run();
    expect(a.over).toBe(true);
    expect(run().units.map((u) => u.hp)).toEqual(a.units.map((u) => u.hp));
  });
  it('a higher stage team wins', () => {
    let wins = 0;
    for (let i = 0; i < 20; i++) if (runBattle(makeEnemies(5, 3, 1, seeded(i)), makeEnemies(3, 3, 1, seeded(i + 99)), seeded(i)).winner === 0) wins++;
    expect(wins).toBe(20);
  });
  it('special mode spends TP', () => {
    const d = { ...only(freshSave(0)), speciesId: '그레이몬', personality: '쿨' as const };
    d.stats = { hp: 200, tp: 100, atk: 80, def: 60, int: 200, spd: 60 };
    const s = createBattle([entrantOf(d, '특수')], makeEnemies(4, 1, 1, seeded(5)));
    const rng = seeded(7);
    for (let i = 0; i < 300 && !s.over; i++) stepBattle(s, rng);
    expect(s.units[0].tp).toBeLessThan(s.units[0].maxTp);
  });
});

describe('titles and hunting', () => {
  it('winning titles raises tamer rank', () => {
    let s = freshSave(0);
    expect(tamerRank(s)).toBe(1);
    s = applyWin(s, TITLES[0]);
    expect(tamerRank(s)).toBe(2);
    expect(s.bits).toBe(1500);
    s = applyWin(applyWin(s, TITLES[1]), TITLES[2]);
    expect(rankName(tamerRank(s))).toBe('레드 테이머');
    expect(capacityOf(s)).toBe(96);
  });
  it('a new game starts from a digi-egg that hatches into 깜몬', () => {
    const s = freshEggSave(0);
    expect(s.digimon[0].isEgg).toBe(true);
    expect(advance(s, 30, seeded(1)).save.digimon[0]).toMatchObject({ isEgg: false, speciesId: '깜몬' });
  });
  it('title matches appear on their day before 15:00', () => {
    const s = { ...freshSave(0), clock: 1440 * 2 + 9 * 60 };
    expect(todaysMatches(s).map((m) => m.name)).toEqual(['에이스 오브 링']);
    expect(todaysMatches({ ...s, clock: s.clock + 7 * 60 })).toEqual([]);
  });
  it('capture respects capacity', () => {
    const s = freshSave(0);
    const r = capture(s, '포요몬', seeded(1));
    expect(r.save.digimon.length).toBe(2);
    const full = { ...s, digimon: Array.from({ length: 8 }, (_, i) => ({ ...s.digimon[0], uid: i + 1 })) };
    expect(capture(full, '포요몬', seeded(1)).ok).toBe(false);
  });
});
