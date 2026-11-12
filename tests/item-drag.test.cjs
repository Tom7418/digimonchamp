// 실제 game.js의 입력 등록 코드를 가짜 이벤트 대상에 연결해 취소·포인터 경합을 검증한다.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
  const target = () => ({
    handlers: {},
    addEventListener(type, fn) { (this.handlers[type] ??= []).push(fn); },
    fire(type, e = {}) { for (const fn of this.handlers[type] ?? []) fn(e); },
  });
  const tray = Object.assign(target(), { setPointerCapture() {}, hasPointerCapture() { return false; } });
  const modal = { open: false }, mail = {}, ghosts = [], drops = [];
  const window = target();
  const document = Object.assign(target(), {
    hidden: false,
    body: { append(g) { ghosts.push(g); } },
    createElement() { return { style: {}, remove() { this.removed = true; } }; },
  });
  const canvas = Object.assign(target(), { getBoundingClientRect: () => ({ left: 0, right: 960, top: 0, bottom: 560, width: 960, height: 560 }) });
  const board = { editing: false };
  const ctx = vm.createContext({ window, document, canvas, board, battle: null, hunt: null, mailOpen: false, dayEnding: false,
    $: (id) => ({ '#tray': tray, '#modal': modal, '#mail': mail })[id],
    nextMail() {}, dropItem: (...args) => drops.push(args), view: { poops: [] },
  });
  const source = fs.readFileSync(require('node:path').join(__dirname, '../web/game.js'), 'utf8');
  const start = source.indexOf('  // 아이템 끌기');
  const end = source.indexOf('  // 배고픈 디지몬', start);
  assert.ok(start > 0 && end > start);
  vm.runInContext(source.slice(start, end) + '\ninitFarmInput();', ctx);
  const event = (patch = {}) => ({ pointerId: 1, button: 0, isPrimary: true, clientX: 250, clientY: 300,
    target: { closest: () => ({ disabled: false, dataset: { item: 'meat' }, querySelector: () => ({ textContent: 'meat' }) }) },
    preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...patch });
  return { tray, window, document, modal, board, ghosts, drops, event };
}

test('먹이 드롭은 한 번만 실행하고 케이지에 pointerup을 전달하지 않는다', () => {
  const s = setup();
  s.tray.fire('pointerdown', s.event());
  const up = s.event();
  s.window.fire('pointerup', up);
  s.window.fire('pointerup', s.event());
  assert.equal(s.drops.length, 1);
  assert.equal(up.stopped, true);
  assert.equal(s.ghosts[0].removed, true);
});

for (const cancel of ['pointercancel', 'lostpointercapture', 'blur', 'Escape', 'hidden', 'outside']) {
  test(`${cancel} 취소 후 재고 소비 없이 다시 끌 수 있다`, () => {
    const s = setup();
    s.tray.fire('pointerdown', s.event());
    if (cancel === 'lostpointercapture') s.tray.fire(cancel, s.event());
    else if (cancel === 'Escape') s.window.fire('keydown', s.event({ key: 'Escape' }));
    else if (cancel === 'hidden') { s.document.hidden = true; s.document.fire('visibilitychange'); s.document.hidden = false; }
    else if (cancel === 'outside') s.window.fire('pointerup', s.event({ clientX: -1 }));
    else s.window.fire(cancel, s.event());
    const released = s.event();
    s.window.fire('pointerup', released);
    if (cancel !== 'outside') assert.equal(released.stopped, true);
    assert.equal(s.drops.length, 0);
    assert.equal(s.ghosts[0].removed, true);
    s.tray.fire('pointerdown', s.event());
    s.window.fire('pointerup', s.event());
    assert.equal(s.drops.length, 1);
  });
}

test('다른 손가락과 우클릭은 활성 끌기에 간섭하지 않는다', () => {
  const s = setup();
  s.tray.fire('pointerdown', s.event({ button: 2 }));
  assert.equal(s.ghosts.length, 0);
  s.tray.fire('pointerdown', s.event());
  s.tray.fire('pointerdown', s.event({ pointerId: 2, isPrimary: false }));
  s.window.fire('pointerup', s.event({ pointerId: 2 }));
  s.window.fire('pointercancel', s.event({ pointerId: 2 }));
  assert.equal(s.drops.length, 0);
  assert.equal(s.ghosts.length, 1);
  s.window.fire('pointerup', s.event());
  assert.equal(s.drops.length, 1);
});

test('끌던 중 모달이나 편집 화면이 열리면 드롭하지 않는다', () => {
  for (const key of ['modal', 'board']) {
    const s = setup();
    s.tray.fire('pointerdown', s.event());
    if (key === 'modal') s.modal.open = true;
    else s.board.editing = true;
    s.window.fire('pointerup', s.event());
    assert.equal(s.drops.length, 0);
    assert.equal(s.ghosts[0].removed, true);
    s.tray.fire('pointerdown', s.event());
    assert.equal(s.ghosts.length, 1);
  }
});
