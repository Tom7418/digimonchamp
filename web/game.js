'use strict';
// 디지몬 챔피언십 웹판 화면.
// 게임 규칙(사육·진화·배틀·타이틀·상점)은 web/core.js(ChampCore, src/core에서 빌드)를 그대로 쓰고,
// 이 파일은 화면 그리기, 입력, 저장만 담당한다. 시간: 현실 1초 = 게임 2분 (임시).
(() => {
  const C = window.ChampCore;
  const animations = window.createAnimationPlayer(window.DIGIMON_ANIMATIONS);
  const L = window.CageLayout;
  const $ = (s) => document.querySelector(s);
  const KEY = 'champion-web-v2';
  // 타이틀 화면의 '이어서'용: 페이지를 열 때 저장이 있었는가
  const hadSave = (() => {
    try {
      return !!localStorage.getItem(KEY);
    } catch {
      return false;
    }
  })();
  // 시간 흐름: 현실 1초 = 게임 2분 (×1). 하루(07:00~21:00)가 약 7분. 원작 속도는 미확인이라 임시 값
  // 원작 도움말(help #96): 디지털 월드의 1일은 실제 시간 10분 → 1440분 / 600초
  const MINUTES_PER_SECOND = 2.4;
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
    return { layout: START_LAYOUT.map((c) => ({ ...c })), storedCages: [], layoutVersion: 2, team: [], selected: 0, logs: [], poops: [], foods: [], tips: {}, entryNoticeRead: null, farmWorld: 2 };
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.save && raw.save.version === 2 && Array.isArray(raw.save.digimon) && raw.save.digimon.length && raw.view) {
        save = C.upgradeSave(raw.save);
        view = { ...freshView(), ...raw.view };
        view.farmWorld = raw.view.farmWorld; // 없으면 옛 좌표 → 시작할 때 새 월드 크기로 옮긴다
        // 먹이 좌표 복원은 board 생성과 옛 월드 좌표 변환을 마친 뒤 수행한다.
        // 재접속도 21시에서 멈춘다. 수면은 달력의 '다음 날로'를 누를 때만 진행한다.
        const away = Math.min(C.OFFLINE_CAP_MINUTES, Math.max(0, Math.floor(((Date.now() - save.lastSavedAt) / 1000) * MINUTES_PER_SECOND)));
        if (away > 0) {
          const r = C.advanceOffline(save, away);
          save = r.save;
          r.events.forEach(logEvent);
          const elapsed = r.elapsedMinutes;
          if (elapsed >= 5) view.logs.unshift({ time: stamp(), text: `자리를 비운 동안 게임 시간 ${Math.floor(elapsed / 60)}시간 ${elapsed % 60}분이 지났습니다.` });
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
            logs: view.logs.slice(0, 40),
            poops: view.poops,
            foods: view.foods,
            tips: view.tips,
            entryNoticeRead: view.entryNoticeRead,
            farmWorld: view.farmWorld,
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
    if (e.type === 'trained') return log(`${e.name}(은)는 ${e.changes}`);
    if (e.type === 'poop') return dropPoop(e.uid);
    if (e.type === 'hatched') log(`디지에그가 부화해 ${n(e.to)}이(가) 태어났습니다!`);
    else if (e.type === 'evolved') {
      log(`✦ ${n(e.from)}이(가) ${n(e.to)}(으)로 진화했습니다!`);
      toast(`${n(e.from)} → ${n(e.to)} 진화!`);
      tipMail('evolve', '디지몬이 진화했습니다.\n스테이터스를 올려 조건을 만족시키거나 시간이 지나면 디지몬은 진화합니다.\n오른쪽 진화 조건표를 확인하세요.');
    } else if (e.type === 'egg' && e.reason === 'sick') {
      log(`${n(e.from)}이(가) 병·부상을 방치해 쓰러졌습니다… 디지에그로 돌아갔습니다.`);
      toast(`${n(e.from)} → 디지에그`);
    } else if (e.type === 'egg') log(`${n(e.from)}이(가) 수명을 다해 디지에그로 돌아갔습니다.`);
    else if (e.type === 'lost') log(`${e.name}을(를) 잃었습니다… (${e.reason})`);
    else if (e.type === 'sick') {
      log(`${e.name}이(가) 병에 걸렸습니다. 알약을 선택하고 디지몬을 터치하세요. (페널티 +1)`);
      toast(`${e.name} 발병!`);
      tipMail('sick', '디지몬이 병에 걸렸습니다.\n아래 알약을 선택한 뒤 디지몬을 터치하면 낫습니다.\n이틀 동안 방치하면 쓰러져 디지에그로 돌아갑니다.');
    } else if (e.type === 'blocked')
      log(
        e.reason === 'rank'
          ? `${e.name}: 테이머 랭크가 낮아 진화하지 못했습니다. 타이틀 매치에서 이기세요.`
          : `${e.name}: 사육 용량이 부족해 진화하지 못했습니다.`,
      );
  }

  // 화면용 목록(view.team)을 규칙 엔진의 디지몬 목록과 맞추고, 들어간 시설을 엔진의 케이지로 반영한다.
  // 새 디지몬은 사육장 가운데쯤에 나타난다 (월드 좌표, cage-editor.js)
  function spawnPet(uid, i) {
    const r = board.roam, cx = (r.x0 + r.x1) / 2, cy = (r.y0 + r.y1) / 2;
    const x = cx - 220 + ((i * 97) % 440), y = cy - 60 + ((i * 53) % 140);
    return { uid, x, y, target: x, direction: 1, cageId: null, cage: 'free' };
  }
  function syncTeam() {
    const old = new Map(view.team.map((p) => [p.uid, p]));
    view.team = save.digimon.map(
      (d, i) => old.get(d.uid) || spawnPet(d.uid, i),
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
    syncPoops();
    renderTray();
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
        `<b>${battle ? '배틀' : hunt ? '사냥' : '육성'}</b>`,
        `${pad(date.hour)}:${pad(date.minute)}`,
        `${esc(C.rankName(rank))}`,
        `용량 ${C.usedCapacity(save)} / ${capacity}G`,
        `케이지 ${usedCells()} / ${C.cageSpaceOf(save)}칸`,
      ]
        .map((x) => `<span>${x}</span>`)
        .join(''),
    );
    $('#scene-title').textContent = battle ? '배틀 아레나' : hunt ? `사냥터 · ${hunt.field.id}` : '사육장';
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

    $('#inventory').textContent = `고기 ${save.meat} · 알약 ${save.pills} · ${C.ropeOf(save.rope).name} · 메모리카드 ${save.memoryCard}G`;
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
      ...view.logs.slice(0, 8).map((l) => {
        const li = document.createElement('li');
        const t = document.createElement('time');
        const span = document.createElement('span');
        t.textContent = l.time;
        span.textContent = l.text;
        li.append(t, span);
        return li;
      }),
    );
    document.querySelectorAll('[data-action]').forEach((b) => (b.disabled = !!battle || !!hunt));
    // 상점에서 사지 않은 시설은 설치 목록에서 잠근다
    document.querySelectorAll('[data-build]').forEach((b) => {
      const t = L.types[b.dataset.build];
      const owned = b.dataset.build === 'free' || save.cages.includes(t.core);
      b.disabled = !owned;
      b.title = owned ? '' : '상점에서 구매하면 설치할 수 있습니다';
    });
  }


  // ---------- 안내 편지 (원작: 'From: 안내' 창) ----------
  // 편지가 열려 있는 동안은 시간이 멈춘다. 같은 안내(tip)는 한 번만 보낸다.
  let mailOpen = false;
  let activeMail = null;
  const mailQueue = [];
  function mail(text, from = '안내', entryKey = null) {
    mailQueue.push({ text, from, entryKey });
    if (!mailOpen) nextMail();
  }
  function tipMail(key, text) {
    if (view.tips[key]) return;
    view.tips[key] = true;
    mail(text);
  }
  function nextMail() {
    // 경기 안내는 실제로 닫은 뒤에만 읽음 처리한다. 큐에 넣기만 하고 저장하면 안내가 유실된다.
    if (activeMail?.entryKey) {
      view.entryNoticeRead = activeMail.entryKey;
      persist();
    }
    const m = mailQueue.shift();
    activeMail = m || null;
    const box = $('#mail');
    if (!m) {
      mailOpen = false;
      box.hidden = true;
      return;
    }
    mailOpen = true;
    box.hidden = false;
    box.querySelector('.mail-from').textContent = `From: ${m.from}`;
    box.querySelector('.mail-text').textContent = m.text;
  }

  // ---------- 하루 흐름 ----------
  // 밤 9시가 되면 하루가 끝나고 달력 화면을 거쳐 다음 날 아침 7시로 넘어간다 (밤에는 잔다).
  // 엔트리 시간 내 재접속에도 안내한다. 이미 읽었거나 대기 중인 같은 날 안내는 중복하지 않는다.
  let dayEnding = false;
  function checkSchedule() {
    const notice = C.matchEntryNotice(save, view.entryNoticeRead);
    if (notice && activeMail?.entryKey !== notice.key && !mailQueue.some((m) => m.entryKey === notice.key)) {
      mail(`배틀에 참가할 수 있습니다.\n오늘은 ${notice.names.join(', ')}이(가) 열립니다.\n엔트리는 15시 전까지. 아래 '배틀'에서 출전하세요.`, '안내', notice.key);
    }
    if (C.isNight(save) && !battle) openDayEnd();
  }
  function matchDays(season, year) {
    // 이번 계절 달력에 표시할 경기 날짜
    const rank = C.tamerRank(save);
    const marks = {};
    for (const t of C.TITLES) if (t.season === season && rank >= t.minRank && !save.titles.includes(t.id)) (marks[t.day] ??= []).push(t.name);
    if (season === C.CHAMP_SEASON && !save.champion) {
      if (save.qualifiedYear !== null && year > save.qualifiedYear) (marks[C.CHAMP_DAY] ??= []).push('챔피언십 본선');
      else if (save.qualifiedYear === null && rank >= C.PRELIM_MIN_RANK) for (const d of C.PRELIM_DAYS) (marks[d] ??= []).push('예선');
    }
    return marks;
  }
  function openDayEnd() {
    if (dayEnding) return;
    if (hunt) endHunt('밤 9시');
    dayEnding = true;
    const morning = C.dateOf(C.nextMorningClock(save));
    const nextIdx = morning.day;
    const nextSeason = morning.season;
    const nextYear = morning.year;
    const marks = matchDays(nextSeason, nextYear);
    const seasonName = ['봄', '여름', '가을', '겨울'][nextSeason];
    const cells = Array.from({ length: C.DAYS_PER_SEASON }, (_, i) => {
      const day = i + 1;
      const m = marks[day];
      return `<div class="cal-cell${day === nextIdx ? ' today' : ''}${day < nextIdx ? ' past' : ''}"><b>${day}</b>${m ? `<small>★ ${esc(m.join(', '))}</small>` : ''}</div>`;
    }).join('');
    showModal(
      '하루가 끝났습니다',
      `<p>디지몬들이 잠들었습니다. 내일 아침 7시에 다시 시작합니다.</p>
       <div class="calendar"><div class="cal-head">${seasonName}</div><div class="cal-grid">${cells}</div><div class="cal-today">${seasonName} <b>${nextIdx}</b> 일</div></div>`,
      'END OF DAY',
      '다음 날로',
    );
    $('#close-modal').disabled = true;
  }
  function finishDay() {
    const r = C.endDay(save);
    save = r.save;
    r.events.forEach(logEvent);
    dayEnding = false;
    const d = C.dateOf(save.clock);
    log(`${d.seasonName} ${d.day}일 아침이 밝았습니다.`);
    toast(`${d.seasonName} ${d.day}일`);
    render();
    persist();
  }

  // ---------- 사육장 바닥: 똥·먹이 ----------
  // 똥은 하나씩 눌러 치운다. 고기 도구를 선택하면 터치 위치에 바닥 먹이를 놓는다.
  function dropPoop(uid) {
    const p = view.team.find((x) => x.uid === uid);
    if (!p) return;
    view.poops.push({ uid, x: p.x + (Math.random() - 0.5) * 50, y: p.y + 4 + Math.random() * 14 });
  }
  function syncPoops() {
    for (const d of save.digimon) {
      const mine = view.poops.filter((x) => x.uid === d.uid);
      for (let k = mine.length; k < d.poop; k++) dropPoop(d.uid);
      if (mine.length > d.poop) {
        const extra = new Set(mine.slice(0, mine.length - d.poop));
        view.poops = view.poops.filter((x) => !extra.has(x));
      }
    }
    const alive = new Set(save.digimon.map((d) => d.uid));
    view.poops = view.poops.filter((x) => alive.has(x.uid));
  }
  function drawPoop(x, y) {
    ctx.fillStyle = '#e57aa9';
    ctx.strokeStyle = '#7a2f52';
    ctx.lineWidth = 1.5;
    for (const [w, dy] of [[9, 0], [6.5, -5], [4, -9]]) {
      ctx.beginPath();
      ctx.ellipse(x, y + dy, w, 3.8, 0, 0, 7);
      ctx.fill();
      ctx.stroke();
    }
  }
  const itemImages = Object.fromEntries(['meat', 'pill', 'rotten'].map((kind) => {
    const image = new Image();
    image.src = `assets/items/${kind}.png`;
    return [kind, image];
  }));
  function drawFood(f) {
    const image = itemImages[f.kind];
    if (image?.complete && image.naturalWidth) ctx.drawImage(image, f.x - 32, f.y - 60, 64, 70);
  }
  // 선택형 도구: 고기는 바닥 배치만, 알약은 디지몬을 터치해 사용한다.
  let selectedItem = null;
  const ITEMS = [
    { kind: 'meat', label: '고기', count: () => C.availableFood(save, view.foods, 'meat') },
    { kind: 'pill', label: '알약', count: () => save.pills },
  ];
  function renderTray() {
    setHtml(
      '#tray',
      ITEMS.map((it) => `<button class="tray-item" data-item="${it.kind}" aria-pressed="${selectedItem === it.kind}"${it.count() > 0 ? '' : ' disabled'}><img src="assets/items/${it.kind}.png" alt=""><b>${it.label}</b><small>×${Math.max(0, it.count())}</small></button>`).join('') +
        '<button class="tray-item" data-item="select" aria-pressed="' + (selectedItem === null) + '">선택 / 이동</button>' +
        '<span class="tray-hint">' + (selectedItem === 'meat' ? '사육장 바닥을 터치해 고기를 놓으세요 · Esc로 취소' : selectedItem === 'pill' ? '치료할 디지몬을 터치하세요 · Esc로 취소' : '고기 선택 → 바닥 터치 · 알약 선택 → 디지몬 터치') + '</span>',
    );
  }
  function petAt(pt) {
    let best = null;
    for (const p of view.team) {
      const d = digi(p.uid);
      if (!d) continue;
      const a = spriteOf(d.speciesId, d.isEgg);
      const h = (a?.baseline ?? 30) * (d.isEgg ? 1.6 : 2);
      const r = Math.max(28, footprint(d.speciesId, d.isEgg, 2) + 6);
      const dist = Math.hypot(pt.x - p.x, pt.y - (p.y - h / 2));
      if (Math.abs(pt.x - p.x) < r && pt.y < p.y + 12 && pt.y > p.y - h - 6 && (!best || dist < best.dist)) best = { p, d, dist };
    }
    return best;
  }
  function dropItem(kind, pt) {
    if (farmInputBlocked()) return;
    const hit = petAt(pt);
    if (kind === 'pill') {
      if (!hit) return toast('알약을 사용할 디지몬을 터치하세요.');
      view.selected = view.team.indexOf(hit.p);
      return apply(C.heal(save, hit.d.uid));
    }
    const it = ITEMS.find((x) => x.kind === kind);
    if (!it || it.count() <= 0) return toast('사용 가능한 아이템이 없어요. 상점에서 사세요.');
    const r = board.roam;
    view.foods.push({ kind, x: Math.min(r.x1, Math.max(r.x0, pt.x)), y: Math.min(r.y1, Math.max(r.y0, pt.y)) });
    renderTray();
    persist();
  }
  // 아이템 터치 배치. 같은 포인터의 누르기/떼기를 한 번만 처리하고 케이지 입력은 막는다.
  let itemPress = null;
  let canceledPress = null;
  let swallowUp = false;
  function farmInputBlocked() {
    return titleOpen || !!battle || !!hunt || board.editing || mailOpen || dayEnding || $('#modal').open || document.hidden;
  }
  function clearItemTool() {
    canceledPress = itemPress?.id ?? canceledPress;
    itemPress = null;
    selectedItem = null;
    renderTray();
  }
  function farmPoint(e) {
    const r = canvas.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
    return board.toWorld(e);
  }
  function initFarmInput() {
    $('#tray').addEventListener('click', (e) => {
      const b = e.target.closest('[data-item]');
      if (!b || b.disabled || farmInputBlocked()) return;
      selectedItem = b.dataset.item === 'select' || selectedItem === b.dataset.item ? null : b.dataset.item;
      itemPress = null;
      renderTray();
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (farmInputBlocked()) return;
      if (selectedItem) {
        e.stopImmediatePropagation();
        e.preventDefault();
        if (e.button !== 0 || e.isPrimary === false || itemPress) return;
        itemPress = { id: e.pointerId, kind: selectedItem };
        canceledPress = null;
        canvas.setPointerCapture?.(e.pointerId);
        return;
      }
      const pt = farmPoint(e);
      const hit = pt && view.poops.find((x) => Math.hypot(pt.x - x.x, pt.y - (x.y - 4)) < 16);
      if (!hit) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      swallowUp = true;
      const res = C.cleanOne(save, hit.uid);
      if (res.ok) save = res.save;
      view.poops = view.poops.filter((x) => x !== hit);
      effect = { text: '반짝!', color: '#e8fbff', until: performance.now() + 900, uid: hit.uid };
      render();
      persist();
    }, true);
    canvas.addEventListener('pointerup', (e) => {
      if (e.pointerId === canceledPress) {
        canceledPress = null;
        e.stopImmediatePropagation();
        return;
      }
      if (selectedItem || itemPress || swallowUp) {
        e.stopImmediatePropagation();
        e.preventDefault();
        swallowUp = false;
        if (itemPress?.id !== e.pointerId) return;
        const kind = itemPress.kind;
        itemPress = null;
        const pt = farmPoint(e);
        if (pt && !farmInputBlocked()) dropItem(kind, pt);
      }
    }, true);
    canvas.addEventListener('pointercancel', (e) => {
      if (itemPress?.id === e.pointerId) itemPress = null;
    });
    canvas.addEventListener('lostpointercapture', (e) => {
      if (itemPress?.id === e.pointerId) itemPress = null;
    });
    window.addEventListener('blur', clearItemTool);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearItemTool(); });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && selectedItem) { e.preventDefault(); clearItemTool(); }
    });
    $('#mail').onclick = nextMail;
  }
  // 먹는 동안의 예약은 화면에서만 유지한다. 저장 후 재접속하면 바닥 먹이는 남고 다시 접근한다.
  const feeding = new Map();
  const animationId = (d) => SPRITE_BY_NAME[d.isEgg ? '디지에그' : C.getSpecies(d.speciesId).name];
  // 배고픈 디지몬은 접근 → 정지 → 씹기 → 소비 순서로 행동한다.
  function seekFood(p, d, dt) {
    const eating = feeding.get(d.uid);
    if (eating) {
      if (!view.foods.includes(eating.food) || d.isEgg || p.cageId || eating.species !== d.speciesId) {
        feeding.delete(d.uid);
        return false;
      }
      eating.elapsed += dt;
      // 임시 연출 정책: 원본 먹기 후보 시퀀스를 두 번 재생한 뒤 한 개를 소비한다.
      if (eating.elapsed < animations.duration(animationId(d), 'eat') * 2) return true;
      const r = C.eatFloorFood(save, view.foods, d.uid, view.foods.indexOf(eating.food));
      feeding.delete(d.uid);
      if (r.ok) {
        view.foods = r.foods;
        save = r.save;
        log(`${nameOf(d)}: ${r.message}`);
        effect = { text: eating.food.kind === 'meat' ? '♥ 냠냠!' : '우웩…', color: '#ffe4a0', until: performance.now() + 1500, uid: d.uid };
      }
      render();
      persist();
      return true;
    }
    if (!view.foods.length || d.isEgg || d.hunger >= 60) return false;
    let best = null;
    for (const f of view.foods) {
      // 다른 디지몬이 씹는 먹이를 동시에 소비하지 않는다.
      if ([...feeding.values()].some((e) => e.food === f)) continue;
      // 병든 디지몬은 썩은 먹이를 거부한다. 먹지 못하는 먹이 앞에서 계속 멈추지 않는다.
      if (f.kind === 'rotten' && d.sick) continue;
      const dist = Math.hypot(f.x - p.x, f.y - p.y);
      if (!best || dist < best.dist) best = { f, dist };
    }
    if (!best) return false;
    const { f, dist } = best;
    if (p.cageId) { p.cageId = null; p.cage = 'free'; syncTeam(); }
    if (dist < 10) {
      feeding.set(d.uid, { food: f, elapsed: 0, species: d.speciesId });
      return true;
    }
    const v = 34 * dt;
    p.direction = f.x > p.x ? 1 : -1;
    p.x += ((f.x - p.x) / dist) * v;
    p.y += ((f.y - p.y) / dist) * v;
    p.target = p.x;
    return true;
  }
  // 머리 위 상태 말풍선
  function bubbleOf(d) {
    if (d.isEgg) return null;
    if (d.sick) return '🤢';
    if (d.injured) return '🩹';
    if (d.hunger < 30) return '🍖';
    if (d.poop >= 3) return '💩';
    if (d.fatigue > 80) return '💤';
    return null;
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
    if (action === 'clean') apply(C.clean(save, d.uid));
    if (action === 'heal') apply(C.heal(save, d.uid));
    if (action === 'battle') battleMenu();
    if (action === 'shop') shopMenu();
    if (action === 'release') releaseMenu();
    if (action === 'hunt') huntMenu();
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
    if (dayEnding) return finishDay();
    if (battle) {
      battle = null;
      render();
      persist();
    }
  }

  function shopMenu() {
    const items = C.shopItems(save).filter((item) => item.id !== 'rotten');
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
      : `<p class="hint">오늘은 타이틀 매치가 없습니다. 엔트리 시간은 07:00~15:00, 일정: ${esc(C.upcoming(save)[0] || '-')}</p>`;
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
    const m = b.setup.match;
    const wasQualified = save.qualifiedYear;
    // 타이틀은 이겼을 때만, 챔피언십 예선·본선은 진 것도 기록한다
    if (m) save = C.applyMatch(save, m, won);
    else if (won) save = { ...save, bits: save.bits + b.setup.prize };
    const after = C.tamerRank(save);
    const why = b.state.reason === 'timeout' ? ' (시간 종료 판정)' : '';
    battleLog(won ? `승리!${why} 상금 ${b.setup.prize.toLocaleString('ko-KR')} ฿` : `패배…${why}`);
    log(`${b.setup.title} ${won ? '승리' : '패배'}${won ? ` · ${b.setup.prize} ฿` : ''}`);
    const champLine = (t) => {
      battleLog(t);
      log(t);
    };
    if (m?.id === 'prelim') {
      const p = save.prelim;
      champLine(`예선 성적 ${p.wins}승 ${p.days.length - p.wins}패 (${C.PRELIM_WINS}승 통과)`);
      if (wasQualified === null && save.qualifiedYear !== null) {
        champLine(`예선 통과! 본선은 다음 해 가을 ${C.CHAMP_DAY}일입니다.`);
        toast('챔피언십 예선 통과!');
      } else if (save.qualifiedYear === null && p.wins + C.PRELIM_DAYS.filter((x) => x > C.dateOf(save.clock).day).length < C.PRELIM_WINS)
        champLine('올해 예선 탈락… 내년 가을에 다시 도전하세요.');
    } else if (m?.id === 'final') {
      if (save.champion) {
        champLine('🏆 디지몬 챔피언십 우승! 진정한 디지몬 테이머가 되었습니다.');
        toast('챔피언십 우승!');
      } else if (won) champLine(`다음 라운드가 열렸습니다: ${C.FINAL_ROUNDS[save.finalRound].name} (배틀에서 이어서 출전)`);
      else champLine('본선 탈락… 다시 예선부터 도전해야 합니다.');
    } else if (won && m) log(`타이틀 메달 획득: ${m.name}`);
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
    const animDt = !titleOpen && !battle && !hunt && !paused && !mailOpen && !dayEnding && !board.editing ? dt : 0;
    // 로스트·놓아주기·새 게임으로 사라진 개체의 먹이 예약을 해제한다.
    for (const uid of feeding.keys()) if (!digi(uid)) feeding.delete(uid);
    ctx.fillStyle = '#163a40';
    ctx.fillRect(0, 0, 960, 560);
    ctx.save();
    ctx.translate(-Math.round(board.cam.x), -Math.round(board.cam.y));
    board.draw(ctx);
    for (const f of view.foods) drawFood(f);
    for (const pp of view.poops) drawPoop(pp.x, pp.y);
    const order = view.team.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y);
    for (const { p, i } of order) {
      const d = digi(p.uid);
      if (!d) continue;
      const oldX = p.x, oldY = p.y;
      if (animDt > 0 && !d.isEgg && !seekFood(p, d, dt) && !p.cageId) {
        if (Math.abs(p.target - p.x) < 3) {
          if (Math.random() < 0.008) p.target = Math.max(board.roam.x0, Math.min(board.roam.x1, p.x + (Math.random() - 0.5) * 500));
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
      // 행동별 원본 셀을 재생한다. 인위적인 상하 흔들림은 사용하지 않는다.
      if (animDt > 0) p.motion = feeding.has(d.uid) ? 'eat' : Math.hypot(p.x - oldX, p.y - oldY) > 0.01 ? 'walk' : 'idle';
      const frame = animations.pose(p, animationId(d), p.motion || 'idle', animDt);
      body(ctx, d.speciesId, d.isEgg, p.x, p.y, scale, frame, p.direction < 0);
      // 머리 위 상태 말풍선 (배고픔·병·부상·똥·피로)
      const bub = bubbleOf(d);
      if (bub) {
        const top = p.y - (spriteOf(d.speciesId, d.isEgg)?.baseline ?? 30) * scale - 6;
        ctx.fillStyle = '#ffffffe8';
        ctx.strokeStyle = '#203040';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(p.x + 6, top - 26, 28, 22, 6);
        ctx.fill();
        ctx.stroke();
        ctx.font = '15px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(bub, p.x + 20, top - 9);
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
    ctx.restore();
    drawMinimap();
    if (paused) {
      ctx.fillStyle = '#00000066';
      ctx.fillRect(0, 0, 960, 560);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('일시 정지', 480, 280);
    }
  }
  // 오른쪽 아래 작은 지도: 사육장 전체와 지금 보는 범위
  function drawMinimap() {
    const W = board.world.w, H = board.world.h, k = 150 / W, w = 150, h = H * k, x0 = 960 - w - 12, y0 = 560 - h - 12;
    ctx.fillStyle = '#081a24c0';
    ctx.fillRect(x0 - 3, y0 - 3, w + 6, h + 6);
    for (const c of view.layout) {
      ctx.fillStyle = L.types[c.kind]?.color || '#c9b98a';
      for (const [q, r] of L.cells(c)) {
        const m = board.center(q, r);
        ctx.beginPath();
        ctx.arc(x0 + m.x * k, y0 + m.y * k, board.R * k * 0.9, 0, 7);
        ctx.fill();
      }
    }
    for (const p of view.team) {
      ctx.fillStyle = view.team.indexOf(p) === view.selected ? '#ffe36e' : '#9fe6ff';
      ctx.fillRect(x0 + p.x * k - 2, y0 + p.y * k - 2, 4, 4);
    }
    ctx.strokeStyle = '#ffffffcc';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + board.cam.x * k, y0 + board.cam.y * k, 960 * k, 560 * k);
  }
  const portraitActor = {};
  function drawPortrait(dt) {
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
    const frame = animations.pose(portraitActor, animationId(d), 'idle', dt);
    body(portrait, d.speciesId, d.isEgg, 120, 120, scale, frame, false);
  }


  // ---------- 사냥 ----------
  // 규칙(출현표, HP, 로프 단계, 시간 제한)은 core의 hunt.ts. 여기서는 움직임·입력·그리기만 한다.
  // 로프 모드 (원작: 둘러싸고 → 당긴다)
  //  1) 드래그로 디지몬을 둘러싸 고리를 닫으면(시작점 근처에서 손을 뗌) 로프가 감긴다. 감긴 디지몬은 움직이지 못한다.
  //  2) 감긴 디지몬을 눌러 바깥쪽으로 끌었다 놓으면 '당기기' 1회 → HP 1 감소. HP가 0이 되면 포획.
  //  감은 뒤 BIND_SECONDS 안에 당기지 않으면 로프가 풀리고 디지몬이 도망간다.
  // 와이어 모드: 드래그한 선분에 와이어를 깔아 길을 막는다 (와이어 1개 소모).
  const AREA = { x0: 40, y0: 70, x1: 920, y1: 530 };
  const FIELD_LOOK = {
    '다이나 초원': ['#7fb069', '#6a9a57'], '미끌미끌 늪': ['#6f8f6a', '#4f6d55'], '모쥬라의 숲': ['#4f7f4a', '#3b6438'],
    하수도: ['#6d7378', '#545a5e'], '이글이글 사막': ['#d9b46a', '#c49a52'], 대초원: ['#9cc46e', '#86ad5c'],
    용암지대: ['#8a4e3a', '#6e3a2b'], '부츠 정글': ['#3f7a4d', '#2f5f3b'], '눈의 왕국': ['#e4eef2', '#c7d8df'], '잉카 유적': ['#b8a27a', '#9a855f'],
  };
  // 원본 사냥 지도(tools/extract_hunt_maps.py로 변환한 root/field/field_hmNN). 사냥터와 번호의 짝은
  // 형규가 원작 기준으로 확인(2026-11-12, docs/design.md). _01=낮, _02=밤. 실내(크롬 광산·기계 공장·하수도)는 밤 지도가 없다.
  const HUNT_MAP = {
    '다이나 초원': '01', 대초원: '02', '모쥬라의 숲': '03', '부츠 정글': '04', '미끌미끌 늪': '05', '파도치는 해변': '06',
    바위산: '08', '크롬 광산': '09', '기계 공장': '10', 하수도: '11', '눈의 왕국': '13', '암반 계곡': '14',
    용암지대: '15', '이글이글 사막': '16', 오아시스: '17', '잉카 유적': '18',
  };
  const HUNT_NO_NIGHT = ['09', '10', '11'];
  const huntMaps = {};
  function huntMapImage(field) {
    const no = HUNT_MAP[field.id];
    if (!no) return null;
    const night = C.dateOf(save.clock).hour >= C.HUNT_NIGHT_HOUR && !HUNT_NO_NIGHT.includes(no);
    const key = `${no}_${night ? '02' : '01'}`;
    if (!huntMaps[key]) {
      const img = new Image();
      img.src = `assets/fields/${key}.png`;
      huntMaps[key] = img;
    }
    return huntMaps[key];
  }
  let hunt = null;
  const BIND_SECONDS = 4;
  const PULL_DISTANCE = 70;

  function huntMenu() {
    const can = C.canHuntNow(save);
    const date = C.dateOf(save.clock);
    const fields = C.huntFields(save);
    showModal(
      '사냥',
      `<p>${esc(date.seasonName)} ${date.day}일 ${pad(date.hour)}:${pad(date.minute)} · ${C.ropeOf(save.rope).name} · 와이어 ${save.wires}개 · 메모리카드 ${save.memoryCard}G · 용량 ${C.usedCapacity(save)}/${C.capacityOf(save)}G</p>
       ${can.ok ? '' : `<p class="warn">${esc(can.reason)}</p>`}
       <div class="menu-list">${fields
         .map((f, i) => {
           const pool = C.huntPool(f, save.clock);
           const off = !f.open || !can.ok || save.bits < f.fee;
           const why = !f.open ? f.reason : save.bits < f.fee ? '비트 부족' : '';
           return `<button data-field="${i}"${off ? ' disabled' : ''}><b>${esc(f.id)}${f.fee ? ` · ${f.fee} ฿` : ''}</b><small>${why ? esc(why) + ' · ' : ''}이번 계절: ${esc(pool.babies.join(', ') || '없음')}${pool.rookies.length ? ` / 성장기 ${esc(pool.rookies.join(', '))}` : ''}${pool.strong.length ? ` / 성숙기 이상 ${esc(pool.strong.join(', '))}` : ''}</small></button>`;
         })
         .join('')}</div>
       <p class="hint">드래그로 디지몬을 둘러싸고 처음 위치 근처에서 손을 떼면 로프가 감깁니다. 감긴 디지몬을 눌러 바깥으로 끌었다 놓으면 당겨서 HP가 깎이고, HP를 다 깎으면 포획. 감은 뒤 4초 안에 당기지 않으면 풀립니다. 맞은 디지몬은 맵 밖으로 도망가니 와이어로 길을 막으세요. 성장기는 성장기 로프가 있어야 잡힙니다.</p>`,
      'HUNT',
      '취소',
    );
    $('#modal-body').querySelectorAll('[data-field]').forEach((b) => (b.onclick = () => startHunt(fields[+b.dataset.field])));
  }

  function spawnWild(field) {
    const id = C.pickWild(field, save.clock, Math.random);
    if (!id) return null;
    const side = Math.random();
    return {
      id, x: AREA.x0 + 80 + Math.random() * (AREA.x1 - AREA.x0 - 160), y: AREA.y0 + 60 + Math.random() * (AREA.y1 - AREA.y0 - 100),
      vx: (side < 0.5 ? -1 : 1) * (15 + Math.random() * 20), vy: (Math.random() - 0.5) * 30,
      hp: C.wildHp(id), max: C.wildHp(id), flee: 0, flash: 0, turn: 1 + Math.random() * 3,
    };
  }
  function startHunt(field) {
    if (!field.open) return;
    if (save.bits < field.fee) return toast('비트가 부족해요.');
    save = { ...save, bits: save.bits - field.fee };
    hunt = { field, wilds: [], wires: [], trail: [], drawing: false, tool: 'rope', respawn: 0, notes: [], carried: 0 };
    // 1024x1024 원본 지도에서 화면(960x560)만큼 잘라 쓸 위치. 들어갈 때마다 달라진다.
    hunt.map = huntMapImage(field);
    hunt.view = { x: Math.floor(Math.random() * (1024 - 960)), y: Math.floor(Math.random() * (1024 - 560)) };
    for (let i = 0; i < C.WILD_COUNT; i++) {
      const w = spawnWild(field);
      if (w) hunt.wilds.push(w);
    }
    $('#modal').close();
    document.body.classList.add('hunting');
    setTool('rope');
    log(`${field.id}에서 사냥을 시작했습니다.`);
    render();
    persist();
  }
  function endHunt(reason) {
    if (!hunt) return;
    log(`${hunt.field.id} 사냥 종료${reason ? ` (${reason})` : ''}`);
    hunt = null;
    document.body.classList.remove('hunting');
    render();
    persist();
  }
  function huntNote(text) {
    hunt.notes.unshift({ text, until: performance.now() + 3500 });
    hunt.notes = hunt.notes.slice(0, 4);
  }
  function setTool(tool) {
    if (hunt) hunt.tool = tool;
    $('#tool-rope').classList.toggle('active', tool === 'rope');
    $('#tool-wire').classList.toggle('active', tool === 'wire');
  }

  // 선분 교차 (와이어 충돌)
  function crosses(a, b, c, d) {
    const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
    return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  }
  function inside(pt, poly) {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  }

  function huntTick(dt) {
    if (!hunt) return;
    const now = performance.now();
    for (const w of hunt.wilds) {
      if (w.gone) continue;
      w.flash = Math.max(0, w.flash - dt);
      if (w.bound > 0) {
        // 감긴 동안은 제자리에서 버둥댄다
        w.bound -= dt;
        if (w.bound <= 0) {
          w.bound = 0;
          w.flee = 3;
          w.vx = (w.x - AREA.x0 < AREA.x1 - w.x ? -1 : 1) * 95;
          w.vy = (Math.random() - 0.5) * 40;
          huntNote(`${C.getSpecies(w.id).name}이(가) 로프를 풀고 도망간다!`);
        }
        continue;
      }
      if (w.flee > 0) {
        w.flee -= dt;
      } else {
        w.turn -= dt;
        if (w.turn <= 0) {
          w.turn = 1.5 + Math.random() * 3;
          const a = Math.random() * Math.PI * 2, v = 15 + Math.random() * 25;
          w.vx = Math.cos(a) * v;
          w.vy = Math.sin(a) * v * 0.6;
        }
      }
      const next = { x: w.x + w.vx * dt, y: w.y + w.vy * dt };
      if (hunt.wires.some((l) => crosses(w, next, l.a, l.b))) {
        w.vx = -w.vx;
        w.vy = -w.vy;
        continue;
      }
      w.x = next.x;
      w.y = next.y;
      const out = w.x < AREA.x0 || w.x > AREA.x1 || w.y < AREA.y0 + 20 || w.y > AREA.y1;
      if (out && w.flee > 0) {
        w.gone = true;
        huntNote(`${C.getSpecies(w.id).name}이(가) 도망쳤다!`);
      } else if (out) {
        if (w.x < AREA.x0 || w.x > AREA.x1) w.vx = -w.vx;
        if (w.y < AREA.y0 + 20 || w.y > AREA.y1) w.vy = -w.vy;
        w.x = Math.min(AREA.x1, Math.max(AREA.x0, w.x));
        w.y = Math.min(AREA.y1, Math.max(AREA.y0 + 20, w.y));
      }
    }
    hunt.wilds = hunt.wilds.filter((w) => !w.gone || now < 0);
    hunt.respawn -= dt;
    if (hunt.wilds.length < C.WILD_COUNT && hunt.respawn <= 0) {
      hunt.respawn = 6;
      const w = spawnWild(hunt.field);
      if (w) hunt.wilds.push(w);
    }
    const can = C.canHuntNow(save);
    if (!can.ok) endHunt(can.reason);
  }

  // 로프를 감는다: 닫힌 고리 안의 디지몬을 묶는다 (HP는 아직 그대로)
  function wrapRope(poly) {
    let any = false;
    for (const w of hunt.wilds) {
      if (w.gone || !inside(w, poly)) continue;
      any = true;
      const name = C.getSpecies(w.id).name;
      if (!C.ropeDamage(save, w.id)) {
        const need = C.ropeFor(w.id);
        huntNote(`${name}: 로프가 약해 감기지 않는다 (${need ? need.name + ' 필요' : '로프로는 잡을 수 없다'})`);
        w.flee = 2;
        w.vx = (w.x - AREA.x0 < AREA.x1 - w.x ? -1 : 1) * 80;
        continue;
      }
      w.bound = BIND_SECONDS;
      huntNote(`${name}에게 로프를 감았다! 디지몬을 눌러 바깥으로 당기세요`);
    }
    if (!any) huntNote('둘러싼 디지몬이 없습니다.');
  }

  // 감긴 디지몬을 당긴다: 내구력에 따라 끊어지거나, HP 1 감소, 0이면 포획
  function pullRope(w) {
    const name = C.getSpecies(w.id).name;
    if (Math.random() < C.ropeBreakChance(save, w.id)) {
      // 원작 도움말: 끊어져도 몇 번이고 다시 쓸 수 있다
      w.bound = 0;
      w.flee = 2;
      w.vx = (w.x - AREA.x0 < AREA.x1 - w.x ? -1 : 1) * 90;
      huntNote(`로프가 끊어졌다! ${name}이(가) 달아난다 (다시 감을 수 있어요)`);
      return;
    }
    w.hp -= C.ropeDamage(save, w.id);
    w.flash = 0.4;
    if (w.hp > 0) {
      w.bound = BIND_SECONDS;
      huntNote(`당겼다! ${name} HP ${w.hp}/${w.max}`);
      return;
    }
    const r = C.capture(save, w.id, Math.random, hunt.carried);
    if (r.ok) {
      save = r.save;
      hunt.carried += C.getSpecies(w.id).size;
      w.gone = true;
      huntNote(r.message);
      log(r.message);
      toast(r.message);
      render();
      persist();
    } else {
      w.hp = 1;
      w.bound = 0;
      w.flee = 3;
      w.vx = (w.x - AREA.x0 < AREA.x1 - w.x ? -1 : 1) * 95;
      huntNote(r.message);
      toast(r.message);
    }
  }

  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return board.toWorld(e);
  }
  function huntPointer(type, e) {
    if (!hunt) return;
    e.preventDefault();
    const p = canvasPoint(e);
    if (type === 'down') {
      const target = hunt.tool === 'rope' && hunt.wilds.find((w) => !w.gone && w.bound > 0 && Math.hypot(p.x - w.x, p.y - (w.y - 15)) < 50);
      hunt.pull = target ? { w: target, to: p } : null;
      hunt.drawing = !target;
      hunt.trail = target ? [] : [p];
      canvas.setPointerCapture?.(e.pointerId);
    } else if (type === 'move' && hunt.pull) {
      hunt.pull.to = p;
    } else if (type === 'up' && hunt.pull) {
      const { w } = hunt.pull;
      hunt.pull = null;
      if (w.gone || !(w.bound > 0)) return;
      if (Math.hypot(p.x - w.x, p.y - (w.y - 15)) >= PULL_DISTANCE) pullRope(w);
      else huntNote('더 멀리 끌어당기세요.');
    } else if (type === 'move' && hunt.drawing) {
      const last = hunt.trail[hunt.trail.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 4) hunt.trail.push(p);
      if (hunt.trail.length > 400) hunt.trail.shift();
      if (hunt.tool === 'wire' && hunt.trail.length > 2) hunt.trail = [hunt.trail[0], p];
    } else if (type === 'up' && hunt.drawing) {
      hunt.drawing = false;
      const t = hunt.trail;
      hunt.trail = [];
      if (hunt.tool === 'wire') {
        if (t.length < 2) return;
        if (save.wires <= 0) return huntNote('와이어가 없습니다. 상점에서 사세요.');
        let b = t[t.length - 1];
        const len = Math.hypot(b.x - t[0].x, b.y - t[0].y);
        if (len < 20) return;
        const k = Math.min(1, 180 / len);
        b = { x: t[0].x + (b.x - t[0].x) * k, y: t[0].y + (b.y - t[0].y) * k };
        hunt.wires.push({ a: t[0], b });
        save = { ...save, wires: save.wires - 1 };
        render();
        return;
      }
      const closed = t.length > 12 && Math.hypot(t[0].x - t[t.length - 1].x, t[0].y - t[t.length - 1].y) < 70;
      if (closed) wrapRope(t);
      else if (t.length > 12) huntNote('고리가 닫히지 않았습니다. 처음 위치 근처에서 손을 떼세요.');
    }
  }

  function drawHunt(t) {
    const [c1, c2] = FIELD_LOOK[hunt.field.id] || ['#7fb069', '#6a9a57'];
    const map = hunt.map;
    if (map && map.complete && map.naturalWidth) {
      // 원본 지도는 도트 그대로 1배로 그리고, 사냥 가능 범위 밖은 어둡게 덮는다.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(map, hunt.view.x, hunt.view.y, 960, 560, 0, 0, 960, 560);
      ctx.fillStyle = '#00000059';
      ctx.fillRect(0, 0, 960, AREA.y0);
      ctx.fillRect(0, AREA.y1, 960, 560 - AREA.y1);
      ctx.fillRect(0, AREA.y0, AREA.x0, AREA.y1 - AREA.y0);
      ctx.fillRect(AREA.x1, AREA.y0, 960 - AREA.x1, AREA.y1 - AREA.y0);
    } else {
      ctx.fillStyle = c2;
      ctx.fillRect(0, 0, 960, 560);
      ctx.fillStyle = c1;
      ctx.fillRect(AREA.x0, AREA.y0, AREA.x1 - AREA.x0, AREA.y1 - AREA.y0);
    }
    // 가장자리 = 출구
    ctx.strokeStyle = '#00000044';
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.strokeRect(AREA.x0, AREA.y0, AREA.x1 - AREA.x0, AREA.y1 - AREA.y0);
    ctx.setLineDash([]);
    for (const l of hunt.wires) {
      ctx.strokeStyle = '#d8dde0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.stroke();
      ctx.fillStyle = '#7a5532';
      for (const p of [l.a, l.b]) ctx.fillRect(p.x - 3, p.y - 8, 6, 12);
    }
    const order = [...hunt.wilds].sort((a, b) => a.y - b.y);
    for (const w of order) {
      const rx = footprint(w.id, false, 2);
      ctx.fillStyle = '#00000033';
      ctx.beginPath();
      ctx.ellipse(w.x, w.y + 1, rx, Math.max(5, rx * 0.3), 0, 0, 7);
      ctx.fill();
      if (w.bound > 0) {
        // 감긴 로프 (남은 시간만큼 고리가 줄어든다)
        ctx.strokeStyle = '#f5e6a8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(w.x, w.y - 14, rx + 8, rx * 0.55 + 10, 0, 0, Math.PI * 2 * (w.bound / BIND_SECONDS));
        ctx.stroke();
      }
      if (w.flash > 0 && Math.floor(w.flash * 20) % 2) ctx.globalAlpha = 0.4;
      body(ctx, w.id, false, w.x, w.y, 2, Math.floor(t * 4) % 2, w.vx < 0);
      ctx.globalAlpha = 1;
      const sp = C.getSpecies(w.id);
      const weak = !C.ropeDamage(save, w.id);
      ctx.font = 'bold 11px "Noto Sans KR",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = weak ? '#ffd0c0' : '#ffffff';
      ctx.fillText(sp.name + (weak ? ` (${C.ropeFor(w.id)?.name ?? '포획 불가'} 필요)` : ''), w.x, w.y + 18);
      for (let k = 0; k < w.max; k++) {
        ctx.fillStyle = k < w.hp ? '#e0574b' : '#00000055';
        ctx.fillRect(w.x - w.max * 7 + k * 14, w.y + 22, 12, 5);
      }
    }
    if (hunt.pull) {
      const { w, to } = hunt.pull;
      const far = Math.hypot(to.x - w.x, to.y - (w.y - 15)) >= PULL_DISTANCE;
      ctx.strokeStyle = far ? '#ffd36a' : '#f5e6a8';
      ctx.lineWidth = far ? 4 : 2;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y - 15);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    if (hunt.trail.length > 1) {
      ctx.strokeStyle = hunt.tool === 'wire' ? '#d8dde0' : '#f5e6a8';
      ctx.lineWidth = hunt.tool === 'wire' ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(hunt.trail[0].x, hunt.trail[0].y);
      for (const p of hunt.trail) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (hunt.tool === 'rope') {
        ctx.strokeStyle = '#f5e6a888';
        ctx.beginPath();
        ctx.arc(hunt.trail[0].x, hunt.trail[0].y, 70, 0, 7);
        ctx.stroke();
      }
    }
    // 상단 정보
    const d = C.dateOf(save.clock);
    ctx.fillStyle = '#0b1d2acc';
    ctx.fillRect(0, 0, 960, 52);
    ctx.fillStyle = '#ffd36a';
    ctx.font = 'bold 16px "Noto Sans KR",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`사냥 · ${hunt.field.id}`, 16, 32);
    ctx.fillStyle = '#e6f2f5';
    ctx.font = '13px "Noto Sans KR",sans-serif';
    ctx.fillText(`${d.seasonName} ${d.day}일 ${pad(d.hour)}:${pad(d.minute)} (22:00 종료) · ${C.ropeOf(save.rope).name} · 와이어 ${save.wires}개 · 카드 ${hunt.carried}/${save.memoryCard}G`, 230, 31);
    const now = performance.now();
    hunt.notes = hunt.notes.filter((n) => n.until > now);
    ctx.textAlign = 'left';
    hunt.notes.forEach((n, i) => {
      ctx.fillStyle = '#0b1d2abb';
      const w = ctx.measureText(n.text).width + 20;
      ctx.fillRect(16, 520 - i * 26 - 18, w, 22);
      ctx.fillStyle = '#fff';
      ctx.fillText(n.text, 26, 520 - i * 26 - 2);
    });
  }

  // ---------- 시작 ----------
  load();
  const board = createCageEditor(
    canvas,
    () => view,
    (message) => {
      if (message) log(message);
      render();
      persist();
    },
    toast,
    () => !!battle || !!hunt || mailOpen || dayEnding,
  );
  // 육각 칸을 키우기 전(사육장 960x560)의 저장 좌표를 새 월드 크기로 옮긴다
  if (view.farmWorld !== 2) {
    const kx = board.world.w / 960, ky = board.world.h / 560;
    for (const o of [...view.team, ...view.foods, ...view.poops]) {
      o.x *= kx;
      o.y *= ky;
      if ('target' in o) o.target = o.x;
    }
    view.farmWorld = 2;
  }
  // 카메라보다 큰 월드의 좌표를 옛 960x560 범위로 잘라내지 않는다.
  view.foods = C.restoreFloorFood(save, view.foods, board.roam);
  syncTeam();
  { const p = view.team[view.selected]; if (p) board.centerOn(p.x, p.y - 40); }
  // 아이템 칸은 사육장 바로 아래에 둔다 (화면을 내리지 않고 끌어 놓을 수 있게)
  document.querySelector('.canvas-wrap').after($('#tray'));
  initFarmInput();
  tipMail('welcome', '디지몬 챔피언십에 참가하게 된 것을 환영합니다!\n디지에그가 곧 부화합니다. 고기를 선택한 뒤 바닥을 터치해 놓고, 똥은 눌러서 치워 주세요.\n밤 9시가 되면 하루가 끝납니다.');

  document.querySelectorAll('[data-action]').forEach((b) => (b.onclick = () => act(b.dataset.action)));
  $('#partner-tabs').onclick = (e) => {
    const b = e.target.closest('[data-partner]');
    if (b) {
      view.selected = +b.dataset.partner;
      const p = view.team[view.selected];
      if (p) board.centerOn(p.x, p.y - 40);
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
        <li>디지에그에서 시작합니다. 현실 1초가 게임 2분이고, 아침 7시부터 밤 9시까지가 하루입니다. 밤 9시가 되면 달력을 보고 다음 날로 넘어갑니다.</li>
        <li>고기를 선택한 뒤 사육장 바닥을 터치하면 배치됩니다. 배고픈 디지몬은 훈련을 멈추고 걸어와 먹습니다. 알약은 선택 후 치료할 디지몬을 터치하세요. 선택 / 이동 버튼이나 Esc로 도구를 해제합니다. 바닥의 똥은 선택 / 이동 상태에서 눌러 치웁니다.</li>
        <li>디지몬을 끌어 케이지에 넣으면 1시간마다 정해진 능력치와 종족·속성 수치가 오릅니다. 양호실은 피로와 부상을 회복합니다.</li>
        <li>진화는 자동입니다. 오른쪽 진화 조건표의 위에서부터 먼저 채운 쪽으로 진화하고, 아무것도 채우지 못하면 수명이 다할 때 ‘시간 경과’ 진화를 합니다.</li>
        <li>배고픔·똥 방치·썩은 고기는 병(페널티)이 됩니다. 병·부상을 이틀 방치하면 쓰러져 디지에그로 돌아갑니다.</li>
        <li>타이틀 매치(엔트리 07:00~15:00)에서 이기면 테이머 랭크가 올라 사육 용량, 케이지 공간, 진화 가능 세대가 늘어납니다. 첫 타이틀은 봄 3일 ‘에이스 오브 링’입니다.</li>
        <li>프리 배틀로 배틀 횟수와 비트를 모으고, 상점에서 고기·알약·케이지를 사세요.</li>
      </ol><p class="hint">비공식 비영리 팬게임입니다. 진행은 이 브라우저에 자동 저장되며, 창을 닫아 둔 시간도 최대 12시간까지 반영됩니다. 사냥은 아직 웹판에 옮기지 않았습니다.</p>`,
    );
  // ---------- 타이틀 화면 (원작 title_menu 그림) ----------
  // 페이지를 열면 먼저 보인다. 닫기 전에는 게임 시간이 흐르지 않는다.
  let titleOpen = true;
  function closeTitle() {
    const el = $('#title-screen');
    el.classList.add('closing');
    setTimeout(() => (el.hidden = true), 350);
    titleOpen = false;
    lastTime = 0;
  }
  function startNewGame() {
    endHunt();
    save = C.freshSave(Date.now());
    view = freshView();
    log('새 테이머 생활을 시작했습니다.');
    board.reset();
    render();
    persist();
  }
  (function initTitle() {
    const menu = $('#title-menu'), confirm = $('#title-confirm');
    if (!hadSave) {
      // 저장이 없으면 '이어하기' 자리에 바로 시작
      $('#title-continue').innerHTML = '<span class="ico">▶</span>시작하기';
      $('#title-new').hidden = true;
    }
    $('#title-continue').onclick = closeTitle;
    $('#title-new').onclick = () => {
      menu.hidden = true;
      confirm.hidden = false;
      $('#title-no').focus();
    };
    $('#title-no').onclick = () => {
      confirm.hidden = true;
      menu.hidden = false;
    };
    $('#title-yes').onclick = () => {
      startNewGame();
      closeTitle();
    };
    $('#title-help').onclick = () => $('#help').click();
    $('#title-continue').focus();
  })();
  // 타이틀 왼쪽 그림: 원작 시설 그림을 떠 있는 육각 섬으로, 그 위에 디지몬, 앞에 오프닝의 구슬
  const titleArt = $('#title-art').getContext('2d');
  titleArt.imageSmoothingEnabled = false;
  const titleImages = Object.fromEntries(['field', 'gym', 'clinic', 'free'].map((k) => [k, Object.assign(new Image(), { src: `assets/facilities/${k}.png` })]));
  titleImages.orb = Object.assign(new Image(), { src: 'assets/ui/title_orb.png' });
  const ISLANDS = [
    { x: 175, y: 175, r: 105, img: 'field', mon: '아구몬', phase: 0 },
    { x: 470, y: 150, r: 95, img: 'gym', mon: '가오몬', phase: 1.7 },
    { x: 330, y: 330, r: 125, img: 'free', mon: '파피몬', phase: 3.1 },
  ];
  function hexPath(c, x, y, r, squash = 0.62) {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 + 30) * (Math.PI / 180);
      c[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a) * squash);
    }
    c.closePath();
  }
  function drawTitleArt(t) {
    const c = titleArt;
    c.clearRect(0, 0, 640, 560);
    for (const is of ISLANDS) {
      const y = is.y + Math.sin(t * 1.2 + is.phase) * 6;
      // 섬의 옆면(흙)
      for (let k = 34; k > 0; k -= 2) {
        hexPath(c, is.x, y + k, is.r);
        c.fillStyle = k > 20 ? '#5a3a22' : '#7a5230';
        c.fill();
      }
      // 윗면: 원작 시설 그림
      c.save();
      hexPath(c, is.x, y, is.r);
      c.clip();
      const im = titleImages[is.img];
      c.fillStyle = '#6aa04a';
      c.fill();
      if (im.complete && im.naturalWidth) c.drawImage(im, is.x - is.r * 1.1, y - is.r * 0.8, is.r * 2.2, is.r * 1.6);
      c.restore();
      hexPath(c, is.x, y, is.r);
      c.strokeStyle = '#ffffff88';
      c.lineWidth = 2;
      c.stroke();
      // 디지몬
      c.fillStyle = '#0005';
      c.beginPath();
      c.ellipse(is.x, y + 12, 26, 7, 0, 0, 7);
      c.fill();
      body(c, is.mon, false, is.x, y + 10 + Math.sin(t * 3 + is.phase) * 2, 2.6, Math.floor(t * 3 + is.phase) % 2, is.x > 320);
    }
    // 앞쪽 구슬 + 빛
    const orb = titleImages.orb, ox = 330, oy = 470, pulse = 1 + Math.sin(t * 2) * 0.05;
    const g = c.createRadialGradient(ox, oy, 10, ox, oy, 120 * pulse);
    g.addColorStop(0, '#9fe8ff88');
    g.addColorStop(1, '#9fe8ff00');
    c.fillStyle = g;
    c.beginPath();
    c.arc(ox, oy, 120 * pulse, 0, 7);
    c.fill();
    if (orb.complete && orb.naturalWidth) {
      const w = orb.naturalWidth * 1.3, h = orb.naturalHeight * 1.3;
      c.save();
      c.beginPath();
      c.ellipse(ox, oy, w * 0.36, h * 0.42, 0, 0, 7);
      c.clip();
      c.drawImage(orb, ox - w / 2, oy - h / 2, w, h);
      c.restore();
    }
  }

  $('#reset').onclick = () => {
    if (battle) return;
    showModal(
      '새로 시작할까요?',
      '<p>이 브라우저의 육성 기록이 모두 지워집니다.</p><button class="primary" id="confirm-reset" style="background:#ad654d">기록을 지우고 다시 시작</button>',
      'NEW GAME',
    );
    $('#confirm-reset').onclick = () => {
      startNewGame();
      closeModal();
    };
  };

  canvas.addEventListener('pointerdown', (e) => huntPointer('down', e));
  canvas.addEventListener('pointermove', (e) => huntPointer('move', e));
  canvas.addEventListener('pointerup', (e) => huntPointer('up', e));
  canvas.addEventListener('pointercancel', (e) => huntPointer('up', e));
  $('#tool-rope').onclick = () => setTool('rope');
  $('#tool-wire').onclick = () => setTool('wire');
  $('#hunt-leave').onclick = () => endHunt();

  function frame(now) {
    if (titleOpen) drawTitleArt(now / 1000);
    if (selectedItem && farmInputBlocked()) clearItemTool();
    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0;
    lastTime = now;
    if (!document.hidden) {
      if (battle) battleTick(dt);
      else if (!titleOpen && !paused && !board.editing && !mailOpen && !dayEnding) {
        if (hunt) huntTick(dt);
        clock += dt * speed * MINUTES_PER_SECOND;
        let changed = false;
        while (clock >= 1 && !dayEnding) {
          clock -= 1;
          syncTeam();
          const r = C.tickFarm(save);
          save = r.save;
          r.events.forEach(logEvent);
          changed = true;
          checkSchedule();
        }
        if (changed) {
          render();
          if (save.clock % 10 === 0) persist();
        }
      }
      if (hunt) drawHunt(now / 1000);
      else drawFarm(now / 1000, dt);
      drawPortrait(!titleOpen && !paused && !mailOpen && !dayEnding && !board.editing ? dt : 0);
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
    get hunt() {
      return hunt;
    },
  };
  render();
  // 저장된 밤에는 첫 tick 전에 달력을 연다. 재접속으로 야간 훈련이 발생하지 않는다.
  checkSchedule();
  persist();
  requestAnimationFrame(frame);
})();
