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
  const context = vm.createContext({ view, save: {}, battle: null,
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
