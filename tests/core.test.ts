import { HUNT_MAP, huntTerrain, huntTerrainAt, canStandOnHuntTerrain, huntTerrainLineClear, moveOnHuntTerrain, huntSpawnPoints, pickHuntSpawn, type HuntTerrain } from '../src/core/hunt-terrain';
import terrainAudit from '../docs/hunt-terrain-audit.json';
import skillTable from '../src/data/battle-skills.json';
import skillAudit from '../docs/battle-skills-audit.json';
import { BATTLE_MAPS, RANDOM_BATTLE_MAPS, TITLE_BATTLE_MAPS, battleMapFor } from '../src/core/battle-maps';
import supportTable from '../src/data/support-skills.json';
import { supportSkills, useSupport, reviveSupport, buffMultiplier, battleElement } from '../src/core/support-skills';
import { battleSkills, pickBattleSkill } from '../src/core/battle-skills';
import { evolvedStats, rebirthPercent, upgradeStats } from '../src/core/stats';
import { describe, expect, it } from 'vitest';
import { trainingPreview, applyTraining, trainingBounds, trainingDelta, personalityTraining } from '../src/core/training';
import { evaluateEvolutions, advance, advanceOffline, nextMorningClock, capture, cleanOne, endDay, isSleeping, isTraining, isNight, eggSpriteIndex, eatHp, cageLevelUp, CURE_CHANCE, trainingSideDelta, TREAT_CHANCE, trainingHpCost, facilityHpEffects, remember, memoryEvolution, feed, feedRotten, scheduleMealPoop, freshSave as freshEggSave, newDigimon, setCage, tickFarm, shopItems, upgradeSave, poopInterval, cure, treat, STRESS, pet, PET } from '../src/core/care';
import { CAGES, getCage, getSpecies, originalSpecies, initialStats, statBounds, MINUTES_PER_SECOND, LIFESPAN, parseCond, SPECIES, speciesByStage, typicalStats, dateOf, FIELDS } from '../src/core/data';
import { explain, hints, findEvolution, maxStageForRank } from '../src/core/evolution';
import { applyBattleResult, FREE_FOES, FREE_POOLS, freeBattleLineup, freeBattleFoes, createBattle, entrantOf, makeEnemies, runBattle, stepBattle } from '../src/core/battle';
import { migrateTitleIds, cageSpaceOf, entryProblems, applyMatch, applyWin, capacityOf, rankName, tamerRank, TITLES, todaysMatches, upcoming, matchEntryNotice } from '../src/core/titles';
import { seeded } from '../src/core/rng';
import { canHuntNow, huntFields, huntPool, pickWild, ropeDamage, ropeDrainSeconds, ropeHoldSeconds, ropeSnapDistance, ropeTick, wildRegen, faintWakeSeconds, ropeFor, ROPES, wildHp, SHOTS, shotOf, shotStun, shotDamage, useGear, gearCount, BAITS, GEARS, gearOf, gearDamage } from '../src/core/hunt';
import type { Digimon, SaveData, Stage } from '../src/core/types';
import { discardFloorFood, ageFloorFood, SPOIL_MINUTES, biteFloorFood, availableFood, restoreFloorFood, feedFromTray, eatFloorFood, type FloorFood } from '../src/core/food';

describe('원본 배틀 장소', () => {
  it('일반 배틀은 원본 일반 장소7종에서 무작위 선택한다', () => {
    expect(BATTLE_MAPS).toHaveLength(11);
    expect(RANDOM_BATTLE_MAPS).toEqual([0,1,2,3,4,5,7]);
    const rng=seeded(89),seen=new Set<number>();
    for(let i=0;i<200;i++)seen.add(battleMapFor(undefined,rng).id);
    expect([...seen].sort((a,b)=>a-b)).toEqual([0,1,2,3,4,5,7]);
  });
  it('환경 지정 타이틀은 번호별 원본 맵, 조건 없는 타이틀은 스타디움을 쓴다', () => {
    const noRandom=()=>{throw new Error('고정 맵은 RNG를 쓰지 않는다');};
    for(const [id,map] of [['m15',3],['m35',3],['m36',4],['m37',2],['m38',5],['m39',8],['m2',9]] as const)
      expect(battleMapFor(id,noRandom).id).toBe(map);
    expect(battleMapFor('m37',noRandom).stem).toBe('field_bm03_01');
    expect(Object.keys(TITLE_BATTLE_MAPS)).toHaveLength(61);
    expect(Object.values(TITLE_BATTLE_MAPS).filter(v=>v!==null)).toHaveLength(20);
    expect(Object.values(TITLE_BATTLE_MAPS).filter(v=>v===null)).toHaveLength(41);
    for(const title of TITLES)expect(TITLE_BATTLE_MAPS).toHaveProperty(title.id);
    // 원작도 환경 -1인 타이틀은 무작위다. -1을 맵 배열 인덱스로 쓰지 않는다.
    expect(TITLE_BATTLE_MAPS.m0).toBeNull();
    expect(battleMapFor('m0',()=>0).id).toBe(0);
    expect(battleMapFor('m0',()=>0.999).id).toBe(7);
    expect(battleMapFor('prelim',noRandom).id).toBe(10);
    expect(battleMapFor('final',noRandom).id).toBe(10);
  });
});

describe('원본 종별 배틀 기술', () => {
  it('216종 중 유년기I를 제외한204종의361기술만 연결한다', () => {
    expect(Object.keys(skillTable)).toHaveLength(216);
    let total = 0, fighters = 0;
    const records = new Set<number>();
    for (const [name, entry] of Object.entries(skillTable)) {
      const skills = battleSkills(name);
      expect(skills).toHaveLength(entry.skills.length);
      if (getSpecies(name).stage === 1) expect(skills).toEqual([]);
      else { expect(skills.length).toBeGreaterThan(0); fighters++; }
      for (const skill of skills) {
        expect(records.has(skill.record)).toBe(false); records.add(skill.record);
        expect(skill.record).not.toBe(entry.basicRecord);
      }
      total += skills.length;
    }
    expect(fighters).toBe(204); expect(total).toBe(361);
  });
  it('아구몬·토이아구몬·가루다몬 기술을 섞지 않고 각 슬롯을 선택한다', () => {
    expect(battleSkills('아구몬').map(s => s.name)).toEqual(['헤비 플레임', '헤비 버너']);
    expect(battleSkills('토이아구몬').map(s => s.name)).toEqual(['토이 플레임']);
    expect(battleSkills('가루다몬').map(s => s.name)).toEqual(['쉐도우 윙', '파이어 허리케인']);
    for (const sp of Object.keys(skillTable)) {
      const skills = battleSkills(sp);
      if (!skills.length) { expect(pickBattleSkill(sp, () => 0)).toBeNull(); continue; }
      skills.forEach((skill, i) => expect(pickBattleSkill(sp, () => (i + 0.5) / skills.length)).toEqual(skill));
    }
  });
  it('실제 적중 이벤트에 선택한 기술을 보존하고 TP가 없으면 기본 공격한다', () => {
    const entrant = { speciesId: '아구몬', stats: {hp:10000,tp:100,atk:10,def:10,int:10,spd:10}, personality:'솔직' as const, mode:'특수' as const };
    for (const roll of [0, 0.4, 0.8]) {
      const state = createBattle([entrant], [entrant]);
      state.units.forEach(u => { u.x = 200; u.cd = 0; });
      const events = stepBattle(state, () => roll);
      for (const e of events) if (e.type === 'hit' && e.special) {
        expect(battleSkills('아구몬')).toContainEqual(e.skill);
        expect(state.units[e.from].tp).toBe(100 - e.skill!.tpCost);
      }
      expect(events.some(e => e.type === 'hit')).toBe(true);
    }
    for (const speciesId of ['아구몬', '즈루몬']) {
      const state = createBattle([{...entrant,speciesId,stats:{...entrant.stats,tp:0}}], [entrant]);
      state.units[0].x = state.units[1].x; state.units[0].cd = 0;
      const event = stepBattle(state, () => 0).find(e => e.type === 'hit' && e.from === 0);
      expect(event).toMatchObject({special:false}); expect(event).not.toHaveProperty('skill');
      expect(state.units[0].tp).toBe(0);
    }
    // 첫 RNG는 필살기 발동, 다음 RNG는 두 번째 기술 선택이다.
    const state = createBattle([entrant], [entrant]);
    state.units[0].x = state.units[1].x; state.units[0].cd = 0;
    const rolls = [0, 0.99, 0.5];
    const hit = stepBattle(state, () => rolls.shift() ?? 0.5).find(e => e.type === 'hit' && e.from === 0);
    expect(hit).toMatchObject({special:true,skill:{name:'헤비 버너',englishName:'Spitfire Blast',dbTextIndex:447,slot:1,animation:'attack1',sequence:7,tpCost:10}});
    const baby = createBattle([{...entrant,speciesId:'즈루몬'}], [entrant]);
    baby.units[0].x = baby.units[1].x; baby.units[0].cd = 0;
    expect(stepBattle(baby, () => 0).find(e => e.type === 'hit' && e.from === 0)).toMatchObject({special:false});
    expect(baby.units[0].tp).toBe(100);
  });
  it('도감361개 한글 이름을 빠짐없이 연결하고 영문 원본은 별도로 보존한다', () => {
    const skills = Object.values(skillTable).flatMap(entry => entry.skills);
    expect(skills.map(s => s.dbTextIndex).sort((a,b) => a-b)).toEqual(Array.from({length:361},(_,i) => 432+i));
    expect(skills.every(s => /[가-힣]/.test(s.name) && s.englishName.length > 0)).toBe(true);
    expect(skillAudit.localizedNames).toMatchObject({count:361,databaseRange:[432,793],battleRange:[1301,1662],instructionChecks:15});
    expect(battleSkills('파닥몬').map(s => s.name)).toEqual(['날개 따귀','에어 샷']);
    expect(battleSkills('아구몬').map(s => s.englishName)).toEqual(['Pepper Breath','Spitfire Blast']);
  });
  it('기술 순서 대신 원본 동작 필드로361개 시퀀스를 고른다', () => {
    expect(battleSkills('가루다몬').map(s => [s.sequence,s.animation,s.tpCost])).toEqual([[9,'attack3',30],[7,'attack1',20]]);
    expect(battleSkills('아구몬').map(s => [s.sequence,s.animation,s.tpCost])).toEqual([[7,'attack1',6],[7,'attack1',10]]);
    expect(battleSkills('드라코몬')[1]).toMatchObject({sequence:10,animation:'attack4',tpCost:10});
    const counts: Record<number,number> = {};
    for (const name of Object.keys(skillTable)) for (const skill of battleSkills(name)) {
      expect(skill.animation).toBe(`attack${skill.sequence - 6}`);
      expect(skill.tpCost).toBeGreaterThan(0);
      counts[skill.sequence] = (counts[skill.sequence] ?? 0) + 1;
    }
    expect(counts).toEqual({7:183,8:110,9:55,10:13});
    expect(skillAudit.combat).toMatchObject({sequenceField:16,tpCostField:72,instructionChecks:22});
  });
  it('원본 소비TP 경계를 모든 기술에서 검사하고 부족하면 기본 공격/접근을 한다', () => {
    for (const name of Object.keys(skillTable)) for (const skill of battleSkills(name)) {
      const below = skill.tpCost - 1;
      for (const roll of [0,0.5,0.999]) {
        const chosen = pickBattleSkill(name, () => roll, below);
        expect(chosen === null || chosen.tpCost <= below).toBe(true);
      }
      const affordable = battleSkills(name).filter(s => s.tpCost <= skill.tpCost);
      const index = affordable.findIndex(s => s.record === skill.record);
      expect(pickBattleSkill(name, () => (index+0.5)/affordable.length, skill.tpCost)).toEqual(skill);
    }
    const entrant = {speciesId:'아구몬',stats:{hp:10000,tp:6,atk:10,def:10,int:10,spd:10},personality:'솔직' as const,mode:'특수' as const};
    const state = createBattle([entrant],[entrant]);
    state.units[0].x = state.units[1].x; state.units[0].cd = 0;
    expect(stepBattle(state,()=>0).find(e => e.type==='hit' && e.from===0)).toMatchObject({special:true,skill:{name:'헤비 플레임',tpCost:6}});
    expect(state.units[0].tp).toBe(0);
    state.units[0].cd = 0;
    expect(stepBattle(state,()=>0).find(e => e.type==='hit' && e.from===0)).toMatchObject({special:false});
    expect(state.units[0].tp).toBe(0);
    const distant = createBattle([{...entrant,stats:{...entrant.stats,tp:5}}],[entrant]);
    distant.units[0].x = 200; distant.units[1].x = 300; distant.units[0].cd = 0;
    expect(stepBattle(distant,()=>0).some(e => e.type==='hit' && e.from===0)).toBe(false);
    expect(distant.units[0].x).toBeGreaterThan(200);
    expect(distant.units[0].tp).toBe(5);
  });
});

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

describe('하루3~4회와 식사 후 배설',()=>{
  const awake=():SaveData=>({...freshEggSave(0),clock:7*60,meat:20,rotten:3,
    digimon:[{...newDigimon(1,'워그레이몬',()=>.5),personality:'솔직',hunger:100,
      restCycle:{species:'워그레이몬',awakeLeft:5000,sleepLeft:0}}]});
  it('배고픔과 수면에 방해받지 않는 하루에도 기본 배설은3~4회다',()=>{
    const r=advance(awake(),17*60-1,()=>.5);
    expect(r.events.filter(e=>e.type==='poop')).toHaveLength(3);
    expect(only(r.save).bowel?.count).toBe(3);
  });
  it('첫 식사 후120~180분에 한 번 배설하고 직전 기본 타이머는 겹치지 않는다',()=>{
    for(const [roll,delay] of [[0,120],[.999,180]]){
      const s=awake();s.digimon=[scheduleMealPoop({...only(s),poopTimer:299},s.clock,()=>roll)];
      const r=advance(s,delay-1,()=>.5);
      expect(r.events.some(e=>e.type==='poop')).toBe(false);
      const due=tickFarm(r.save,()=>.5);
      expect(due.events.filter(e=>e.type==='poop')).toHaveLength(1);
      expect(only(due.save)).toMatchObject({poop:1,poopTimer:0,bowel:{count:1}});
      expect(only(due.save).bowel?.mealDueAt).toBeUndefined();
      expect(advance(due.save,1,()=>.5).events.some(e=>e.type==='poop')).toBe(false);
    }
  });
  it('한 입씩 먹거나 고기를 더 먹어도 최초 예약이 늘거나 미뤄지지 않는다',()=>{
    let s=awake();s.digimon[0]={...only(s),speciesId:'아구몬',hunger:0};const original=s;
    const first=biteFloorFood(s,[{kind:'meat',x:0,y:0}],1,0);s=first.save;
    const due=only(s).bowel!.mealDueAt!;
    expect(due).toBeGreaterThanOrEqual(s.clock+120);expect(due).toBeLessThanOrEqual(s.clock+180);
    const second=biteFloorFood({...s,clock:s.clock+10},first.foods,1,0);
    expect(second.ok).toBe(true);
    expect(only(second.save).bowel?.mealDueAt).toBe(due);
    const more=feed({...second.save,clock:s.clock+20},1);
    expect(more.ok).toBe(true);expect(only(more.save).bowel?.mealDueAt).toBe(due);
    expect(only(original).bowel).toBeUndefined();
  });
  it('성공한 고기/상한 고기만 예약하며 알약과 실패한 급여는 예약하지 않는다',()=>{
    const s=awake();s.digimon[0].hunger=30;
    for(const result of [feed(s,1),feedRotten(s,1)])expect(only(result.save).bowel?.mealDueAt).toBeGreaterThan(s.clock);
    expect(only(biteFloorFood({...s,pills:2},[{kind:'pill',x:0,y:0}],1,0).save).bowel).toBeUndefined();
    expect(only(feed({...s,meat:0},1).save).bowel).toBeUndefined();
    expect(only(feed({...s,digimon:[{...only(s),hunger:100}]},1).save).bowel).toBeUndefined();
  });
  it('청소/재접속을 해도 일일 한도4회를 넘기지 않고 예약을 보존한다',()=>{
    let s=awake();
    for(let i=0;i<4;i++){
      s={...s,digimon:[scheduleMealPoop(only(s),s.clock,()=>0)]};
      const r=advance(s,120,()=>.5);expect(r.events.filter(e=>e.type==='poop')).toHaveLength(1);
      s=cleanOne(r.save,1).save;expect(only(s).bowel?.count).toBe(i+1);
    }
    s={...s,digimon:[scheduleMealPoop(only(s),s.clock,()=>0)]};
    const saved=upgradeSave(JSON.parse(JSON.stringify(s)));expect(only(saved).bowel).toEqual(only(s).bowel);
    expect(advance(saved,180,()=>.5).events.some(e=>e.type==='poop')).toBe(false);
    expect(only(upgradeSave(saved)).bowel?.count).toBe(4);
  });
  it('수면/야간에는 배설하지 않고 다음 날에 횟수를 초기화한다',()=>{
    let s=awake();s={...s,clock:23*60+59,digimon:[{...only(s),bowel:{day:0,count:4,mealDueAt:23*60},poopTimer:999}]};
    const night=endDay(s,()=>.5);expect(night.events.some(e=>e.type==='poop')).toBe(false);
    expect(only(night.save).bowel?.count).toBe(0);
    const morning=tickFarm(night.save,()=>.5);expect(morning.events.filter(e=>e.type==='poop')).toHaveLength(1);
    expect(only(morning.save).bowel?.count).toBe(1);
    const sleeping=awake();sleeping.digimon[0]={...only(sleeping),restCycle:{species:'워그레이몬',awakeLeft:0,sleepLeft:10},bowel:{day:0,count:0,mealDueAt:sleeping.clock+1}};
    const r=advance(sleeping,9,()=>.5);expect(r.events.some(e=>e.type==='poop')).toBe(false);
    expect(tickFarm(r.save,()=>.5).events.filter(e=>e.type==='poop')).toHaveLength(1);
  });
  it('옛 저장과 자동 관리 시설을 처리하되 기존 배설물은 삭제하지 않는다',()=>{
    const s=awake();s.digimon[0].poop=2;
    const loaded=upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(only(loaded)).toMatchObject({poop:2,bowel:{day:0,count:0}});
    for(const cage of ['동물원','목장']){
      const next=tickFarm({...loaded,digimon:[{...only(loaded),cage,poopTimer:999,bowel:{day:0,count:2,mealDueAt:s.clock}}]},()=>.5);
      expect(next.events.some(e=>e.type==='poop')).toBe(false);expect(only(next.save).poop).toBe(2);
      expect(only(next.save).bowel?.mealDueAt).toBeUndefined();
    }
  });
});

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
      // 훈련은 현재 HP를 깎는다(원본 부가 명령1). 이 테스트는 분기만 보므로 쉬게 해서 HP를 채운다
      s = { ...s, digimon: s.digimon.map((d) => ({ ...d, hpNow: undefined })) };
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
    // 원본 시설 상시 효과: 온천 3분마다 -1, 목장 6분마다 -1, 그 밖은 1시간마다 -1(임시)
    expect(relief('온천')).toBe(8);
    expect(relief('목장')).toBe(28);
    expect(relief('절')).toBe(48);
    expect(getCage('경기장').capacity).toBe(10);
  });
  it('계절: 여름은 훈련 효과가 높고, 겨울은 부상 위험도가 더 쌓인다', () => {
    const train = (clock: number, rng = seeded(1)) => {
      let s = withMon({ ...freshSave(0), clock }, { hunger: 100, personality: '쿨' });
      s = { ...s, cages: [...s.cages, '미니 화산'] };
      s = setCage(s, 1, '미니 화산').save;
      return advance(s, 20, rng);
    };
    const day = 1440, noon = 12 * 60;
    expect(only(train(noon).save).ap['용']).toBe(3); // 봄
    expect(only(train(8 * day + noon).save).ap['용']).toBe(5); // 여름: 원본 가산+2
    // 원본: 훈련마다 부상 위험도가 쌓이고(겨울 +1), 30을 넘으면 그 %로 부상
    const risk = (clock: number) => only(train(clock).save).injuryRisk ?? 0;
    expect(risk(noon)).toBe(1); // 미니 화산 부가 명령5 = 1
    expect(risk(24 * day + noon)).toBe(2);
    expect(only(train(noon).save).injured).toBe(false);
    const risky = (clock: number, i: number) => { let s = withMon({ ...freshSave(0), clock }, { hunger: 100, personality: '쿨', injuryRisk: 80 }); s = { ...s, cages: [...s.cages, '미니 화산'] }; s = setCage(s, 1, '미니 화산').save; return only(advance(s, 20, seeded(i)).save).injured; };
    expect(Array.from({ length: 50 }, (_, i) => risky(noon, i + 1)).filter(Boolean).length).toBeGreaterThan(20);
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
    expect(findEvolution(agu, 2, 100)).toEqual({ kind: 'blocked', to: '그레이몬', reason: 'rank' });
    expect(findEvolution(agu, 3, 100)).toEqual({ kind: 'evolve', to: '그레이몬' }); // 레드 테이머부터 성숙기
    expect(findEvolution(agu, 3, 2)).toEqual({ kind: 'blocked', to: '그레이몬', reason: 'capacity' });
    expect(maxStageForRank(7)).toBe(6);
  });
  it('코로몬의 세 번째 배틀 직후 성장 대기나 시간 진행 없이 아구몬으로 진화한다', () => {
    let s = withMon(freshSave(0), { speciesId: '코로몬', stageAge: 0, battles: 0 });
    for (let i = 1; i <= 3; i++) {
      s = { ...s, digimon: s.digimon.map(d => applyBattleResult(d, false, false, () => 0.9)) };
      const clock = s.clock, hunger = only(s).hunger;
      const r = evaluateEvolutions(s, () => 0.5, new Set([1]));
      expect(r.events.filter(e => e.type === 'evolved')).toHaveLength(i === 3 ? 1 : 0);
      expect(r.save.clock).toBe(clock);expect(only(r.save).hunger).toBe(hunger);
      s = r.save;
    }
    expect(only(s).speciesId).toBe('아구몬');expect(only(s).battles).toBe(3);expect(only(s).stageAge).toBe(0);
    expect(s.seen).toContain('아구몬');expect(evaluateEvolutions(s).events).toHaveLength(0);
  });
  it('배틀 직후에도 분기 우선순위·추가 속성·시간 진화·랭크 제한을 보존한다', () => {
    const d = { ...newDigimon(1, '코로몬'), battles: 3, stageAge: 0 };
    expect(findEvolution(d, 1, 100)).toEqual({ kind: 'evolve', to: '아구몬' });
    d.ap.용 = 20;
    const r = evaluateEvolutions({ ...freshSave(0), digimon: [d] }, () => 0.5);
    expect(only(r.save).speciesId).toBe('브이몬');expect(only(r.save).ap.용).toBe(0); // 원본: 진화하면 속성·종족 수치는 0부터
    expect(findEvolution({ ...d, battles: 2 }, 1, 100)).toBeNull();
    expect(findEvolution({ ...newDigimon(1, '코로몬'), stageAge: 0 }, 1, 100)).toBeNull();
    expect(findEvolution({ ...newDigimon(1, '아구몬'), battles: 6 }, 1, 100)?.kind).toBe('blocked');
  });
  it('동시 진화는 남은 용량을 순서대로 사용하고 비출전 개체·알은 그대로 둔다', () => {
    const digimon = ['코로몬', '코로몬', '코로몬', '깜몬'].map((name, i) => ({ ...newDigimon(i + 1, name), battles: i < 2 ? 3 : 0 }));
    const s = { ...freshSave(0), digimon };
    expect(s.digimon.reduce((sum,d)=>sum+getSpecies(d.speciesId).size,0)).toBe(30);
    const r = evaluateEvolutions(s, () => 0.5, new Set([1, 2]));
    expect(r.events.filter(e=>e.type==='evolved')).toHaveLength(1);
    expect(r.save.digimon.map(d=>d.speciesId)).toEqual(['아구몬', '코로몬', '코로몬', '깜몬']);
    const egg = { ...digimon[0], isEgg: true };
    expect(evaluateEvolutions({ ...s, digimon: [egg] }).events).toHaveLength(0);
    expect(evaluateEvolutions(s, () => 0.5, new Set([4])).events).toHaveLength(0);
  });
  it('속성 조건은 태어난 직후에도 진화하며 조건표에 임시20% 대기를 붙이지 않는다', () => {
    const d = newDigimon(1, '코로몬', () => .5);d.ap.물 = 20;
    expect(d.stageAge).toBe(0);
    expect(findEvolution(d, 1, 100)).toEqual({ kind: 'evolve', to: '스노우아구몬' });
    expect(explain(d, { ap: { 물: 20 } })).toHaveLength(1);
    expect(hints(d, new Set(['스노우아구몬'])).find(h => h.name === '스노우아구몬')?.ready).toBe(true);
    expect(findEvolution({ ...newDigimon(2, '코로몬'), stageAge: LIFESPAN[2] - 1 }, 1, 100)).toBeNull();
    expect(findEvolution({ ...newDigimon(2, '코로몬'), stageAge: LIFESPAN[2] }, 1, 100)?.to).toBe('토이아구몬');
  });
  it('훈련으로 조건을 채운 바로 그 분에 진화하고 다음 시간을 기다리지 않는다', () => {
    const d = newDigimon(1, '코로몬', () => .5);d.ap.물 = 19;d.cage = '해변';d.trainMinutes = 14;d.hunger = 100;
    d.restCycle = { species: d.speciesId, awakeLeft: 5000, sleepLeft: 0 };
    const s = { ...freshSave(0), digimon: [d] };
    const r = tickFarm(s, () => .5);
    expect(r.save.clock).toBe(s.clock + 1);expect(only(r.save).speciesId).toBe('스노우아구몬');
    expect(r.events.map(e => e.type)).toEqual(expect.arrayContaining(['trained', 'evolved']));
    expect(only(r.save).stageAge).toBe(0);
  });
  it('용량과 랭크 제한이 풀린 즉시 시간 진행 없이 다시 진화한다', () => {
    const d = newDigimon(1, '코로몬');d.ap.물 = 20;
    const full = { ...freshSave(0), digimon: [d, ...[2,3,4].map(uid=>newDigimon(uid, '코로몬'))] };
    expect(evaluateEvolutions(full).events).toHaveLength(0);
    const freed = { ...full, digimon: full.digimon.slice(0,3) }, r = evaluateEvolutions(freed, () => .5);
    expect(only(r.save).speciesId).toBe('스노우아구몬');expect(r.save.clock).toBe(full.clock);
    const agu = { ...newDigimon(1, '아구몬'), battles: 6 };
    const locked = { ...freshSave(0), digimon: [agu], titles: TITLES.slice(0,2).map(t=>t.id) };
    expect(tamerRank(locked)).toBe(2);expect(evaluateEvolutions(locked).events).toHaveLength(0);
    const promoted = { ...locked, titles: TITLES.slice(0,3).map(t=>t.id) }, ready = evaluateEvolutions(promoted);
    expect(only(ready.save).speciesId).toBe('그레이몬');expect(ready.save.clock).toBe(locked.clock);
  });
  it('같은 사육 틱의 뒤쪽 개체가 로스트되어 용량이 비워져도 앞의 대기 개체가 즉시 진화한다', () => {
    const digimon = [1,2,3,4].map(uid=>newDigimon(uid, '코로몬',()=>.5));digimon[0].ap.물 = 20;
    digimon[3].sick = true;digimon[3].sickMinutes = 2879;digimon[3].dying = true;digimon[3].dyingMinutes = 1439;
    const s = { ...freshSave(0), digimon }, r = tickFarm(s,()=>.5);
    expect(r.events.some(e=>e.type==='lost'&&e.uid===4)).toBe(true);
    expect(r.events.filter(e=>e.type==='evolved'&&e.uid===1)).toHaveLength(1);
    expect(only(r.save).speciesId).toBe('스노우아구몬');expect(r.save.clock).toBe(s.clock+1);
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

/** 쉬운 순서로 n개의 타이틀을 딴 상태 */
const won = (n: number) => TITLES.slice(0, n).map((t) => t.id);

describe('titles and hunting', () => {
  it('winning titles raises tamer rank', () => {
    let s = freshSave(0);
    expect(tamerRank(s)).toBe(1);
    s = applyWin(s, TITLES[0]);
    expect(tamerRank(s)).toBe(2);
    expect(rankName(tamerRank(s))).toBe('블루 테이머');
    expect(s.bits).toBe(500 + 5300); // 봄의 시작: 원본 상금 그대로
    s = applyWin(s, TITLES[1]);
    expect(tamerRank(s)).toBe(2); // 레드는 뱃지 3개부터 (영상 확인)
    s = applyWin(s, TITLES[2]);
    expect(rankName(tamerRank(s))).toBe('레드 테이머');
    expect(tamerRank({ ...s, titles: won(28) })).toBe(8);
    expect(rankName(tamerRank({ ...s, champion: true }))).toBe('챔프 테이머');
    expect(capacityOf(s)).toBe(96);
  });
  it('타이틀 매치 61개는 원본 표를 따른다', () => {
    expect(TITLES).toHaveLength(61);
    // 원작 편지: 첫 타이틀 매치는 봄의 3일째
    expect(TITLES[0]).toMatchObject({ name: '봄의 시작', season: 0, day: 3, minRank: 1, format: 1 });
    const by = (name: string) => TITLES.find((t) => t.name === name)!;
    expect(by('무한의 영혼')).toMatchObject({ needEggs: 10, grade: 4, minRank: 8 });
    expect(by('장군의 힘')).toMatchObject({ format: 3, foes: 2, limitStage: 4 });
    expect(by('은빛의 결정체')).toMatchObject({ format: 1, foes: 3 });
    expect(by('용의 군주').limitNote).toBe('용 한정');
    // 참가 조건은 원본 조건 표로 검사한다
    const mon = (speciesId: string, patch: Partial<Digimon> = {}) => ({ ...newDigimon(1, speciesId), ...patch });
    expect(entryProblems(by('용의 군주'), [mon('아구몬')])).toEqual([]);
    expect(entryProblems(by('용의 군주'), [mon('아구몬'), mon('피요몬')])).toEqual(['용 종족 한정']);
    expect(entryProblems(by('악의 파괴자'), [mon('아구몬')])).toEqual(['바이러스 속성 한정']);
    expect(entryProblems(by('장군의 힘'), [mon('아구몬')])).toEqual(['성숙기 한정']);
    expect(entryProblems(by('에메랄드 바다'), [mon('팔몬')])).toEqual([]);
    expect(entryProblems(by('에메랄드 바다'), [mon('아구몬')])).toEqual(['식물 한정']);
    expect(entryProblems(by('고독한 하늘'), [mon('아구몬', { personality: '겁쟁이' })])).toEqual([]);
    expect(entryProblems(by('무한의 영혼'), [mon('아구몬', { eggs: 9 })])).toEqual(['디지에그화 10회 이상']);
    expect(by('그라비티 나이츠').needEggs).toBe(24);
    expect(TITLES.filter((t) => t.grade === 4)).toHaveLength(8);
    // 예전 임시 타이틀 기록을 옮긴 뒤 현재 승급 기준으로 재계산한다
    const old = upgradeSave({ ...freshSave(0), titles: ['t1', 't2', 't3', 't9'] });
    expect(old.titles).toEqual([...won(3), 'm52']);
    expect(rankName(tamerRank({ ...old, titles: won(3) }))).toBe('레드 테이머');
  });
  it('a new game starts from a digi-egg that hatches into 깜몬', () => {
    const s = freshEggSave(0);
    expect(s.digimon[0].isEgg).toBe(true);
    expect(advance(s, 30, seeded(1)).save.digimon[0]).toMatchObject({ isEgg: false, speciesId: '깜몬' });
  });
  it('title matches appear on their day before 15:00', () => {
    const s = { ...freshSave(0), clock: 1440 * 2 + 9 * 60 };
    expect(todaysMatches(s).map((m) => m.name)).toEqual(['봄의 시작']);
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
    // 원본 해금 조건: 디지β는 처음부터, 디지γ는 '작은 도전자'(25번) 타이틀, 하드α는 블루, 하드β는 '벡터 파티션'(3번) 타이틀
    expect(ropes(base)).toEqual(['digi2']);
    expect(ropes({ ...base, titles: ['m25'] })).toEqual(['digi2', 'digi3', 'hard1']);
    expect(ropes({ ...base, titles: ['m25', 'm3'] })).toEqual(['digi2', 'digi3', 'hard1', 'hard2']);
    expect(ROPES.map((r) => r.price)).toEqual([1000, 2500, 5500, 9000, 14000, 18000, 20000, 25000, 32000, 45000, 60000, 90000]);
    expect(ROPES.map((r) => r.durability)).toEqual([10, 15, 20, 32, 44, 56, 60, 80, 100, 150, 150, 250]);
    // 사면 가장 좋은 로프를 든다
    const item = shopItems({ ...base, titles: ['m3'] }).find((i) => i.id === 'rope:hard2')!;
    expect(item.apply(base).rope).toBe('hard2');
  });
  it('fainted wild recovers to 80% (overlay9_0 0x149C) after 5 idle seconds', () => {
    // 즈루몬 표준 HP 220: 초당 12 → 1칸 기준 초당 12/220
    expect(wildRegen('즈루몬', 0, 1, 1)).toBeCloseTo(12 / 220);
    expect(wildRegen('즈루몬', 0.5, 1, 100)).toBe(0.8);
    expect(wildRegen('즈루몬', 0.9, 1, 1)).toBe(0.9);
    expect(faintWakeSeconds('즈루몬')).toBeCloseTo(5 + 220 * 0.8 / 12);
    expect(faintWakeSeconds('즈루몬', 0.1)).toBeCloseTo(5 + 22 / 12);
  });
  it('rope follows the original rope table (gauge, drain, distance zones)', () => {
    // 원본 0xC8DCC: α 6초 · β 12초 · γ 17초
    expect([ropeHoldSeconds({ rope: 'digi1' }), ropeHoldSeconds({ rope: 'hard2' }), ropeHoldSeconds({ rope: 'ultima3' })]).toEqual([6, 12, 17]);
    // 즈루몬(유년기I, 크기 1): 80 × 3프레임 = 4초, 아구몬(성장기, 크기 2): 하드 130 × 6, 클론 100 × 6
    expect(ropeDrainSeconds({ rope: 'digi1' }, '즈루몬')).toBe(4);
    expect(ropeDrainSeconds({ rope: 'hard1' }, '아구몬')).toBe(13);
    expect(ropeDrainSeconds({ rope: 'clone1' }, '아구몬')).toBe(10);
    expect(ropeDrainSeconds({ rope: 'digi3' }, '아구몬')).toBe(0);
    expect(ropeDrainSeconds({ rope: 'ultima3' }, '바이킹몬')).toBe(0); // 궁극체
    expect(ropeDrainSeconds({ rope: 'ultima1' }, '고래몬')).toBe(25); // 완전체 크기 3: 250 × 6
    // 내구력이 높을수록 멀리 당겨도 끊기지 않는다
    expect(ropeSnapDistance({ rope: 'digi1' })).toBeLessThan(ropeSnapDistance({ rope: 'digi3' }));
    const st = { gauge: 6, hp: 1, max: 1 };
    expect(ropeTick({ rope: 'digi1' }, '즈루몬', st, 20, 1).zone).toBe('safe');
    const tense = ropeTick({ rope: 'digi1' }, '즈루몬', st, 60, 1);
    expect(tense).toMatchObject({ zone: 'tense', gauge: 5, hp: 0.75 });
    expect(ropeTick({ rope: 'digi1' }, '즈루몬', st, 100, 1)).toMatchObject({ zone: 'pull', hp: 0.5 });
    expect(ropeTick({ rope: 'digi1' }, '즈루몬', st, 115, 1)).toMatchObject({ zone: 'snap', gauge: 0 });
    expect(ropeTick({ rope: 'digi3' }, '즈루몬', st, 115, 1).zone).toBe('pull');
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
    expect(ruins.reason).toContain('챔프');
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
    expect(shopItems({ ...freshSave(0), bits: 99999, titles: won(2) }).some((i) => i.id === 'gear:bomb1')).toBe(true);
  });
  it('장비는 쓸 때마다 줄고, 상점에서 묶음으로 산다. 예전 저장에는 빈 장비 칸이 생긴다', () => {
    const s = freshSave(0);
    expect(gearCount(s, 'hand1')).toBe(20); // 원본의 처음 가진 수
    expect(gearCount(s, 'bait1')).toBe(10);
    expect(gearCount(useGear(s, 'hand1')!, 'hand1')).toBe(19);
    expect(useGear(s, 'stun2')).toBeNull();
    const item = shopItems({ ...s, bits: 9999 }).find((i) => i.id === 'gear:hand1')!;
    expect(gearCount(item.apply(s), 'hand1')).toBe(30);
    expect(item.price).toBe(50); // 핸드 건α 한 발 5 × 10발
    // 원본 해금: 핸드 건β는 실버가 아니라 레드(랭크 값 2), 샷 건α는 '자연의 신'(17번) 타이틀
    const ids = (x: SaveData) => shopItems({ ...x, bits: 99999 }).map((i) => i.id);
    expect(ids(s)).not.toContain('gear:hand2');
    expect(ids({ ...s, titles: won(3) })).toContain('gear:hand2');
    expect(ids({ ...s, titles: won(3) })).not.toContain('gear:shotgun1');
    expect(ids({ ...s, titles: ['m17'] })).toContain('gear:shotgun1');
    const old = { ...s } as SaveData;
    delete old.gear;
    expect(upgradeSave(old).gear).toEqual({});
  });
});

describe('illness', () => {
  it('병을 방치하면 20시간 뒤 빈사, 24시간 더 지나면 로스트되고, 배틀 10회 이상이면 디지에그로 다시 태어난다', () => {
    const base = freshSave(0);
    const mon = (patch: Partial<Digimon>) => ({ ...newDigimon(1, '깜몬'), hunger: 100, sick: true, ...patch });
    const run = (first: Digimon, alone = false) => advance({ ...base, digimon: alone ? [first] : [first, newDigimon(2, '깜몬')], nextUid: 3 }, 2650, seeded(1));
    const lost = run(mon({}));
    expect(lost.save.digimon.some((x) => x.uid === 1)).toBe(false);
    expect(lost.events.some((e) => e.type === 'lost' && e.reason === '빈사 방치')).toBe(true);
    const reborn = run(mon({ battles: 10, eggs: 1 }));
    const d = reborn.save.digimon.find((x) => x.uid === 1)!;
    expect(d.isEgg).toBe(true);
    expect(d.sick).toBe(false);
    expect(d.eggs).toBe(2); // 원본 0x2119B2C: 빈사 방치로 디지에그가 되어도 디지에그화 횟수가 오른다
    expect(reborn.events.some((e) => e.type === 'egg' && e.reason === 'sick')).toBe(true);
    // 마지막 한 마리는 디지에그로 남는다
    expect(run(mon({}), true).save.digimon[0].isEgg).toBe(true);
  });
  it('병·부상·굶주림을 20시간 방치하면 빈사, 원인을 고치면 회복 (help #137·#140~142)', () => {
    const base = { ...freshSave(0), nextUid: 3 };
    const two = (patch: Partial<Digimon>) => ({ ...base, digimon: [{ ...newDigimon(1, '깜몬'), hunger: 100, ...patch }, newDigimon(2, '깜몬')] });
    let r = advance(two({ sick: true }), 1200, seeded(1));
    const hurt = r.save.digimon.find((x) => x.uid === 1)!;
    expect(hurt.dying).toBe(true);
    expect(r.events.some((e) => e.type === 'dying' && e.cause === 'sick')).toBe(true);
    // 빈사 중에는 훈련하지 않는다
    expect(isTraining({ ...hurt, sick: false, cage: '운동장' })).toBe(false);
    // 병을 고치면 다음 분에 빈사에서 벗어난다
    const healed = { ...r.save, digimon: r.save.digimon.map((x) => (x.uid === 1 ? { ...x, sick: false, hunger: 100 } : x)) };
    r = tickFarm(healed, seeded(1));
    expect(r.save.digimon.find((x) => x.uid === 1)!.dying).toBe(false);
    expect(r.events.some((e) => e.type === 'revived')).toBe(true);
    // 배고픔 0이 깨어 있는 시간으로 하루 이어지면 빈사
    const starving = tickFarm(two({ hunger: 0, starvingMinutes: 1199 }), seeded(1));
    expect(starving.events.some((e) => e.type === 'dying' && e.cause === 'hunger')).toBe(true);
  });
  it('기억 진화: 바뀌기 전 모습을 세대별로 두 칸 기억하고 수명이 다할 때 그 모습으로 진화할 수 있다 (원본 0x2062E80·0x21165A4)', () => {
    const agu = newDigimon(1, '아구몬');
    const m1 = remember(agu)!;
    expect(m1.first[3]).toBe('아구몬');
    const m2 = remember({ ...agu, speciesId: '가오몬', memory: m1 })!;
    expect([m2.first[3], m2.second[3]]).toEqual(['가오몬', '아구몬']);
    // 코로몬(유년기II)이 다음 세대(성장기) 기억 두 칸을 가지면 1/3씩
    const koro = { ...newDigimon(2, '코로몬'), memory: m2 };
    expect(memoryEvolution(koro, '아구몬', () => 0.1)).toBe('아구몬'); // r=0 → 둘째 기억
    expect(memoryEvolution(koro, '아구몬', () => 0.5)).toBe('가오몬'); // r=1 → 첫째 기억
    expect(memoryEvolution(koro, '아구몬', () => 0.9)).toBe(null); // r=2 → 원래 진화
    // 진화 조건을 못 채웠으면 첫째 기억
    expect(memoryEvolution(koro, null, () => 0.9)).toBe('가오몬');
    // 첫째만 있으면 1/2
    const one = { ...koro, memory: m1 };
    expect(memoryEvolution(one, '가오몬', () => 0.2)).toBe('아구몬');
    expect(memoryEvolution(one, '가오몬', () => 0.7)).toBe(null);
  });
  it('수명이 다한 개체만 기억 진화하고, 디지에그는 유년기I 기억으로 부화한다', () => {
    const mem = { first: { 3: '가오몬', 1: '푸니몬' }, second: {} };
    const young = { ...freshSave(0), digimon: [{ ...newDigimon(1, '코로몬'), hunger: 100, memory: mem }, newDigimon(2, '깜몬')] };
    // 수명 전에는 기억으로 진화하지 않는다
    expect(tickFarm(young, () => 0.2).events.some((e) => e.type === 'evolved')).toBe(false);
    const old = { ...young, digimon: young.digimon.map((d) => (d.uid === 1 ? { ...d, stageAge: LIFESPAN[2] } : d)) };
    const r = tickFarm(old, () => 0.2);
    const e = r.events.find((x) => x.type === 'evolved' && x.uid === 1);
    expect(e && e.type === 'evolved' && e.to).toBe('가오몬');
    expect(e && e.type === 'evolved' && e.memory).toBe(true);
    // 부화: 기억한 유년기I
    const egg = { ...young, digimon: [{ ...newDigimon(1, '깜몬'), isEgg: true, stageAge: 29, memory: mem }, newDigimon(2, '깜몬')] };
    expect(tickFarm(egg, () => 0.2).save.digimon[0].speciesId).toBe('푸니몬');
  });
  it('뿔몬→사이케몬은 롬 진화표 값(데이터10, 페널티 없음), 나머지는 위키 목록', () => {
    const tuno = { ...newDigimon(1, '뿔몬'), ap: { ...newDigimon(1, '뿔몬').ap, 데이터: 10 } };
    expect(findEvolution(tuno, 9, 999)).toMatchObject({ kind: 'evolve', to: '사이케몬' });
    // 위키: 아구몬은 페널티4면 바로 스카몬
    expect(findEvolution({ ...newDigimon(2, '아구몬'), penalties: 4 }, 9, 999)).toMatchObject({ kind: 'evolve', to: '스카몬' });
  });
  it('현재 HP: 훈련으로 줄고(최소1) 1/10 이하면 빈사, 자연 회복·양호실로 찬다', () => {
    expect(trainingHpCost(1)).toBe(-120);
    expect(facilityHpEffects(16)).toEqual([{ every: 2, amount: 8 }]);
    const base = { ...freshSave(0), nextUid: 3 };
    const mon = (patch: Partial<Digimon>) => ({ ...base, digimon: [{ ...newDigimon(1, '아구몬', () => 0.5), hunger: 100, ...patch }, newDigimon(2, '깜몬')] });
    const max = newDigimon(1, '아구몬', () => 0.5).stats.hp;
    // 자연 회복: 11분째에 최대의 1%
    let r = advance(mon({ hpNow: max - 50 }), 11, seeded(1));
    expect(r.save.digimon[0].hpNow).toBe(max - 50 + Math.trunc(max / 100));
    // 1/10 이하 → 빈사, 회복하면 해제
    r = tickFarm(mon({ hpNow: Math.trunc(max / 10) }), seeded(1));
    expect(r.events.some((e) => e.type === 'dying' && e.cause === 'hp')).toBe(true);
    const healed = { ...r.save, digimon: r.save.digimon.map((d) => (d.uid === 1 ? { ...d, hpNow: max } : d)) };
    expect(tickFarm(healed, seeded(1)).save.digimon[0].dying).toBe(false);
    // 배틀은 현재 HP로 시작하고 남은 HP가 그대로 남는다
    const d = { ...newDigimon(1, '아구몬', () => 0.5), hpNow: 100 };
    expect(createBattle([entrantOf(d, '일반')], []).units[0].hp).toBe(100);
    expect(applyBattleResult(d, false, false, () => 0.9, false, 40).hpNow).toBe(40);
  });
  it('양호실 HP 회복에도 케이지 레벨 배율이 붙는다', () => {
    const max = newDigimon(1, '아구몬', () => 0.5).stats.hp;
    const s = (lv: number): SaveData => ({ ...freshSave(0), nextUid: 3, cageLevels: { '미니 양호실': lv }, digimon: [{ ...newDigimon(1, '아구몬', () => 0.5), hunger: 100, cage: '미니 양호실', hpNow: max - 100 }, newDigimon(2, '깜몬')] });
    const gain = (lv: number) => (advance(s(lv), 2, seeded(1)).save.digimon[0].hpNow ?? 0) - (max - 100);
    expect(gain(0)).toBe(8);
    expect(gain(1)).toBe(16);
    expect(gain(2)).toBe(24);
  });
  it('먹으면 HP가 차고(포만감 1칸마다 1%), 다음 날 아침에는 가득 찬다', () => {
    const d = { ...newDigimon(1, '아구몬', () => 0.5), hpNow: 100 };
    const unit = 100 / getSpecies('아구몬').size;
    expect(eatHp(d, unit).hpNow).toBe(100 + Math.trunc(d.stats.hp / 100));
    const s = { ...freshSave(0), digimon: [{ ...d, hunger: 100 }], clock: 23 * 60 + 59 };
    const r = endDay(s, seeded(1));
    expect(r.save.digimon[0].hpNow).toBe(d.stats.hp); // 다음 날은 가득 (형규 지정)
  });
  it('케이지 레벨 업: 랭크가 허락하면 Lv1(값×1)·Lv2(값×1.5), 훈련 효과 2·3배', () => {
    const base = { ...freshSave(0), cages: [...freshSave(0).cages, '운동장'], bits: 999999 };
    expect(cageLevelUp(base, '운동장')).toMatchObject({ ok: false, reason: '지금의 테이머 랭크로는 레벨 업 할 수 없습니다.' });
    const champ = { ...base, champion: true };
    expect(cageLevelUp(champ, '운동장')).toEqual({ ok: true, next: 1, price: 10000 });
    expect(cageLevelUp({ ...champ, cageLevels: { 운동장: 1 } }, '운동장')).toEqual({ ok: true, next: 2, price: 15000 });
    expect(cageLevelUp({ ...champ, cageLevels: { 운동장: 2 } }, '운동장')).toMatchObject({ ok: false });
    expect(shopItems(champ).some((i) => i.id === 'cagelv:운동장')).toBe(true);
    // 배율: 계절 가산 뒤 곱하고 난수 폭을 더한다
    expect(trainingDelta(0, 3, 0, () => 0.5, 2)).toBe(trainingDelta(0, 6, 0, () => 0.5, 1));
  });
  it('부상 위험도는 상처약·진화로 0이 되고, 약·상처약 확률은 원본 표', () => {
    expect(CURE_CHANCE.slice(1)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(TREAT_CHANCE.slice(1)).toEqual([1, 1, 0.9, 0.8, 0.6, 0.5]);
    const d = { ...newDigimon(1, '코로몬'), injured: true, injuryRisk: 50, battles: 3 };
    const s = { ...freshSave(0), digimon: [d], salve: 1 };
    expect(only(treat(s, 1, () => 0).save).injuryRisk).toBe(0);
    const evo = evaluateEvolutions({ ...freshSave(0), digimon: [{ ...d, injured: false }] }, () => 0.5);
    expect(only(evo.save).injuryRisk).toBe(0);
  });
  it('디지에그 그림은 디지에그화 횟수로 고른다 (원본 0x2119B2C)', () => {
    expect([0, 1, 2, 6, 7, 8, 100].map(eggSpriteIndex)).toEqual([0, 1, 2, 6, 7, 7, 7]);
  });
  it('상한 먹이가 놓인 케이지에 오래 있으면 병 (help #139·#141)', () => {
    const s: SaveData = { ...freshSave(0), digimon: [{ ...newDigimon(1, '깜몬'), hunger: 100, cageInstance: 'c1' }] };
    expect(advance({ ...s }, 180, seeded(1)).save.digimon[0].sick).toBe(false);
    let cur = s;
    for (let i = 0; i < 180; i++) cur = tickFarm(cur, seeded(i), false, ['c1']).save;
    expect(cur.digimon[0].sick).toBe(true);
  });
});

describe('championship', () => {
  // y년차 가을 d일 09:00
  const at = (y: number, d: number) => (((y - 1) * 32 + 16 + (d - 1)) * 1440) + 9 * 60;
  const red = (clock: number): SaveData => ({ ...freshSave(0), clock, titles: won(3) });

  it('prelims need 레드 테이머 and run one match a day on autumn days 1-5', () => {
    expect(todaysMatches({ ...red(at(1, 1)), titles: won(1) }).map((m) => m.id)).not.toContain('prelim');
    let s = red(at(1, 1));
    const m = todaysMatches(s).find((x) => x.id === 'prelim')!;
    expect(m.name).toBe('챔피언십 예선 1전');
    const bits0 = s.bits;
    s = applyMatch(s, m, true);
    expect(todaysMatches(s).some((x) => x.id === 'prelim')).toBe(false); // 하루 한 경기
    s = applyMatch({ ...s, clock: at(1, 2) }, m, true);
    expect(s.bits).toBe(bits0); // 상금은 통과했을 때 한 번 (원본 50,000)
    s = applyMatch({ ...s, clock: at(1, 3) }, m, true);
    expect(s.qualifiedYear).toBe(1);
    expect(s.bits).toBe(bits0 + 50000);
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
    expect(s.bits).toBe(red(0).bits + 300000); // 원본 본선 우승 상금
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
      expect(matchEntryNotice(at(minutes))).toEqual({ key: '1:0:3', names: ['봄의 시작'] });
    }
    expect(matchEntryNotice(at(15 * 60))).toBeNull();
    expect(matchEntryNotice(at(21 * 60))).toBeNull();
    // 이미 딴 타이틀도, 같은 날에도 다시 도전할 수 있다
    expect(matchEntryNotice({ ...at(10 * 60), titles: won(1) })?.names).toEqual(['봄의 시작']);
    const m = todaysMatches(at(10 * 60))[0];
    const after = applyMatch(at(10 * 60), m, true);
    expect(after.bits).toBe(at(0).bits + m.prize);
    expect(todaysMatches(after).map((x) => x.id)).toContain(m.id);
    const again = applyMatch(after, m, true); // 같은 날 한 번 더
    expect(again.bits).toBe(at(0).bits + m.prize * 2);
    expect(again.titles.filter((x) => x === m.id)).toHaveLength(1);
  });
  it('read notices are suppressed that day, but can recur next year', () => {
    const s = { ...freshSave(0), clock: 2 * 1440 + 9 * 60 };
    const notice = matchEntryNotice(s)!;
    expect(matchEntryNotice(s, notice.key)).toBeNull();
    expect(matchEntryNotice({ ...s, clock: s.clock + 32 * 1440 }, notice.key)?.key).toBe('2:0:3');
    expect(matchEntryNotice(freshSave(0))).toBeNull();
  });
  it('championship notices respect rank, played prelims and the final round', () => {
    const s = { ...freshSave(0), clock: 16 * 1440 + 10 * 60, titles: won(3) };
    expect(matchEntryNotice({ ...s, titles: [] })).toBeNull();
    expect(matchEntryNotice(s)?.names).toContain('챔피언십 예선 1전');
    // 같은 날 타이틀 매치(원작 61개)도 열리므로 예선만 골라 치른다
    expect(matchEntryNotice(applyMatch(s, todaysMatches(s).find((m) => m.id === 'prelim')!, true))?.names).not.toContain('챔피언십 예선 1전');
    const finals = { ...s, clock: 52 * 1440 + 10 * 60, qualifiedYear: 1, finalRound: 1 };
    expect(matchEntryNotice(finals)?.names).toContain('챔피언십 본선 4강');
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
  it('사용자 지정 기본 배설 간격은 세대와 관계없이5시간이다', () => {
    for(const stage of [1,2,3,4,5,6])expect(poopInterval(stage)).toBe(300);
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
  it('약(주사기)은 병만 고치고, 어느 세대든 항상 듣는다', () => {
    const s = sickSave('깜몬');
    const ok = cure(s, 1, () => 0);
    expect(ok.save.digimon[0].sick).toBe(false);
    expect(ok.save.digimon[0].injured).toBe(true); // 부상은 그대로
    expect(ok.save.medicine).toBe(s.medicine - 1);
    expect(cure(s, 1, () => 0.99).save.digimon[0].sick).toBe(false);
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
  it('정원 초과면 1시간마다 그 케이지의 디지몬 수 - 1만큼 오른다 (원본 0x211AE94)', () => {
    const mon = (uid: number) => ({ ...newDigimon(uid, '아구몬'), hunger: 100, stress: 50, cage: '미니 양호실', cageInstance: 'c1' });
    const base = { ...freshEggSave(0), clock: 10 * 60 + 59 } as SaveData; // 다음 분이 정각
    const three = tickFarm({ ...base, digimon: [mon(1), mon(2), mon(3)] }, seeded(1)).save.digimon; // 정원 2에 3마리
    const two = tickFarm({ ...base, digimon: [mon(1), mon(2)] }, seeded(1)).save.digimon;
    const relief = two[0].stress!; // 정원 안: 시설 효과·자연 회복만
    expect(three[0].stress).toBe(relief + 2);
    const off = tickFarm({ ...base, clock: 10 * 60 + 10, digimon: [mon(1), mon(2), mon(3)] }, seeded(1)).save.digimon;
    expect(off[0].stress).toBeLessThanOrEqual(50); // 정각이 아니면 오르지 않는다
  });
  it('100이 되면 병에 걸린다 (한 번만)', () => {
    const s = tickFarm(one({ stress: 100 }), seeded(1)).save;
    expect(s.digimon[0]).toMatchObject({ sick: true, stress: 100, penalties: 1 });
    expect(STRESS.show).toBe(70);
  });
  it('훈련 스트레스는 원본 시설 표대로(연구소·병원·가스실 +10±1), 1시간마다 -1', () => {
    const tick = (patch: Partial<Digimon>) => tickFarm(one({ stress: 10, ...patch }), seeded(1)).save.digimon[0];
    const trained = tick({ cage: '미니 운동장', trainMinutes: 14 });
    expect(trained).toMatchObject({ stress: 10, trainDone: true });
    for (const r of [0, 0.5, 0.99]) expect(trainingSideDelta(2, 10, 0, () => r)).toBeGreaterThanOrEqual(9);
    expect(trainingSideDelta(2, 10, 0, () => 0.99)).toBeLessThanOrEqual(11);
    expect(tick({ cage: '미니 운동장', trainDone: true, trainMinutes: 0 }).stress).toBe(10); // 다시 넣기 전에는 훈련 없음
    expect(tick({ cage: '기본 케이지', trainDone: true }).trainDone).toBe(false);
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
      const d = newDigimon(1, '아구몬',()=>.5);
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
    const d = newDigimon(1, '아구몬',()=>.5);d.stats.atk = 52; d.stats.def = 30;
    expect(applyTraining(d, getCage('체육관'), 0, rolls(0, 0.5, 0.5))).toEqual(['공격 +1', '방어 +0 (하한)']);
    expect(d.stats.atk).toBe(53);expect(d.stats.def).toBe(30);
    expect(applyTraining(d, getCage('체육관'), 0, rolls(0, 0.5, 0.5))[0]).toBe('공격 +0 (상한)');
  });
  it('기존 저장이 원작 범위 밖이어도 임의로 끌어올리거나 깎지 않는다', () => {
    const d = newDigimon(1, '아구몬',()=>.5);d.stats.atk = 200;d.stats.def = 2;
    expect(applyTraining(d, getCage('체육관'), 0, rolls(0, 0.5, 0.5))).toEqual(['공격 +0 (상한)', '방어 +0 (하한)']);
    expect(d.stats.atk).toBe(200);expect(d.stats.def).toBe(2);
  });
  it('AP·내성의 실제 증감과 한계, 저장 재개를 보존한다', () => {
    const d = newDigimon(1, '아구몬',()=>.5);d.ap['용'] = 98;d.ap['짐승'] = 2;
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
    const loaded=upgradeSave(JSON.parse(JSON.stringify(s)));
    expect(loaded.digimon[0].stats).toEqual(migrated.stats);
    expect(upgradeSave(JSON.parse(JSON.stringify(loaded)))).toEqual(loaded);
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


describe('배틀 접근 AI 회귀',()=>{
  it('시작 알에서 깜몬→코로몬→아구몬으로 진화한 게으름 개체도 모든 모드에서 먼저 걷는다',()=>{
    let save=freshEggSave(0);save.digimon[0].personality='게으름';
    save=advance(save,30,()=>.5).save;const stages=[only(save)];
    save={...save,digimon:[{...only(save),stageAge:LIFESPAN[1]}]};save=evaluateEvolutions(save,()=>.5).save;stages.push(only(save));
    save={...save,digimon:[{...only(save),battles:3}]};save=evaluateEvolutions(save,()=>.5).save;stages.push(only(save));
    expect(stages.map(d=>d.speciesId)).toEqual(['깜몬','코로몬','아구몬']);
    for(const d of stages)for(const mode of ['일반','지원','특수'] as const){
      expect(d.personality).toBe('게으름');
      const foe={...newDigimon(2,'아구몬',()=>.5),personality:'솔직' as const};
      const state=createBattle([entrantOf(d,mode)],[entrantOf(foe,'일반')]);
      for(let i=0;i<20;i++)stepBattle(state,()=>.99);
      expect(state.units[0].wasHit).toBe(false);expect(state.units[0].x).toBeGreaterThan(110);
      expect(Number.isFinite(state.units[0].y)).toBe(true);
    }
  });
  it('지원은 기술이 없거나TP가 부족하거나 특수 선택에 실패해도 멈춘 상대에게 접근해 기본 공격한다',()=>{
    for(const species of ['깜몬','코로몬','아구몬'])for(const tp of [0,100]){
      const d={...newDigimon(1,species,()=>.5),personality:'게으름' as const};
      const foe={...newDigimon(2,'아구몬',()=>.5),personality:'솔직' as const};foe.stats={...foe.stats,hp:100000};
      const state=createBattle([entrantOf(d,'지원')],[entrantOf(foe,'일반')]);
      state.units[0].x=100;state.units[0].cd=0;state.units[0].tp=tp;
      const hits=[];
      for(let i=0;i<80&&!state.over;i++){
        state.units[1].x=280;state.units[1].cd=100;
        hits.push(...stepBattle(state,()=>.99).filter(e=>e.type==='hit'&&e.from===0));
      }
      expect(hits.length).toBeGreaterThan(0);expect(state.units[0].wasHit).toBe(false);
      expect(hits.some(e=>e.type==='hit'&&!e.special)).toBe(true);
    }
  });
  it('지원의 체력이 낮은 아군 회복 우선순위는 유지한다',()=>{
    const a={...newDigimon(1,'파닥몬'),personality:'열혈' as const},b={...newDigimon(2,'코로몬'),personality:'솔직' as const};
    const state=createBattle([entrantOf(a,'지원'),entrantOf(b,'일반')],[entrantOf(newDigimon(3,'아구몬'),'일반')]);
    state.units[0].cd=0;state.units[0].tp=30;state.units[1].hp=state.units[1].maxHp*.3;
    expect(stepBattle(state,()=>.99)).toEqual(expect.arrayContaining([expect.objectContaining({type:'heal',from:0,to:1})]));
    expect(state.units[0].tp).toBe(25);
  });
  it('같은 종/성격/능력치라면 사육 출신과 사냥 출신의 이동 처리가 동일하다',()=>{
    const born=newDigimon(1,'아구몬',()=>.68),wild=newDigimon(1,'아구몬',()=>.68,true),foe=newDigimon(2,'아구몬',()=>.5);
    expect(born.personality).toBe('게으름');expect(wild.personality).toBe(born.personality);expect(wild.stats).toEqual(born.stats);
    for(const mode of ['일반','지원','특수'] as const){
      const a=createBattle([entrantOf(born,mode)],[entrantOf(foe,'일반')]),b=createBattle([entrantOf(wild,mode)],[entrantOf(foe,'일반')]);
      const ar=seeded(41),br=seeded(41);for(let i=0;i<40;i++){stepBattle(a,ar);stepBattle(b,br);}
      expect(a.units[0].x).toBe(b.units[0].x);expect(a.units[0].y).toBe(b.units[0].y);
    }
  });
});

describe('프리 배틀 (원본 대진·상금)',()=>{
 it('원본 NPC 표: 상대 120명, 상금은 디지몬마다 정해져 있다',()=>{
  expect(FREE_FOES.size).toBe(120);
  expect(FREE_FOES.get(456)).toMatchObject({nick:'카픈',speciesId:'카프리몬',level:1,prize:40});
  expect(FREE_FOES.get(575)).toMatchObject({speciesId:'다이아나몬',level:10,prize:4300});
  expect(FREE_POOLS[0][4]).toEqual([456,457,458,468,469,470]);
 });
 it('하루 대진: 1:1·3:3 각각 레벨 슬롯 0·2·4·6·8을 포함하고, 상금은 상대 상금의 합',()=>{
  const list=freeBattleLineup(1,0,3);
  expect(freeBattleLineup(1,0,3)).toEqual(list); // 같은 날은 같은 대진
  for(const f of [1,3] as const){
   const xs=list.filter(x=>x.format===f);
   expect(xs.length).toBeGreaterThanOrEqual(5);expect(xs.length).toBeLessThanOrEqual(9);
   for(const lv of [1,3,5,7,9])expect(xs.some(x=>x.level===lv)).toBe(true);
   for(const x of xs){expect(x.foes).toHaveLength(f);expect(x.prize).toBe(x.foes.reduce((n,y)=>n+y.prize,0));}
  }
  const ones=list.filter(x=>x.format===1).map(x=>x.foes[0].no);
  expect(new Set(ones).size).toBe(ones.length);
 });
 it('프리 배틀 상대로 실제 배틀이 끝난다',()=>{
  for(const entry of freeBattleLineup(1,1,2).slice(0,2)){
   const foes=freeBattleFoes(entry,seeded(12));
   expect(foes.map(x=>x.speciesId)).toEqual(entry.foes.map(x=>x.speciesId));
   const mine=Array.from({length:entry.format},(_,i)=>entrantOf(newDigimon(i+1,'코로몬',seeded(i)),'일반'));
   expect(runBattle(mine,foes,seeded(33)).over).toBe(true);
  }
 });
 it('인원이 다른 타이틀 매치(3 VS 1, 1 VS 3, 3 VS 2)도 배틀이 끝난다',()=>{
  for(const [a,b] of [[3,1],[1,3],[3,2]]){
   const foes=makeEnemies(3,b,1,seeded(5));
   const mine=Array.from({length:a},(_,i)=>entrantOf(newDigimon(i+1,'아구몬',seeded(i)),'일반'));
   expect(runBattle(mine,foes,seeded(9)).over).toBe(true);
  }
 });
});

it('하루 마감은23:58까지 진행하고23:59부터 멈춘다',()=>{
 const s=freshSave(0);expect(isNight({...s,clock:21*60})).toBe(false);
 expect(isNight({...s,clock:23*60+58})).toBe(false);
 expect(isNight({...s,clock:23*60+59})).toBe(true);
});

describe('training effect preview',()=>{
  it('결과 비율은100%이며 원본 표의 계절·난수·HP 반올림 범위를 그대로 포함한다',()=>{
    for(const season of [0,1,2,3])for(const cage of CAGES){
      const preview=trainingPreview(cage,season);
      expect(preview.outcomes.reduce((n,r)=>n+r.weight,0)).toBe(100);
      for(let roll=0;roll<100;roll++){
        const d={...newDigimon(1,'아구몬'),personality:'쿨' as const};
        const changes=applyTraining(d,cage,season,()=>roll/100);
        let left=roll;const row=preview.outcomes.find(r=>{if(left<r.weight)return true;left-=r.weight;return false;})!;
        for(const text of changes){
          const match=text.match(/^(.+) ([+-]\d+)/);if(!match)continue;
          if(match[1]==='배틀 수')continue;
          const predicted=row.changes.find(c=>c.label===match[1]);expect(predicted).toBeDefined();
          // 실제 개체 상/하한이 범위를0방향으로 줄일 수 있다.
          const n=Number(match[2]);expect(n).toBeGreaterThanOrEqual(Math.min(0,predicted!.min));expect(n).toBeLessThanOrEqual(Math.max(0,predicted!.max));
        }
      }
    }
  });
  it('조회는 개체나 표를 변경하지 않으며 원본 표에 없는 시설은 임시 효과로 구별한다',()=>{
    const cage=getCage('체육관'),before=JSON.stringify(cage);
    expect(trainingPreview(cage,1)).toEqual(trainingPreview(cage,1));expect(JSON.stringify(cage)).toBe(before);
    expect(trainingPreview({...cage,no:999},0).source).toBe('temporary');
  });
});

describe('legacy title migration follows current rank rules',()=>{
  it('임시 타이틀6개 저장은 승리 기록을 더하지 않고 새 기준으로 랭크·용량·진화 제한을 계산한다',()=>{
    const before={...freshSave(0),titles:['t1','t2','t3','t4','t5','t6']};
    const copy=JSON.stringify(before),after=upgradeSave(before),rank=tamerRank(after);
    expect(after.titles).toEqual(['m8','m4','m55','m25','m30','m38']);
    expect(rankName(rank)).toBe('화이트 테이머');expect(rank).toBe(4);
    expect(capacityOf(after)).toBe(120);expect(cageSpaceOf(after)).toBe(20);expect(maxStageForRank(rank)).toBe(4);
    expect(after.digimon.length).toBe(before.digimon.length);expect(JSON.stringify(before)).toBe(copy);
  });
  it('옛/새 ID 혼합·중복 기록은 한 번만 집계하고 여러 번 불러와도 승리가 추가되지 않는다',()=>{
    const ids=['t1','m8','t2','t2','m4','t9','m52'];
    expect(migrateTitleIds(ids)).toEqual(['m8','m4','m52']);
    const once=upgradeSave({...freshSave(0),titles:ids}),twice=upgradeSave(JSON.parse(JSON.stringify(once)));
    expect(twice.titles).toEqual(once.titles);expect(tamerRank(twice)).toBe(tamerRank(once));
    expect(capacityOf(twice)).toBe(capacityOf(once));expect(ids).toHaveLength(7);
  });
  it('새 저장/이미 변환된 ID는 유지하고 챔피언십 우승도 현재 규칙으로 계산한다',()=>{
    expect(migrateTitleIds([])).toEqual([]);
    expect(migrateTitleIds(['future-title','constructor'])).toEqual(['future-title','constructor']);
    const now=upgradeSave({...freshSave(0),titles:['m8','m4','m55']});expect(now.titles).toEqual(['m8','m4','m55']);expect(tamerRank(now)).toBe(3);
    const champion=upgradeSave({...freshSave(0),titles:['t1'],champion:true});expect(champion.champion).toBe(true);expect(tamerRank(champion)).toBe(9);
  });
});

describe('original hunt terrain',()=>{
  const grid=(width=8,height=8):HuntTerrain=>({width,height,tileSize:8,cells:new Uint8Array(width*height)});
  it('16사냥터를 원본 ATR 검증 보고서와 동일하게 복원하고 지도 번호를 공유한다',()=>{
    expect(Object.keys(HUNT_MAP)).toHaveLength(16);
    for(const field of FIELDS){const g=huntTerrain(field.id)!;expect(g).not.toBeNull();expect(g.cells.length).toBe(128*128);expect(g.tileSize).toBe(8);
      const counts:Record<string,number>={};for(const value of g.cells)counts[value]=(counts[value]??0)+1;
      const audit=(terrainAudit.maps as Record<string,{counts:Record<string,number>;solidCells:number}>)[HUNT_MAP[field.id]];
      expect(counts).toEqual(audit.counts);expect(g.cells.filter(x=>x&1).length).toBe(audit.solidCells);
      expect(huntTerrain(field.id)).toBe(g);
    }
    expect(huntTerrain('없는 사냥터')).toBeNull();
  });
  it('차단 비트와 지형 속성을 구별하고 범위 밖·유효하지 않은 좌표는 막는다',()=>{
    const g=grid();for(const flag of [0,1,2,3,4,5]){g.cells[0]=flag;expect(canStandOnHuntTerrain(g,{x:4,y:4},0)).toBe(!(flag&1));}
    for(const p of [{x:-1,y:4},{x:64,y:4},{x:4,y:64},{x:NaN,y:4}])expect(canStandOnHuntTerrain(g,p)).toBe(false);
    expect(huntTerrainAt(g,{x:Infinity,y:0})).toBe(1);
    expect(huntTerrainLineClear(g,{x:4,y:4},{x:NaN,y:4})).toBe(false);
  });
  it('빠른 이동도8px 벽을 관통하지 않고 옆 축으로 미끄러진 실제 경로를 반환한다',()=>{
    const g=grid();for(let y=0;y<8;y++)g.cells[y*8+3]=1;
    const from={x:12,y:12},to={x:52,y:44};expect(huntTerrainLineClear(g,from,to)).toBe(false);
    const moved=moveOnHuntTerrain(g,from,to);expect(moved.x).toBeLessThanOrEqual(20);expect(moved.y).toBeCloseTo(44);expect(moved.blockedX).toBe(true);
    expect(moved.path.length).toBeGreaterThan(1);for(const p of moved.path)expect(canStandOnHuntTerrain(g,p)).toBe(true);
    expect(moveOnHuntTerrain(g,from,{x:10000,y:12}).x).toBeLessThanOrEqual(20);
  });
  it('대각선으로 맞닿은 벽 틈을 통과하지 않고 비정상 목적지도 차단한다',()=>{
    const g=grid();g.cells[1]=1;g.cells[8]=1;
    const moved=moveOnHuntTerrain(g,{x:4,y:4},{x:12,y:12});expect(moved.x).toBe(4);expect(moved.y).toBe(4);
    expect(moveOnHuntTerrain(g,{x:4,y:4},{x:Infinity,y:4})).toMatchObject({x:4,y:4,blockedX:true});
  });
  it('모든 사냥터의 잘라낸 화면 모서리·중앙에서도 막힌 칸에 생성하지 않는다',()=>{
    const rng=seeded(39);
    for(const id of Object.keys(HUNT_MAP))for(const x of [0,32,64])for(const y of [0,232,464]){
      const g=huntTerrain(id)!,rect={x0:x+80,y0:y+110,x1:x+880,y1:y+490},points=huntSpawnPoints(g,rect);
      expect(points.length).toBeGreaterThan(0);
      for(let i=0;i<10;i++){const p=pickHuntSpawn(points,rng)!;expect(canStandOnHuntTerrain(g,p)).toBe(true);expect(p.x).toBeGreaterThanOrEqual(rect.x0);expect(p.y).toBeLessThanOrEqual(rect.y1);}
    }
    const closed=grid();closed.cells.fill(1);expect(pickHuntSpawn(huntSpawnPoints(closed,{x0:0,y0:0,x1:64,y1:64}),rng)).toBeNull();
  });
  it('실제16지도에서 이동을 반복해도 발 위치와 경로는 통행 가능한 곳에 남는다',()=>{
    const rng=seeded(628);
    for(const id of Object.keys(HUNT_MAP)){
      const g=huntTerrain(id)!,points=huntSpawnPoints(g,{x0:80,y0:110,x1:880,y1:490});let p=pickHuntSpawn(points,rng)!;
      for(let i=0;i<100;i++){const moved=moveOnHuntTerrain(g,p,{x:p.x+(rng()-0.5)*100,y:p.y+(rng()-0.5)*100});expect(canStandOnHuntTerrain(g,moved)).toBe(true);for(const point of moved.path)expect(canStandOnHuntTerrain(g,point)).toBe(true);p=moved;}
    }
  });
});

describe('사용자 지정 성격 효과와 원본 SP 연결',()=>{
  const mon=(uid=1,personality:Digimon['personality']='쿨',species='아구몬'):Digimon=>({...newDigimon(uid,species,()=>.5),personality,hunger:80,restCycle:{species,awakeLeft:10000,sleepLeft:0}});
  const saveOf=(...digimon:Digimon[]):SaveData=>({...freshEggSave(0),clock:480,digimon});
  const duel=(p:Digimon['personality']='쿨',mode:'일반'|'지원'|'특수'='일반')=>createBattle([entrantOf(mon(1,p),mode)],[entrantOf(mon(2,'쿨'),'일반')]);
  it('KO 기본 부상25%, 대담35%의 경계와 기존 부상·알약·겨울 보정을 유지한다',()=>{
    for(const p of ['솔직','쿨','열혈','대담','겁쟁이','게으름','성급한','제멋대로'] as const){
      const chance=p==='대담'?.35:.25,d=mon(1,p);
      expect(applyBattleResult(d,false,true,()=>chance-.0001).injured).toBe(true);
      expect(applyBattleResult(d,false,true,()=>chance).injured).toBe(false);
      expect(applyBattleResult(d,true,false,()=>0).injured).toBe(false);
    }
    expect(applyBattleResult({...mon(),injured:true},true,false,()=>.99).injured).toBe(true);
    expect(applyBattleResult(mon(),false,true,()=>.49,true).injured).toBe(true);
    expect(applyBattleResult({...mon(),protein:4},false,true,()=>.39).injured).toBe(true);
  });
  it('게으름0.85배는 첫 피격 전후 동일하고 대담은1.1배 이동한다',()=>{
    const movement=(p:Digimon['personality'],wasHit=false)=>{const s=duel(p);s.units[0].wasHit=wasHit;stepBattle(s,()=>.99);return s.units[0].x-70;};
    expect(movement('게으름')/movement('쿨')).toBeCloseTo(.85);
    expect(movement('게으름',true)).toBeCloseTo(movement('게으름'));
    expect(movement('대담')/movement('쿨')).toBeCloseTo(1.1);
  });
  it('대담 공격 대기0.9배를 추가하면서 제멋대로의 기존 피해1.1배/대기0.9배를 유지한다',()=>{
    const attack=(p:Digimon['personality'])=>{const s=duel(p);s.units[0].x=380;s.units[0].cd=0;const hit=stepBattle(s,()=>.99).find(e=>e.type==='hit'&&e.from===0);return {cd:s.units[0].cd,hit};};
    expect(attack('대담').cd/attack('쿨').cd).toBeCloseTo(.9);
    const selfish=attack('제멋대로'),base=attack('쿨');
    expect(selfish.cd/base.cd).toBeCloseTo(.9);
    expect(selfish.hit?.type).toBe('hit');expect(base.hit?.type).toBe('hit');
    if(selfish.hit?.type==='hit'&&base.hit?.type==='hit'){expect(selfish.hit.damage).toBeGreaterThan(base.hit.damage);expect(Math.abs(selfish.hit.damage-base.hit.damage*1.1)).toBeLessThanOrEqual(1);}
  });
  it('겁쟁이는 세 모드 모두 먼 수적 열세에서는 후퇴하고 가까워지면 공격한다',()=>{
    for(const mode of ['일반','지원','특수'] as const){
      const s=createBattle([entrantOf(mon(1,'겁쟁이'),mode)],[entrantOf(mon(2),'일반'),entrantOf(mon(3),'일반')]);
      s.units[0].x=100;s.units[0].y=100;s.units[1].x=220;s.units[1].y=100;s.units[2].x=400;
      stepBattle(s,()=>.99);expect(s.units[0].x).toBeLessThan(100);
      s.units[0].cd=0;s.units[1].x=s.units[0].x+30;s.units[1].y=s.units[0].y;
      expect(stepBattle(s,()=>.99)).toEqual(expect.arrayContaining([expect.objectContaining({type:'hit',from:0,to:1})]));
    }
  });
  it('성급한은 공격 직후 대기 중 실제로 뒤로 빠진다',()=>{
    const s=duel('성급한');s.units[0].x=380;s.units[0].cd=0;
    stepBattle(s,()=>.99);const x=s.units[0].x;stepBattle(s,()=>.99);expect(s.units[0].x).toBeLessThan(x);
  });
  it('솔직 훈련은 양수만1.15배 반올림하고 실제 안내 범위도 일치한다',()=>{
    expect(personalityTraining(10,'솔직')).toBe(12);expect(personalityTraining(-10,'솔직')).toBe(-10);expect(personalityTraining(0,'솔직')).toBe(0);
    const cage={...getCage('체육관'),no:999,gain:10,up:['atk' as const],down:['def' as const],apUp:['용' as const],apDown:['물' as const]};
    const a=mon(1,'솔직'),b=mon();a.stats.atk=b.stats.atk=trainingBounds(a.speciesId,'atk').min;a.ap.물=b.ap.물=20;
    const before=a.stats.atk,def=a.stats.def;
    const result=applyTraining(a,cage,0,()=>.5);applyTraining(b,cage,0,()=>.5);
    expect(a.stats.atk-before).toBe(12);expect(b.stats.atk-before).toBe(10);expect(a.stats.def-def).toBe(-1);expect(a.ap.물).toBe(19);
    expect(a.ap.용).toBe(35);expect(b.ap.용).toBe(30);expect(result).toContain('공격 +12');
    expect(trainingPreview(cage,0,'솔직').outcomes[0].changes.find(c=>c.label==='공격')).toMatchObject({min:12,max:12});
  });
  it('솔직은 마지막 희귀 후보 기술을3배 가중 선택하며 TP 부족 기술은 선택하지 않는다',()=>{
    const chosen=Array.from({length:400},(_,i)=>pickBattleSkill('아구몬',()=>(i+.5)/400,100,'솔직')!);
    expect(chosen.filter(s=>s.slot===1)).toHaveLength(300);
    for(let i=0;i<100;i++)expect(pickBattleSkill('아구몬',()=>i/100,5,'솔직')).toBeNull();
  });
  it('열혈의 깨어 있는 포만감 감소는1.3배이며 잠들면 소비하지 않는다',()=>{
    const a=mon(1,'열혈'),b=mon(2,'쿨');const s=saveOf(a,b),r=tickFarm(s,()=>.5).save;
    expect((80-r.digimon[0].hunger)/(80-r.digimon[1].hunger)).toBeCloseTo(1.3);
    a.restCycle!.sleepLeft=10;expect(tickFarm(saveOf(a),()=>.5).save.digimon[0].hunger).toBe(80);
  });
  it('성급한 달리기는 깨어 있고 실제 훈련 중일 때만 판정한다',()=>{
    const d={...mon(1,'성급한'),cage:'체육관'};expect(isTraining(d)).toBe(true);
    for(const patch of [{trainDone:true},{sick:true},{injured:true},{hunger:0},{isEgg:true},{cage:'기본 케이지'},{restCycle:{species:d.speciesId,awakeLeft:0,sleepLeft:10}}])expect(isTraining({...d,...patch})).toBe(false);
  });
  it('일반 성격은 터치로 깨어나고 게으름은20% 성공, 실패하면 수면/쓰다듬기 보상 보존',()=>{
    const d=mon(1,'게으름');d.restCycle!.sleepLeft=100;const s=saveOf(d),before=JSON.stringify(s);
    const fail=pet(s,1,()=>.2);expect(fail.awakened).toBe(false);expect(fail.save).toBe(s);expect(fail.soothed).not.toBe(true);expect(JSON.stringify(s)).toBe(before);
    const success=pet(s,1,()=>.199);expect(success.awakened).toBe(true);expect(isSleeping(success.save.digimon[0])).toBe(false);
    const normal=pet(saveOf({...d,personality:'쿨'}),1,()=>.99);expect(normal.awakened).toBe(true);
    expect(pet({...s,clock:1439},1,()=>0).awakened).toBe(false);
    expect(pet(saveOf({...d,pettedAt:479}),1,()=>0).awakened).toBe(true);
  });
  it('동거 스트레스는 실제 같은 시설의 타인에게 분 단위 가산하며 출처 수와 무관하게 하루10 제한',()=>{
    const a={...mon(1,'제멋대로'),cageInstance:'a'},b={...mon(2),cageInstance:'a'},c={...mon(3,'제멋대로'),cageInstance:'b'};
    const s=saveOf(a,b,c),before=JSON.stringify(s),r=tickFarm(s,()=>.5).save;
    expect(r.digimon[1].socialStress!.added).toBeCloseTo(10/1440);expect(r.digimon[0].socialStress!.added).toBe(0);expect(r.digimon[2].socialStress!.added).toBe(0);
    const capped=tickFarm(saveOf(a,{...b,socialStress:{day:0,added:9.999}}),()=>.5).save.digimon[1];expect(capped.socialStress!.added).toBe(10);
    const moved=tickFarm({...r,digimon:r.digimon.map(d=>d.uid===1?{...d,cageInstance:'b'}:d)},()=>.5).save;expect(moved.digimon[1].socialStress!.added).toBe(r.digimon[1].socialStress!.added);
    const restored=JSON.parse(JSON.stringify(r)) as SaveData;expect(tickFarm(restored,()=>.5).save.digimon[1].socialStress!.added).toBeCloseTo(20/1440);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('같은 종류의 분리 시설/미배치/알은 동거로 치지 않고 다음 날짜에 가산 한도가 초기화된다',()=>{
    const a={...mon(1,'제멋대로'),cageInstance:'a'},b={...mon(2),cageInstance:'b'};
    for(const source of [{...a,cageInstance:'b',isEgg:true},{...a,cageInstance:null},a])expect(tickFarm(saveOf(source,b),()=>.5).save.digimon[1].socialStress!.added).toBe(0);
    b.cageInstance='a';b.socialStress={day:0,added:10};const r=tickFarm({...saveOf(a,b),clock:1439},()=>.5).save;expect(r.digimon[1].socialStress).toMatchObject({day:1});expect(r.digimon[1].socialStress!.added).toBeCloseTo(10/1440);
  });
  it('216종×8성격 SP 선택은 원본 조건 두 개/기본 쌍과 같고 TP/이름도 원본을 보존한다',()=>{
    for(const [species,row] of Object.entries(supportTable.species))for(const personality of ['솔직','쿨','열혈','대담','겁쟁이','게으름','성급한','제멋대로'] as const){
      const i=row.personalities.indexOf(personality),ids=[...new Set(row.pairs[i<0?2:i])].filter(Boolean);
      expect(supportSkills(species,personality)).toEqual(ids.map(id=>supportTable.skills.find(sk=>sk.id===id)));
    }
    expect(supportSkills('아구몬','열혈').map(s=>s.name)).toEqual(['도발']);expect(supportSkills('아구몬','대담').map(s=>s.id)).toEqual([12]);
    expect(supportSkills('아구몬','게으름')).toEqual([]);expect(supportSkills('파닥몬','열혈').map(s=>s.id)).toEqual([2]);expect(supportSkills('파닥몬','쿨').map(s=>s.id)).toEqual([28]);
  });
  it('SP가 없는 개체/TP 부족은 무료 회복 대신 기본 공격으로 진행한다',()=>{
    for(const [species,p] of [['아구몬','게으름'],['파닥몬','열혈']] as const){
      const s=createBattle([entrantOf(mon(1,p,species),'지원')],[entrantOf(mon(2),'일반')]);s.units[0].x=380;s.units[0].cd=0;s.units[0].tp=0;s.units[0].hp=1;
      expect(stepBattle(s,()=>.99)).toEqual(expect.arrayContaining([expect.objectContaining({type:'hit',from:0,special:false})]));
    }
  });
  it('도발은 적의 타겟을 시전자에게 바꾸고 방어 SP는 지속 중 재사용/TP 낭비를 막는다',()=>{
    const s=createBattle([entrantOf(mon(1,'열혈'),'지원'),entrantOf(mon(2),'일반')],[entrantOf(mon(3),'일반')]);s.units[0].cd=0;
    const events=stepBattle(s,()=>.99);expect(events).toEqual(expect.arrayContaining([expect.objectContaining({type:'support',skill:expect.objectContaining({id:1})})]));expect(s.units[2].taunt?.from).toBe(0);
    const b=duel('대담','지원');b.units[0].cd=0;const tp=b.units[0].tp;stepBattle(b,()=>.99);expect(b.units[0].tp).toBe(tp-10);expect(buffMultiplier(b.units[0],'def',b.t)).toBe(1.15);
    b.units[0].cd=0;const out:Parameters<typeof useSupport>[2]=[];expect(useSupport(b,b.units[0],out)).toBe(false);expect(b.units[0].tp).toBe(tp-10);expect(buffMultiplier(b.units[0],'def',16)).toBe(1);
  });
  it('파닥몬 쿨의 부활은 KO 직후 한 번만 소비하며 승패 판정 전에 복귀한다',()=>{
    const s=createBattle([entrantOf(mon(1,'쿨','파닥몬'),'일반')],[entrantOf(mon(2),'일반')]);s.units[0].hp=1;s.units[1].x=100;s.units[1].cd=0;const tp=s.units[0].tp;
    const events=stepBattle(s,()=>.99);expect(events.some(e=>e.type==='ko'&&e.id===0)).toBe(true);expect(events.some(e=>e.type==='support'&&e.skill.id===28)).toBe(true);expect(s.units[0].alive).toBe(true);expect(s.units[0].tp).toBe(tp-5);expect(s.over).toBe(false);
    s.units[0].hp=1;s.units[1].cd=0;stepBattle(s,()=>.99);expect(s.units[0].alive).toBe(false);expect(s.winner).toBe(1);
  });
});

it('원본 단일/전체 치료 SP의 실제 대상 수·상한·TP 차감과 기본 회복 대체를 검사한다',()=>{
  for(const [species,p,id,all] of [['파닥몬','열혈',2,false],['엔젤몬','열혈',5,true],['엔젤우몬','열혈',6,true],['릴리몬','쿨',4,false],['발키리몬','열혈',7,true]] as const){
    const caster={...newDigimon(1,species,()=>.5),personality:p},ally=newDigimon(2,'아구몬',()=>.5);
    const s=createBattle([entrantOf(caster,'지원'),entrantOf(ally,'일반')],[entrantOf(newDigimon(3,'아구몬',()=>.5),'일반')]);
    s.units[0].tp=100;s.units[0].cd=0;s.units[0].hp=s.units[0].maxHp*.5;s.units[1].hp=s.units[1].maxHp*.3;
    const events:Parameters<typeof useSupport>[2]=[];expect(useSupport(s,s.units[0],events)).toBe(true);
    expect(events.filter(e=>e.type==='heal')).toHaveLength(all?2:1);expect(events).toEqual(expect.arrayContaining([expect.objectContaining({type:'heal',to:1,support:expect.objectContaining({id})})]));
    expect(s.units[0].tp).toBe(100-supportTable.skills.find(sk=>sk.id===id)!.tpCost);expect(s.units.every(u=>u.hp<=u.maxHp)).toBe(true);
  }
});
it('단일/전체 강화와5종 내성 SP가 실제 소유 쌍으로 발동하고15초 뒤 해제된다',()=>{
  const seen=new Set<number>();
  for(const [species,row] of Object.entries(supportTable.species))for(let index=0;index<2;index++){
    const id=row.pairs[index][0];if(id<10||id>27||seen.has(id))continue;seen.add(id);
    const d={...newDigimon(1,species,()=>.5),personality:row.personalities[index] as Digimon['personality']};
    const s=createBattle([entrantOf(d,'지원'),entrantOf(newDigimon(2,'아구몬',()=>.5),'일반')],[entrantOf(newDigimon(3,'아구몬',()=>.5),'일반')]);
    s.units[0].tp=100;s.units[0].cd=0;const events:Parameters<typeof useSupport>[2]=[];
    expect(useSupport(s,s.units[0],events)).toBe(true);expect(events).toEqual([expect.objectContaining({type:'support',targets:id%2?[0,1]:[0],skill:expect.objectContaining({id})})]);
    const key=Object.keys(s.units[0].buffs!)[0] as Parameters<typeof buffMultiplier>[1];expect(buffMultiplier(s.units[0],key,0)).toBe(1.15);expect(buffMultiplier(s.units[0],key,15)).toBe(1);
  }
  expect([...seen].sort((a,b)=>a-b)).toEqual(Array.from({length:18},(_,i)=>i+10));
  expect(battleElement(battleSkills('아구몬')[0].record)).toBe('열');expect(battleElement(battleSkills('위자몬')[0].record)).toBe('천둥');
});
it('실제 전투의 내성 SP는 대응 속성 필살기만 줄이고 버프를 저장 능력치에 쓰지 않는다',()=>{
  const a={...newDigimon(1,'아구몬',()=>.5),personality:'쿨' as const},b=newDigimon(2,'아구몬',()=>.5),before=JSON.stringify(a.stats);
  const attack=(resist:boolean)=>{const s=createBattle([entrantOf(a,'특수')],[entrantOf(b,'일반')]);s.units[0].x=380;s.units[0].cd=0;if(resist)s.units[1].buffs={열:15};const e=stepBattle(s,()=>0).find(e=>e.type==='hit'&&e.from===0);return e?.type==='hit'?e.damage:0;};
  expect(attack(true)).toBeLessThan(attack(false));expect(JSON.stringify(a.stats)).toBe(before);
});

it('기존 솔직1.2배·쿨1.6배 특수 빈도를 새 훈련/희귀 후보 효과와 함께 유지한다',()=>{
  const special=(personality:Digimon['personality'],roll:number)=>{
    const d={...newDigimon(1,'아구몬',()=>.5),personality};d.stats.int=60;
    const s=createBattle([entrantOf(d,'일반')],[entrantOf({...d,uid:2},'일반')]);s.units[0].x=380;s.units[0].cd=0;
    const event=stepBattle(s,()=>roll).find(e=>e.type==='hit'&&e.from===0);return event?.type==='hit'&&event.special;
  };
  expect(special('게으름',.09)).toBe(false);expect(special('솔직',.09)).toBe(true);
  expect(special('솔직',.11)).toBe(false);expect(special('쿨',.11)).toBe(true);
});
it('열혈은 기존 피해1.2배와 새 포만감 감소1.3배를 함께 유지한다',()=>{
  const damage=(personality:Digimon['personality'])=>{
    const d={...newDigimon(1,'아구몬',()=>.5),personality},foe={...d,uid:2,personality:'쿨' as const};
    const s=createBattle([entrantOf(d,'일반')],[entrantOf(foe,'일반')]);s.units[0].x=380;s.units[0].cd=0;
    const event=stepBattle(s,()=>.99).find(e=>e.type==='hit'&&e.from===0);return event?.type==='hit'?event.damage:0;
  };
  expect(damage('열혈')).toBeGreaterThan(damage('쿨'));expect(Math.abs(damage('열혈')-damage('쿨')*1.2)).toBeLessThanOrEqual(1);
});
