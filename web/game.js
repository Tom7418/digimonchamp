'use strict';
// 디지몬 챔피언십 웹판 화면.
// 게임 규칙(사육·진화·배틀·타이틀·상점)은 web/core.js(ChampCore, src/core에서 빌드)를 그대로 쓰고,
// 이 파일은 화면 그리기, 입력, 저장만 담당한다. 시간: 현실 1초 = 게임 1분.
(() => {
  const C = window.ChampCore;
  const L = window.CageLayout;
  const $ = (s) => document.querySelector(s);
  const KEY = 'champion-web-v2';
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (n, a = 0, b = 100) => Math.min(b, Math.max(a, n));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // 원본에서 변환한 스프라이트(assets/sprites.js, 이름은 tools/sprite_names.json)를 진화표 한글 이름으로 찾는다.
  // 그림이 없는 종은 종족 색 원 + 이름 첫 글자로 그린다.
  const SPRITE_BY_NAME = Object.fromEntries(window.SPRITES.filter((m) => m.name).map((m) => [m.name, m.id]));
  const FAMILY_COLOR = { 용: '#d9774b', 짐승: '#c9a35b', 물: '#5b9fd9', 새: '#8fc7e8', 벌레풀: '#7fb35a', 기계: '#9aa3ad', 성: '#f0dc8a', 암흑: '#7a5a9a' };
  const START_LAYOUT = [
    { id: 'start-clinic', kind: 'clinic', q: 0, r: 0, rotation: 0 },
    { id: 'start-field', kind: 'field', q: 2, r: 1, rotation: 0 },
  ];

  // 217장을 한 번에 받지 않도록 처음 그릴 때 불러온다
  const meta = new Map(window.SPRITES.map((m) => [m.id, m]));
  const assets = new Map();
  function asset(id) {
    if (!assets.has(id) && meta.has(id)) {
      const image = new Image();
      image.src = `assets/${id}.png`;
      assets.set(id, { ...meta.get(id), image });
    }
    return assets.get(id);
  }

  let save,
    view,
    battle = null,
    paused = false,
    speed = 1,
    lastTime = 0,
    clock = 0,
    toastTimer,
    effect = null;

  // ---------- 저장 ----------
  function freshView() {
    return { layout: START_LAYOUT.map((c) => ({ ...c })), storedCages: [], layoutVersion: 2, team: [], selected: 0, logs: [] };
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.save && raw.save.version === 2 && Array.isArray(raw.save.digimon) && raw.save.digimon.length && raw.view) {
        save = raw.save;
        view = { ...freshView(), ...raw.view };
        // 꺼져 있던 동안의 시간 반영 (최대 12시간)
        const away = Math.min(C.OFFLINE_CAP_MINUTES, Math.max(0, Math.floor((Date.now() - save.lastSavedAt) / 1000)));
        if (away > 0) {
          const r = C.advance(save, away);
          save = r.save;
          r.events.forEach(logEvent);
          if (away >= 5) view.logs.unshift({ time: stamp(), text: `자리를 비운 동안 ${Math.floor(away / 60)}시간 ${away % 60}분이 지났습니다.` });
        }
        return;
      }
    } catch {}
    save = C.freshSave(Date.now());
    view = freshView();
    view.logs.push({ time: stamp(), text: '디지몬 챔피언십 참가 메일이 도착했습니다. 디지에그를 잘 돌봐 주세요.' });
  }
  function persist() {
    try {
      save = { ...save, lastSavedAt: Date.now() };
      localStorage.setItem(
        KEY,
        JSON.stringify({
          save,
          view: {
            layout: view.layout,
            storedCages: view.storedCages,
            layoutVersion: view.layoutVersion,
            team: view.team,
            selected: view.selected,
            logs: view.logs.slice(0, 30),
          },
        }),
      );
      $('#save-status').textContent = '브라우저에 자동 저장됨';
    } catch {
      $('#save-status').textContent = '저장 불가 · 브라우저 저장 설정 확인';
    }
  }

  // ---------- 상태 도우미 ----------
  const nameOf = (d) => (d.isEgg ? '디지에그' : C.getSpecies(d.speciesId).name);
  const digi = (uid) => save.digimon.find((d) => d.uid === uid);
  const current = () => digi(view.team[view.selected]?.uid) || save.digimon[0];
  function stamp() {
    if (!save) return '';
    const d = C.dateOf(save.clock);
    return `${d.seasonName} ${d.day}일 ${pad(d.hour)}:${pad(d.minute)}`;
  }
  function log(text) {
    view.logs.unshift({ time: stamp(), text });
    view.logs = view.logs.slice(0, 30);
  }
  function toast(t) {
    $('#toast').textContent = t;
    $('#toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3000);
  }
  function logEvent(e) {
    const n = (id) => C.getSpecies(id).name;
    if (e.type === 'hatched') log(`디지에그가 부화해 ${n(e.to)}이(가) 태어났습니다!`);
    else if (e.type === 'evolved') {
      log(`✦ ${n(e.from)}이(가) ${n(e.to)}(으)로 진화했습니다!`);
      toast(`${n(e.from)} → ${n(e.to)} 진화!`);
    } else if (e.type === 'egg') log(`${n(e.from)}이(가) 수명을 다해 디지에그로 돌아갔습니다.`);
    else if (e.type === 'lost') log(`${e.name}을(를) 잃었습니다… (${e.reason})`);
    else if (e.type === 'sick') {
      log(`${e.name}이(가) 병에 걸렸습니다. 알약으로 치료하세요. (페널티 +1)`);
      toast(`${e.name} 발병!`);
    } else if (e.type === 'blocked')
      log(
        e.reason === 'rank'
          ? `${e.name}: 테이머 랭크가 낮아 진화하지 못했습니다. 타이틀 매치에서 이기세요.`
          : `${e.name}: 사육 용량이 부족해 진화하지 못했습니다.`,
      );
  }

  // 화면용 목록(view.team)을 규칙 엔진의 디지몬 목록과 맞추고, 들어간 시설을 엔진의 케이지로 반영한다.
  function syncTeam() {
    const old = new Map(view.team.map((p) => [p.uid, p]));
    view.team = save.digimon.map(
      (d, i) => old.get(d.uid) || { uid: d.uid, x: 260 + ((i * 97) % 420), y: 330 + ((i * 53) % 120), target: 300, direction: 1, cageId: null, cage: 'free' },
    );
    view.selected = clamp(view.selected, 0, view.team.length - 1);
    const coreCage = new Map(view.team.map((p) => [p.uid, (p.cageId && L.types[p.cage]?.core) || '기본 케이지']));
    save = { ...save, digimon: save.digimon.map((d) => (d.cage === coreCage.get(d.uid) ? d : { ...d, cage: coreCage.get(d.uid) })) };
  }

  // ---------- 케이지 규칙 연결 ----------
  // 케이지 공간은 테이머 랭크에 따라 늘어나고(레드 테이머 16칸), 새 시설은 상점에서 산 것만 한 개씩 설치할 수 있다.
  L.space = () => C.cageSpaceOf(save);
  L.canPlace = (item, items) => {
    const t = L.types[item.kind];
    if (item.kind === 'free') return true;
    return save.cages.includes(t.core) && !items.some((c) => c.kind === item.kind);
  };
  const usedCells = () => view.layout.reduce((n, c) => n + L.cells(c).length, 0);

  // ---------- 그리기 (DOM) ----------
  // 매 게임 분마다 다시 그리므로, 내용이 바뀐 경우에만 교체해 누르는 중인 버튼이 사라지지 않게 한다
  const htmlCache = new Map();
  function setHtml(sel, html) {
    if (htmlCache.get(sel) === html) return;
    htmlCache.set(sel, html);
    $(sel).innerHTML = html;
  }
  function render() {
    syncTeam();
    const d = current();
    const date = C.dateOf(save.clock);
    const rank = C.tamerRank(save);
    const capacity = C.capacityOf(save);
    $('#coins').textContent = save.bits.toLocaleString('ko-KR');
    setHtml(
      '#band',
      [
        `<b>${date.seasonName}</b>`,
        `${date.day}일`,
        `${date.year}년차`,
        `<b>${battle ? '배틀' : '육성'}</b>`,
        `${pad(date.hour)}:${pad(date.minute)}`,
        `${esc(C.rankName(rank))}`,
        `용량 ${C.usedCapacity(save)} / ${capacity}G`,
        `케이지 ${usedCells()} / ${C.cageSpaceOf(save)}칸`,
      ]
        .map((x) => `<span>${x}</span>`)
        .join(''),
    );
    $('#scene-title').textContent = battle ? '배틀 아레나' : '사육장';
    $('#speed').textContent = `▶▶ ×${speed}`;

    setHtml(
      '#partner-tabs',
      view.team
        .map((p, i) => {
          const x = digi(p.uid);
          const flag = x.sick ? ' ✚' : x.injured ? ' ✚' : x.poop >= 3 ? ' ●' : '';
          return `<button class="${i === view.selected ? 'active' : ''}" data-partner="${i}" aria-pressed="${i === view.selected}">${esc(nameOf(x))}${flag}</button>`;
        })
        .join(''),
    );

    const sp = C.getSpecies(d.speciesId);
    $('#name').textContent = nameOf(d);
    $('#level').textContent = d.isEgg ? '부화 대기' : C.STAGE_LABEL[sp.stage];
    $('#stage').textContent = d.isEgg ? `디지에그화 ${d.eggs}회` : `${sp.family} · ${sp.attr} · ${sp.size}G`;
    const life = d.isEgg ? C.EGG_MINUTES : C.LIFESPAN[sp.stage];
    $('#mood').textContent = d.isEgg
      ? `${Math.max(0, C.EGG_MINUTES - d.stageAge)}분 뒤 부화합니다.`
      : `성격: ${d.personality} · 배틀 ${d.battles}회 (승 ${d.wins}) · 페널티 ${d.penalties}${d.sick ? ' · 병' : ''}${d.injured ? ' · 부상' : ''}`;
    $('#xp-label').textContent = `${Math.floor(d.stageAge / 60)}시간 / ${Math.floor(life / 60)}시간`;
    $('#xp-bar').style.width = `${clamp((d.stageAge / life) * 100)}%`;
    const where = view.team[view.selected];
    $('#cage-status').textContent = where?.cageId ? `${L.types[where.cage]?.name} 안에서 지내는 중` : '자유 활동 (훈련 없음)';
    setHtml(
      '#vitals',
      [
        ['포만감', d.hunger],
        ['피로', d.fatigue],
        ['청결', 100 - d.poop * 20],
      ]
        .map(
          ([n, v]) =>
            `<div class="vital"><span>${n}</span><div class="track"><i style="width:${clamp(v)}%"></i></div><span>${Math.round(v)} / 100</span></div>`,
        )
        .join(''),
    );
    setHtml('#stats', C.STAT_KEYS.map((k) => `<div><span>${C.STAT_LABEL[k]}</span><strong>${d.stats[k]}</strong></div>`).join(''));
    const ap = Object.entries(d.ap).filter(([, v]) => v >= 1);
    setHtml(
      '#ap',
      ap.length
        ? ap.map(([k, v]) => `<span>${k} ${Math.floor(v)}</span>`).join('')
        : '<span class="muted">종족·속성 수치 없음 — 훈련 케이지에 넣어 올리세요</span>',
    );

    // 진화 힌트: 위에서부터 먼저 충족한 쪽으로 진화
    if (d.isEgg) setHtml('#evo', '<p class="hint">부화하면 진화 조건이 표시됩니다.</p>');
    else {
      const seen = new Set(save.seen);
      const maxStage = C.maxStageForRank(rank);
      const hs = C.hints(d, seen);
      setHtml(
        '#evo',
        (sp.stage + 1 > maxStage && hs.length
          ? `<p class="warn">테이머 랭크가 낮아 ${C.STAGE_LABEL[sp.stage + 1]}로 진화할 수 없습니다. 타이틀 매치에서 이기세요.</p>`
          : '') +
          (hs.length
            ? hs
                .map(
                  (h) =>
                    `<div class="evo-row${h.ready ? ' ready' : ''}"><b>${esc(h.name)}</b><small>${h.stage}</small><ul>${h.checks.map((c) => `<li class="${c.met ? 'met' : ''}">${esc(c.label)}</li>`).join('')}</ul></div>`,
                )
                .join('')
            : '<p class="hint">더 이상 진화하지 않습니다.</p>'),
      );
    }

    $('#inventory').textContent = `고기 ${save.meat} · 알약 ${save.pills} · 썩은 고기 ${save.rotten} · 로프 Lv.${save.ropeLevel}`;
    const next = C.upcoming(save);
    $('#milestone').textContent = next[0] || '모든 타이틀 획득!';
    setHtml(
      '#schedule',
      next
        .slice(1, 4)
        .map((t) => `<li>${esc(t)}</li>`)
        .join(''),
    );

    $('#journal').replaceChildren(
      ...view.logs.slice(0, 6).map((l) => {
        const li = document.createElement('li');
        const t = document.createElement('time');
        const span = document.createElement('span');
        t.textContent = l.time;
        span.textContent = l.text;
        li.append(t, span);
        return li;
      }),
    );
    document.querySelectorAll('[data-action]').forEach((b) => (b.disabled = !!battle));
    // 상점에서 사지 않은 시설은 설치 목록에서 잠근다
    document.querySelectorAll('[data-build]').forEach((b) => {
      const t = L.types[b.dataset.build];
      const owned = b.dataset.build === 'free' || save.cages.includes(t.core);
      b.disabled = !owned;
      b.title = owned ? '' : '상점에서 구매하면 설치할 수 있습니다';
    });
  }

  // ---------- 돌보기 ----------
  function apply(result) {
    if (result.ok) {
      save = result.save;
      log(`${nameOf(current())}: ${result.message}`);
      render();
      persist();
    } else toast(result.message);
    return result.ok;
  }
  function act(action) {
    if (battle) return;
    const d = current();
    if (action === 'feed') {
      if (apply(C.feed(save, d.uid))) fx('♥ 냠냠!', '#ffe4a0');
    }
    if (action === 'rotten') apply(C.feedRotten(save, d.uid));
    if (action === 'clean') apply(C.clean(save, d.uid));
    if (action === 'heal') apply(C.heal(save, d.uid));
    if (action === 'battle') battleMenu();
    if (action === 'shop') shopMenu();
    if (action === 'release') releaseMenu();
  }
  function fx(text, color = '#fff') {
    effect = { text, color, until: performance.now() + 1500, uid: current().uid };
  }

  // ---------- 모달 ----------
  function showModal(title, body, kicker = 'TAMER GUIDE', ok = '사육장으로 돌아가기') {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = body;
    $('#modal-kicker').textContent = kicker;
    $('#modal-ok').textContent = ok;
    $('#modal-ok').disabled = false;
    $('#close-modal').disabled = false;
    if (!$('#modal').open) $('#modal').showModal();
  }
  function closeModal() {
    if (battle && !battle.state.over) return;
    $('#modal').close();
    if (battle) {
      battle = null;
      render();
      persist();
    }
  }

  function shopMenu() {
    const items = C.shopItems(save);
    showModal(
      '상점',
      `<p>소지 비트 ${save.bits.toLocaleString('ko-KR')} ฿</p><div class="menu-list">${items
        .map(
          (it, i) =>
            `<button data-buy="${i}"${save.bits < it.price ? ' disabled' : ''}><b>${esc(it.name)}</b><small>${it.price.toLocaleString('ko-KR')} ฿</small></button>`,
        )
        .join('')}</div><p class="hint">케이지를 사면 사육장 아래 ‘케이지 편집’에서 설치할 수 있습니다. 랭크가 오르면 상품이 늘어납니다.</p>`,
      'SHOP',
    );
    $('#modal-body')
      .querySelectorAll('[data-buy]')
      .forEach((b) => {
        b.onclick = () => {
          const r = C.buy(save, items[+b.dataset.buy]);
          if (r.ok) {
            save = r.save;
            log(r.message);
            render();
            persist();
            toast(r.message);
            shopMenu();
          } else toast(r.message);
        };
      });
  }

  function releaseMenu() {
    const d = current();
    showModal(
      '디지몬을 놓아줄까요?',
      `<p>${esc(nameOf(d))}을(를) 놓아주면 되돌릴 수 없습니다. 사육 용량이 그만큼 비워집니다.</p><button class="primary" id="confirm-release" style="background:#ad654d">놓아주기</button>`,
      'RELEASE',
    );
    $('#confirm-release').onclick = () => {
      const r = C.release(save, d.uid);
      if (r.ok) {
        save = r.save;
        log(`${nameOf(d)}을(를) 놓아주었습니다.`);
        view.selected = 0;
        render();
        persist();
      } else toast(r.message);
      closeModal();
    };
  }

  // ---------- 배틀 ----------
  const canFight = (d) => !d.isEgg && !d.sick && !d.injured;
  function members(format) {
    const first = current();
    const rest = save.digimon.filter((d) => d.uid !== first.uid && canFight(d));
    return [first, ...rest].slice(0, format);
  }
  function battleMenu() {
    const date = C.dateOf(save.clock);
    const titles = C.todaysMatches(save);
    const d = current();
    const freeOpen = date.hour >= 8 && date.hour < 21;
    let mode = '일반';
    const titleHtml = titles.length
      ? titles
          .map((m, i) => {
            const eggsOk = !m.needEggs || members(m.format).every((x) => x.eggs >= m.needEggs);
            return `<button data-title="${i}"${eggsOk ? '' : ' disabled'}><b>★ ${esc(m.name)}</b><small>${m.format}:${m.format} · 상대 ${C.STAGE_LABEL[m.stage]} · 상금 ${m.prize.toLocaleString('ko-KR')} ฿${eggsOk ? '' : ` · 디지에그화 ${m.needEggs}회 필요`}</small></button>`;
          })
          .join('')
      : `<p class="hint">오늘은 타이틀 매치가 없습니다. 엔트리 시간은 08:00~15:00, 일정: ${esc(C.upcoming(save)[0] || '-')}</p>`;
    const free = [];
    for (const stars of [1, 2, 3])
      for (const format of [1, 3]) free.push({ stars, format, stage: Math.min(6, 2 + stars), prize: 60 * stars * (format === 3 ? 2 : 1) });
    showModal(
      '배틀',
      `<p>출전: <b>${esc(nameOf(d))}</b> (3:3은 함께 지내는 디지몬 중 건강한 순서로 둘이 더 나갑니다)</p>
       <div class="mode-pick">출전 전 공격 방식 ${['일반', '지원', '특수'].map((m) => `<button data-mode="${m}" class="${m === mode ? 'active' : ''}">${m}</button>`).join('')}</div>
       <h3>타이틀 매치</h3><div class="menu-list">${titleHtml}</div>
       <h3>프리 배틀 ${freeOpen ? '' : '(08:00~21:00)'}</h3><div class="menu-list two">${free
         .map(
           (f, i) =>
             `<button data-free="${i}"${freeOpen ? '' : ' disabled'}><b>${'★'.repeat(f.stars)} ${f.format}:${f.format}</b><small>상대 ${C.STAGE_LABEL[f.stage]} · ${f.prize} ฿</small></button>`,
         )
         .join('')}</div>`,
      'BATTLE ENTRY',
      '취소',
    );
    const body = $('#modal-body');
    body.querySelectorAll('[data-mode]').forEach(
      (b) =>
        (b.onclick = () => {
          mode = b.dataset.mode;
          body.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('active', x === b));
        }),
    );
    body.querySelectorAll('[data-title]').forEach(
      (b) =>
        (b.onclick = () => {
          const m = titles[+b.dataset.title];
          startBattle({ title: m.name, match: m, format: m.format, stage: m.stage, scale: m.scale, prize: m.prize }, mode);
        }),
    );
    body.querySelectorAll('[data-free]').forEach(
      (b) =>
        (b.onclick = () => {
          const f = free[+b.dataset.free];
          startBattle({ title: `프리 배틀 ${'★'.repeat(f.stars)}`, format: f.format, stage: f.stage, scale: 1, prize: f.prize }, mode);
        }),
    );
  }
  function startBattle(setup, mode) {
    const team = members(setup.format);
    if (!team.length || !canFight(team[0])) return toast('출전할 수 있는 디지몬이 없어요. (알·병·부상은 출전 불가)');
    if (team.length < setup.format) return toast(`${setup.format}:${setup.format}에는 건강한 디지몬 ${setup.format}마리가 필요해요.`);
    const foes = C.makeEnemies(setup.stage, setup.format, setup.scale, Math.random);
    const state = C.createBattle(
      team.map((d) => C.entrantOf(d, mode)),
      foes,
    );
    battle = { setup, state, acc: 0, flashes: [], done: false };
    log(`${setup.title} 출전: ${team.map(nameOf).join(', ')}`);
    showModal(
      setup.title,
      '<canvas id="arena" width="480" height="250"></canvas><div class="battle-health" id="battle-hp"></div><div class="battle-log" id="battle-log"></div>',
      'AUTO BATTLE',
      '결과 확인',
    );
    $('#modal-ok').disabled = true;
    $('#close-modal').disabled = true;
    render();
  }
  function battleTick(dt) {
    const b = battle;
    if (!b || b.done) return;
    b.acc += dt * 2; // 화면에서는 2배속으로 진행
    while (b.acc >= 0.1 && !b.state.over) {
      b.acc -= 0.1;
      for (const e of C.stepBattle(b.state, Math.random)) {
        if (e.type === 'hit')
          b.flashes.push({ id: e.to, text: `-${e.damage}${e.special ? '!' : ''}`, until: performance.now() + 700, color: e.special ? '#ffd36a' : '#fff' });
        if (e.type === 'heal') b.flashes.push({ id: e.to, text: `+${e.amount}`, until: performance.now() + 700, color: '#8ef0a0' });
        if (e.type === 'ko') battleLog(`${b.state.units[e.id].name} 쓰러짐!`);
      }
    }
    drawArena();
    if (b.state.over) finishBattle();
  }
  function battleLog(t) {
    const el = $('#battle-log');
    if (!el) return;
    el.insertAdjacentHTML('beforeend', `<p>${esc(t)}</p>`);
    el.scrollTop = el.scrollHeight;
  }
  function finishBattle() {
    const b = battle;
    b.done = true;
    const won = b.state.winner === 0;
    const ko = new Set(b.state.units.filter((u) => u.team === 0 && !u.alive).map((u) => u.uid));
    const uids = new Set(b.state.units.filter((u) => u.team === 0).map((u) => u.uid));
    const before = C.tamerRank(save);
    save = { ...save, digimon: save.digimon.map((d) => (uids.has(d.uid) ? C.applyBattleResult(d, won, ko.has(d.uid), Math.random) : d)) };
    if (won && b.setup.match) save = C.applyWin(save, b.setup.match);
    else if (won) save = { ...save, bits: save.bits + b.setup.prize };
    const after = C.tamerRank(save);
    const why = b.state.reason === 'timeout' ? ' (시간 종료 판정)' : '';
    battleLog(won ? `승리!${why} 상금 ${b.setup.prize.toLocaleString('ko-KR')} ฿` : `패배…${why}`);
    log(`${b.setup.title} ${won ? '승리' : '패배'}${won ? ` · ${b.setup.prize} ฿` : ''}`);
    if (won && b.setup.match) log(`타이틀 메달 획득: ${b.setup.match.name}`);
    if (after > before) {
      const msg = `${C.rankName(after)}(으)로 랭크 업! 최대 용량 ${C.capacityOf(save)}G, 케이지 공간 ${C.cageSpaceOf(save)}칸, ${C.STAGE_LABEL[C.maxStageForRank(after)]}까지 진화 가능`;
      battleLog(msg);
      log(msg);
      toast('랭크 업!');
    }
    for (const d of save.digimon) if (uids.has(d.uid) && d.injured) log(`${nameOf(d)}이(가) 다쳤습니다. 양호실에 넣거나 알약으로 치료하세요.`);
    $('#modal-title').textContent = won ? 'WIN!' : 'LOSE';
    $('#modal-ok').disabled = false;
    $('#close-modal').disabled = false;
    render();
    persist();
  }
  function drawArena() {
    const el = $('#arena');
    if (!el || !battle) return;
    const ctx = el.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const s = battle.state;
    ctx.fillStyle = '#dfe9ee';
    ctx.fillRect(0, 0, 480, 250);
    ctx.strokeStyle = '#b7c8d2';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 460, 230);
    ctx.beginPath();
    ctx.moveTo(240, 10);
    ctx.lineTo(240, 240);
    ctx.stroke();
    for (const u of s.units) {
      if (!u.alive) ctx.globalAlpha = 0.3;
      body(ctx, u.speciesId, false, u.x, u.y + 14, 1.6, Math.floor(performance.now() / 250) % 2, u.team === 1);
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#30404a';
      ctx.fillRect(u.x - 20, u.y + 18, 40, 4);
      ctx.fillStyle = u.team === 0 ? '#58c27d' : '#e0795b';
      ctx.fillRect(u.x - 20, u.y + 18, 40 * Math.max(0, u.hp / u.maxHp), 4);
    }
    const now = performance.now();
    battle.flashes = battle.flashes.filter((f) => f.until > now);
    for (const f of battle.flashes) {
      const u = s.units[f.id];
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.strokeStyle = '#203040';
      ctx.lineWidth = 3;
      const y = u.y - 40 - (700 - (f.until - now)) / 25;
      ctx.strokeText(f.text, u.x, y);
      ctx.fillText(f.text, u.x, y);
    }
    ctx.fillStyle = '#203040';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`TIME ${Math.max(0, Math.ceil(C.TIME_LIMIT - s.t))}`, 240, 26);
    const team = (t) => s.units.filter((u) => u.team === t);
    $('#battle-hp').innerHTML = [0, 1]
      .map(
        (t) =>
          `<div>${t === 0 ? '내 팀' : '상대'}${team(t)
            .map(
              (u) =>
                `<div class="hp-row"><span>${esc(u.name)}</span><div class="track"><i style="width:${clamp((u.hp / u.maxHp) * 100)}%${t ? ';background:#d19772' : ''}"></i></div><span>${Math.max(0, Math.round(u.hp))}</span></div>`,
            )
            .join('')}</div>`,
      )
      .join('');
  }

  // ---------- 그리기 (캔버스) ----------
  function sprite(context, id, x, y, scale, frame, flip) {
    const a = asset(id);
    if (!a || !a.image.complete || !a.image.naturalWidth) return false;
    context.save();
    context.translate(Math.round(x), Math.round(y));
    if (flip) context.scale(-1, 1);
    context.drawImage(
      a.image,
      (frame % a.frames) * a.width,
      0,
      a.width,
      a.height,
      // 칸 가운데가 아니라 몸의 가로 중심(cx)을 x에 맞춘다
      -(a.cx ?? a.width / 2) * scale,
      // 칸 맨 아래가 아니라 발끝 줄(baseline)을 y에 맞춰 땅에 붙인다
      -(a.baseline ?? a.height) * scale,
      a.width * scale,
      a.height * scale,
    );
    context.restore();
    return true;
  }
  // 스프라이트가 없는 종은 종족 색 원과 이름 첫 글자로 표시한다
  function body(context, speciesId, isEgg, x, y, scale, frame, flip) {
    const name = isEgg ? '디지에그' : C.getSpecies(speciesId).name;
    if (sprite(context, SPRITE_BY_NAME[name], x, y, scale, frame, flip)) return;
    const sp = C.getSpecies(speciesId);
    const r = (6 + sp.stage * 3) * scale * 0.8;
    context.fillStyle = FAMILY_COLOR[sp.family] || '#ccc';
    context.strokeStyle = '#203040';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y - r, r, 0, 7);
    context.fill();
    context.stroke();
    context.fillStyle = '#203040';
    context.font = `bold ${Math.round(r)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name[0], x, y - r);
    context.textBaseline = 'alphabetic';
  }

  // 그림자(발밑 하이라이트) 가로 반지름: 서 있는 몸 폭에 맞춘다
  function spriteOf(speciesId, isEgg) {
    return asset(SPRITE_BY_NAME[isEgg ? '디지에그' : C.getSpecies(speciesId).name]);
  }
  function footprint(speciesId, isEgg, scale) {
    const a = spriteOf(speciesId, isEgg);
    const width = a?.body ?? (6 + C.getSpecies(speciesId).stage * 3) * 1.6;
    return Math.max(9, width * scale * 0.55);
  }

  const canvas = $('#world');
  const ctx = canvas.getContext('2d');
  const portrait = $('#portrait').getContext('2d');
  ctx.imageSmoothingEnabled = false;
  portrait.imageSmoothingEnabled = false;

  function drawFarm(t, dt) {
    board.draw(ctx);
    const order = view.team.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y);
    for (const { p, i } of order) {
      const d = digi(p.uid);
      if (!d) continue;
      if (!paused && !p.cageId && !board.editing && !d.isEgg) {
        if (Math.abs(p.target - p.x) < 3) {
          if (Math.random() < 0.008) p.target = 160 + Math.random() * 560;
        } else {
          p.direction = p.target > p.x ? 1 : -1;
          p.x += p.direction * dt * 16 * (d.fatigue > 80 ? 0.4 : 1);
        }
      }
      const selected = i === view.selected;
      const scale = d.isEgg ? 1.6 : 2;
      const rx = footprint(d.speciesId, d.isEgg, scale) + (selected ? 4 : 0);
      ctx.fillStyle = selected ? '#ffffff33' : '#00000022';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y + 1, rx, Math.max(5, rx * 0.3), 0, 0, 7);
      ctx.fill();
      if (selected) {
        ctx.strokeStyle = '#f8f3d0';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      const bob = paused ? 0 : Math.sin(t * 2 + i) * 2;
      body(ctx, d.speciesId, d.isEgg, p.x, p.y + bob, scale, Math.floor(t * 4) % 2, p.direction < 0);
      // 똥과 상태 표시
      for (let k = 0; k < d.poop; k++) {
        ctx.fillStyle = '#7a5532';
        ctx.beginPath();
        ctx.arc(p.x - 22 + k * 9, p.y + 12, 3.5, 0, 7);
        ctx.fill();
      }
      ctx.font = 'bold 11px "Noto Sans KR",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#eef6f2';
      ctx.fillText(nameOf(d) + (d.sick || d.injured ? ' ✚' : ''), p.x, p.y + 28);
      if (selected) {
        ctx.fillStyle = '#fff3c2';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 82);
        ctx.lineTo(p.x - 5, p.y - 90);
        ctx.lineTo(p.x + 5, p.y - 90);
        ctx.fill();
      }
      if (effect && effect.uid === p.uid && performance.now() < effect.until) {
        ctx.font = 'bold 17px sans-serif';
        ctx.fillStyle = effect.color;
        ctx.fillText(effect.text, p.x, p.y - 95 - (1500 - (effect.until - performance.now())) / 80);
      }
    }
    if (paused) {
      ctx.fillStyle = '#00000066';
      ctx.fillRect(0, 0, 960, 560);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('일시 정지', 480, 280);
    }
  }
  function drawPortrait(t) {
    const d = current();
    portrait.clearRect(0, 0, 240, 150);
    // 큰 디지몬도 액자(240x150) 안에 들어오도록 배율을 줄인다
    const a = spriteOf(d.speciesId, d.isEgg);
    const scale = a ? Math.min(2.4, 100 / a.baseline, 200 / a.body) : 2.4;
    const rx = footprint(d.speciesId, d.isEgg, scale);
    portrait.fillStyle = '#b5c99955';
    portrait.beginPath();
    portrait.ellipse(120, 119, rx, Math.max(5, rx * 0.28), 0, 0, 7);
    portrait.fill();
    body(portrait, d.speciesId, d.isEgg, 120, 120 + Math.sin(t * 2), scale, Math.floor(t * 3) % 2, false);
  }

  // ---------- 시작 ----------
  load();
  syncTeam();
  const board = createCageEditor(
    canvas,
    () => view,
    (message) => {
      if (message) log(message);
      render();
      persist();
    },
    toast,
    () => !!battle,
  );

  document.querySelectorAll('[data-action]').forEach((b) => (b.onclick = () => act(b.dataset.action)));
  $('#partner-tabs').onclick = (e) => {
    const b = e.target.closest('[data-partner]');
    if (b) {
      view.selected = +b.dataset.partner;
      render();
      persist();
    }
  };
  $('#modal-ok').onclick = closeModal;
  $('#close-modal').onclick = closeModal;
  $('#modal').addEventListener('cancel', (e) => {
    e.preventDefault();
    closeModal();
  });
  $('#pause').onclick = () => {
    paused = !paused;
    $('#pause').textContent = paused ? '▶ 다시 진행' : 'Ⅱ 일시 정지';
  };
  $('#speed').onclick = () => {
    speed = speed === 1 ? 5 : speed === 5 ? 20 : 1;
    render();
  };
  $('#help').onclick = () =>
    showModal(
      '디지몬 챔피언십 웹판',
      `<ol>
        <li>디지에그에서 시작합니다. 현실 1초가 게임 1분이며, 밤까지 하루가 흐릅니다.</li>
        <li>디지몬을 끌어 케이지에 넣으면 1시간마다 정해진 능력치와 종족·속성 수치가 오릅니다. 양호실은 피로와 부상을 회복합니다.</li>
        <li>진화는 자동입니다. 오른쪽 진화 조건표의 위에서부터 먼저 채운 쪽으로 진화하고, 아무것도 채우지 못하면 수명이 다할 때 ‘시간 경과’ 진화를 합니다.</li>
        <li>배고픔·똥 방치·썩은 고기는 병(페널티)이 됩니다. 페널티 진화를 노릴 때만 일부러 쓰세요.</li>
        <li>타이틀 매치(엔트리 08:00~15:00)에서 이기면 테이머 랭크가 올라 사육 용량, 케이지 공간, 진화 가능 세대가 늘어납니다. 첫 타이틀은 봄 3일 ‘에이스 오브 링’입니다.</li>
        <li>프리 배틀로 배틀 횟수와 비트를 모으고, 상점에서 고기·알약·케이지를 사세요.</li>
      </ol><p class="hint">비공식 비영리 팬게임입니다. 진행은 이 브라우저에 자동 저장되며, 창을 닫아 둔 시간도 최대 12시간까지 반영됩니다. 사냥은 아직 웹판에 옮기지 않았습니다.</p>`,
    );
  $('#reset').onclick = () => {
    if (battle) return;
    showModal(
      '새로 시작할까요?',
      '<p>이 브라우저의 육성 기록이 모두 지워집니다.</p><button class="primary" id="confirm-reset" style="background:#ad654d">기록을 지우고 다시 시작</button>',
      'NEW GAME',
    );
    $('#confirm-reset').onclick = () => {
      save = C.freshSave(Date.now());
      view = freshView();
      log('새 테이머 생활을 시작했습니다.');
      board.reset();
      closeModal();
      render();
      persist();
    };
  };

  function frame(now) {
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
    lastTime = now;
    if (!document.hidden) {
      if (battle) battleTick(dt);
      else if (!paused && !board.editing) {
        clock += dt * speed;
        let changed = false;
        while (clock >= 1) {
          clock -= 1;
          syncTeam();
          const r = C.tickFarm(save);
          save = r.save;
          r.events.forEach(logEvent);
          changed = true;
        }
        if (changed) {
          render();
          if (save.clock % 10 === 0) persist();
        }
      }
      drawFarm(now / 1000, dt);
      drawPortrait(now / 1000);
    }
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => {
    lastTime = 0;
    persist();
  });
  window.addEventListener('pagehide', persist);
  // 브라우저 콘솔·자동 테스트에서 상태를 확인할 수 있게 열어 둔다 (읽기용)
  window.ChampGame = {
    get save() {
      return save;
    },
    get view() {
      return view;
    },
  };
  render();
  persist();
  requestAnimationFrame(frame);
})();
