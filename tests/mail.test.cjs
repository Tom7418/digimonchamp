const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// 실제 안내 큐와 일정 점검 코드를 연결해 저장·재접속 경계의 중복과 유실을 확인한다.
function setup(readKey = null) {
  const source = fs.readFileSync(path.join(__dirname, '../web/game.js'), 'utf8');
  const start = source.indexOf('  let mailOpen = false;');
  const end = source.indexOf('  function matchDays(', start);
  assert.ok(start > 0 && end > start);
  const box = { hidden: true, querySelector: () => ({ textContent: '' }) };
  const view = { tips: {}, entryNoticeRead: readKey };
  const saved = [];
  const context = vm.createContext({ view, save: {}, battle: null, hunt: null, titleOpen: false,
    $: () => box, persist: () => saved.push(view.entryNoticeRead),
    C: { isNight: () => false, matchEntryNotice: (_, read) => read === '1:0:3' ? null : { key: '1:0:3', names: ['에이스 오브 링'] } },
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.api = { mail, nextMail, checkSchedule, pending: () => mailQueue.length, active: () => activeMail };', context);
  return { ...context.api, view, saved, box };
}

test('재접속 안내는 읽기 전에는 다시 표시하고 닫은 뒤에는 중복하지 않는다', () => {
  const first = setup();
  first.checkSchedule();
  first.checkSchedule();
  assert.equal(first.pending(), 0);
  assert.equal(first.view.entryNoticeRead, null);
  const reloaded = setup(first.view.entryNoticeRead);
  reloaded.checkSchedule();
  assert.equal(reloaded.active().entryKey, '1:0:3');
  reloaded.nextMail();
  assert.deepEqual(reloaded.saved, ['1:0:3']);
  const read = setup(reloaded.view.entryNoticeRead);
  read.checkSchedule();
  assert.equal(read.active(), null);
});

test('다른 편지 뒤에 대기 중인 경기 안내도 한 번만 추가하고 실제로 닫을 때 저장한다', () => {
  const s = setup();
  s.mail('부화 안내');
  s.checkSchedule();
  s.checkSchedule();
  assert.equal(s.pending(), 1);
  s.nextMail();
  assert.equal(s.active().entryKey, '1:0:3');
  assert.equal(s.saved.length, 0);
  s.nextMail();
  assert.deepEqual(s.saved, ['1:0:3']);
  assert.equal(s.box.hidden, true);
});

test('랭크 업 사장 메일은 한 번만 띄우고, 닫을 때 선물 먹이를 케이지에 놓는다', () => {
  const source = fs.readFileSync(path.join(__dirname, '../web/game.js'), 'utf8');
  const start = source.indexOf('  let mailOpen = false;');
  const end = source.indexOf('  function matchDays(', start);
  const core = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/core.js'), 'utf8') + ';this.C=ChampCore', core);
  const C = core.C;
  const box = { hidden: true, querySelector: () => ({ textContent: '' }) };
  const view = { tips: {}, entryNoticeRead: null, team: [{ x: 300, y: 300 }], selected: 0, foods: [] };
  const logs = [];
  const context = vm.createContext({ view, save: C.queueMails({ ...C.freshSave(0), meat: 0 }, [0x77]), battle: null, hunt: null, titleOpen: false,
    $: () => box, persist: () => {}, renderTray: () => {}, log: (t) => logs.push(t),
    board: { roam: { x0: 0, x1: 1000, y0: 0, y1: 1000 }, attachFloorItem: (i) => i },
    C: { ...C, isNight: () => false, matchEntryNotice: () => null },
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.api = { nextMail, checkSchedule, pending: () => mailQueue.length, active: () => activeMail, save: () => save };', context);
  const api = context.api;
  api.checkSchedule();
  api.checkSchedule();
  assert.equal(api.active()?.eventId, 0x77);
  assert.equal(api.pending(), 0);
  api.nextMail();
  assert.equal(view.foods.length, 3);
  assert.deepEqual(view.foods.map((f) => f.gift), ['big', 'big', 'big']);
  assert.deepEqual(view.foods.map((f) => f.x), [250, 300, 350]);
  assert.equal(api.save().meat, 6);
  assert.equal(api.save().pendingMails.length, 0);
  api.checkSchedule();
  assert.equal(api.active(), null);
});

test('NPC 매입 제안 메일을 닫으면 건넬지 묻고, 건네면 디지몬과 값이 바뀐다', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../web/game.js'), 'utf8');
  const start = source.indexOf('  let mailOpen = false;');
  const end = source.indexOf('  function matchDays(', start);
  const core = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../web/core.js'), 'utf8') + ';this.C=ChampCore', core);
  const C = core.C;
  const buttons = {};
  const modal = { open: false, close() { this.open = false; } };
  const body = { set innerHTML(v) { this.html = v; }, querySelectorAll: () => ['yes', 'no'].map((k) => (buttons[k] = { dataset: { offer: k } })) };
  const box = { hidden: true, querySelector: () => ({ textContent: '' }) };
  const $ = (q) => (q === '#modal' ? modal : q === '#modal-body' ? body : box);
  const save0 = { ...C.freshSave(0), bits: 0, digimon: [{ ...C.newDigimon(9, '아구몬'), isEgg: false }], npcOffer: { id: 0x5e, uid: 9, price: 5000, from: '철수' } };
  const context = vm.createContext({ view: { tips: {}, team: [], foods: [] }, save: save0, battle: null, hunt: null, titleOpen: false,
    $, persist: () => {}, renderTray: () => {}, log: () => {}, syncTeam: () => {}, esc: (t) => String(t), nameOf: () => '아구몬',
    showModal: (title, html) => { modal.open = true; body.innerHTML = html; }, setTimeout: (f) => f(),
    board: { roam: { x0: 0, x1: 1000, y0: 0, y1: 1000 }, attachFloorItem: (i) => i },
    C: { ...C, isNight: () => false, matchEntryNotice: () => null },
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.api = { nextMail, checkSchedule, active: () => activeMail, save: () => save };', context);
  const api = context.api;
  api.checkSchedule();
  assert.equal(api.active()?.offer, true);
  api.nextMail();
  assert.equal(modal.open, true);
  assert.match(body.html, /5,000/);
  buttons.yes.onclick();
  assert.equal(api.save().digimon.length, 0);
  assert.equal(api.save().bits, 5000);
  assert.equal(api.save().npcOffer, undefined);
  assert.equal(modal.open, false);
});
