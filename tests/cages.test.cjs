const {test}=require('node:test');
const assert=require('node:assert/strict');
global.window={};require('../web/cages.js');const rules=window.CageRules;
const pet=()=>({cage:'gym',energy:50,hunger:50,hp:50,attack:10,defense:10,speed:10});
test('training waits 15 ticks and applies its cost once',()=>{const p=pet();for(let i=0;i<14;i++)assert.equal(rules.tick(p),null);assert.equal(p.attack,10);assert.equal(rules.tick(p),'trained');assert.equal(p.attack,12);assert.equal(p.energy,42);assert.equal(p.hunger,47);assert.equal(p.cageSeconds,0);});
test('exhausted partners do not train or spend energy',()=>{const p={...pet(),energy:14};for(let i=0;i<15;i++)rules.tick(p);assert.equal(p.attack,10);assert.equal(p.energy,14);});
test('clinic recovers and clamps health',()=>{const p={...pet(),cage:'clinic',hp:98,energy:96};for(let i=0;i<15;i++)rules.tick(p);assert.equal(p.hp,100);assert.equal(p.energy,100);assert.equal(p.attack,10);});
test('free cage does not train',()=>{const p={...pet(),cage:'free'};for(let i=0;i<30;i++)rules.tick(p);assert.equal(p.attack,10);assert.equal(p.cageSeconds,0);});
