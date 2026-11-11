import { describe, expect, it } from 'vitest';
import { advance, clean, feed, newMonster, train } from '../src/core/care';
import { findEvolution, evolve, evolutionHints } from '../src/core/evolution';
import { makeOpponent, simulateBattle, type Fighter } from '../src/core/battle';
import { SPECIES, MOVES } from '../src/core/data';
import { seeded } from '../src/core/rng';
import type { Monster } from '../src/core/types';

describe('data integrity', () => {
  it('every evolution target and move exists', () => {
    for (const s of Object.values(SPECIES)) {
      for (const e of s.evolutions) expect(SPECIES[e.to], `${s.id} -> ${e.to}`).toBeDefined();
      for (const m of s.moves) expect(MOVES[m], `${s.id} move ${m}`).toBeDefined();
    }
  });
});

describe('care', () => {
  it('egg hatches into poko after 30 minutes', () => {
    const r = advance(newMonster(), 30, seeded(1));
    expect(r.monster.speciesId).toBe('poko');
    expect(r.events.some((e) => e.type === 'hatched')).toBe(true);
  });

  it('starving for an hour counts a care mistake', () => {
    let m: Monster = { ...advance(newMonster(), 30, seeded(1)).monster, hunger: 0 };
    m = advance(m, 60, seeded(2)).monster;
    expect(m.careMistakes).toBeGreaterThanOrEqual(1);
  });

  it('feeding and cleaning work', () => {
    let m: Monster = { ...advance(newMonster(), 30, seeded(1)).monster, hunger: 20, poop: 2 };
    m = feed(m).monster;
    expect(m.hunger).toBe(50);
    m = clean(m).monster;
    expect(m.poop).toBe(0);
  });

  it('training raises the chosen stat and costs energy', () => {
    const m: Monster = { ...advance(newMonster(), 30, seeded(1)).monster };
    const r = train(m, 'atk', seeded(3));
    expect(r.ok).toBe(true);
    expect(r.monster.stats.atk).toBeGreaterThan(m.stats.atk);
    expect(r.monster.energy).toBe(m.energy - 15);
  });
});

describe('evolution', () => {
  const base = (): Monster => ({ ...newMonster(), speciesId: 'pokorong', stageAge: 360 });

  it('dominant stat decides the rookie branch', () => {
    const m = base();
    expect(findEvolution({ ...m, stats: { hp: 5, atk: 5, def: 5, spd: 5, int: 12 } })).toBe('lumi');
    expect(findEvolution({ ...m, stats: { hp: 5, atk: 5, def: 12, spd: 5, int: 5 } })).toBe('gru');
    expect(findEvolution({ ...m, stats: { hp: 5, atk: 12, def: 5, spd: 5, int: 5 } })).toBe('igni');
  });

  it('bad care leads to mudbug', () => {
    const m: Monster = { ...newMonster(), speciesId: 'igni', stageAge: 1440, careMistakes: 9, stats: { hp: 20, atk: 80, def: 10, spd: 10, int: 10 } };
    expect(findEvolution(m)).toBe('mudbug');
  });

  it('champion waits until requirements are met', () => {
    const m: Monster = { ...newMonster(), speciesId: 'ignis', stageAge: 2880, stats: { hp: 50, atk: 100, def: 40, spd: 40, int: 30 } };
    expect(findEvolution(m)).toBeNull();
    expect(findEvolution({ ...m, stats: { ...m.stats, atk: 160 }, wins: 10 })).toBe('flaredrake');
  });

  it('evolve adds base stats and resets stage age', () => {
    const m: Monster = { ...newMonster(), speciesId: 'pokorong', stageAge: 360, stats: { hp: 5, atk: 5, def: 5, spd: 5, int: 5 } };
    const e = evolve(m, 'igni');
    expect(e.stats.atk).toBe(5 + SPECIES.igni.baseStats.atk);
    expect(e.stageAge).toBe(0);
  });

  it('hints hide undiscovered names', () => {
    const m: Monster = { ...newMonster(), speciesId: 'pokorong' };
    const hints = evolutionHints(m, new Set(['igni']));
    expect(hints.map((h) => h.name)).toEqual(['???', '???', '이그니']);
  });
});

describe('battle', () => {
  const strong: Fighter = { name: 'A', speciesId: 'ignis', stats: { hp: 60, atk: 120, def: 60, spd: 60, int: 40 }, moves: SPECIES.ignis.moves, tactic: 'aggressive' };
  const weak: Fighter = { name: 'B', speciesId: 'igni', stats: { hp: 10, atk: 20, def: 15, spd: 15, int: 10 }, moves: SPECIES.igni.moves, tactic: 'balanced' };

  it('is deterministic for a seed', () => {
    const a = simulateBattle(strong, weak, seeded(42));
    const b = simulateBattle(strong, weak, seeded(42));
    expect(a).toEqual(b);
  });

  it('stronger fighter wins most of the time', () => {
    let wins = 0;
    for (let i = 0; i < 50; i++) if (simulateBattle(strong, weak, seeded(i)).winner === 0) wins++;
    expect(wins).toBeGreaterThan(45);
  });

  it('battles end within the tick limit', () => {
    const r = simulateBattle(makeOpponent('novice', seeded(1)), makeOpponent('novice', seeded(2)), seeded(3));
    expect(r.events.at(-1)?.type).toBe('end');
  });
});
