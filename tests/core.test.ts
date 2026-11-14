import { evolvedStats, rebirthPercent, upgradeStats } from '../src/core/stats';
import { describe, expect, it } from 'vitest';
import { applyTraining, trainingBounds, trainingDelta } from '../src/core/training';
import { advance, advanceOffline, nextMorningClock, capture, cleanOne, endDay, isSleeping, isNight, feedRotten, freshSave as freshEggSave, newDigimon, setCage, tickFarm, shopItems, upgradeSave, poopInterval, cure, treat, STRESS, pet, PET } from '../src/core/care';
import { CAGES, getCage, getSpecies, originalSpecies, initialStats, statBounds, MINUTES_PER_SECOND, LIFESPAN, parseCond, SPECIES, speciesByStage, typicalStats, dateOf, FIELDS } from '../src/core/data';
import { findEvolution, maxStageForRank } from '../src/core/evolution';
import { applyBattleResult, FREE_BATTLES, createBattle, entrantOf, makeEnemies, runBattle, stepBattle } from '../src/core/battle';
import { applyMatch, applyWin, capacityOf, rankName, tamerRank, TITLES, todaysMatches, upcoming, matchEntryNotice } from '../src/core/titles';
import { seeded } from '../src/core/rng';
import { canHuntNow, huntFields, huntPool, pickWild, ropeBreakChance, ropeDamage, ropeFor, ROPES, wildHp, SHOTS, shotOf, shotStun, shotDamage, useGear, gearCount, BAITS, GEARS, gearOf, gearDamage } from '../src/core/hunt';
import type { Digimon, SaveData, Stage } from '../src/core/types';
import { discardFloorFood, ageFloorFood, SPOIL_MINUTES, biteFloorFood, availableFood, restoreFloorFood, feedFromTray, eatFloorFood, type FloorFood } from '../src/core/food';

describe('floor food reservations', () => {
  it('restores food in the expanded farm without clipping to the old viewport', () => {
    const s = freshSave(0);
    const bounds = { x0: 90, x1: 1800, y0: 130, y1: 1110 };
    const foods = [{ kind: 'meat', x: 1450, y: 900 }];
    const restored = restoreFloorFood(s, foods, bounds);
    expect(restored).toEqual(foods);
    expect(restoreFloorFood(s, JSON.parse(JSON.stringify(restored)), bounds)).toEqual(foods);
  });
  it('먹이 청소는 남은 양과 관계없이 해당 재고 한 개만 폐기하고 육성 상태는 바꾸지 않는다', () => {
    for (const [kind,key] of [['meat','meat'],['pill','pills'],['rotten','rotten']] as const) {
      const s={...freshSave(0),meat:2,pills:2,rotten:2};
      const r=discardFloorFood(s,[{kind,x:200,y:300,remaining:5}],0);
      expect(r.ok).toBe(true);expect(r.foods).toEqual([]);expect(r.save[key]).toBe(1);
      expect(r.save.digimon).toBe(s.digimon);
      expect(discardFloorFood(r.save,r.foods,0)).toMatchObject({ok:false,save:r.save});
    }
  });
  it('청소 중 재접속한 먹이는 청소 표시 없이 복원하여 다시 치울 수 있다', () => {
    const foods=[{kind:'meat',x:200,y:300,sweeping:true,remaining:25}];
    expect(restoreFloorFood(freshSave(0),foods)).toEqual([{kind:'meat',x:200,y:300,remaining:25}]);
  });
  const foods: FloorFood[] = [{ kind: 'meat', x: 200, y: 300 }];
  it('direct feeding cannot consume the last meat reserved on the floor', () => {
    const s = { ...freshSave(0), meat: 1 };
    expect(availableFood(s, foods, 'meat')).toBe(0);
    expect(feedFromTray(s, foods, 1, 'meat')).toMatchObject({ ok: false, save: s });
    const r = eatFloorFood(s, foods, 1, 0);
    expect(r.ok).toBe(true);
    expect(r.save.meat).toBe(0);
    expect(r.foods).toHaveLength(0);
    expect(eatFloorFood(r.save, r.foods, 1, 0).ok).toBe(false);
  });
  it('direct feeding and floor feeding each consume exactly one item', () => {
    const s = { ...freshSave(0), meat: 2, digimon: [{ ...newDigimon(1, '깜몬'), hunger: 0 }] };
    const direct = feedFromTray(s, foods, 1, 'meat');
    expect(direct.ok).toBe(true);
    expect(availableFood(direct.save, foods, 'meat')).toBe(0);
    const floor = eatFloorFood(direct.save, foods, 1, 0);
    expect(floor.save.meat).toBe(0);
    expect(floor.save.digimon[0].hunger).toBe(70);
    expect(s.meat).toBe(2);
    expect(foods).toHaveLength(1);
  });
  it('refused food stays on the floor without spending inventory', () => {
    const base = freshSave(0);
    for (const patch of [{ hunger: 100 }, { isEgg: true }]) {
      const s = { ...base, digimon: [{ ...base.digimon[0], ...patch }] };
      const r = eatFloorFood(s, foods, 1, 0);
      expect(r.ok).toBe(false);
      expect(r.save).toBe(s);
      expect(r.foods).toBe(foods);
    }
    const s = { ...base, rotten: 1, digimon: [{ ...base.digimon[0], sick: true }] };
    const rotten: FloorFood[] = [{ kind: 'rotten', x: 200, y: 300 }];
    expect(eatFloorFood(s, rotten, 1, 0)).toMatchObject({ ok: false, foods: rotten, save: s });
  });
  it('rotten food reservations are independent of meat and retain illness rules', () => {
    const s = { ...freshSave(0), rotten: 2 };
    const rotten: FloorFood[] = [{ kind: 'rotten', x: 200, y: 300 }];
    const direct = feedFromTray(s, rotten, 1, 'rotten');
    expect(feedFromTray(direct.save, rotten, 1, 'rotten').ok).toBe(false);
    const r = eatFloorFood(direct.save, rotten, 1, 0);
    expect(r.save.rotten).toBe(0);
    expect(r.save.digimon[0]).toMatchObject({ sick: true, penalties: 1 });
    expect(r.save.meat).toBe(s.meat);
  });
  it('old saves keep valid reservations and repair excess or invalid entries once', () => {
    const s = { ...freshSave(0), meat: 1, rotten: 0, pills: 0 };
    const restored = restoreFloorFood(s, [...foods, ...foods, null, { kind: 'pill', x: 1, y: 1 }, { kind: 'rotten', x: 200, y: 300 }]);
    expect(restored).toEqual(foods);
    expect(restoreFloorFood(s, JSON.parse(JSON.stringify(restored)))).toEqual(restored);
    expect(restoreFloorFood(s, null)).toEqual([]);
  });
});

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
    for (const f of FIELDS) for (const [name] of f.spawns) expect(SPECIES[name], `${f.id}:${name}`).toBeDefined();
  });
  it('calendar', () => {
    expect(dateOf(480)).toMatchObject({ year: 1, seasonName: '봄', day: 1, hour: 8 });
    expect(dateOf(1440 * 20)).toMatchObject({ seasonName: '가을', day: 5 }); // 계절 8일
  });
});

describe('evolution', () => {
  it('깜몬 evolves by time into 코로몬 at the end of its lifespan', () => {
    const r = advance(withMon(freshSave(0), { hunger: 100 }), LIFESPAN[1], seeded(1));
    expect(only(r.save).speciesId).toBe('코로몬');
  });
  it('AP from a training cage changes the branch', () => {
    // 시설 결과·변동을 고정하여 진화 분기를 확인한다
    let s = withMon(freshSave(0), { hunger: 100, personality: '쿨' });
    s = { ...s, cages: [...s.cages, '묘지'] };
    // 묘지 기본 결과는 암흑+5에 변동 -1. 재배치 여섯 번으로20을 넘긴다.
    for (let i = 0; i < 6; i++) {
      s = setCage(s, 1, '묘지').save;
      s = advance(s, 20, () => 0.5).save;
      if (i === 0) expect(only(advance(s, 60, () => 0.5).save).ap['암흑']).toBe(4); // 그대로 두면 더 훈련하지 않는다
      s = setCage(s, 1, '기본 케이지').save;
      s = advance(s, 1, () => 0.5).save;
    }
    const r = advance(s, 8 * 60, () => 0.5);
    expect(only(r.save).speciesId).toBe('퍼그몬');
    expect(only(r.save).ap['암흑']).toBeLessThan(20);
  });
  it('원작 케이지: 큰 시설은 미니보다 많이 오르고, 목장은 먹이·똥을 알아서 처리, 링은 배틀 수를 올린다', () => {
    const train = (cage: string) => {
      let s = withMon(freshSave(0), { hunger: 100, personality: '쿨' });
      s = { ...s, cages: [...s.cages, cage] };
      s = setCage(s, 1, cage).save;
      return only(advance(s, 20, seeded(1)).save);
    };
    expect(train('미니 화산').ap['용']).toBe(3);
    expect(train('화산').ap['용']).toBe(5);
    expect(train('링').battles).toBe(1);
    let s = withMon(freshSave(0), { hunger: 55 });
    s = { ...s, cages: [...s.cages, '목장'] };
    s = setCage(s, 1, '목장').save;
    const r = advance(s, 8 * 60, seeded(1));
    expect(only(r.save).hunger).toBeGreaterThan(50);
    expect(only(r.save).poop).toBe(0);
    expect(CAGES.filter((c) => c.no > 0).length).toBe(38);
    // 동물원·목장은 온천·양호실보다 약한 쉬는 시설: 스트레스 시간당 -3 (쉬는 시설 -5, 그 밖 -1)
    const relief = (cage: string) => {
      let z = withMon(freshSave(0), { hunger: 100, stress: 50 });
      z = { ...z, cages: [...z.cages, cage] };
      z = setCage(z, 1, cage).save;
      return only(advance(z, 120, seeded(1)).save).stress;
    };
    expect(relief('온천')).toBe(40);
    expect(relief('목장')).toBe(44);
    expect(relief('절')).toBeGreaterThan(44);
    expect(getCage('경기장').capacity).toBe(10);
  });
  it('계절: 여름은 훈련 효과가 높고, 겨울은 훈련 부상이 잦다', () => {
    const train = (clock: number, rng = seeded(1)) => {
      let s = withMon({ ...freshSave(0), clock }, { hunger: 100, personality: '쿨' });
      s = { ...s, cages: [...s.cages, '미니 화산'] };
      s = setCage(s, 1, '미니 화산').save;
      return advance(s, 20, rng);
    };
    const day = 1440, noon = 12 * 60;
    expect(only(train(noon).save).ap['용']).toBe(3); // 봄
    expect(only(train(8 * day + noon).save).ap['용']).toBe(5); // 여름: 원본 가산+2
    const injuries = (clock: number) => Array.from({ length: 300 }, (_, i) => only(train(clock, seeded(i + 1)).save).injured).filter(Boolean).length;
    const spring = injuries(noon), winter = injuries(24 * day + noon);
    expect(spring).toBeGreaterThan(0);
    expect(winter).toBeGreaterThan(spring);
  });
  it('쓰다듬으면 스트레스가 조금 풀리고, 게임 1시간 안에는 다시 풀리지 않는다', () => {
    const s = withMon(freshSave(0), { stress: 50 });
    const a = pet(s, 1);
    expect(only(a.save).stress).toBe(50 - PET.relief);
    expect(only(pet(a.save, 1).save).stress).toBe(50 - PET.relief);
    expect(only(pet({ ...a.save, clock: a.save.clock + PET.cooldown }, 1).save).stress).toBe(50 - 2 * PET.relief);
    expect(pet(withMon(s, { isEgg: true }), 1).ok).toBe(false);
  });
  it('바닥에 오래 둔 고기·프로틴은 상한 먹이가 된다', () => {
    const s = { ...freshSave(0), meat: 2, pills: 1, rotten: 0 };
    const foods: FloorFood[] = [{ kind: 'meat', x: 1, y: 1, remaining: 40 }, { kind: 'pill', x: 2, y: 2 }];
    const early = ageFloorFood(s, foods, SPOIL_MINUTES - 1);
    expect(early.spoiled).toBe(0);
    const late = ageFloorFood(early.save, early.foods, 1);
    expect(late.foods.map((f) => f.kind)).toEqual(['rotten', 'rotten']);
    expect(late.save).toMatchObject({ meat: 1, pills: 0, rotten: 2 });
    expect(restoreFloorFood(early.save, JSON.parse(JSON.stringify(early.foods)))[0].age).toBe(SPOIL_MINUTES - 1);
  });
  it('먹이가 상하거나 저장을 복원해도 케이지 소속과 내부 좌표를 보존한다', () => {
    const s = { ...freshSave(0), meat: 1, rotten: 0 };
    const food: FloorFood = {kind:'meat', x:200, y:300, remaining:40, cageId:'clinic', cagePosition:{id:'clinic',x:25,y:-10}};
    const spoiled = ageFloorFood(s, [food], SPOIL_MINUTES);
    expect(spoiled.foods[0]).toEqual({...food, kind:'rotten', remaining:undefined});
    const restored = restoreFloorFood(spoiled.save, JSON.parse(JSON.stringify(spoiled.foods)));
    expect(restored).toEqual(spoiled.foods);
    const invalid = restoreFloorFood(spoiled.save,[{...spoiled.foods[0],cagePosition:{id:'clinic',x:NaN,y:0}}]);
    expect(invalid[0].cagePosition).toBeUndefined();
  });
  it('예전 임시 케이지 이름은 원작 이름으로 옮겨진다', () => {
    const old = withMon(freshSave(0), { cage: '미니 수영장' });
    const s = upgradeSave({ ...old, cages: [...old.cages, '미니 수영장', '백신 연구실', '미니 묘지'] });
    expect(s.cages).toEqual(expect.arrayContaining(['미니 해변', '병원', '묘지']));
    expect(s.cages).not.toContain('미니 수영장');
    expect(only(s).cage).toBe('미니 해변');
  });
  it('battle count evolves 코로몬 into 아구몬, and rank gates the next stage', () => {
    const base = withMon(freshSave(0), { speciesId: '코로몬', battles: 3, stageAge: 1200 });
    expect(findEvolution(only(base), 1, 100)).toEqual({ kind: 'evolve', to: '아구몬' });
    const agu = { ...only(base), speciesId: '아구몬', battles: 6, stageAge: 2400 };
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

describe('hunting', () => {
  const field = (id: string) => FIELDS.find((f) => f.id === id)!;
  const at = (season: number, hour: number) => (season * 8 * 1440) + hour * 60; // 그 계절 1일
  it('16 hunting fields, each with someone to catch in some season', () => {
    expect(FIELDS.map((f) => f.id)).toEqual(
      expect.arrayContaining(['파도치는 해변', '바위산', '오아시스', '암반 계곡', '크롬 광산', '기계 공장', '잉카 유적']),
    );
    expect(FIELDS).toHaveLength(16);
    for (const f of FIELDS) expect([0, 1, 2, 3].some((s) => huntPool(f, at(s, 10)).babies.length + huntPool(f, at(s, 10)).rookies.length > 0), f.id).toBe(true);
  });
  it('spring pool on 다이나 초원 follows the wiki habitat table by stage', () => {
    const { babies, rookies, strong } = huntPool(field('다이나 초원'), at(0, 10));
    expect(babies).toEqual(expect.arrayContaining(['뿔몬', '새싹몬']));
    expect(rookies).toEqual(expect.arrayContaining(['가오몬', '에렉몬']));
    expect(babies).not.toContain('뽀글몬'); // 가을·겨울에만 나온다
    expect(strong).toEqual([]);
    expect([...babies, ...rookies]).toContain(pickWild(field('다이나 초원'), at(0, 10), seeded(3)));
  });
  it('beach has strong digimon that need the 완전체 로프', () => {
    const p = huntPool(field('파도치는 해변'), at(3, 10));
    expect(p.babies).toContain('둥실몬');
    expect(p.strong).toEqual(expect.arrayContaining(['고래몬']));
    expect(getSpecies('고래몬').stage).toBe(5);
    expect(ropeDamage({ rope: 'clone3' }, '고래몬')).toBe(0);
    expect(ropeDamage({ rope: 'ultima1' }, '고래몬')).toBe(1);
    expect(ropeFor('고래몬')?.name).toBe('알테마 로프');
    expect(ropeFor('워그레이몬')).toBeNull(); // 궁극체는 못 잡는다
  });
  it('rope shop opens each family (α·β·γ) by tamer rank, durability from the original text', () => {
    const base = { ...freshSave(0), bits: 99999 };
    const ropes = (s: typeof base) => shopItems(s).filter((i) => i.id.startsWith('rope:')).map((i) => i.id.slice(5));
    expect(ropes(base)).toEqual(['digi2', 'digi3']);
    expect(ropes({ ...base, titles: ['t1'] })).toEqual(['digi2', 'digi3', 'hard1', 'hard2', 'hard3']);
    expect(ropes({ ...base, titles: ['t1', 't2', 't3', 't4', 't5'] })).toHaveLength(11);
    expect(ROPES.map((r) => r.durability)).toEqual([10, 15, 20, 32, 44, 56, 60, 80, 100, 150, 150, 250]);
    // 사면 가장 좋은 로프를 든다
    const item = shopItems({ ...base, titles: ['t1'] }).find((i) => i.id === 'rope:hard2')!;
    expect(item.apply(base).rope).toBe('hard2');
  });
  it('stronger rope breaks less often', () => {
    expect(ropeBreakChance({ rope: 'digi1' }, '뿔몬')).toBeGreaterThan(ropeBreakChance({ rope: 'digi3' }, '뿔몬'));
    expect(ropeBreakChance({ rope: 'ultima3' }, '고래몬')).toBeLessThan(ropeBreakChance({ rope: 'ultima1' }, '고래몬'));
  });
  it('memory card limits what one hunt can bring back', () => {
    const s = freshSave(0);
    expect(s.memoryCard).toBe(32);
    const size = getSpecies('뿔몬').size;
    expect(capture(s, '뿔몬', seeded(1), 32 - size + 1).ok).toBe(false);
    expect(capture(s, '뿔몬', seeded(1), 0).ok).toBe(true);
  });
  it('old saves with ropeLevel are upgraded to the rope list', () => {
    const old = { ...freshSave(0), ropeLevel: 2, ropes: undefined, rope: undefined, memoryCard: undefined } as unknown as SaveData;
    const s = upgradeSave(old);
    expect(s.ropes).toEqual(['digi1', 'hard1']);
    expect(s.rope).toBe('hard1');
    expect(s.memoryCard).toBe(32);
    expect('ropeLevel' in s).toBe(false);
  });
  it('night-only and rare spawns', () => {
    expect(huntPool(field('잉카 유적'), at(2, 10)).babies).not.toContain('유라몬');
    const night = huntPool(field('잉카 유적'), at(2, 19));
    expect(night.babies).toEqual(expect.arrayContaining(['유라몬', '푸치몬']));
    expect(night.rare).toEqual(['푸치몬']);
    expect(huntPool(field('잉카 유적'), at(2, 19)).rookies).not.toContain('코로나몬'); // 가을 낮에만
  });
  it('a field with nobody this season is closed, and 잉카 유적 waits for the championship', () => {
    const s = { ...freshSave(0), clock: at(0, 10) };
    expect(pickWild(field('눈의 왕국'), at(0, 10), seeded(1))).not.toBeNull();
    const ruins = huntFields(s).find((f) => f.id === '잉카 유적')!;
    expect(ruins.open).toBe(false);
    expect(ruins.reason).toContain('챔피언십');
  });
  it('rookies need the 성장기 로프', () => {
    expect(wildHp('뿔몬')).toBe(2);
    expect(ropeDamage({ rope: 'digi1' }, '뿔몬')).toBe(1);
    expect(ropeDamage({ rope: 'digi3' }, '파피몬')).toBe(0);
    expect(ropeDamage({ rope: 'hard1' }, '파피몬')).toBe(1);
  });
  it('no hunting after 22:00', () => {
    const s = freshSave(0);
    expect(canHuntNow({ ...s, clock: 10 * 60 }).ok).toBe(true);
    expect(canHuntNow({ ...s, clock: 22 * 60 + 5 }).ok).toBe(false);
  });
});

describe('원본 속성·종족', () => {
  it('속성과 종족은 원본 실행 코드의 표를 따른다', () => {
    expect(getSpecies('피요몬')).toMatchObject({ attr: '백신', family: '새' });
    expect(getSpecies('토이아구몬')).toMatchObject({ attr: '백신', family: '기계' });
    expect(getSpecies('아구몬')).toMatchObject({ attr: '백신', family: '용' });
    expect(getSpecies('가루몬(흑)').attr).toBe('바이러스');
    expect(originalSpecies('코로몬')!.attr).toBe('없음');
    expect(originalSpecies('아르마몬')!.attr).toBe('프리');
  });
  it('원본이 프리·없음인 종만 디지몬 API 값으로 보완한다', () => {
    expect(getSpecies('코로몬').attr).toBe('데이터');
    expect(getSpecies('퍼그몬').attr).toBe('바이러스');
    expect(getSpecies('아르마몬').attr).toBe('백신');
    expect(getSpecies('파닥몬').attr).toBe('데이터'); // API는 데이터·백신 둘 다, 공식 도감은 데이터
    expect(getSpecies('바이킹몬').attr).toBe('프리'); // API에 데이터·백신이 함께 있어 정할 수 없다
    expect(getSpecies('산몬').attr).toBe('없음'); // API 값이 비어 있다
    expect(getSpecies('즈루몬').attr).toBe('프리');
    expect(getSpecies('피요몬').attr).toBe('백신'); // 원본에 값이 있으면 건드리지 않는다
  });
  it('용량·세대 지속 시간·능력치 성향은 원본 표 값을 쓴다', () => {
    expect([1, 2, 3, 4, 5, 6].map((s) => speciesByStage(s as Stage)[0].size)).toEqual([6, 8, 10, 14, 18, 24]);
    expect(LIFESPAN).toEqual({ 1: 1440, 2: 5760, 3: 11520, 4: 17280, 5: 24480, 6: 30240 });
    // 세대 안에서는 모든 종의 지속 시간이 같다
    for (const sp of Object.values(SPECIES)) expect(originalSpecies(sp.id)!.life).toBe(LIFESPAN[sp.stage]);
    // 피요몬은 민첩이 높고(4,5,4,4,5,6), 아르마몬은 방어가 높고 민첩이 낮다(5,5,5,6,5,4)
    const piyo = typicalStats('피요몬'), arma = typicalStats('아르마몬');
    // HP는 공격·민첩과 단위가 다르다. 같은 종류의 능력치끼리 종별 성향을 비교한다.
    expect(piyo.spd).toBeGreaterThan(arma.spd);
    expect(arma.def).toBeGreaterThan(arma.spd);
  });
  it('진화표의 모든 종이 원본 표에 있고 세대가 같다', () => {
    const missing = Object.values(SPECIES).filter((sp) => !originalSpecies(sp.id)).map((sp) => sp.id);
    expect(missing).toEqual([]);
    const wrong = Object.values(SPECIES).filter((sp) => originalSpecies(sp.id)!.stage !== sp.stage).map((sp) => sp.id);
    expect(wrong).toEqual([]);
  });
});

describe('사냥 장비', () => {
  it('샷 12종: 원작 이름·위력, 수면·마비는 더 오래 멈춘다', () => {
    expect(SHOTS.map((s) => s.name)).toEqual(['핸드 건α', '핸드 건β', '래피드 건α', '래피드 건β', '슬립 라이플α', '슬립 라이플β', '스턴 라이플α', '스턴 라이플β', '샷 건α', '샷 건β', '스턴 샷α', '스턴 샷β']);
    expect(shotOf('hand2')!.power).toBe(20);
    expect(shotStun(shotOf('sleep1')!)).toBeGreaterThan(shotStun(shotOf('stun1')!));
    expect(shotStun(shotOf('stun1')!)).toBeGreaterThan(shotStun(shotOf('hand1')!));
    expect(shotDamage(shotOf('hand1')!, 3)).toBe(0);
    expect(shotDamage(shotOf('hand2')!, 3)).toBe(1);
    expect(shotDamage(shotOf('hand2')!, 1)).toBe(0); // 샷만으로는 잡히지 않는다
    expect(BAITS[1].range).toBe(BAITS[0].range * 2);
  });
  it('나머지 장비 19종: 원작 이름·길이·위력, 위력 20당 HP 1이고 HP 1은 남긴다', () => {
    expect(GEARS.length).toBe(19);
    expect(gearOf('spark2')).toMatchObject({ name: '스파크 와이어β', length: 48, power: 20 });
    expect(gearOf('mine2')!.power).toBe(70);
    expect(gearOf('light1')!.nightOnly).toBe(true);
    expect(gearDamage(40, 5)).toBe(2);
    expect(gearDamage(70, 5)).toBe(3);
    expect(gearDamage(70, 2)).toBe(1);
    expect(gearDamage(10, 5)).toBe(0);
    expect(shopItems({ ...freshSave(0), bits: 99999, titles: ['t1', 't2'] }).some((i) => i.id === 'gear:bomb1')).toBe(true);
  });
  it('장비는 쓸 때마다 줄고, 상점에서 묶음으로 산다. 예전 저장에는 빈 장비 칸이 생긴다', () => {
    const s = freshSave(0);
    expect(gearCount(s, 'hand1')).toBe(10);
    expect(gearCount(useGear(s, 'hand1')!, 'hand1')).toBe(9);
    expect(useGear(s, 'stun2')).toBeNull();
    const item = shopItems({ ...s, bits: 9999 }).find((i) => i.id === 'gear:hand1')!;
    expect(gearCount(item.apply(s), 'hand1')).toBe(20);
    const old = { ...s } as SaveData;
    delete old.gear;
    expect(upgradeSave(old).gear).toEqual({});
  });
});

describe('illness', () => {
  it('병을 이틀 방치하면 로스트되고, 배틀 10회 이상이면 디지에그로 다시 태어난다', () => {
    const base = freshSave(0);
    const mon = (patch: Partial<Digimon>) => ({ ...newDigimon(1, '깜몬'), hunger: 100, sick: true, ...patch });
    const run = (first: Digimon, alone = false) => advance({ ...base, digimon: alone ? [first] : [first, newDigimon(2, '깜몬')], nextUid: 3 }, 2880, seeded(1));
    const lost = run(mon({}));
    expect(lost.save.digimon.some((x) => x.uid === 1)).toBe(false);
    expect(lost.events.some((e) => e.type === 'lost' && e.reason === '병·부상 방치')).toBe(true);
    const reborn = run(mon({ battles: 10, eggs: 1 }));
    const d = reborn.save.digimon.find((x) => x.uid === 1)!;
    expect(d.isEgg).toBe(true);
    expect(d.sick).toBe(false);
    expect(d.eggs).toBe(1); // 병으로 죽은 것은 디지에그화 횟수로 세지 않는다
    expect(reborn.events.some((e) => e.type === 'egg' && e.reason === 'sick')).toBe(true);
    // 마지막 한 마리는 디지에그로 남는다
    expect(run(mon({}), true).save.digimon[0].isEgg).toBe(true);
  });
});

describe('championship', () => {
  // y년차 가을 d일 09:00
  const at = (y: number, d: number) => (((y - 1) * 32 + 16 + (d - 1)) * 1440) + 9 * 60;
  const red = (clock: number): SaveData => ({ ...freshSave(0), clock, titles: ['t1', 't2', 't3'] });

  it('prelims need 레드 테이머 and run one match a day on autumn days 1-5', () => {
    expect(todaysMatches({ ...red(at(1, 1)), titles: ['t1'] }).map((m) => m.id)).not.toContain('prelim');
    let s = red(at(1, 1));
    const m = todaysMatches(s).find((x) => x.id === 'prelim')!;
    expect(m.name).toBe('챔피언십 예선 1전');
    s = applyMatch(s, m, true);
    expect(todaysMatches(s).some((x) => x.id === 'prelim')).toBe(false); // 하루 한 경기
    s = applyMatch({ ...s, clock: at(1, 2) }, m, true);
    s = applyMatch({ ...s, clock: at(1, 3) }, m, true);
    expect(s.qualifiedYear).toBe(1);
    expect(todaysMatches({ ...s, clock: at(1, 4) }).some((x) => x.id === 'prelim')).toBe(false);
  });

  it('three prelim losses end this year', () => {
    let s = red(at(1, 1));
    for (const d of [1, 2, 3]) s = applyMatch({ ...s, clock: at(1, d) }, todaysMatches({ ...s, clock: at(1, d) }).find((x) => x.id === 'prelim')!, false);
    expect(todaysMatches({ ...s, clock: at(1, 4) }).some((x) => x.id === 'prelim')).toBe(false);
    expect(todaysMatches({ ...s, clock: at(2, 1) }).some((x) => x.id === 'prelim')).toBe(true); // 다음 해 다시
  });

  it('finals next year: 8강 → 4강 → 결승, win all to become champion', () => {
    let s: SaveData = { ...red(at(2, 5)), qualifiedYear: 1 };
    expect(todaysMatches({ ...s, clock: at(1, 5) }).some((x) => x.id === 'final')).toBe(false);
    for (const name of ['챔피언십 본선 8강', '챔피언십 본선 4강', '챔피언십 결승']) {
      const m = todaysMatches(s).find((x) => x.id === 'final')!;
      expect(m.name).toBe(name);
      s = applyMatch(s, m, true);
    }
    expect(s.champion).toBe(true);
    expect(tamerRank(s)).toBe(9);
    expect(upcoming(s).some((l) => l.includes('챔피언십'))).toBe(false);
  });

  it('losing in the finals means qualifying again', () => {
    let s: SaveData = { ...red(at(2, 5)), qualifiedYear: 1 };
    s = applyMatch(s, todaysMatches(s).find((x) => x.id === 'final')!, false);
    expect(s.qualifiedYear).toBeNull();
    expect(todaysMatches(s).some((x) => x.id === 'final')).toBe(false);
  });
});

describe('day flow', () => {
  it('entry notices catch up after 07:00 but never invite after closing', () => {
    const at = (minutes: number) => ({ ...freshSave(0), clock: 2 * 1440 + minutes });
    expect(matchEntryNotice(at(6 * 60 + 59))).toBeNull();
    for (const minutes of [7 * 60, 10 * 60 + 23, 14 * 60 + 59]) {
      expect(matchEntryNotice(at(minutes))).toEqual({ key: '1:0:3', names: ['에이스 오브 링'] });
    }
    expect(matchEntryNotice(at(15 * 60))).toBeNull();
    expect(matchEntryNotice(at(21 * 60))).toBeNull();
    expect(matchEntryNotice({ ...at(10 * 60), titles: ['t1'] })).toBeNull();
  });
  it('read notices are suppressed that day, but can recur next year', () => {
    const s = { ...freshSave(0), clock: 2 * 1440 + 9 * 60 };
    const notice = matchEntryNotice(s)!;
    expect(matchEntryNotice(s, notice.key)).toBeNull();
    expect(matchEntryNotice({ ...s, clock: s.clock + 32 * 1440 }, notice.key)?.key).toBe('2:0:3');
    expect(matchEntryNotice(freshSave(0))).toBeNull();
  });
  it('championship notices respect rank, played prelims and the final round', () => {
    const s = { ...freshSave(0), clock: 16 * 1440 + 10 * 60, titles: ['t1', 't2', 't3'] };
    expect(matchEntryNotice({ ...s, titles: [] })).toBeNull();
    expect(matchEntryNotice(s)?.names).toEqual(['챔피언십 예선 1전']);
    expect(matchEntryNotice(applyMatch(s, todaysMatches(s)[0], true))).toBeNull();
    const finals = { ...s, clock: 52 * 1440 + 10 * 60, qualifiedYear: 1, finalRound: 1 };
    expect(matchEntryNotice(finals)?.names).toEqual(['챔피언십 본선 4강']);
  });
  it('offline progress stops at the calendar instead of silently skipping the night', () => {
    const s = { ...freshSave(0), clock: 23 * 60 + 57 };
    const r = advanceOffline(s, 720, seeded(1));
    expect(r.elapsedMinutes).toBe(2);
    expect(r.save.clock).toBe(23 * 60 + 59);
    expect(s.clock).toBe(23 * 60 + 57);
    expect(advanceOffline(r.save, 720).elapsedMinutes).toBe(0);
    expect(advanceOffline(r.save, 1).save).toBe(r.save);
  });
  it('offline progress respects elapsed minutes and the twelve-hour cap', () => {
    const s = { ...freshSave(0), clock: 7 * 60 };
    expect(advanceOffline(s, 3.9, seeded(1)).elapsedMinutes).toBe(3);
    expect(advanceOffline(s, 10000, seeded(1)).elapsedMinutes).toBe(720);
    for (const minutes of [-1, NaN, Infinity]) expect(advanceOffline(s, minutes).save).toBe(s);
  });
  it.each([
    [21 * 60, 1440 + 7 * 60],
    [1440 + 2 * 60, 1440 + 7 * 60],
    [7 * 1440 + 21 * 60, 8 * 1440 + 7 * 60],
    [31 * 1440 + 21 * 60, 32 * 1440 + 7 * 60],
  ])('calendar and sleep agree across dawn, season and year boundaries (%i)', (clock, morning) => {
    const s = { ...freshSave(0), clock };
    expect(nextMorningClock(s)).toBe(morning);
    expect(endDay(s, seeded(1)).save.clock).toBe(morning);
  });
  it('the day ends at 23:59 and the night is slept through to 07:00 without hunger or poop', () => {
    const base = freshSave(0);
    const s: SaveData = { ...base, clock: 23 * 60 + 59, digimon: [{ ...only(base), hunger: 50, poop: 0, stageAge: 100 }] };
    expect(isNight(s)).toBe(true);
    const r = endDay(s, seeded(1));
    expect(dateOf(r.save.clock)).toMatchObject({ day: 2, hour: 7, minute: 0 });
    expect(only(r.save).hunger).toBe(50);
    expect(only(r.save).poop).toBe(0);
    expect(only(r.save).stageAge).toBe(100 + 7 * 60 + 1);
    expect(isNight(r.save)).toBe(false);
  });
  it('poop comes less often: every 4 game hours for babies, 8 hours after', () => {
    expect(poopInterval(1)).toBe(240);
    expect(poopInterval(2)).toBe(240);
    expect(poopInterval(3)).toBe(480);
    expect(poopInterval(5)).toBe(480);
  });
  it('training reports what changed, and poop is cleaned one at a time', () => {
    const base = freshSave(0);
    const s: SaveData = { ...base, clock: 9 * 60, digimon: [{ ...only(base), cage: '미니 운동장', trainMinutes: 14, hunger: 80, poop: 2 }] };
    const r = tickFarm(s, seeded(2));
    expect(r.events.find((e) => e.type === 'trained')).toMatchObject({ changes: expect.stringContaining('HP +') });
    const c = cleanOne(r.save, 1);
    expect(only(c.save).poop).toBe(only(r.save).poop - 1);
  });
});

describe('partial meat bites', () => {
  it('babies eat 5 remaining for 10 fullness and preserve progress across saves', () => {
    const s = freshSave(0); s.digimon = [newDigimon(1, '깜몬')]; s.digimon[0].hunger = 0;
    const r = biteFloorFood(s, [{kind:'meat',x:200,y:300}], 1, 0);
    expect(r.save.digimon[0].hunger).toBe(10);
    expect(r.foods[0].remaining).toBe(95);
    expect(r.save.meat).toBe(s.meat);
    expect(restoreFloorFood(r.save, JSON.parse(JSON.stringify(r.foods)))).toEqual(r.foods);
    expect(s.digimon[0].hunger).toBe(0);
  });
  it('last fragment consumes stock once and cannot be eaten twice', () => {
    const s = freshSave(0); s.digimon = [newDigimon(1, '깜몬')]; s.digimon[0].hunger = 0;
    const r = biteFloorFood(s, [{kind:'meat',x:200,y:300,remaining:2}], 1, 0);
    expect(r.save.digimon[0].hunger).toBe(4); expect(r.foods).toHaveLength(0);
    expect(r.save.meat).toBe(s.meat-1);
    expect(biteFloorFood(r.save,r.foods,1,0).ok).toBe(false);
  });
  it('fullness caps proportional consumption and eggs/full digimon refuse', () => {
    const s = freshSave(0); s.digimon = [newDigimon(1, '아구몬')]; s.digimon[0].hunger=99;
    const f: FloorFood[]=[{kind:'meat',x:200,y:300,remaining:100}];
    const r=biteFloorFood(s,f,1,0);
    expect(r.save.digimon[0].hunger).toBe(100); expect(r.foods[0].remaining).toBe(99.5);
    expect(biteFloorFood(r.save,r.foods,1,0).ok).toBe(false);
    s.digimon[0].isEgg=true; expect(biteFloorFood(s,f,1,0).ok).toBe(false);
  });
});

describe('약·상처약·알약(프로틴): 원작 문장 기준으로 역할을 나눔', () => {
  const sickSave = (stage: string) => {
    const s = freshEggSave(0);
    const d = { ...newDigimon(1, stage), sick: true, injured: true };
    return { ...s, digimon: [d] } as SaveData;
  };
  it('약(주사기)은 병만 고치고, 세대가 낮을수록 실패할 수 있다', () => {
    const s = sickSave('깜몬');
    const ok = cure(s, 1, () => 0);
    expect(ok.save.digimon[0].sick).toBe(false);
    expect(ok.save.digimon[0].injured).toBe(true); // 부상은 그대로
    expect(ok.save.medicine).toBe(s.medicine - 1);
    const miss = cure(s, 1, () => 0.99);
    expect(miss.ok).toBe(true);
    expect(miss.save.digimon[0].sick).toBe(true);
    expect(miss.save.medicine).toBe(s.medicine - 1);
    expect(cure({ ...s, medicine: 0 }, 1).ok).toBe(false);
  });
  it('상처약은 부상만 고친다', () => {
    const s = sickSave('아구몬');
    const r = treat(s, 1, () => 0);
    expect(r.save.digimon[0]).toMatchObject({ injured: false, sick: true });
    expect(r.save.salve).toBe(s.salve - 1);
  });
  it('알약은 바닥에서 네 입에 먹고 공격을 올리며, 배틀 뒤에 사라진다', () => {
    const s = { ...freshEggSave(0), pills: 1, digimon: [{ ...newDigimon(1, '아구몬'), hunger: 100 }] } as SaveData;
    let foods: readonly FloorFood[] = [{ kind: 'pill', x: 0, y: 0 }];
    let cur = s;
    for (let i = 0; i < 4; i++) {
      const r = biteFloorFood(cur, foods, 1, 0);
      expect(r.ok).toBe(true);
      cur = r.save;
      foods = r.foods;
    }
    expect(foods).toEqual([]);
    expect(cur.pills).toBe(0);
    const d = cur.digimon[0];
    expect(d.protein).toBe(1);
    expect(entrantOf(d, '일반').stats.atk).toBeGreaterThan(d.stats.atk);
    expect(applyBattleResult(d, true, false, () => 0.99).protein).toBe(0);
  });
  it('알약을 과식하면 KO가 아니어도 부상 위험이 생긴다', () => {
    const d = { ...newDigimon(1, '아구몬'), protein: 6 };
    expect(applyBattleResult(d, true, false, () => 0.3).injured).toBe(true);
    expect(applyBattleResult({ ...d, protein: 1 }, true, false, () => 0.3).injured).toBe(false);
  });
  it('옛 저장의 알약(치료용)은 약으로 옮긴다', () => {
    const old = { ...freshEggSave(0), pills: 3 } as Partial<SaveData>;
    delete old.medicine;
    delete old.salve;
    const s = upgradeSave(old as SaveData);
    expect(s).toMatchObject({ medicine: 3, salve: 1, pills: 0 });
  });
});

describe('스트레스 (형규가 정한 값)', () => {
  const one = (patch: Partial<Digimon>) => ({ ...freshEggSave(0), clock: 10 * 60, digimon: [{ ...newDigimon(1, '아구몬'), hunger: 100, ...patch }] }) as SaveData;
  it('배고픔 20 아래로 1 내려갈 때마다 1.5, 배고픔 0에서 합계 30', () => {
    expect(tickFarm(one({ hunger: 20.05 }), seeded(1)).save.digimon[0].stress ?? 0).toBeCloseTo(0.045, 1);
    const half = tickFarm(one({ hunger: 10.08 }), seeded(1)).save.digimon[0];
    expect(half.stress).toBeCloseTo(15, 0);
    let s = one({ hunger: 0.05 });
    for (let i = 0; i < 5; i++) s = tickFarm(s, seeded(1)).save;
    expect(s.digimon[0].stress).toBeCloseTo(30, 5); // 0에 머물러도 더 쌓이지 않는다
  });
  it('병에 걸리면 +40, 상한 먹이는 +50 (그 병과 겹치지 않음)', () => {
    let s = one({ poop: 5, dirtyMinutes: 179 });
    s = tickFarm(s, seeded(1)).save;
    expect(s.digimon[0]).toMatchObject({ sick: true, stress: 40 });
    const r = feedRotten({ ...one({ rottenEaten: 1 }), rotten: 1 }, 1);
    expect(r.save.digimon[0]).toMatchObject({ sick: true, stress: 50 });
  });
  it('정원 초과로 하루가 지나면 +20, 그냥 지나면 그대로', () => {
    const night = { ...one({ stress: 50 }), clock: 21 * 60 };
    // 밤 10시간 동안 시간당 -1
    expect(endDay(night, seeded(1), [1]).save.digimon[0].stress).toBe(60);
    expect(endDay(night, seeded(1)).save.digimon[0].stress).toBe(40);
  });
  it('100이 되면 병에 걸린다 (한 번만)', () => {
    const s = tickFarm(one({ stress: 100 }), seeded(1)).save;
    expect(s.digimon[0]).toMatchObject({ sick: true, stress: 100, penalties: 1 });
    expect(STRESS.show).toBe(70);
  });
  it('훈련 한 번에 +5, 1시간마다 -1, 미니 양호실에서는 -5', () => {
    const tick = (patch: Partial<Digimon>) => tickFarm(one({ stress: 10, ...patch }), seeded(1)).save.digimon[0];
    const trained = tick({ cage: '미니 운동장', trainMinutes: 14 });
    expect(trained).toMatchObject({ stress: 15, trainDone: true });
    expect(tick({ cage: '미니 운동장', trainDone: true, trainMinutes: 0 }).stress).toBe(10); // 다시 넣기 전에는 훈련 없음
    expect(tick({ cage: '기본 케이지', trainDone: true }).trainDone).toBe(false);
    expect(tick({ cage: '미니 양호실', stageAge: 59 }).stress).toBe(5);
    expect(tick({ cage: '기본 케이지', stageAge: 59 }).stress).toBe(9);
  });
});


describe('종별 낮잠 주기', () => {
  const cycle = (awakeLeft: number, sleepLeft = 0) => ({ species: '아구몬', awakeLeft, sleepLeft });
  it('원본 범위는 종별로 읽고 옛 저장은 첫 틱에 주기를 만든다', () => {
    expect(originalSpecies('깜몬').awake).toEqual([360, 420]);
    expect(originalSpecies('아구몬').awake).toEqual([960, 1020]);
    expect(originalSpecies('아구몬').sleep).toEqual([60, 120]);
    const s = withMon(freshSave(0), { speciesId: '아구몬' });
    const d = only(tickFarm(s, () => 0.5).save);
    expect(d.restCycle).toEqual(cycle(989));
    expect(only(s).restCycle).toBeUndefined();
  });
  it('잠들면 훈련·섭취·배설 진행을 멈추고 정해진 시간 뒤 깬다', () => {
    let s = withMon(freshSave(0), { speciesId: '아구몬', restCycle: cycle(1), hunger: 50, fatigue: 30, cage: '미니 운동장', trainMinutes: 14, poopTimer: 20 });
    s = tickFarm(s, () => 0).save;
    expect(isSleeping(only(s))).toBe(true);
    expect(only(s)).toMatchObject({ hunger: 50, fatigue: 29.7, trainMinutes: 14, poopTimer: 20 });
    const saved = only(s).restCycle;
    s = tickFarm(s, () => 0.5).save;
    expect(saved?.sleepLeft).toBe(60); // 이전 저장 객체를 변경하지 않는다
    for (let i = 0; i < 59; i++) s = tickFarm(s, () => 0.5).save;
    expect(isSleeping(only(s))).toBe(false);
    expect(only(s).trainDone).toBe(true); // 깬 뒤 남은 1분 훈련을 마친다
  });
  it('수면 중 한 입 처리와 직접 급여는 먹이·재고를 보존한다', () => {
    const s = withMon(freshSave(0), { speciesId: '아구몬', hunger: 0, restCycle: cycle(0, 10) });
    for (const kind of ['meat', 'pill', 'rotten'] as const) {
      const foods = [{ kind, x: 100, y: 100, remaining: 50 }];
      expect(biteFloorFood(s, foods, 1, 0)).toMatchObject({ ok: false, save: s, foods });
    }
    expect(feedFromTray(s, [], 1, 'meat').ok).toBe(false);
  });
  it('밤에는 낮잠 잔여를 정리하고 부화·진화한 종은 새 주기를 쓴다', () => {
    const s = withMon(freshSave(0), { speciesId: '아구몬', restCycle: cycle(0, 10) });
    expect(only(tickFarm(s, () => 0.5, true).save).restCycle).toBeUndefined();
    const changed = withMon(s, { speciesId: '코로몬' });
    const d = only(tickFarm(changed, () => 0.5).save);
    expect(d.restCycle?.species).toBe('코로몬');
    expect(isSleeping(d)).toBe(false);
    expect(isSleeping({ ...only(s), isEgg: true })).toBe(false);
  });
});


describe('원본 훈련 결과와 실제 변화량', () => {
  const rolls = (...values: number[]) => { let i = 0; return () => values[i++] ?? 0.5; };
  it('시간 배율은 실제10초에 게임10분이며 화면은10분씩 갱신한다', () => {
    expect(MINUTES_PER_SECOND).toBe(1);
    expect(10 / MINUTES_PER_SECOND).toBe(10);
  });
  it('시설은70/20/10 경계에서 서로 다른 결과를 선택한다', () => {
    const train = (roll: number) => {
      const d = newDigimon(1, '아구몬');
      d.stats.hp = 700; d.stats.tp = 40; d.stats.int = 40; d.stats.spd = 40; d.stats.def = 40;
      return { d, changes: applyTraining(d, getCage('운동장'), 0, rolls(roll, 0.5, 0.5)) };
    };
    expect(train(0.69).changes).toEqual(['HP +50', 'TP -3']);
    expect(train(0.70).changes).toEqual(['HP +70', '지능 -5']);
    expect(train(0.90).changes).toEqual(['민첩 +5', '방어 -7']);
  });
  it('여름은 항목별 가산, HP는 원본대로10 단위 반올림한다', () => {
    expect(trainingDelta(3, 6, 0, () => 0.5)).toBe(5);
    expect(trainingDelta(3, 6, 1, () => 0.5)).toBe(7);
    expect(trainingDelta(16, 50, 0, () => 0)).toBe(30);
    expect(trainingDelta(16, 50, 0, () => 0.99)).toBe(70);
    expect(trainingDelta(17, -2, 1, () => 0.5)).toBe(-2);
  });
  it('종별 곡선 인덱스에서 상하한을 얻고 한계에서는 실제 차이만 보고한다', () => {
    expect(trainingBounds('아구몬', 'atk')).toEqual({ min: 30, max: 53 });
    expect(trainingBounds('피요몬', 'spd').max).toBeGreaterThan(trainingBounds('아르마몬', 'spd').max);
    expect(trainingBounds('아르마몬', 'def').max).toBeGreaterThan(trainingBounds('피요몬', 'def').max);
    const d = newDigimon(1, '아구몬');d.stats.atk = 52; d.stats.def = 30;
    expect(applyTraining(d, getCage('체육관'), 0, rolls(0, 0.5, 0.5))).toEqual(['공격 +1', '방어 +0 (하한)']);
    expect(d.stats.atk).toBe(53);expect(d.stats.def).toBe(30);
    expect(applyTraining(d, getCage('체육관'), 0, rolls(0, 0.5, 0.5))[0]).toBe('공격 +0 (상한)');
  });
  it('기존 저장이 원작 범위 밖이어도 임의로 끌어올리거나 깎지 않는다', () => {
    const d = newDigimon(1, '아구몬');d.stats.atk = 200;d.stats.def = 2;
    expect(applyTraining(d, getCage('체육관'), 0, rolls(0, 0.5, 0.5))).toEqual(['공격 +0 (상한)', '방어 +0 (하한)']);
    expect(d.stats.atk).toBe(200);expect(d.stats.def).toBe(2);
  });
  it('AP·내성의 실제 증감과 한계, 저장 재개를 보존한다', () => {
    const d = newDigimon(1, '아구몬');d.ap['용'] = 98;d.ap['짐승'] = 2;
    expect(applyTraining(d, getCage('화산'), 0, rolls(0, 0.5, 0.5))).toEqual(['용 수치 +1', '짐승 수치 -2']);
    const before = JSON.stringify(d);
    expect(applyTraining(d, getCage('화산'), 0, rolls(0.7, 0.5, 0.5))).toEqual(['열 내성 +9', '추위 내성 +0 (하한)']);
    expect(JSON.parse(JSON.stringify(d)).resistance).toEqual({ 열: 9, 추위: 0 });
    expect(JSON.parse(before).resistance).toBeUndefined();
  });
});


describe('원본 능력치 생성·진화·저장 이전', () => {
  it('216종 초기값은 범위 안이며 HP는10단위다', () => {
    for (const id of Object.keys(SPECIES)) for (const roll of [0, 0.5, 0.999999]) {
      const stats = initialStats(id, () => roll);
      for (const key of ['hp','tp','atk','def','int','spd'] as const) {
        const bounds = statBounds(id, key);
        expect(stats[key], `${id} ${key}`).toBeGreaterThanOrEqual(bounds.min);
        expect(stats[key], `${id} ${key}`).toBeLessThanOrEqual(bounds.max);
      }
      expect(stats.hp % 10).toBe(0);
    }
    expect(initialStats('아구몬', () => 0)).toEqual({ hp:600, tp:30, atk:30, def:30, int:30, spd:30 });
    expect(initialStats('아구몬', () => 0.999999)).toEqual({ hp:670, tp:33, atk:33, def:33, int:33, spd:33 });
    expect(typicalStats('아구몬')).toEqual({ hp:640, tp:32, atk:32, def:32, int:32, spd:32 });
  });
  it('진화는 새 종의 초기값에 이전 훈련의 일부를 이월하고 새 범위에서 제한한다', () => {
    const d = newDigimon(1, '코로몬', () => 0);
    d.stats = { hp:590, tp:25, atk:29, def:29, int:29, spd:29 };
    const before = JSON.stringify(d);
    const stats = evolvedStats(d, '아구몬', 0, () => 0);
    expect(stats).toEqual({ hp:650, tp:32, atk:32, def:32, int:32, spd:32 });
    expect(JSON.stringify(d)).toBe(before);
    for (const key of ['hp','tp','atk','def','int','spd'] as const) d.stats[key] = 100000;
    const limited = evolvedStats(d, '아구몬', 100, () => 0.999);
    for (const key of ['hp','tp','atk','def','int','spd'] as const) expect(limited[key]).toBe(statBounds('아구몬', key).max);
  });
  it('재탄생 횟수 보정과 원본99 경계도 보존한다', () => {
    expect([0,1,6,10,19,20,98,99,100,101].map(rebirthPercent)).toEqual([0,5,8,10,20,25,25,99,50,50]);
    const fresh = evolvedStats(null, '아구몬', 0, () => 0);
    const reborn = evolvedStats(null, '아구몬', 1, () => 0);
    expect(reborn.hp).toBe(fresh.hp + 20);
    expect(reborn.atk).toBe(fresh.atk + 1);
  });
  it('옛 저장 수치를 별도로 보존하며 한 번만 변환한다', () => {
    const d = newDigimon(1, '아구몬', () => 0);
    delete d.statVersion;
    d.stats = { hp:25, tp:42, atk:400, def:2, int:38, spd:32 };
    d.ap['용'] = 60;d.trainMinutes = 9;
    const old = JSON.stringify(d);
    const migrated = upgradeStats(d);
    expect(migrated.stats).toEqual({ hp:640, tp:42, atk:53, def:32, int:38, spd:32 });
    expect(migrated.legacyStats).toEqual(d.stats);
    expect(migrated.legacyStats).not.toBe(d.stats);
    expect(migrated).toMatchObject({ statVersion:1, ap:d.ap, trainMinutes:9, uid:d.uid });
    expect(JSON.stringify(d)).toBe(old);
    const s = { ...freshSave(0), digimon:[migrated] };
    expect(upgradeSave(JSON.parse(JSON.stringify(s)))).toEqual(s);
    const egg = upgradeStats({ ...d, isEgg:true });
    expect(Object.values(egg.stats)).toEqual([0,0,0,0,0,0]);
  });
  it('부화·진화는 새 단위 표식을 유지하고 범위 안에서 시작한다', () => {
    const hatch = advance(freshEggSave(0), 30, () => 0.5).save.digimon[0];
    expect(hatch).toMatchObject({ isEgg:false, speciesId:'깜몬', statVersion:1 });
    expect(hatch.stats).toEqual(initialStats('깜몬', () => 0.5));
    let s = withMon(freshSave(0), { stageAge:LIFESPAN[1]-1, hunger:100 });
    s = tickFarm(s, () => 0.5).save;
    expect(only(s).speciesId).toBe('코로몬');
    for (const key of ['hp','tp','atk','def','int','spd'] as const) expect(only(s).stats[key]).toBeLessThanOrEqual(statBounds('코로몬', key).max);
  });
  it('전투는 같은 HP·TP 단위를 사용하며 임시배율을 더하지 않는다', () => {
    const mine = newDigimon(1, '아구몬', () => 0.5);
    const foe = newDigimon(2, '아구몬', () => 0.5);
    const s = createBattle([entrantOf(mine, '일반')], [entrantOf(foe, '일반')]);
    expect(s.units[0].maxHp).toBe(mine.stats.hp);
    expect(s.units[0].maxTp).toBe(mine.stats.tp);
    expect(s.units[1].maxHp).toBe(s.units[0].maxHp);
    const rng = seeded(81);
    for (let i=0; i<1000 && !s.over; i++) stepBattle(s, rng);
    expect(s.over).toBe(true);
    expect(s.units.every(u => Number.isFinite(u.hp) && u.hp >= 0 && u.hp <= u.maxHp)).toBe(true);
  });
});


describe('유년기Ⅱ 입문 프리 배틀',()=>{
 it('입문1:1/3:3을 추가하며 기존★1~3은 유지한다',()=>{
  expect(FREE_BATTLES.slice(0,2)).toEqual([{label:'입문',format:1,stage:2,prize:30},{label:'입문',format:3,stage:2,prize:60}]);
  expect(FREE_BATTLES.slice(2).map(x=>[x.stage,x.format,x.prize])).toEqual([[3,1,60],[3,3,120],[4,1,120],[4,3,240],[5,1,180],[5,3,360]]);
 });
 it('입문 상대는 유년기Ⅱ만 생성하며 실제 배틀이 종료된다',()=>{
  for(const entry of FREE_BATTLES.filter(x=>x.stage===2)){
   const foes=makeEnemies(entry.stage,entry.format,1,seeded(12));
   expect(foes).toHaveLength(entry.format);
   expect(foes.every(x=>getSpecies(x.speciesId).stage===2)).toBe(true);
   const mine=Array.from({length:entry.format},(_,i)=>entrantOf(newDigimon(i+1,'코로몬',seeded(i)),'일반'));
   expect(runBattle(mine,foes,seeded(33)).over).toBe(true);
  }
 });
});

it('하루 마감은23:58까지 진행하고23:59부터 멈춘다',()=>{
 const s=freshSave(0);expect(isNight({...s,clock:21*60})).toBe(false);
 expect(isNight({...s,clock:23*60+58})).toBe(false);
 expect(isNight({...s,clock:23*60+59})).toBe(true);
});
