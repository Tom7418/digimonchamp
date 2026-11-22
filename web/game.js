'use strict';
// 디지몬 챔피언십 웹판 화면.
// 게임 규칙(사육·진화·배틀·타이틀·상점)은 web/core.js(ChampCore, src/core에서 빌드)를 그대로 쓰고,
// 이 파일은 화면 그리기, 입력, 저장만 담당한다. 시간: 현실10초 = 게임10분(사용자 지정).
(() => {
  const C = window.ChampCore;
  const animations = window.createAnimationPlayer(window.DIGIMON_ANIMATIONS);
  const battleBackdrop = window.createBattleMapRenderer();
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
  // 온라인·오프라인 시간에 같은 엔진 배율을 쓴다(현실10초 = 게임10분, 사용자 지정).
  const huntEquipmentArt=window.createHuntEquipmentRenderer();
  const MINUTES_PER_SECOND = C.MINUTES_PER_SECOND;
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (n, a = 0, b = 100) => Math.min(b, Math.max(a, n));
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // 원본에서 변환한 스프라이트(assets/sprites.js, 이름은 tools/sprite_names.json)를 진화표 한글 이름으로 찾는다.
  // 그림이 없는 종은 종족 색 원 + 이름 첫 글자로 그린다.
  const SPRITE_BY_NAME = Object.fromEntries(window.SPRITES.filter((m) => m.name).map((m) => [m.name, m.id]));
  const FAMILY_COLOR = { 용: '#d9774b', 짐승: '#c9a35b', 물: '#5b9fd9', 새: '#8fc7e8', 벌레풀: '#7fb35a', 기계: '#9aa3ad', 성: '#f0dc8a', 암흑: '#7a5a9a' };
  const START_LAYOUT = [
    { id: 'start-basic', kind: 'free', q: 0, r: 0, rotation: 0 },
    { id: 'start-clinic', kind: 'clinic', q: 2, r: 0, rotation: 0 },
    { id: 'start-field', kind: 'field', q: 3, r: 0, rotation: 0 },
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
  // 진화 결과는 엔진이 먼저 확정한다. 연출은 원본 그림을 재생하는 화면 전용 큐다.
  const evolutionScene=window.createEvolutionPlayer({
    data:window.EVOLUTION_DATA,dialog:$('#evolution-dialog'),canvas:$('#evolution-canvas'),skipButton:$('#evolution-skip'),
    loadSpecies:id=>spriteOf(id,false),
    valid:uid=>!!digi(uid)&&!digi(uid).isEgg,
    canStart:uid=>!hatching.has(uid), // 오프라인 중 부화→진화했어도 부화부터 보여 준다.
    drawSpecies:(context,id,x,y,scale,white,elapsed)=>{
      const spriteId=SPRITE_BY_NAME[C.getSpecies(id).id];
      sprite(context,spriteId,x,y,scale,animations.sample(spriteId,white?'evolving':'idle',elapsed),false);
    },
    onComplete:event=>toast(`${C.getSpecies(event.from).name} → ${C.getSpecies(event.to).name} 진화!`),
    onDrain:event=>{
      if(!event)return;
      // 다음 단계까지 이미 충족했다면 그 연출부터 이어간다. 모든 진화가 끝난 뒤 안내를 연다.
      render();
      if(!evolutionScene.busy)tipMail('evolve', '디지몬이 진화했습니다.\n스테이터스를 올려 조건을 만족시키거나 시간이 지나면 디지몬은 진화합니다.\n오른쪽 진화 조건표를 확인하세요.');
      persist();
    },
  });
  window.evolutionScene=evolutionScene;
  const trainingFloats = new Map();
  const farmHealth=window.createHpBars?.();

  // ---------- 저장 ----------
  function freshView() {
    return { layout: START_LAYOUT.map((c) => ({ ...c })), storedCages: [], layoutVersion: 6, team: [], selected: 0, logs: [], poops: [], foods: [], tips: {}, entryNoticeRead: null, farmWorld: 2 };
  }
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && raw.save && raw.save.version === 2 && Array.isArray(raw.save.digimon) && raw.save.digimon.length && raw.view) {
        save = C.upgradeSave(raw.save);
        view = { ...freshView(), ...raw.view };
        view.poops=(view.poops||[]).map(({sweeping,...poop})=>poop);
        if (raw.save.digimon.some(d => d.statVersion !== 1))
          view.logs.unshift({ time: stamp(), text: '디지몬 능력치를 원작 수치 기준으로 갱신했습니다.' });
        view.farmWorld = raw.view.farmWorld; // 없으면 옛 좌표 → 시작할 때 새 월드 크기로 옮긴다
        // 먹이 좌표 복원은 board 생성과 옛 월드 좌표 변환을 마친 뒤 수행한다.
        // 창을 닫아 둔 동안에는 게임 시간이 흐르지 않는다(형규 지정). 진행 중이던 10초 묶음의 남은 분량만 이어받는다.
        // 예전에는 닫아 둔 시간을 최대 12게임시간까지 반영해, 15시에 닫고 9분 넘게 지나면 켜자마자 하루가 끝났다.
        clock = Math.max(0, Math.min(9.999, Number(view.timeRemainder) || 0));
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
            rankAreaVersion: view.rankAreaVersion,
            rankAreaBackup: view.rankAreaBackup,
            floorItems: view.floorItems,
            team: view.team,
            selected: view.selected,
            logs: view.logs.slice(0, 40),
            poops: view.poops,
            foods: view.foods,
            tips: view.tips,
            entryNoticeRead: view.entryNoticeRead,
            farmWorld: view.farmWorld,
            timeRemainder: clock,
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
  // 디지에그 그림: 원본처럼 디지에그화 횟수에 따라 e000(처음 흰 알)~e007
  const eggName = (d) => { const i = C.eggSpriteIndex(d.eggs); return i ? '디지에그' + i : '디지에그'; };
  const digi = (uid) => save.digimon.find((d) => d.uid === uid);
  const current = () => digi(view.team[view.selected]?.uid) || save.digimon[0];
  function stamp() {
    if (!save) return '';
    const d = C.dateOf(save.clock);
    return `${d.seasonName} ${d.day}일 ${pad(d.hour)}:${pad(d.minute - d.minute % 10)}`;
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
    if (e.type === 'trained') {
      // 엔진이 확정한 실제 변화량을 마리별로 표시해 동시 훈련도 서로 덮어쓰지 않는다.
      trainingFloats.set(e.uid, {lines:e.changes.split(', '),elapsed:0});
      return log(`${e.name}(은)는 ${e.changes}`);
    }
    if (e.type === 'poop') return dropPoop(e.uid);
    if (e.type === 'hatched') {
      // 원본 디지에그 그림의 두 번째 동작(금이 가고 갈라지며 빛이 퍼지는 9칸)을 재생한 뒤 새 디지몬을 보여 준다
      hatching.set(e.uid, 0);
      asset(SPRITE_BY_NAME[n(e.to)]);
      log(`디지에그가 부화해 ${n(e.to)}이(가) 태어났습니다!`);
    }
    else if (e.type === 'evolved') {
      log(e.memory ? `✦ 기억 진화! ${n(e.from)}이(가) 예전 생의 모습 ${n(e.to)}(으)로 진화했습니다!` : `✦ ${n(e.from)}이(가) ${n(e.to)}(으)로 진화했습니다!`);
      evolutionScene.enqueue(e);
    } else if (e.type === 'egg' && e.reason === 'sick') {
      log(`${n(e.from)}이(가) 빈사 상태로 방치되어 쓰러졌습니다… 디지에그로 돌아갔습니다.`);
      toast(`${n(e.from)} → 디지에그`);
    } else if (e.type === 'egg') log(`${n(e.from)}이(가) 수명을 다해 디지에그로 돌아갔습니다.`);
    else if (e.type === 'lost') {
      log(`${e.name}을(를) 잃었습니다… (${e.reason})`);
      toast(`${e.name} 로스트…`);
    }
    else if (e.type === 'sick') {
      log(`${e.name}이(가) 병에 걸렸습니다. 약(주사기)을 선택하고 디지몬을 터치하세요. (페널티 +1)`);
      toast(`${e.name} 발병!`);
      tipMail('sick', '디지몬이 병에 걸렸습니다.\n아래 약(주사기)을 선택한 뒤 디지몬을 터치하면 주사를 놓습니다. 세대가 낮으면 한 번에 안 나을 수도 있어요.\n내버려두면 빈사 상태가 되어버립니다.');
    } else if (e.type === 'injured') {
      log(`${e.name}이(가) 훈련하다 다쳤습니다. 상처약을 선택하고 디지몬을 터치하세요.`);
      toast(`${e.name} 부상!`);
    } else if (e.type === 'dying') {
      const fix = e.cause === 'sick' ? '약(주사기)으로 병을' : e.cause === 'injured' ? '상처약으로 부상을' : e.cause === 'hp' ? '양호실에서 쉬게 해 HP를' : '먹이로 배고픔을';
      log(`${e.name}이(가) 빈사 상태가 되었습니다! 움직이지 못합니다. ${fix} 고치세요. 계속 내버려두면 로스트됩니다.`);
      toast(`${e.name} 빈사!`);
      tipMail('dying', '디지몬이 빈사 상태가 되었습니다.\n병·부상·배고픔을 치료하지 않으면 빈사 상태가 되고, 빈사 상태를 내버려두면 로스트되어 사라질 수도 있습니다.\n원인을 치료하면 다시 움직일 수 있어요.');
    } else if (e.type === 'revived') {
      log(`${e.name}이(가) 빈사 상태에서 회복했습니다.`);
      toast(`${e.name} 회복`);
    } else if (e.type === 'petted') {
      const p = view.team.find((x) => x.uid === e.uid);
      if (p) startCareFx('pet', p, true);
      log(`${e.name}(은)는 쓰다듬어 주자 마음이 편해졌다.`);
    } else if (e.type === 'extended') {
      // 원본 +0x4C 수명 연장 (랭크 때문에 못 한 진화, 또는 수명이 다할 때 유대 50 이상). 알림 문구는 웹판
      log(e.reason === 'rank' ? `${e.name}: 진화할 힘은 있지만 테이머 랭크가 낮아 기다립니다. 이번 세대의 수명이 늘어났습니다.` : `${e.name}: 테이머와의 유대 덕분에 이번 세대의 수명이 늘어났습니다.`);
      toast(`${e.name} 수명 연장`);
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
    if (view.pickedUid != null && !view.team.some((p) => p.uid === view.pickedUid)) view.pickedUid = null;
    const coreCage = new Map(view.team.map((p) => [p.uid, (p.cageId && L.types[p.cage]?.core) || '기본 케이지']));
    const cageInstances=new Map(view.team.map(p=>[p.uid,p.cageId??null]));
    // 다른 케이지로 옮겨 놓으면 새 훈련을 시작한다. 훈련 케이지인데 못 하면 이유를 알려 준다.
    save = { ...save, digimon: save.digimon.map((d) => {
      const next = C.relocate(d, coreCage.get(d.uid), cageInstances.get(d.uid));
      if (next !== d && d.cageInstance !== undefined && next.cageInstance !== d.cageInstance) {
        const why = C.trainingBlocker(next);
        if (why) toast(`${nameOf(next)}: ${why}`);
      }
      return next;
    }) };
  }

  // ---------- 케이지 규칙 연결 ----------
  // 케이지 공간은 테이머 랭크에 따라 늘어나고(레드 테이머 16칸), 새 시설은 상점에서 산 것만 한 개씩 설치할 수 있다.
  L.space = () => C.cageSpaceOf(save);
  // 정원 표시와 과밀 판정이 같은 엔진 값을 사용하도록 연결한다.
  for(const type of Object.values(L.types))type.capacity=C.getCage(type.core).capacity;
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
  function checkReadyEvolutions() {
    const result=C.evaluateEvolutions(save);
    save=result.save;
    result.events.forEach(logEvent);
  }
  function render() {
    syncTeam();
    // 돌보기/놓아주기/상점/타이틀로 조건이나 제한이 바뀐 직후, 시간 진행 없이 전체를 재평가한다.
    checkReadyEvolutions();
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
        `${pad(date.hour)}:${pad(date.minute - date.minute % 10)}`,
        `${esc(C.rankName(rank))}`,
        `용량 ${C.usedCapacity(save)} / ${capacity}G`,
        `케이지 ${usedCells()} / ${C.cageSpaceOf(save)}칸`,
      ]
        .map((x) => `<span>${x}</span>`)
        .join(''),
    );
    $('#scene-title').textContent = battle ? '배틀 아레나' : hunt ? `사냥터 · ${hunt.field.id}` : '사육장';
    $('#next-day').disabled = !!battle || titleOpen || dayEnding;
    if(hunt)refreshGear();

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
    const life = d.isEgg ? C.EGG_MINUTES : C.lifespanOf(d);
    $('#mood').textContent = d.isEgg
      ? `${Math.max(0, C.EGG_MINUTES - d.stageAge)}분 뒤 부화합니다.`
      : `성격: ${d.personality} · 배틀 ${d.battles}회 (승 ${d.wins}) · 페널티 ${d.penalties}${d.dying ? ' · 빈사' : ''}${d.sick ? ' · 병' : ''}${d.injured ? ' · 부상' : ''}`;
    $('#xp-label').textContent = `${Math.floor(d.stageAge / 60)}시간 / ${Math.floor(life / 60)}시간`;
    $('#xp-bar').style.width = `${clamp((d.stageAge / life) * 100)}%`;
    $('#training-info').disabled=!!battle||!!hunt;
    const where = view.team[view.selected];
    $('#cage-status').textContent = where?.cageId ? `${L.types[where.cage]?.name} 안에서 지내는 중` : '자유 활동 (훈련 없음)';
    setHtml(
      '#vitals',
      [
        // 현재 HP (원본 +0x50). 배틀·훈련으로 줄고 쉬면 찬다
        ['HP', d.isEgg ? 0 : C.hpOf(d), d.isEgg ? 0 : d.stats.hp],
        ['포만감', d.hunger, 100],
        ['피로', d.fatigue, 100],
        ['청결', 100 - d.poop * 20, 100],
      ]
        .map(
          ([n, v, max]) =>
            n==='HP'&&window.hpBarHtml
              ? `<div class="vital" data-pet-hp="${d.uid}"><span>HP</span>${window.hpBarHtml(v,max,farmHealth?.sample(d.uid,v,max)??v)}<span class="hp-number">${Math.round(v)} / ${max}</span></div>`
              : `<div class="vital"><span>${n}</span><div class="track"><i style="width:${clamp(max ? (v / max) * 100 : 0)}%"></i></div><span>${Math.round(v)} / ${max}</span></div>`,
        )
        .join(''),
    );
    setHtml('#stats', C.STAT_KEYS.map((k) => `<div><span>${C.STAT_LABEL[k]}</span><strong>${d.stats[k]}</strong></div>`).join(''));
    const ap = Object.entries(d.ap).filter(([, v]) => v >= 1);
    setHtml(
      '#ap',
      (ap.length
        ? ap.map(([k, v]) => `<span>${k} ${Math.floor(v)}</span>`).join('')
        : '<span class="muted">종족·속성 수치 없음 — 훈련 케이지에 넣어 올리세요</span>') +
        (d.isEgg ? '' : Object.entries(C.digimonResist(d))
          .map(([k, v]) => `<span title="종 기본값 + 훈련으로 얻은 값. 이 속성의 필살기를 맞을 때 방어 대신 쓰입니다.">${esc(k)} 내성 ${v}</span>`).join('')),
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

    $('#inventory').textContent = `고기 ${save.meat} · 알약 ${save.pills} · 약 ${save.medicine} · 상처약 ${save.salve} · ${C.ropeOf(save.rope).name} · 메모리카드 ${save.memoryCard}G`;
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
      // 원작 시설이 40종 가까이 되므로 가진 것만 보여 준다
      b.hidden = !owned;
      b.disabled = !owned;
    });
  }


  // ---------- 안내 편지 (원작: 'From: 안내' 창) ----------
  // 편지가 열려 있는 동안은 시간이 멈춘다. 같은 안내(tip)는 한 번만 보낸다.
  let mailOpen = false;
  let activeMail = null;
  const mailQueue = [];
  function mail(text, from = '안내', entryKey = null, eventId = null, offer = false) {
    mailQueue.push({ text, from, entryKey, eventId, offer });
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
    // 원본 이벤트 메일은 읽어야 선물을 받는다 (메일을 열 때 선물 처리, arm9 0x0208C2D8)
    if (activeMail?.eventId != null) giveEventMail(activeMail.eventId);
    if (activeMail?.offer) setTimeout(offerPrompt, 0);
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

  // 랭크 업 사장 메일 등 예약된 원본 이벤트를 메일함에 띄운다
  let lastEventHour = null;
  function deliverEventMails() {
    // NPC 매입 제안 (원본 0x2129064): 답할 때까지 다시 띄운다
    const o = save.npcOffer, od = o && save.digimon.find((d) => d.uid === o.uid);
    if (o && !od) { save = C.answerNpcOffer(save, false); persist(); }
    else if (o && !activeMail?.offer && !mailQueue.some((m) => m.offer) && !$('#modal').open) mail(C.offerText(o, nameOf(od)), o.from, null, null, true);
    for (const id of save.pendingMails ?? []) {
      const e = C.mailEvent(id);
      if (!e || activeMail?.eventId === id || mailQueue.some((m) => m.eventId === id)) continue;
      mail(e.text, e.from, null, id);
    }
  }
  function offerPrompt() {
    const o = save.npcOffer, d = o && save.digimon.find((x) => x.uid === o.uid);
    if (!d) return;
    showModal('디지몬을 건네겠습니까?', `<p>${esc(o.from)}에게 <b>${esc(nameOf(d))}</b>(을)를 ${o.price.toLocaleString('ko-KR')} ฿에 건넵니다. 건넨 디지몬은 돌아오지 않습니다.</p><p><button class="primary" data-offer="yes">건넨다</button> <button data-offer="no">거절한다</button></p>`, 'MAIL', '나중에 답하기');
    $('#modal-body').querySelectorAll('[data-offer]').forEach((b) => (b.onclick = () => {
      const yes = b.dataset.offer === 'yes';
      save = C.answerNpcOffer(save, yes);
      log(yes ? `${nameOf(d)}(을)를 ${o.from}에게 건네고 ${o.price.toLocaleString('ko-KR')} ฿를 받았습니다.` : `${o.from}의 매입 제안을 거절했습니다.`);
      syncTeam();
      persist();
      $('#modal').close();
    }));
  }
  function giveEventMail(id) {
    const r = C.openMail(save, id);
    save = r.save;
    if (!r.event) return persist();
    // 배틀 신청: 원본 '도전을 받겠습니까?' (선물 종류 1, arm9 0x0208B8A8)
    if (r.event.battle) {
      persist();
      const e = r.event;
      setTimeout(() => {
        showModal('도전을 받겠습니까?', `<p>${esc(e.from)}의 팀 「${esc(e.battle.name)}」(${C.npcTeam(e.battle.team).members.length}마리)와 배틀합니다. 이기면 ${e.battle.prize.toLocaleString('ko-KR')} ฿.</p><p><button class="primary" data-challenge="yes">받는다</button> <button data-challenge="no">거절한다</button></p>`, 'CHALLENGE', '닫기');
        $('#modal-body').querySelectorAll('[data-challenge]').forEach((b) => (b.onclick = () => {
          if (b.dataset.challenge === 'no') { log(`${e.from}의 도전을 거절했습니다.`); $('#modal').close(); return; }
          save = { ...save, challenge: { id: e.id, ...e.battle, from: e.from } };
          persist();
          $('#modal').close();
          battleMenu();
        }));
      }, 0);
      return;
    }
    // 원본은 지금 케이지 x=100~300에 50 간격으로 놓는다. 웹판은 선택한 디지몬 근처에 같은 간격으로 놓는다
    const p = view.team[view.selected] ?? view.team[0], ro = board.roam;
    const cx = p ? p.x : (ro.x0 + ro.x1) / 2, cy = p ? p.y + 30 : (ro.y0 + ro.y1) / 2;
    r.event.foods.forEach((gift, i) => {
      const x = cx + (i - (r.event.foods.length - 1) / 2) * 50;
      const item = { kind: 'meat', gift, x: Math.min(ro.x1, Math.max(ro.x0, x)), y: Math.min(ro.y1, Math.max(ro.y0, cy)) };
      board.attachFloorItem(item);
      view.foods.push(item);
    });
    if (r.event.foods.length) log(`${r.event.from}의 선물: ${r.event.foods.map((f) => (f === 'big' ? '큰 고기' : '케이크')).join(', ')}`);
    const g = r.event.gift;
    if (g?.bits) log(`디지몬이 ${g.bits.toLocaleString('ko-KR')} ฿를 찾아냈습니다.`);
    if (g?.item) log(`디지몬이 ${g.item.name} ${g.item.count}개를 찾아냈습니다.`);
    renderTray();
    persist();
  }

  // ---------- 하루 흐름 ----------
  // 23:59가 되면 하루가 끝나고 달력 화면을 거쳐 다음 날 아침 7시로 넘어간다 (밤에는 잔다).
  // 엔트리 시간 내 재접속에도 안내한다. 이미 읽었거나 대기 중인 같은 날 안내는 중복하지 않는다.
  let dayEnding = false;
  function checkSchedule() {
    if (titleOpen) return; // 타이틀 화면(이어하기·새로하기)을 먼저 보여 준다
    const notice = C.matchEntryNotice(save, view.entryNoticeRead);
    if (notice && activeMail?.entryKey !== notice.key && !mailQueue.some((m) => m.entryKey === notice.key)) {
      mail(`배틀에 참가할 수 있습니다.\n오늘은 ${notice.names.join(', ')}이(가) 열립니다.\n엔트리는 15시 전까지. 아래 '배틀'에서 출전하세요.`, '안내', notice.key);
    }
    if (!battle && !hunt) {
      // 정각마다 원본 메일 이벤트를 굴린다: 10·15·20시 NPC 매입(0x2129064), 13~18시 라이벌 배틀 신청(0x2129450)
      const minute = ((save.clock % 1440) + 1440) % 1440;
      if (minute % 60 === 0 && lastEventHour !== save.clock) {
        lastEventHour = save.clock;
        const r = C.rollNpcOffer(save, minute / 60, Math.random);
        if (r) save = r.save;
        save = C.rollRivalChallenge(save, minute / 60, Math.random);
        // 사장 배틀: 챔피언이 되면 첫 신청(0xAD), 이기기 전까지 계절 첫날 12시 재도전(0xAE)
        save = C.rollBossMail(save);
        persist();
      }
      // 프리 배틀 활약 매입: 후보가 있으면 육성 화면에 돌아와 50%로 제안 (원본 0x2129084)
      if (save.offerCandidate !== undefined && !save.npcOffer) { save = C.rollBattleOffer(save, Math.random); persist(); }
      deliverEventMails();
    }
    if (C.isNight(save) && !battle) openDayEnd();
  }
  function matchDays(season, year) {
    // 이번 계절 달력에 표시할 경기 날짜
    const rank = C.tamerRank(save);
    const marks = {};
    for (const t of C.TITLES) if (t.season === season && rank >= t.minRank) (marks[t.day] ??= []).push({name:t.name,won:save.titles.includes(t.id)});
    if (season === C.CHAMP_SEASON && !save.champion) {
      if (save.qualifiedYear !== null && year > save.qualifiedYear) (marks[C.CHAMP_DAY] ??= []).push({name:'챔피언십 본선',won:false});
      else if (save.qualifiedYear === null && rank >= C.PRELIM_MIN_RANK) for (const d of C.PRELIM_DAYS) (marks[d] ??= []).push({name:'예선',won:false});
    }
    return marks;
  }
  function openDayEnd() {
    if (dayEnding) return;
    if (hunt) endHunt('23:59 하루 마감');
    dayEnding = true;
    clock = 0;
    const morning = C.dateOf(C.nextMorningClock(save));
    const nextSeason = morning.season;
    const nextYear = morning.year;
    const marks = matchDays(nextSeason, nextYear);
    showModal(
      '하루가 끝났습니다',
      `<p>디지몬들이 잠들었습니다. 내일 아침 7시에 다시 시작합니다.</p>
       ${window.dayResultCalendarHtml(C,morning,marks,esc)}`,
      'END OF DAY',
      '다음 날로',
    );
    $('#close-modal').disabled = true;
    $('#modal').classList.add('day-change-modal');
  }
  function finishDay() {
    const r = C.endDay(save, Math.random, L.crowded(view));
    save = r.save;
    r.events.forEach(logEvent);
    dayEnding = false;
    const d = C.dateOf(save.clock);
    // 원본 아침 메일: 계절 첫날이 아니면 4%로 어머니 소식이나 '디지몬이 무언가를 찾아냄' (overlay9_18 0x21120E4)
    save = C.rollMorningMail(save, d.day, Math.random);
    log(`${d.seasonName} ${d.day}일 아침이 밝았습니다.`);
    toast(`${d.seasonName} ${d.day}일`);
    render();
    persist();
  }

  // ---------- 사육장 바닥: 똥·먹이 ----------
  // 똥과 남은 먹이는 빗자루 클릭·드래그로 치운다. 고기 도구를 선택하면 터치 위치에 바닥 먹이를 놓는다.
  function dropPoop(uid) {
    const p = view.team.find((x) => x.uid === uid);
    if (!p) return;
    view.poops.push({ uid, cageId:p.cageId, x: p.x + (Math.random() - 0.5) * 50, y: p.y + 4 + Math.random() * 14 });
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
    // 원작 똥 2프레임 (18틱씩 반복), 원점 (14,19)
    const im = careImages[`poop_${(Math.floor(performance.now() / 300) % 2) + 1}`];
    if (im.complete && im.naturalWidth) {
      ctx.drawImage(im, x - 14 * 2, y - 19 * 2 + 8, im.naturalWidth * 2, im.naturalHeight * 2);
      return;
    }
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
  const itemImages = Object.fromEntries(['meat', 'meat_1', 'meat_2', 'meat_3', 'pill', 'pill_1', 'pill_2', 'pill_3', 'rotten', ...['big','cake'].flatMap(k=>[0,1,2,3].map(n=>`${k}_${n}`))].map((kind) => {
    const image = new Image();
    image.src = `assets/items/${kind}.png`;
    return [kind, image];
  }));
  function drawFood(f) {
    const full = 100 * C.foodUnits(f);
    const stage = Math.min(3, Math.floor((full - (f.remaining ?? full)) / (full / 4)));
    // 원본 사육 NANR: 큰 고기36~39, 케이크41~44. 같은 원점으로 먹는 단계만 바꾼다.
    if(f.kind==='meat'&&['big','cake'].includes(f.gift)){
      const image=itemImages[`${f.gift}_${stage}`];
      if(image?.complete&&image.naturalWidth)ctx.drawImage(image,f.x-64,f.y-96,128,112);
      return;
    }
    const image = itemImages[(f.kind === 'meat' || f.kind === 'pill') && stage ? `${f.kind}_${stage}` : f.kind];
    const k = 1;
    if (image?.complete && image.naturalWidth) ctx.drawImage(image, f.x - 32 * k, f.y - 60 * k - (k - 1) * -10, 64 * k, 70 * k);
  }
  // 선택형 도구: 고기·알약(프로틴)은 바닥에 놓아 먹이고, 약(주사기)·상처약은 디지몬을 터치해 쓴다.
  let selectedItem = null;
  const TOOL_ICON = { meat: 'assets/items/meat.png', pill: 'assets/items/pill.png', shot: 'assets/ui/tool_shot.png', heal: 'assets/ui/tool_heal.png' };
  const ITEMS = [
    { kind: 'meat', label: '고기', count: () => C.availableFood(save, view.foods, 'meat') },
    { kind: 'pill', label: '알약', count: () => C.availableFood(save, view.foods, 'pill') },
    { kind: 'shot', label: '약', count: () => save.medicine, target: true },
    { kind: 'heal', label: '상처약', count: () => save.salve, target: true },
  ];
  function renderTray() {
    // 빗자루를 든 동안은 마우스 커서도 원작 빗자루 그림
    canvas.style.cursor = selectedItem === 'broom' ? 'url(assets/ui/broom_1.png) 6 26, pointer' : '';
    setHtml(
      '#tray',
      // 도구 줄 그림은 원작의 실제 도트: 손 커서, 고기, 알약, 말풍선 속 주사기·반창고, 빗자루, 공터 (tools/extract_ui.py·extract_items.py)
      '<button class="tray-item tool" data-item="select" aria-pressed="' + (selectedItem === null) + '" title="선택 / 이동 / 쓰다듬기"><img src="assets/ui/tool_hand.png" alt=""><b>선택</b></button>' +
        ITEMS.map((it) => `<button class="tray-item tool" data-item="${it.kind}" aria-pressed="${selectedItem === it.kind}"${it.count() > 0 ? '' : ' disabled'} title="${it.label}"><img src="${TOOL_ICON[it.kind]}" alt=""><b>${it.label}</b><small>×${Math.max(0, it.count())}</small></button>`).join('') +
        '<button class="tray-item tool" data-item="broom" aria-pressed="' + (selectedItem === 'broom') + '" title="빗자루: 똥·남은 먹이를 클릭하거나 드래그해 치우기"><img src="assets/ui/broom_1.png" alt=""><b>빗자루</b>' + (view.poops.length ? `<small>${view.poops.length}</small>` : '') + '</button>' +
        '<button class="tray-item tool" data-tool="cage" title="케이지 편집"><img src="assets/facilities/cm01.png" alt=""><b>케이지</b></button>' +
        '<span class="tray-hint">' + (selectedItem === 'broom' ? '똥부터 치우세요 · 겹친 먹이는 다음 청소에서 치워집니다 · Esc로 취소' : selectedItem === 'meat' ? '사육장 바닥을 터치해 고기를 놓으세요 · Esc로 취소' : selectedItem === 'pill' ? '바닥에 알약(프로틴)을 놓으면 디지몬이 먹고 다음 배틀에서 힘이 세집니다 · 과식 주의' : selectedItem === 'shot' ? '병에 걸린 디지몬을 터치해 주사를 놓으세요 · Esc로 취소' : selectedItem === 'heal' ? '다친 디지몬을 터치해 상처약을 바르세요 · Esc로 취소' : '고기·알약 → 바닥 터치 · 약·상처약 → 디지몬 터치') + '</span>',
    );
    $('#tray').querySelectorAll('button').forEach((button,i)=>{
      if(i>=9)return;
      button.setAttribute('aria-keyshortcuts',String(i+1));
      button.insertAdjacentHTML('afterbegin',`<kbd class="tool-key">${i+1}</kbd>`);
    });
  }
  // 스프라이트 셀 전체에는 공격/점프용 투명 여백이 있다. 실제 그린 프레임의 알파만 한 번 읽어 캐시한다.
  const spriteGeometryCache=new WeakMap(),spriteFrames=new WeakMap();
  function spriteFrameGeometry(a,frame=0){
    if(!a?.image?.complete||!a.image.naturalWidth)return null;
    frame=((Math.floor(frame)%(a.frames||1))+(a.frames||1))%(a.frames||1);
    let cache=spriteGeometryCache.get(a.image);
    if(!cache){cache=new Map();spriteGeometryCache.set(a.image,cache);}
    const key=`${a.width}:${a.height}:${frame}`;
    if(cache.has(key))return cache.get(key);
    try{
      const c=document.createElement('canvas');c.width=a.width;c.height=a.height;
      const g=c.getContext('2d',{willReadFrequently:true});
      g.drawImage(a.image,frame*a.width,0,a.width,a.height,0,0,a.width,a.height);
      const rgba=g.getImageData(0,0,a.width,a.height).data,alpha=new Uint8Array(a.width*a.height);
      let left=a.width,top=a.height,right=0,bottom=0;
      for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++)if(rgba[(y*a.width+x)*4+3]>16){
        alpha[y*a.width+x]=1;left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);
      }
      const box={left,top,right,bottom,width:right-left,height:bottom-top,alpha,empty:right<=left};cache.set(key,box);return box;
    }catch{return null;} // 이미지가 아직 없거나 읽을 수 없으면 표시 중인 대체 그림 크기로 판정한다.
  }
  function spriteVisualBounds(a,pose){
    const box=spriteFrameGeometry(a,pose.frame),x=Math.round(pose.x),y=Math.round(pose.y),scale=pose.scale;
    if(!box){const r=pose.radius??16;return {left:x-r,right:x+r,top:y-2*r,bottom:y,cx:x,cy:y-r,width:2*r,height:2*r};}
    if(box.empty)return {left:x,right:x,top:y,bottom:y,cx:x,cy:y,width:0,height:0};
    const cx=a.cx??a.width/2,base=a.baseline??a.height;
    const left=x+(pose.flip?cx-box.right:box.left-cx)*scale,right=x+(pose.flip?cx-box.left:box.right-cx)*scale;
    const top=y+(box.top-base)*scale,bottom=y+(box.bottom-base)*scale;
    return {left,right,top,bottom,cx:(left+right)/2,cy:(top+bottom)/2,width:right-left,height:bottom-top};
  }
  // 투명 여백·날개 사이를 제외하고, 실제 그리기와 같은 프레임·좌우 반전·좌표 반올림을 사용한다.
  function spriteHit(a,pose,pt,padding=3){
    const box=spriteFrameGeometry(a,pose.frame);
    if(!box){const b=spriteVisualBounds(a,pose),r=b.width/2+padding;return Math.hypot(pt.x-b.cx,pt.y-b.cy)<=r;}
    if(box.empty)return false;
    const x=(pt.x-Math.round(pose.x))/pose.scale*(pose.flip?-1:1)+(a.cx??a.width/2);
    const y=(pt.y-Math.round(pose.y))/pose.scale+(a.baseline??a.height),r=padding/pose.scale;
    if(x<box.left-r||x>=box.right+r||y<box.top-r||y>=box.bottom+r)return false;
    if(box.alpha[Math.floor(y)*a.width+Math.floor(x)]&&x>=0&&x<a.width&&y>=0&&y<a.height)return true;
    for(let yy=Math.max(0,Math.floor(y-r));yy<Math.min(a.height,Math.ceil(y+r));yy++)
      for(let xx=Math.max(0,Math.floor(x-r));xx<Math.min(a.width,Math.ceil(x+r));xx++)
        if(box.alpha[yy*a.width+xx]&&Math.hypot(xx+0.5-x,yy+0.5-y)<=r)return true;
    return false;
  }
  function petSpritePose(p,d){
    const scale=d.isEgg?1.6:2,drawn=spriteFrames.get(p);
    return {x:p.x,y:p.y,scale,flip:p.direction>0,frame:drawn?.speciesId===d.speciesId&&drawn.isEgg===!!d.isEgg?drawn.frame:0,
      radius:(6+C.getSpecies(d.speciesId).stage*3)*scale*0.8};
  }
  const petVisualBounds=(p,d)=>spriteVisualBounds(spriteOf(d.speciesId,d.isEgg),petSpritePose(p,d));
  function petAt(pt) {
    // 앞쪽(나중에 그린) 개체를 먼저 검사하고 투명한 픽셀 사이로 보이는 뒤쪽 개체도 고를 수 있다.
    const order=view.team.map((p,i)=>({p,i})).sort((a,b)=>b.p.y-a.p.y||b.i-a.i);
    for (const {p} of order) {
      const d=digi(p.uid);if(!d)continue;
      const a=spriteOf(d.speciesId,d.isEgg),pose=petSpritePose(p,d);
      if(spriteHit(a,pose,pt)){const bounds=spriteVisualBounds(a,pose);return {p,d,dist:Math.hypot(pt.x-bounds.cx,pt.y-bounds.cy)};}
    }
    return null;
  }
  function wildSpriteHit(w,pt){
    const drawn=spriteFrames.get(w),a=spriteOf(w.id,false);
    return spriteHit(a,{x:w.x,y:w.y,scale:HUNT_SPRITE_SCALE,frame:drawn?.speciesId===w.id?drawn.frame:0,flip:drawn?.flip??w.vx>0,
      radius:(6+C.getSpecies(w.id).stage*3)*0.8*HUNT_SPRITE_SCALE},pt);
  }
  function drawPetNote(im,p){
    const d=digi(p.uid);if(!d||!im.complete||!im.naturalWidth)return;
    const b=petVisualBounds(p,d),box=spriteFrameGeometry({image:im,width:im.naturalWidth,height:im.naturalHeight,frames:1},0);
    if(box?.empty||b.height<=0)return;
    const src=box||{left:0,top:0,width:im.naturalWidth,height:im.naturalHeight};
    const height=Math.max(14,Math.min(28,b.height*0.45)),width=src.width*height/src.height;
    ctx.drawImage(im,src.left,src.top,src.width,src.height,b.cx+Math.min(12,b.width*0.2),b.top-4-height,width,height);
  }
  // ---------- 빗자루: 원작 쓸기 2프레임(18틱씩) → 반짝임 7프레임(9틱씩), common/e001_ikusei ----------
  const SWEEP_FRAME = 18 / 60, SWEEP_LOOPS = 2, SPARKLE_FRAME = 9 / 60;
  const sweeps = [];
  const careImages = Object.fromEntries(['poop_1', 'poop_2', 'broom_1', 'broom_2', ...[1, 2, 3, 4, 5, 6, 7].map((i) => `sparkle_${i}`)].map((k) => [k, Object.assign(new Image(), { src: `assets/ui/${k}.png` })]));
  // 바닥에 오래 둔 고기·프로틴은 상한다. 먹는 중인 먹이를 가리키는 참조가 끊기지 않게 같은 객체를 고친다
  function spoilFoods() {
    if (!view.foods.length) return;
    const r = C.ageFloorFood(save, view.foods);
    save = r.save;
    r.foods.forEach((f, i) => {
      const o = view.foods[i];
      if (f.kind !== o.kind) delete o.remaining, delete o.age, delete o.gift;
      Object.assign(o, f);
    });
    if (r.spoiled) {
      log('바닥에 둔 먹이가 상했습니다. 빗자루로 치우세요. 디지몬이 먹으면 병에 걸립니다. (바닥에 둔 지 이틀)');
      toast('먹이가 상했습니다!');
      renderTray();
    }
  }
  // 고기·상한 고기·프로틴 모두 청소한다. 씹기 예약을 먼저 풀어 중복 섭취를 막는다.
  function foodUnderPoop(food) {
    return view.poops.some(p=>Math.hypot(p.x-food.x,(p.y-14)-(food.y-20))<=40);
  }
  function sweepFoods(pt,protectedFoods=itemPress?.protectedFoods) {
    for (const food of view.foods) {
      if (food.sweeping || Math.hypot(pt.x-food.x,pt.y-(food.y-20))>40) continue;
      // 겹친 똥을 먼저 청소한다. 같은 드래그 도중 똥이 사라져도 먹이를 함께 지우지 않는다.
      if(foodUnderPoop(food)){protectedFoods?.add(food);continue;}
      // 한 입 먹어 새 객체로 바뀐 먹이도 같은 자리에 있으면 이번 드래그의 보호를 이어간다.
      if(protectedFoods&&[...protectedFoods].some(f=>f===food||(f.x===food.x&&f.y===food.y)))continue;
      food.sweeping=true;
      for (const [uid,eating] of feeding) if(eating.food===food) feeding.delete(uid);
      sweeps.push({food,start:performance.now(),done:false});
    }
  }
  function sweepAt(pt,protectedFoods=itemPress?.protectedFoods) {
    const hits=view.poops.filter(x=>Math.hypot(pt.x-x.x,pt.y-(x.y-14))<=40);
    for(const hit of hits)if(!hit.sweeping){hit.sweeping=true;sweeps.push({poop:hit,start:performance.now(),done:false});}
    if(!hits.length)sweepFoods(pt,protectedFoods);
  }
  // 빠른 드래그에서도 포인터 사이 구간의 똥과 먹이를 놓치지 않는다.
  function sweepStroke(from,to,protectedFoods=itemPress?.protectedFoods){const n=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/12));for(let i=0;i<=n;i++)sweepAt({x:from.x+(to.x-from.x)*i/n,y:from.y+(to.y-from.y)*i/n},protectedFoods);}
  function updateSweeps(now) {
    for (const sw of sweeps) {
      if (!sw.done && now - sw.start >= SWEEP_FRAME * 2 * SWEEP_LOOPS * 1000) {
        sw.done = true;
        sw.cleanedAt = now;
        if (sw.food) {
          // 음식 종류가 청소 도중 상해 바뀌어도 현재 종류의 재고를 한 번만 차감한다.
          const res=C.discardFloorFood(save,view.foods,view.foods.indexOf(sw.food));
          if(res.ok){save=res.save;view.foods=res.foods;}
        } else {
          const res = C.cleanOne(save, sw.poop.uid);
          if (res.ok) save = res.save;
          view.poops = view.poops.filter((x) => x !== sw.poop);
        }
        renderTray();
        render();
        persist();
      }
    }
    for (let i = sweeps.length - 1; i >= 0; i--) if (sweeps[i].done && now - sweeps[i].cleanedAt > SPARKLE_FRAME * 7 * 1000) sweeps.splice(i, 1);
  }
  function drawSweeps(now) {
    const put = (key, x, y, ox, oy) => {
      const im = careImages[key];
      if (im.complete && im.naturalWidth) ctx.drawImage(im, x - ox * 2, y - oy * 2, im.naturalWidth * 2, im.naturalHeight * 2);
    };
    for (const sw of sweeps) {
      const { x, y } = sw.food || sw.poop;
      if (!sw.done) put(`broom_${(Math.floor((now - sw.start) / 1000 / SWEEP_FRAME) % 2) + 1}`, x + 10, y, 16, 28);
      else put(`sparkle_${Math.min(7, Math.floor((now - sw.cleanedAt) / 1000 / SPARKLE_FRAME) + 1)}`, x, y, 16, 44);
    }
  }
  // ---------- 치료·강화 연출: 원작 common/e001_ikusei 회복 고리(2번)·회복 빛(4번)·강화 기운(15번) ----------
  const fxImages = {};
  const fxImage = (k) => fxImages[k] || (fxImages[k] = Object.assign(new Image(), { src: `assets/ui/${k}.png` }));
  const careFx = [];
  const TOOL_TIME = 0, HEAL_SEQ = [1, 2, 3, 0, 4, 5, 6, 0];
  function startCareFx(kind, pet, success) {
    careFx.push({ kind, pet, success, start: performance.now() });
  }
  function drawCareFx(now) {
    const put = (key, x, y, ox, oy) => {
      const im = fxImage(key);
      if (im.complete && im.naturalWidth) ctx.drawImage(im, x - ox * 2, y - oy * 2, im.naturalWidth * 2, im.naturalHeight * 2);
    };
    for (let i = careFx.length - 1; i >= 0; i--) {
      const fx = careFx[i], t = (now - fx.start) / 1000, { x, y } = fx.pet;
      if (fx.kind === 'aura') {
        // 강화 기운: 3틱씩 10프레임, 네 번 반복
        if (t > 2) careFx.splice(i, 1);
        else put(`fx_aura_${(Math.floor(t / 0.05) % 10) + 1}`, x, y + 6, 20, 67);
        continue;
      }
      if (fx.kind === 'pet') {
        // 쓰다듬기: 원작의 빨간 음표 4프레임 (common/e001_ikusei 144~147번)
        if (t > 0.9) careFx.splice(i, 1);
        else {
          const im = fxImage(`note_${Math.min(4, Math.floor(t / 0.225) + 1)}`);
          drawPetNote(im,fx.pet);
        }
        continue;
      }
      const u = t - TOOL_TIME;
      if (!fx.success || u > 1.6) {
        if (!fx.success && u < 0.8) {
          ctx.font = 'bold 18px sans-serif';
          ctx.fillStyle = '#ffe36a';
          ctx.textAlign = 'center';
          ctx.fillText('…', x, y - 80);
        } else careFx.splice(i, 1);
        continue;
      }
      // 회복 고리 10틱씩 6프레임 + 회복 빛 6틱씩 8프레임 두 번
      if (u < 1) put(`fx_ring_${Math.floor(u / (10 / 60)) + 1}`, x, y + 4, 15, 29);
      put(`fx_heal_${HEAL_SEQ[Math.floor(u / 0.1) % 8]}`, x, y, 16, 43);
    }
  }
  function dropItem(kind, pt) {
    if (farmInputBlocked()) return;
    if (kind === 'broom') return sweepAt(pt);
    const hit = petAt(pt);
    if (kind === 'shot' || kind === 'heal') {
      if (!hit) return toast(kind === 'shot' ? '주사를 놓을 디지몬을 터치하세요.' : '상처약을 바를 디지몬을 터치하세요.');
      view.selected = view.team.indexOf(hit.p);
      const res = kind === 'shot' ? C.cure(save, hit.d.uid, Math.random) : C.treat(save, hit.d.uid, Math.random);
      if (res.ok && typeof startCareFx === 'function') startCareFx(kind, hit.p, kind === 'shot' ? !res.save.digimon.find((x) => x.uid === hit.d.uid)?.sick : !res.save.digimon.find((x) => x.uid === hit.d.uid)?.injured);
      apply(res);
      renderTray();
      return;
    }
    const it = ITEMS.find((x) => x.kind === kind);
    if (!it || it.count() <= 0) return toast('사용 가능한 아이템이 없어요. 상점에서 사세요.');
    const r = board.roam;
    const item={ kind, x: Math.min(r.x1, Math.max(r.x0, pt.x)), y: Math.min(r.y1, Math.max(r.y0, pt.y)) };
    board.attachFloorItem(item);view.foods.push(item);
    renderTray();
    persist();
  }
  // 아이템 터치 배치. 같은 포인터의 누르기/떼기를 한 번만 처리하고 케이지 입력은 막는다.
  let itemPress = null;
  let canceledPress = null;
  let swallowUp = false;
  function farmInputBlocked() {
    return titleOpen || !!battle || !!hunt || board.editing || mailOpen || dayEnding || $('#modal').open || document.hidden || !!window.evolutionScene?.busy;
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
      if (e.target.closest?.('[data-tool]')?.dataset?.tool === 'cage' && !farmInputBlocked()) {
        const b = document.querySelector('#edit-cages');
        if (b) b.click();
        return;
      }
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
        itemPress = { id: e.pointerId, kind: selectedItem, last: farmPoint(e),protectedFoods:selectedItem==='broom'?new Set(view.foods.filter(foodUnderPoop)):null };
        if(selectedItem==='broom'&&itemPress.last)sweepAt(itemPress.last);
        canceledPress = null;
        canvas.setPointerCapture?.(e.pointerId);
        return;
      }
      // 똥은 빗자루 도구로만 치운다 (형규 요청)
    }, true);
    canvas.addEventListener('pointermove',e=>{
      if(itemPress?.kind!=='broom'||itemPress.id!==e.pointerId)return;
      e.stopImmediatePropagation();e.preventDefault();
      if(farmInputBlocked())return;
      const pt=farmPoint(e);if(pt&&itemPress.last)sweepStroke(itemPress.last,pt);if(pt)itemPress.last=pt;
    },true);
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
        const kind = itemPress.kind, last = itemPress.last,protectedFoods=itemPress.protectedFoods;
        itemPress = null;
        const pt = farmPoint(e);
        if (pt && !farmInputBlocked()) {if(kind==='broom'&&last)sweepStroke(last,pt,protectedFoods);else dropItem(kind, pt);}
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
      // 입력 중·모달·사냥에서는 사육장 숫자 도구 단축키를 사용하지 않는다.
      if(/^[1-9]$/.test(e.key)&&!e.ctrlKey&&!e.altKey&&!e.metaKey&&!e.repeat
        &&!e.target?.closest?.('input,textarea,select,[contenteditable="true"]')
        &&!farmInputBlocked()){
        const button=$('#tray').querySelectorAll('button')[Number(e.key)-1];
        if(button&&!button.disabled){e.preventDefault();button.click();}
        return;
      }

      if (e.key === 'Escape' && selectedItem) { e.preventDefault(); clearItemTool(); }
    });
    $('#mail').onclick = nextMail;
  }
  // 먹는 동안의 예약은 화면에서만 유지한다. 저장 후 재접속하면 바닥 먹이는 남고 다시 접근한다.
  const feeding = new Map();
  const animationId = (d) => SPRITE_BY_NAME[d.isEgg ? eggName(d) : C.getSpecies(d.speciesId).id];
  /** 부화 연출 중인 디지몬: uid → 지난 초 */
  const hatching = new Map();
  const HATCH = { id: 'e000_digitama', state: 'seq_1' };
  // 먹이 중앙을 밟지 않고 몸 크기에 맞춘 좌/우 식사 자리 중 도달 가능한 쪽을 고른다.
  function foodSide(p,d,f,preferred){
    const body=window.SPRITES.find(x=>x.id===animationId(d))?.body??24,gap=Math.max(26,body+12);
    if(!board.canMove(p,f))return null;
    const occupied=new Set([...feeding].filter(([uid,e])=>uid!==d.uid&&e.food===f).map(([,e])=>e.side));
    return [-1,1].filter(side=>!occupied.has(side)).map(side=>({x:f.x+side*gap,y:f.y,side}))
      .filter(spot=>board.canMove(p,spot)).sort((a,b)=>(a.side===preferred?-100000:0)+Math.hypot(a.x-p.x,a.y-p.y)-(b.side===preferred?-100000:0)-Math.hypot(b.x-p.x,b.y-p.y))[0]||null;
  }
  function approachFood(p,f,spot,dt){
    const dist=Math.hypot(spot.x-p.x,spot.y-p.y),step=Math.min(dist,34*Math.max(0,dt));
    if(dist>0.01)board.movePet(p,{x:p.x+(spot.x-p.x)*step/dist,y:p.y+(spot.y-p.y)*step/dist});
    p.target=p.x;p.direction=(Math.hypot(spot.x-p.x,spot.y-p.y)<1?f.x-p.x:spot.x-p.x)>=0?1:-1;
    return Math.hypot(spot.x-p.x,spot.y-p.y)<1;
  }
  // 배고픈 디지몬은 접근 → 정지 → 씹기 → 소비 순서로 행동한다.
  function seekFood(p, d, dt) {
    // 잠들면 씹기 예약만 풀고, 바닥의 먹이와 재고는 그대로 둔다.
    if (C.isSleeping(d)) { feeding.delete(d.uid); return true; }
    const eating = feeding.get(d.uid);
    if (eating) {
      if (!view.foods.includes(eating.food) || eating.food.sweeping || d.isEgg || eating.cageId !== p.cageId || eating.species !== d.speciesId) {
        feeding.delete(d.uid);
        return false;
      }
      const spot=foodSide(p,d,eating.food,eating.side);
      if(!spot){feeding.delete(d.uid);return false;}
      eating.side=spot.side;
      // 케이지 회전으로 식사 자리가 옮겨지면 다시 도착한 다음 주기부터 씹는다.
      if(Math.hypot(spot.x-p.x,spot.y-p.y)>=1){approachFood(p,eating.food,spot,dt);eating.elapsed=0;return true;}
      approachFood(p,eating.food,spot,0);
      eating.elapsed += dt;
      // 입 벌림 → 깨물기 한 주기마다 엔진에서 잔량과 포만감을 함께 갱신한다.
      if (eating.elapsed < animations.duration(animationId(d), 'eat')) return true;
      const food=eating.food,foodIndex = view.foods.indexOf(food), oldCount = view.foods.length;
      const r = C.biteFloorFood(save, view.foods, d.uid, foodIndex);
      feeding.delete(d.uid);
      if (r.ok) {
        view.foods = r.foods;
        save = r.save;
        // 한 입마다 엔진이 새 객체를 돌려주므로 반대편 디지몬의 자리/씹기 시간도 함께 이어준다.
        const left = r.foods[foodIndex], eater = save.digimon.find(x => x.uid === d.uid);
        const remains=r.foods.length===oldCount&&left&&left.x===food.x&&left.y===food.y&&left.remaining>0;
        for(const [uid,other] of feeding)if(other.food===food){if(remains)other.food=left;else feeding.delete(uid);}
        if (remains && (eater.hunger < 100 || left.kind === 'pill'))
          feeding.set(d.uid, {food: left, elapsed: 0, species: d.speciesId,cageId:p.cageId,side:eating.side});
        log(`${nameOf(d)}: ${r.message}`);
        effect = eating.food.kind === 'meat' ? null : { text: r.boosted ? '힘이 솟는다!' : eating.food.kind === 'pill' ? '오독오독' : '우웩…', color: r.boosted ? '#9dff8a' : '#ffe4a0', until: performance.now() + 1500, uid: d.uid };
        if (r.boosted && typeof startCareFx === 'function') startCareFx('aura', p, true);
      }
      render();
      persist();
      return true;
    }
    if (!view.foods.length || d.isEgg) return false;
    let best = null;
    for (const f of view.foods) {
      if(f.sweeping)continue; // 청소 중인 먹이는 새 식사 대상으로 고르지 않는다.
      // 고기는 배고플 때만, 알약(프로틴)은 배와 상관없이 먹는다 (하루 5개까지)
      if (f.kind === 'pill' ? (d.protein ?? 0) >= 5 : d.hunger >= 60) continue;
      // 병든 디지몬은 썩은 먹이를 거부한다. 먹지 못하는 먹이 앞에서 계속 멈추지 않는다.
      if (f.kind === 'rotten' && d.sick) continue;
      const spot=foodSide(p,d,f);if(!spot)continue;
      const dist=Math.hypot(spot.x-p.x,spot.y-p.y);
      if(!best||dist<best.dist)best={f,spot,dist};
    }
    if(!best)return false;
    const {f,spot}=best;
    // 접근할 때부터 자리를 예약해 세 번째 개체가 같은 쪽에 겹쳐 들어오지 않게 한다.
    feeding.set(d.uid,{food:f,elapsed:0,species:d.speciesId,cageId:p.cageId,side:spot.side});
    approachFood(p,f,spot,dt);
    return true;
  }
  // 머리 위 상태 말풍선
  function bubbleOf(d) {
    if (d.isEgg) return null;
    if (C.isSleeping(d)) return '💤';
    if (d.sick) return '🤢';
    if (d.injured) return '🩹';
    if ((d.stress ?? 0) >= C.STRESS.show) return 'stress';
    if (d.hunger < 30) return '🍖';
    if (d.poop >= 3) return '💩';
    if (d.fatigue > 80) return '💤';
    if (d.protein) return '💪';
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
    if (action === 'tamer') tamerInfo();
    if (action === 'dex') dexMenu();
    if (action === 'release') releaseMenu();
    if (action === 'hunt') huntMenu();
  }
  function fx(text, color = '#fff') {
    effect = { text, color, until: performance.now() + 1500, uid: current().uid };
  }

  // ---------- 모달 ----------
  // 원작 '테이머 정보'·'달성률' 화면 (tamer_info 그림 위에 값을 얹는다)
  function tamerInfo() {
    const d = C.dateOf(save.clock), rank = C.tamerRank(save);
    const battles = save.digimon.reduce((n, x) => n + (x.battles || 0), 0), wins = save.digimon.reduce((n, x) => n + (x.wins || 0), 0);
    const open = C.huntFields(save).filter((f) => f.minRank <= rank && (!f.needTitle || save.titles.includes(f.needTitle))).length;
    const field = (x, y, w, text, cls = '') => `<span class="info-field ${cls}" style="left:${(x / 256) * 100}%;top:${(y / 192) * 100}%;width:${(w / 256) * 100}%">${esc(String(text))}</span>`;
    const body =
      `<div class="info-screen" style="background-image:url(assets/ui/tamer_info.png)">` +
      field(10, 40, 112, '테이머', 'name') +
      field(134, 52, 112, C.rankName(rank)) +
      field(44, 75, 92, `${save.bits.toLocaleString()} bit`) +
      field(44, 117, 92, `${d.year}년차 ${d.seasonName} ${d.day}일`) +
      field(154, 117, 94, `${C.STAGE_LABEL[C.maxStageForRank(rank)]}까지`) +
      field(44, 157, 92, `${C.usedCapacity(save)} / ${C.capacityOf(save)}G`) +
      field(154, 157, 94, `${C.cageSpaceOf(save)}칸`) +
      `</div><div class="info-screen" style="background-image:url(assets/ui/achievement.png)">` +
      field(118, 23, 100, `${save.titles.length} / ${C.TITLES.length}`) +
      field(118, 47, 100, `${C.dexCount(save)} / ${C.DEX_ORDER.length}`) +
      field(118, 68, 100, `${open} / ${C.FIELDS.length}`) +
      field(118, 111, 100, `${battles}회`) +
      field(118, 132, 100, battles ? `${Math.round((wins / battles) * 100)}%` : '-') +
      `</div>`;
    showModal('테이머 정보', body, 'TAMER INFO');
  }
  // 도감: 원작 도감 순서(arm9 0x020EDE78). 손에 넣거나 진화한 종만 내용이 보인다. 원작 설명 글은 옮기지 않는다
  function dexMenu(selectedNo = null) {
    const oldGrid=$('#modal-body').querySelector('.dex-grid'),scroll=oldGrid?.scrollTop||0;
    showModal('디지몬 도감',window.dexViewHtml(C,save,selectedNo,esc),'DIGIMON DEX');
    const grid=$('#modal-body').querySelector('.dex-grid');if(grid)grid.scrollTop=scroll;
    $('#modal-body').querySelectorAll('[data-dex]').forEach(b=>b.onclick=()=>{dexMenu(+b.dataset.dex);$('#modal-body').querySelector(`[data-dex="${b.dataset.dex}"]`)?.focus({preventScroll:true});});
  }
  function showModal(title, body, kicker = 'TAMER GUIDE', ok = '사육장으로 돌아가기') {
    $('#modal').classList.remove('battle-modal','day-change-modal','title-result-modal');
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

  // 설치된 시설의 현재 계절 결과표를 읽기만 한다. 안내 열기로 훈련/재고/선택 개체를 바꾸지 않는다.
  function trainingMenu(cageId=view.team[view.selected]?.cageId) {
    const cages=view.layout,chosen=cages.find(c=>c.id===cageId)||cages[0];
    if(!chosen)return toast('설치된 케이지가 없습니다.');
    const cage=C.getCage(L.types[chosen.kind].core),date=C.dateOf(save.clock),learner=current(),level=C.cageLevelOf(save,cage.id),preview=C.trainingPreview(cage,date.season,learner?.personality,C.CAGE_LEVEL_FACTOR[level]??1);
    const signed=n=>n>0?`+${n}`:String(n);
    const rows=preview.outcomes.map(row=>`<tr><td>${row.weight}%</td><td>${row.changes.length?row.changes.map(c=>`${esc(c.label)} ${signed(c.min)}${c.min===c.max?'':` ~ ${signed(c.max)}`}`).join('<br>'):'능력치·종족·속성·내성 변화 없음'}</td></tr>`).join('');
    showModal('케이지 훈련 효과',`<label>시설 <select id="training-cage">${cages.map(c=>`<option value="${esc(c.id)}"${c.id===chosen.id?' selected':''}>${esc(L.types[c.kind].name)}</option>`).join('')}</select></label>
      <p>${esc(date.seasonName)} 기준 · 케이지 Lv${level}${level?` (효과 ×${C.CAGE_LEVEL_FACTOR[level]})`:''} · ${preview.source==='original'?'원본 시설 결과표':'웹판 임시 효과'}${learner?.personality==='솔직'?' · 솔직: 증가량1.15배(정수 반올림)':''}</p>
      <table class="training-effects-table"><thead><tr><th>발생 비율</th><th>예상 변화 범위</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="hint">한 번의 훈련에서 위 결과 중 하나가 선택됩니다. 계절과 난수 보정을 포함한 범위이며, 실제 증감은 개체의 상·하한에 따라 줄어들 수 있습니다. 훈련은 배치당 한 번이며, 잠든 동안에는 진행되지 않습니다.</p>
      ${cage.battleUp?`<p>웹판 추가 효과: 배틀 수 +${cage.battleUp}</p>`:''}`,'TRAINING');
    $('#training-cage').onchange=e=>trainingMenu(e.target.value);
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
        feeding.delete(d.uid); // 놓아준 개체의 식사 예약만 해제한다. 먹이 결과/인덱스는 존재하지 않는다.
        log(`${nameOf(d)}을(를) 놓아주었습니다.`);
        view.selected = 0;
        render();
        persist();
      } else toast(r.message);
      closeModal();
    };
  }

  // ---------- 배틀 ----------
  const canFight = (d) => !d.isEgg && !d.sick && !d.injured && !d.dying && C.hpOf(d) > 0;
  function members(format,selection) {
    if(Array.isArray(selection))return selection.slice(0,format).map(uid=>save.digimon.find(d=>d.uid===uid)).filter(Boolean);
    const first = current();
    const rest = save.digimon.filter((d) => d.uid !== first.uid && canFight(d));
    return [first, ...rest].slice(0, format);
  }
  function battleMenu() {
    const date=C.dateOf(save.clock),titles=C.todaysMatches(save),free=C.freeBattleLineup(date.year,date.season,date.day);
    const freeOpen=date.hour>=8&&date.hour<21;
    const first=canFight(current())?current():save.digimon.find(canFight);
    // 선택 순서가 출전 순서다. 1:1은 첫 개체,3:3은 직접 고른 세 개체를 사용한다.
    const roster=first?[first.uid]:[];
    const teamFor=format=>members(format,roster);
    const titleText=m=>{
      const team=teamFor(m.format),problems=C.entryProblems(m,team),limits=C.entryLimits(m);
      if(team.length<m.format)problems.unshift(m.format+'마리를 선택해 주세요');
      const prizeText=m.id==='prelim'?`예선 통과 시 ${C.PRELIM_PRIZE.toLocaleString('ko-KR')}`:m.id==='final'?`우승 시 ${C.CHAMP_PRIZE.toLocaleString('ko-KR')}`:m.prize.toLocaleString('ko-KR');
      const holder=C.titleHolder(m.id),foeText=holder?`홀더 「${holder.name}」 ${holder.members.map(f=>f.nick).join('·')}`:`상대 ${C.STAGE_LABEL[m.stage]}`;
      if(m.fee&&save.bits<m.fee)problems.push('소지금 부족');
      return `${m.format} VS ${m.foes??m.format} · ${foeText} · 참가비 ${(m.fee??0).toLocaleString('ko-KR')} ฿ · 상금 ${prizeText} ฿${limits?' · '+limits:''}${problems.length?' (조건 미충족: '+problems.join(', ')+')':''}`;
    };
    showModal('배틀',
      `<p>출전할 디지몬을 선택하세요. <b>1:1은 첫 번째,3:3은 선택한 세 마리</b>가 나갑니다. 다시 누르면 제외됩니다.</p>
       <div id="battle-roster" class="battle-roster">${save.digimon.map(d=>`<button data-entrant="${d.uid}" aria-pressed="false"${canFight(d)?'':' disabled'}><b><span class="roster-order"></span>${esc(nameOf(d))}</b><small>${d.isEgg?'부화 전':d.dying?'빈사 상태로 출전 불가':d.sick?'병으로 출전 불가':d.injured?'부상으로 출전 불가':esc(C.STAGE_LABEL[C.getSpecies(d.speciesId).stage])+' · '+esc(d.personality)+' · 배틀 '+d.battles+'회'}</small>${d.isEgg?'':`<small>SP: ${C.supportSkills(d.speciesId,d.personality).map(sk=>esc(sk.name)+' ('+sk.tpCost+'TP)').join(' · ')||'없음'}</small>`}</button>`).join('')}</div>
       <p id="battle-roster-count" class="hint" role="status"></p>
       <div id="battle-tactics" class="mode-pick-list" aria-label="작전"></div>
       <p class="hint">작전: 특수공격은 필살기 위주, 지원은 SP를 쓰며 공격, 일반공격은 둘을 균형 있게 씁니다. 디지몬마다 정할 수 있고 다음 배틀에도 기억합니다.</p>
       ${save.challenge?`<h3>도전장</h3><div class="menu-list"><button data-challenge-battle><b>⚔ ${esc(save.challenge.from)} 「${esc(save.challenge.name)}」</b><small>${C.npcTeam(save.challenge.team).members.length}:${C.npcTeam(save.challenge.team).members.length} · ${C.npcTeam(save.challenge.team).members.map(f=>esc(f.nick)).join('·')} · 상금 ${save.challenge.prize.toLocaleString('ko-KR')} ฿</small></button></div>`:''}
       <h3>타이틀 매치</h3><div class="menu-list">${titles.length?titles.map((m,i)=>`<button data-title="${i}"><b>★ ${esc(m.name)}</b><small>${esc(titleText(m))}</small></button>`).join(''):`<p class="hint">오늘은 타이틀 매치가 없습니다. 엔트리 시간은07:00~15:00, 일정: ${esc(C.upcoming(save)[0]||'-')}</p>`}</div>
       <h3>프리 배틀 ${freeOpen?'':'(08:00~21:00)'}</h3><div class="menu-list two">${free.map((f,i)=>`<button data-free="${i}"><b>${esc(f.label)} ${f.format}:${f.format}</b><small>${f.foes.map(x=>esc(C.getSpecies(x.speciesId).name)).join(' · ')} · ${f.prize.toLocaleString('ko-KR')} ฿</small></button>`).join('')}</div>`,
      'BATTLE ENTRY','취소');
    const body=$('#modal-body');
    function updateRoster(){
      // 메뉴를 열어 둔 사이 사육 상태가 바뀌어도 사라지거나 아픈 개체를 출전시키지 않는다.
      for(let i=roster.length-1;i>=0;i--){const d=save.digimon.find(d=>d.uid===roster[i]);if(!d||!canFight(d))roster.splice(i,1);}
      body.querySelectorAll('[data-entrant]').forEach(b=>{
        const d=save.digimon.find(d=>d.uid===+b.dataset.entrant);b.disabled=!d||!canFight(d);
        const order=roster.indexOf(+b.dataset.entrant),selected=order>=0;
        b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
        b.querySelector('.roster-order').textContent=selected?(order+1)+'. ':'';
      });
      body.querySelector('#battle-tactics').innerHTML=roster.map(uid=>{const d=save.digimon.find(x=>x.uid===uid),t=d.tactic??'일반';
        return `<div class="mode-pick"><b>${esc(nameOf(d))}</b> ${['일반','지원','특수'].map(m=>`<button data-tactic="${uid}" data-mode="${m}" class="${m===t?'active':''}">${m}</button>`).join('')}</div>`;}).join('');
      body.querySelectorAll('[data-tactic]').forEach(b=>b.onclick=()=>{const d=save.digimon.find(x=>x.uid===+b.dataset.tactic);if(!d)return;d.tactic=b.dataset.mode;persist();updateRoster();});
      body.querySelector('#battle-roster-count').textContent=`선택 ${roster.length}/3 · ${roster.map(uid=>nameOf(save.digimon.find(d=>d.uid===uid))).join(' → ')||'출전할 디지몬을 골라 주세요'}`;
      body.querySelectorAll('[data-title]').forEach(b=>{
        const m=titles[+b.dataset.title];b.disabled=teamFor(m.format).length<m.format||C.entryProblems(m,teamFor(m.format)).length>0||save.bits<(m.fee??0);b.querySelector('small').textContent=titleText(m);
      });
      body.querySelectorAll('[data-free]').forEach(b=>{const f=free[+b.dataset.free];b.disabled=!freeOpen||teamFor(f.format).length<f.format;});
      body.querySelectorAll('[data-challenge-battle]').forEach(b=>{const n=C.npcTeam(save.challenge.team).members.length;b.disabled=teamFor(n).length<n;});
    }
    body.querySelectorAll('[data-entrant]').forEach(b=>b.onclick=()=>{
      const uid=+b.dataset.entrant,d=save.digimon.find(d=>d.uid===uid);if(!d||!canFight(d))return;
      const index=roster.indexOf(uid);if(index>=0)roster.splice(index,1);
      else if(roster.length<3)roster.push(uid);else return toast('최대3마리까지 선택할 수 있어요.');
      updateRoster();
    });
    body.querySelectorAll('[data-title]').forEach(b=>b.onclick=()=>{
      const m=titles[+b.dataset.title];startBattle({title:m.name,match:m,format:m.format,foes:m.foes,stage:m.stage,scale:m.scale,prize:m.prize},[...roster]);
    });
    body.querySelectorAll('[data-challenge-battle]').forEach(b=>b.onclick=()=>{
      const c=save.challenge,n=C.npcTeam(c.team).members.length;
      startBattle({title:`${c.from}의 도전 「${c.name}」`,format:n,stage:3,scale:1,prize:c.prize,rival:c.team},[...roster]);
    });
    body.querySelectorAll('[data-free]').forEach(b=>b.onclick=()=>{
      const f=free[+b.dataset.free];startBattle({title:`프리 배틀 ${f.label}`,format:f.format,stage:f.stage,scale:1,prize:f.prize,free:f},[...roster]);
    });
    updateRoster();
  }
  function startBattle(setup, selection) {
    const team = members(setup.format,selection);
    if (!team.length || team.some(d=>!canFight(d))) return toast('출전할 수 있는 디지몬이 없어요. (알·병·부상은 출전 불가)');
    if (team.length < setup.format) return toast(`${setup.format}:${setup.format}에는 건강한 디지몬 ${setup.format}마리가 필요해요.`);
    if(new Set(team.map(d=>d.uid)).size!==team.length)return toast('같은 디지몬을 중복 출전시킬 수 없어요.');
    if(setup.match){const problems=C.entryProblems(setup.match,team);if(problems.length)return toast(problems.join(', '));}
    // 원본: 타이틀 참가비는 출전을 정할 때 내고, 모자라면 출전할 수 없다 (overlay9_10 0x2115DE8)
    if(setup.match?.fee){const paid=C.payEntryFee(save,setup.match);if(!paid.ok)return toast('소지금이 부족합니다.');save=paid.save;persist();log(`참가비 ${setup.match.fee.toLocaleString('ko-KR')} ฿ 지불`);}
    // 타이틀 매치는 원본 홀더 팀(NPC 표)과 싸운다. 챔피언십처럼 홀더가 없는 경기만 무작위 상대
    const holderFoes = setup.match ? C.titleHolderFoes(setup.match.id, Math.random) : null;
    const rivalFoes = setup.rival ? C.npcTeamFoes(setup.rival, Math.random) : null;
    // 배틀 신청은 시작하면 소모한다 (원본은 받는 즉시 배틀)
    if (setup.rival) { save = { ...save, challenge: undefined }; delete save.challenge; persist(); }
    const foes = rivalFoes ?? (setup.free ? C.freeBattleFoes(setup.free, Math.random) : holderFoes ?? C.makeEnemies(setup.stage, setup.foes ?? setup.format, setup.scale, Math.random));
    // 맵은 시작 시 한 번 선택한다. 타이틀의 원본 지정값이 있으면 무작위보다 우선한다. 맵 번호는 지형 상성에 쓴다.
    const map=C.battleMapFor(setup.match?.id,Math.random);
    const state = C.createBattle(
      team.map((d) => C.entrantOf(d)),
      foes,
      map?.id ?? 0,
    );
    battleBackdrop.preload(map);
    for(const u of state.units)spriteOf(u.speciesId,false); // 배경과 출전 그림을 함께 미리 읽는다.
    battle = { setup, state, map, statusEffects:window.createBattleStatusEffects?.(), health:window.createHpBars?.(), assetWait:0, presentation:window.createBattlePresentation(), acc: 0, flashes: [], done: false, motion:new Map(), actions:new Map(), effects:window.createBattleEffects() };
    if(holderFoes)log(`${setup.title} 홀더 「${C.titleHolder(setup.match.id).name}」 등장`);
    log(`${setup.title} 출전: ${team.map(nameOf).join(', ')}`);
    showModal(
      setup.title,
      '<div class="battle-layout"><div class="battle-stage"><div class="battle-map-info"><b id="battle-map-name"></b><span id="battle-time"></span></div><canvas id="arena" width="416" height="272" aria-label="배틀 경기장"></canvas></div><div class="battle-side"><div class="battle-health" id="battle-hp"></div><div class="battle-log" id="battle-log" aria-label="전투 기록"></div></div></div>',
      'AUTO BATTLE',
      '결과 확인',
    );
    $('#modal').classList?.add('battle-modal');
    $('#modal-ok').disabled = true;
    $('#close-modal').disabled = true;
    render();
  }
  function battleTick(dt) {
    // 엔진 피해는 한 번만 계산한다. 비행 중 HP/쓰러짐 표시는 이전 상태를 유지하고 도착 때 반영한다.
    function battleHitVisual(b,e,delayed=false) {
      const target=b.state.units.find(u=>u.id===e.to);
      const id=SPRITE_BY_NAME[C.getSpecies(target.speciesId).id];
      const state=e.damage===0?'guard2':Math.random()<0.5?'hurt':'hurtAlt';
      const duration=animations.duration(id,state);
      b.actions.set(e.to,{kind:'hit',left:duration,duration,state});
      const text=e.damage===0?'막음':`-${e.damage}${e.critical?' 크리티컬!':e.special?'!':''}`;
      b.flashes.push({id:e.to,text,until:performance.now()+700,color:e.critical?'#ff9a6a':e.special?'#ffd36a':'#fff'});
      if(e.damage===0)battleLog(`${target.name}: 공격을 막아 냄 (피해 0)`);
      else if(e.critical)battleLog(`크리티컬! ${target.name}에게 ${e.damage}`);
      if(delayed&&!target.alive)battleLog(`${target.name} 쓰러짐!`);
    }
    function tickBattleArt(b,dt) {
      b.effects.tick(dt);
      b.statusEffects?.tick(dt);
      for(const e of b.effects.drain?.()||[])battleHitVisual(b,e,true);
    }
    const b = battle;
    if (!b) return;
    // 그림을 읽는 동안 보이지 않는 전투가 먼저 진행되지 않는다. 실패/지연은 최대4초만 기다린다.
    if(!b.done&&b.map&&(b.assetWait??0)<4&&
      (b.effects.ready===false||b.statusEffects?.ready===false||battleBackdrop.status(b.map)==='loading'||b.state.units.some(u=>{const a=spriteOf(u.speciesId,false);return a&&!a.image.complete;}))){
      b.assetWait=(b.assetWait??0)+dt;drawArena(0);return;
    }
    // 강조 중에는 다음 전투 틱을 보류한다. 이미 발생한 피해/TP는 재계산하지 않는다.
    if(b.presentation?.busy){
      const focus=b.presentation.snapshot(),step=dt;
      b.presentation.tick(step);
      const play=Math.max(0,Math.min(focus.age+step,focus.transition+focus.hold)-Math.max(focus.age,focus.transition));
      if(play){
        tickBattleArt(b,play);
        for(const [id,a] of b.actions){a.left-=play;if(a.left<=0)b.actions.delete(id);}
      }
      drawArena(0);return;
    }
    if(b.effects.busy){
      tickBattleArt(b,dt);
      for(const [id,a] of b.actions){a.left-=dt;if(a.left<=0)b.actions.delete(id);}
      drawArena(dt);
      if(b.state.over&&!b.effects.busy&&!b.health?.busy())finishBattle();
      return;
    }
    if(b.done){
      tickBattleArt(b,dt);
      for(const [id,a] of b.actions){a.left-=dt;if(a.left<=0)b.actions.delete(id);}
      drawArena(dt);return;
    }
    tickBattleArt(b,dt);
    b.acc += dt; // 사용자 요청: 이동·공격·피격·기술 연출 모두 실시간 1배속으로 진행
    while (b.acc >= 0.1 && !b.state.over && !b.presentation?.busy && !b.effects.busy) {
      b.acc -= 0.1;
      const before=new Map(b.state.units.map(u=>[u.id,{...u}]));
      const events=C.stepBattle(b.state, Math.random);
      for(const u of b.state.units){
        const p=before.get(u.id);
        b.motion.set(u.id,{dx:u.x-p.x,dy:u.y-p.y});
      }
      for (const e of events) {
        const caster=b.state.units.find(u=>u.id===e.from);
        const skillState=e.type==='hit'&&e.special?(e.skill?.animation??'attack1'):null;
        const windup=skillState&&caster?(animations.windup?.(SPRITE_BY_NAME[C.getSpecies(caster.speciesId).id],skillState)||0):0;
        const effect=b.effects.add(e,b.state.units,before,caster?battleBackdrop.spriteScale(spriteOf(caster.speciesId,false)):1,windup);
        // 실제 적중 이벤트로 공격/피격을 연결하고 각 종 NANR 유지 시간을 사용한다.
        if(e.type==='hit'){
          const attacker=b.state.units.find(u=>u.id===e.from),target=b.state.units.find(u=>u.id===e.to);
          // 필살기는원본 표+16에서 확인한7~10.기본 공격10은 사용자 지정 정책을 유지한다.
          const attackState=e.special?(e.skill?.animation??'attack1'):'attack4';
          const attackId=SPRITE_BY_NAME[C.getSpecies(attacker.speciesId).id];
          const attackDuration=animations.duration(attackId,attackState);
          b.presentation?.add(e,b.state.units,Math.max(attackDuration,effect?.hold||0));
          animations.face?.(attacker,attackId,target.x-attacker.x);
          // 원본 빔은 0x212073c로 시전자를 잠근다. 빔이 끝날 때까지 공격 자세를 유지한다.
          const holdUntil=effect?.lockActor?effect.hold:0;
          const actionDuration=holdUntil?(animations.castDuration?.(attackId,attackState,holdUntil)||Math.max(attackDuration,holdUntil)):attackDuration;
          if(b.actions.get(e.from)?.kind!=='hit') b.actions.set(e.from,{kind:'attack',left:actionDuration,duration:actionDuration,state:attackState,holdUntil,flip:target.x>attacker.x});
          if(!effect?.lead)battleHitVisual(b,e);
          if(e.special&&e.skill){
            b.flashes.push({id:e.from,text:e.skill.name,until:performance.now()+700,color:'#a9e7ff',skill:true});
            const cost=Number.isFinite(e.skill.tpCost)?` · TP ${e.skill.tpCost}`:'';
            battleLog(`${attacker.name} · ${e.skill.name} → ${target.name} (${e.damage}${cost})`);
          }
        }
        if (e.type === 'status') {
          b.flashes.push({ id: e.id, text: e.status, until: performance.now() + 900, color: '#c79bff' });
          battleLog(`${b.state.units[e.id].name}: ${e.status} 상태`);
        }
        if (e.type === 'statusDamage') b.flashes.push({ id: e.id, text: `-${e.damage} ${e.status}`, until: performance.now() + 700, color: '#a6e36b' });
        if (e.type === 'heal') {
          b.flashes.push({ id: e.to, text: `+${e.amount}`, until: performance.now() + 700, color: '#8ef0a0' });
          if(e.support)battleLog(`${b.state.units[e.from].name} · ${e.support.name} → ${b.state.units[e.to].name} +${e.amount}`);
        }
        if(e.type==='support'){
          b.flashes.push({id:e.from,text:e.skill.name,until:performance.now()+700,color:'#a3efdf',skill:true});
          battleLog(`${b.state.units[e.from].name} · ${e.skill.name} (${e.skill.tpCost}TP)`);

        }
        // 치료도 지원 시전자 동작을 재생한다. 전원 치료의 대상별 이벤트는 같은 틱에 시작한다.
        // 원본 지원 행동0x211a6c0 → 배우12 → NANR35. 부활 배우20 → NANR33.
        const support=e.type==='heal'?e.support:e.type==='support'?e.skill:null;
        if(support){
          const actor=b.state.units.find(u=>u.id===e.from);
          if(actor?.alive&&([28,29].includes(support.id)||b.actions.get(e.from)?.kind!=='hit')){
            const state=[28,29].includes(support.id)?'shout':'shoutFrame2';
            const id=SPRITE_BY_NAME[C.getSpecies(actor.speciesId).id];
            const duration=animations.duration(id,state);
            b.actions.set(e.from,{kind:'attack',left:duration,duration,state});
          }
        }
        if (e.type === 'ko'&&!b.effects.busy) battleLog(`${b.state.units[e.id].name} 쓰러짐!`);
      }
    }
    for(const [id,a] of b.actions){a.left-=dt;if(a.left<=0)b.actions.delete(id);}
    drawArena(dt);
    // 마지막 명중의 HP 감소를 보여 준 뒤 결과로 넘어간다. 대기 중 엔진 틱은 진행하지 않는다.
    if (b.state.over&&!b.effects.busy&&!b.presentation?.busy&&!b.health?.busy()) finishBattle();
  }
  function battleLog(t) {
    const el = $('#battle-log');
    if (!el) return;
    el.insertAdjacentHTML('beforeend', `<p>${esc(t)}</p>`);
    while(el.children.length>40)el.firstElementChild.remove();
    el.scrollTop = el.scrollHeight;
  }
  function finishBattle() {
    if (!battle || battle.done) return; // 같은 결과를 두 번 반영해 배틀 횟수/진화가 중복되지 않게 한다.
    const b = battle;
    b.done = true;
    const won = b.state.winner === 0;
    const ko = new Set(b.state.units.filter((u) => u.team === 0 && !u.alive).map((u) => u.uid));
    const uids = new Set(b.state.units.filter((u) => u.team === 0).map((u) => u.uid));
    const before = C.tamerRank(save);
    // 원본: 배틀에서 남은 HP가 그대로 현재 HP가 된다
    const endHp = new Map(b.state.units.filter((u) => u.team === 0).map((u) => [u.uid, u.alive ? u.hp : 0]));
    save = { ...save, digimon: save.digimon.map((d) => (uids.has(d.uid) ? C.applyBattleResult(d, won, ko.has(d.uid), Math.random, C.dateOf(save.clock).season === C.WINTER, endHp.get(d.uid)) : d)) };
    const m = b.setup.match;
    const firstTitleWin=won && /^m\d+$/.test(m?.id||'') && !save.titles.includes(m.id);
    const wasQualified = save.qualifiedYear;
    // 타이틀은 이겼을 때만, 챔피언십 예선·본선은 진 것도 기록한다
    const bitsBefore = save.bits;
    if (m) save = C.applyMatch(save, m, won);
    else if (won) save = C.addBits(save, b.setup.prize);
    if (won && b.setup.rival) save = C.rivalBeaten(save, b.setup.rival);
    // 원본: 프리 배틀에서 상대 첫 디지몬을 쓰러뜨린 디지몬은 매입 제안 후보가 된다 (overlay9_19 0x2111A0C)
    if (won && b.setup.free) save = C.pickOfferCandidate(save, b.state.units, Math.random);
    // 원본: 챔피언십 본선 마지막 경기를 이기면 사장 배틀 신청 메일 (overlay9_19 0x21120AC)
    save = C.rollBossMail(save);
    const after = C.tamerRank(save);
    // 원본 결과 화면: 레드·브론즈·골드·챔프로 오르면 사장 메일 예약 (overlay9_8 0x2111978)
    save = C.queueMails(save, C.rankUpMails(before, after));
    const why = b.state.reason === 'timeout' ? ' (시간 종료 판정)' : '';
    const gained = save.bits - bitsBefore;
    battleLog(won ? `승리!${why}${gained ? ` 상금 ${gained.toLocaleString('ko-KR')} ฿` : ''}` : `패배…${why}`);
    log(`${b.setup.title} ${won ? '승리' : '패배'}${gained ? ` · ${gained.toLocaleString('ko-KR')} ฿` : ''}`);
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
    } else if (firstTitleWin) log(`타이틀 메달 획득: ${m.name}`);
    if (after > before) {
      const msg = `${C.rankName(after)}(으)로 랭크 업! 최대 용량 ${C.capacityOf(save)}G, 케이지 공간 ${C.cageSpaceOf(save)}칸, ${C.STAGE_LABEL[C.maxStageForRank(after)]}까지 진화 가능`;
      battleLog(msg);
      log(msg);
      toast('랭크 업!');
    }
    for (const d of save.digimon) if (uids.has(d.uid) && d.injured) log(`${nameOf(d)}이(가) 다쳤습니다. 양호실에 넣거나 상처약으로 치료하세요.`);
    // mN corresponds to original item_badge(N+1); prelim/final have no title medal.
    if(won && /^m\d+$/.test(m?.id||'')){
      // 경기장 위에 끼워 넣지 않고 NDS 두 화면을 위아래로 쌓은 별도 결과 화면으로 전환한다.
      $('#modal-body').innerHTML=window.titleMedalHtml(m,esc,{firstWin:firstTitleWin,prize:gained});
      $('#modal').classList?.remove('battle-modal');
      $('#modal').classList?.add('title-result-modal');
      $('#modal-kicker').textContent='TITLE MATCH RESULT';
      $('#modal').scrollTop=0;
    }
    $('#modal-title').textContent = won ? 'WIN!' : 'LOSE';
    $('#modal-ok').disabled = false;
    $('#close-modal').disabled = false;
    // 결과/타이틀에 따른 횟수·랭크를 먼저 반영하고 즉시 진화한다. 연출은 결과창을 닫은 뒤 재생한다.
    const evolution = C.evaluateEvolutions(save, Math.random);
    save = evolution.save;
    evolution.events.forEach(logEvent);
    render();
    persist();
  }
  function drawArena(dt = 0) {
    const el = $('#arena');
    if (!el || !battle) return;
    if(battle.done && $('#modal').classList?.contains('title-result-modal'))return;
    const ctx = el.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    window.HDText?.begin(ctx);
    const s = battle.state;
    const units=s.units.map(u=>battle.effects.visualUnit?.(u)||u);
    // 동작 플레이어가 개체 객체를 추적하므로 복제하지 않고 표시 HP를 별도 맵에 둔다.
    const shownHp=new Map(units.map(u=>[u.id,battle.health?.sample(u.id,u.hp,u.maxHp)??u.hp]));
    const focus=battle.presentation?.snapshot();
    let camera=null;
    ctx.save();
    if(focus){
      const v=battleBackdrop.viewport;
      const px=v.x+focus.x*v.scale,py=v.y+(focus.y-15)*v.scale;
      // 원작 줌 값을 현재 경기장에 투영. 가장자리 시전자도 확대 중 화면 안에 유지한다.
      const pan=focus.progress;
      const tx=Math.max(el.width*(1-focus.zoom),Math.min(0,(el.width/2-px)*pan+px*(1-focus.zoom)));
      const ty=Math.max(el.height*(1-focus.zoom),Math.min(0,(el.height/2-py)*pan+py*(1-focus.zoom)));
      camera={tx,ty,zoom:focus.zoom};
      ctx.translate(tx,ty);ctx.scale(focus.zoom,focus.zoom);
    }
    const backgroundReady=battleBackdrop.draw(ctx,battle.map,el.width,el.height);
    if(focus){ctx.fillStyle=`rgba(0,0,0,${focus.dim})`;ctx.fillRect(0,0,el.width,el.height);}
    // 원본 띠는 화면 좌표의 배경층. 줌으로 다시 확대하거나 개체 위에 덮지 않는다.
    ctx.restore();
    battle.presentation?.draw?.(ctx,el.width,el.height);
    ctx.save();
    if(camera){ctx.translate(camera.tx,camera.ty);ctx.scale(camera.zoom,camera.zoom);}
    ctx.save();
    const viewport=battleBackdrop.viewport;
    ctx.translate(viewport.x,viewport.y);ctx.scale(viewport.scale,viewport.scale);
    // 아래쪽 개체를 나중에 그려 뒤쪽 디지몬이 앞쪽을 덮지 않게 한다.
    for (const u of [...units].sort((a,b)=>a.y-b.y||a.id-b.id)) {
      ctx.globalAlpha = !u.alive?0.3:focus&&u.id!==focus.from?1-focus.dim:1;
      const m=battle.done?{dx:0,dy:0}:battle.motion.get(u.id)||{dx:u.team===0?0.001:-0.001,dy:0};
      const spriteId=SPRITE_BY_NAME[C.getSpecies(u.speciesId).id];
      // 원본 반응12의 착지 후 자세(0x2116e38..0x2116e78).
      // 웹판은 원작의 공중 낙하 물리 대신 지속 자세를 바로 표시한다.
      const status=u.status?.until>s.t?u.status.id:0;
      const statusPose=({8:'sleep2',9:'sleep',10:'eyesClosed',12:'sleep2'})[status];
      const pose=animations.movement(u,spriteId,m.dx,m.dy,dt,!u.alive||!!statusPose,statusPose);
      const action=battle.actions.get(u.id);
      // 피격 시 해당 종의 원본 셀을 원본 유지 시간으로 재생한다. 인위적 흔들림/점멸 없음.
      const actionAge=action?Math.max(0,action.duration-action.left):0;
      const actionFrame=action?.holdUntil&&animations.sampleCast?animations.sampleCast(spriteId,action.state,actionAge,action.holdUntil):action?animations.sample(spriteId,action.state,actionAge):pose.frame;
      const frame=!u.alive?animations.sample(spriteId,'ko',0):statusPose?pose.frame:actionFrame;
      const art=spriteOf(u.speciesId,false),scale=battleBackdrop.spriteScale(art);
      ctx.fillStyle='#081c3044';ctx.beginPath();ctx.ellipse(u.x,u.y+14,Math.max(10,(art?.body||24)*scale*.4),5,0,0,Math.PI*2);ctx.fill();
      body(ctx,u.speciesId,false,u.x,u.y+14,scale,frame,action?.flip??pose.flip);
      if(battle.statusEffects){
        const bounds=spriteVisualBounds(art,{x:u.x,y:u.y+14,scale,frame,flip:action?.flip??pose.flip});
        battle.statusEffects.draw(ctx,u,s.t,bounds);
      }
      ctx.globalAlpha = 1;
      if(!u.alive){ctx.font='bold 10px sans-serif';ctx.textAlign='center';ctx.fillStyle='#5c6570';ctx.fillText('전투 불능',u.x,u.y-25);}
      battle.health?.draw(ctx,u.id,u.hp,u.maxHp,u.x-27,u.y+18,54,8,u.team===1);
    }
    battle.effects.draw(ctx,1/viewport.scale);
    const now = performance.now();
    battle.flashes = battle.flashes.filter((f) => f.until > now);
    for (const f of battle.flashes) {
      const u = s.units[f.id];
      ctx.font = f.skill ? 'bold 10px sans-serif' : 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = f.color;
      ctx.strokeStyle = '#203040';
      ctx.lineWidth = 3;
      const y = u.y - 40 - (700 - (f.until - now)) / 25;
      const half=f.skill?Math.min(110,ctx.measureText(f.text).width/2):0;
      const x=f.skill?Math.max(half+5,Math.min(475-half,u.x)):u.x;
      ctx.strokeText(f.text, x, y, f.skill?220:480);
      ctx.fillText(f.text, x, y, f.skill?220:480);
    }
    ctx.restore();
    ctx.restore();
    if(focus){
      ctx.fillStyle='#071a2ddd';ctx.fillRect(0,0,el.width,30);
      ctx.font='bold 14px sans-serif';ctx.textAlign='center';ctx.fillStyle='#fff0b5';
      ctx.fillText(focus.name,el.width/2,21,el.width-20);
    }
    if(!backgroundReady){
      ctx.fillStyle='#e1f5ff';ctx.font='12px sans-serif';ctx.textAlign='center';
      ctx.fillText(battleBackdrop.status(battle.map)==='failed'?'배경을 불러오지 못했습니다.':'경기장을 불러오는 중…',el.width/2,18);
    }
    $('#battle-map-name').textContent=battle.map.name;
    $('#battle-time').textContent=`TIME ${Math.max(0,Math.ceil(C.TIME_LIMIT-s.t))}`;
    const team = (t) => units.filter((u) => u.team === t);
    const hpHtml = [0, 1]
      .map(
        (t) =>
          `<div>${t === 0 ? '내 팀' : '상대'}${team(t)
            .map(
              (u) =>
                `<div class="hp-row"><span>${esc(u.name)}</span>${window.hpBarHtml?.(u.hp,u.maxHp,shownHp.get(u.id),!!t)||'<div class="track"></div>'}<span>${Math.max(0, Math.round(u.hp))}</span></div>`,
            )
            .join('')}</div>`,
      )
      .join('');
    if(battle.hpHtml!==hpHtml){$('#battle-hp').innerHTML=hpHtml;battle.hpHtml=hpHtml;}
    window.HDText?.end(ctx);
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
  // 원본 그림이 아예 없는 종만 종족 색 원과 이름 첫 글자로 표시한다.
  // 그림은 있는데 아직 불러오는 중이면 아무것도 그리지 않는다 (부화·진화 직후 임시 원이 번쩍이지 않게).
  function body(context, speciesId, isEgg, x, y, scale, frame, flip) {
    const key = isEgg ? (typeof isEgg === 'string' ? isEgg : '디지에그') : C.getSpecies(speciesId).id; // 그림은 종 ID로 찾는다
    const name = isEgg ? '디지에그' : C.getSpecies(speciesId).name;
    if (sprite(context, SPRITE_BY_NAME[key], x, y, scale, frame, flip)) return;
    if (SPRITE_BY_NAME[key] && asset(SPRITE_BY_NAME[key])) return;
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
    return asset(SPRITE_BY_NAME[isEgg ? (typeof isEgg === 'string' ? isEgg : '디지에그') : C.getSpecies(speciesId).id]);
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
    farmHealth?.begin();
    window.HDText?.begin(ctx);
    const animDt = !titleOpen && !battle && !hunt && !paused && !mailOpen && !dayEnding && !board.editing && !window.evolutionScene?.busy ? dt : 0;
    // 로스트·놓아주기·새 게임으로 사라진 개체의 먹이 예약을 해제한다.
    for (const uid of feeding.keys()) if (!digi(uid)) feeding.delete(uid);
    ctx.fillStyle = '#163a40';
    ctx.fillRect(0, 0, 960, 560);
    ctx.save();
    ctx.scale(board.zoom, board.zoom);
    ctx.translate(-board.cam.x, -board.cam.y);
    board.advance(animDt);
    board.draw(ctx);
    for (const f of view.foods) drawFood(f);
    for (const pp of view.poops) drawPoop(pp.x, pp.y);
    updateSweeps(performance.now());
    drawSweeps(performance.now());
    const order = view.team.map((p, i) => ({ p, i })).sort((a, b) => a.p.y - b.p.y);
    for (const { p, i } of order) {
      const d = digi(p.uid);
      if (!d) continue;
      const oldX = p.x, oldY = p.y;
      const trainingRun=!!p.cageId&&d.personality==='성급한'&&C.isTraining(d);
      // 잡고 옮기는 동안에는 자율 이동·먹기 예약이 드롭 위치를 덮어쓰지 않는다.
      if (board.isDragging(d.uid)) feeding.delete(d.uid);
      // 빈사: 돌아다니지 못한다 (help #124). 굶주려 빈사가 된 개체만 놓아 준 먹이까지 기어가 먹을 수 있다 (웹판 정책)
      if (d.dying && d.hunger > 0) feeding.delete(d.uid);
      if (animDt > 0 && !board.isDragging(d.uid) && !board.isBouncing(d.uid) && !d.isEgg && !hatching.has(d.uid)) {
        const eating = (!d.dying || d.hunger <= 0) && seekFood(p, d, animDt);
        // 케이지 안에서도 목표를 유지하며 걷는다. 식사/수면/드래그/튕기기가 우선한다.
        if (!eating && !d.dying) board.roamPet(p,animDt,(trainingRun?48:16)*(d.fatigue>80?0.4:1),trainingRun?.15:1);
      }
      const selected = p.uid === view.pickedUid; // 고른 디지몬만 발밑 테두리를 표시
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
      if (animDt > 0) p.motion = Math.hypot(p.x - oldX, p.y - oldY) > 0.01 ? (trainingRun?'run':'walk') : feeding.has(d.uid) ? 'eat' : 'idle';
      const facility=L.types[p.cage];
      const facilityNo=({field:'cm30',gym:'cm34',clinic:'cm16'})[p.cage] || facility?.img?.match(/cm[0-9]+/)?.[0];
      const trainingSequence=window.DIGIMON_ANIMATIONS.training[facilityNo];
      // 훈련은 원작 시설 행동표의 동작으로 표시. 복합 행동의 첫 동작만 연결.
      const state=board.isBouncing(d.uid) ? 'hurtAlt' : d.dying ? (d.hunger<=0&&['walk','eat'].includes(p.motion)?p.motion:'ko') : C.isSleeping(d) ? 'seq_13' : p.cageId&&p.motion==='idle'&&trainingSequence!==undefined&&!d.isEgg&&!d.trainDone
        ? 'seq_'+trainingSequence : p.motion||'idle';
      if (d.isEgg) asset(SPRITE_BY_NAME[C.getSpecies(d.originBaby || d.speciesId).id]); // 부화 전에 미리 불러 둔다
      // 안내 편지/다른 창 때문에 연출이 대기 중이어도 진화 후 모습을 먼저 보여 주지 않는다.
      const evolutionFrom=window.evolutionScene?.appearance(d.uid);
      if (hatching.has(d.uid)) {
        const hatchDt=!titleOpen&&!battle&&!hunt&&!paused&&!mailOpen&&!dayEnding&&!board.editing&&!window.evolutionScene?.snapshot()?dt:0;
        const elapsed = hatching.get(d.uid) + hatchDt;
        hatching.set(d.uid, elapsed);
        const born = asset(SPRITE_BY_NAME[C.getSpecies(evolutionFrom||d.speciesId).id]);
        const hatchId = SPRITE_BY_NAME[eggName(d)] || HATCH.id; // 깨어나는 알도 그 디지몬의 알 그림
        if (elapsed < animations.duration(HATCH.id, HATCH.state) || (born && !born.image.complete)) {
          const hatchFrame = animations.sample(HATCH.id, HATCH.state, elapsed);
          spriteFrames.set(p, { frame: hatchFrame, speciesId: d.speciesId, isEgg: true });
          sprite(ctx, hatchId, p.x, p.y, 1.6, hatchFrame, false);
          continue;
        }
        hatching.delete(d.uid);
      }
      if(evolutionFrom){
        const spriteId=SPRITE_BY_NAME[C.getSpecies(evolutionFrom).id],frame=animations.sample(spriteId,'idle',0);
        spriteFrames.set(p,{frame,speciesId:evolutionFrom,isEgg:false});
        body(ctx,evolutionFrom,false,p.x,p.y,scale,frame,p.direction>0);
        continue;
      }
      const frame = animations.pose(p, animationId(d), state, animDt);
      spriteFrames.set(p,{frame,speciesId:d.speciesId,isEgg:!!d.isEgg});
      body(ctx, d.speciesId, d.isEgg && eggName(d), p.x, p.y, scale, frame, p.direction > 0); // 원본 도트는 왼쪽을 향하므로 오른쪽 이동에서만 반전
      if(!d.isEgg)farmHealth?.draw(ctx,d.uid,C.hpOf(d),d.stats.hp,p.x-32,p.y+12,64,9);
      // 머리 위 상태 말풍선 (배고픔·병·부상·똥·피로)
      const bub = bubbleOf(d);
      // 병·부상·스트레스·배고픔은 원작 말풍선 그림(common/e001_ikusei 30·31·34·36)
      const bubImage = bub && fxImage({ '🤢': 'bubble_sick', '🩹': 'bubble_injured', stress: 'bubble_stress', '🍖': 'bubble_hungry' }[bub] || 'bubble_stress');
      if (bub && (bub === 'stress' || '🤢🩹🍖'.includes(bub)) && bubImage.complete && bubImage.naturalWidth) {
        const top = petVisualBounds(p,d).top - 6;
        ctx.drawImage(bubImage, p.x + 2, top - 26, 40, 40);
      } else if (bub && bub !== 'stress') {
        const top = petVisualBounds(p,d).top - 6;
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
      // 육성 화면의 발밑 이름은 숨긴다. 이름/상태는 선택 시 오른쪽 정보창에서 확인한다.
      ctx.textAlign = 'center';
      if (selected) {
        ctx.fillStyle = '#fff3c2';
        ctx.beginPath();
        const top=petVisualBounds(p,d).top;
        ctx.moveTo(p.x, top - 8);
        ctx.lineTo(p.x - 5, top - 16);
        ctx.lineTo(p.x + 5, top - 16);
        ctx.fill();
      }
      const training = trainingFloats.get(p.uid);
      if(training){
        training.elapsed += animDt;
        if(training.elapsed>=3)trainingFloats.delete(p.uid);
        else{
          ctx.save();ctx.textAlign='center';ctx.font='bold 15px sans-serif';
          ctx.globalAlpha=Math.min(1,(3-training.elapsed)*2);
          training.lines.forEach((line,i)=>{
            const y=petVisualBounds(p,d).top-22-(training.lines.length-1-i)*19-training.elapsed*12;
            ctx.lineWidth=3;ctx.strokeStyle='#153b35';ctx.strokeText(line,p.x,y);
            ctx.fillStyle=line.includes('-')?'#ffbe9d':'#a5ffae';ctx.fillText(line,p.x,y);
          });ctx.restore();
        }
      }
      if (effect && effect.uid === p.uid && performance.now() < effect.until) {
        ctx.font = 'bold 17px sans-serif';
        ctx.fillStyle = effect.color;
        ctx.fillText(effect.text, p.x, petVisualBounds(p,d).top - 18 - (1500 - (effect.until - performance.now())) / 80);
      }
    }
    drawCareFx(performance.now());
    ctx.restore();
    // 사육장에는 미니맵을 표시하지 않는다.
    if (paused) {
      ctx.fillStyle = '#00000066';
      ctx.fillRect(0, 0, 960, 560);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('일시 정지', 480, 280);
    }
    if(farmHealth){
      const partner=current(),hp=partner.isEgg?0:C.hpOf(partner),maxHp=partner.isEgg?0:partner.stats.hp;
      window.updateHpBar?.($('#vitals .original-hp'),hp,maxHp,farmHealth.sample(partner.uid,hp,maxHp));
      farmHealth.end();
    }
    window.HDText?.end(ctx);
  }
  // 오른쪽 아래 작은 지도: 사육장 전체와 지금 보는 범위
  function drawMinimap() {
    const W = board.world.w, H = board.world.h, k = 150 / W, w = 150, h = H * k, x0 = 960 - w - 12, y0 = 12; // 아래쪽은 도구 줄이 차지하므로 오른쪽 위
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
      ctx.fillStyle = p.uid === view.pickedUid ? '#ffe36e' : '#9fe6ff';
      ctx.fillRect(x0 + p.x * k - 2, y0 + p.y * k - 2, 4, 4);
    }
    ctx.strokeStyle = '#ffffffcc';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + board.cam.x * k, y0 + board.cam.y * k, 960 / board.zoom * k, 560 / board.zoom * k);
  }
  const portraitActor = {};
  function drawPortrait(dt) {
    const d = current();
    portrait.clearRect(0, 0, 240, 150);
    const evolutionFrom=window.evolutionScene?.appearance(d.uid);
    if(evolutionFrom){
      const a=spriteOf(evolutionFrom,false),scale=a?Math.min(2.4,100/a.baseline,200/a.body):2.4;
      body(portrait,evolutionFrom,false,120,120,scale,0,false);return;
    }
    // 큰 디지몬도 액자(240x150) 안에 들어오도록 배율을 줄인다
    const a = spriteOf(d.speciesId, d.isEgg);
    const scale = a ? Math.min(2.4, 100 / a.baseline, 200 / a.body) : 2.4;
    const rx = footprint(d.speciesId, d.isEgg, scale);
    portrait.fillStyle = '#b5c99955';
    portrait.beginPath();
    portrait.ellipse(120, 119, rx, Math.max(5, rx * 0.28), 0, 0, 7);
    portrait.fill();
    // 빈사/식사 회복 중 자세는 사육장과 일치시킨다. 정상 초상화는 기존 대기/수면 유지.
    const pet=view.team.find(p=>p.uid===d.uid);
    const state=d.dying?(d.hunger<=0&&['walk','eat'].includes(pet?.motion)?pet.motion:'ko'):C.isSleeping(d)?'seq_13':'idle';
    const frame = animations.pose(portraitActor, animationId(d), state, dt);
    body(portrait, d.speciesId, d.isEgg && eggName(d), 120, 120, scale, frame, false);
  }


  // ---------- 사냥 ----------
  // 규칙(출현표, HP, 로프 단계, 시간 제한)은 core의 hunt.ts. 여기서는 움직임·입력·그리기만 한다.
  // 로프 모드 (원작: 둘러싸고 → 당긴다)
  //  1) 드래그로 디지몬을 둘러싸 고리를 닫으면 로프가 감긴다. 로프 끝은 고리를 다 그린 곳에 남는다.
  //  2) 감긴 디지몬은 로프 끝 반대쪽으로 도망친다. 디지몬을 누른 채 끌면 로프 끝이 따라온다.
  //     거리(원본 overlay9_0 0x9C28): 40px 안은 로프 게이지 회복, 그 밖은 게이지가 줄고 체력이 깎인다.
  //     80px 넘으면 디지몬이 끌려오고 체력이 2배로 깎인다. 내구력으로 정한 거리를 넘거나 게이지가 다 닳으면 끊긴다.
  //  3) 체력이 0이면 그 자리에서 기절 → 눌러서 포획.
  // 와이어 모드: 드래그한 선분에 와이어를 깔아 길을 막는다 (와이어 1개 소모).
  // 사냥은 원본 지도(1024×1024) 전체를 무대로 쓴다. AREA는 지도 좌표의 활동 범위, 화면은 카메라로 움직인다.
  const AREA = { x0: 40, y0: 70, x1: 920, y1: 530 };
  /** 사냥 화면 배율. 원작처럼 지도 1배·디지몬 1배 비율을 유지하고 화면 전체를 이만큼 키워 보여 준다 (휠로 조절) */
  const HUNT_ZOOM = { start: 1.5, min: 1, max: 3 };
  /** 사냥터 디지몬 그림 배율 (지도 픽셀 기준). 원작처럼 지도와 같은 1배 */
  const HUNT_SPRITE_SCALE = 1;
  const FIELD_LOOK = {
    '다이나 초원': ['#7fb069', '#6a9a57'], '미끌미끌 늪': ['#6f8f6a', '#4f6d55'], '모쥬라의 숲': ['#4f7f4a', '#3b6438'],
    하수도: ['#6d7378', '#545a5e'], '이글이글 사막': ['#d9b46a', '#c49a52'], 대초원: ['#9cc46e', '#86ad5c'],
    용암지대: ['#8a4e3a', '#6e3a2b'], '부츠 정글': ['#3f7a4d', '#2f5f3b'], '눈의 왕국': ['#e4eef2', '#c7d8df'], '잉카 유적': ['#b8a27a', '#9a855f'],
  };
  // 원본 사냥 지도(tools/extract_hunt_maps.py로 변환한 root/field/field_hmNN). 사냥터와 번호의 짝은
  // 형규가 원작 기준으로 확인(2026-11-12, docs/design.md). _01=낮, _02=밤. 실내(크롬 광산·기계 공장·하수도)는 밤 지도가 없다.
  const HUNT_MAP = C.HUNT_MAP; // 배경과 충돌 지형의 사냥터 번호를 공유한다.
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
  /** 로프 끝에서 디지몬 몸 가운데까지 잴 때 발밑에서 올리는 높이 */
  const ROPE_BODY_Y = 15;
  /** 로프에 묶인 디지몬이 끌고 도망치는 속도(지도 px/초). 임시 */
  const BOUND_RUN_SPEED = 38;
  /** 기절에서 깨어나 회복하는 동안의 달아나는 속도 (임시): 10~40% 졸린 걸음, 40~80% 걷기, 80%부터 BOUND_RUN_SPEED로 뜀 */
  const WAKE_DROWSY_SPEED = 10;
  const WAKE_WALK_SPEED = 24;
  const WAKE_RUN_SECONDS = 3;
  /**
   * 로프 색: 디지 파랑·하드 노랑·클론 초록·알테마 빨강(형규 지정), α·β·γ로 갈수록 진하게.
   */
  const ROPE_COLORS = {
    digi: ['#9fd3ff', '#5fb0ff', '#2f86e8'],
    hard: ['#f5e6a8', '#f0d277', '#e8bb45'],
    clone: ['#b8f0a8', '#71d965', '#36b43a'],
    ultima: ['#ff9a8a', '#f2503c', '#c41e1e'],
  };
  function ropeColor() {
    const id = save?.rope || 'digi1';
    const family = id.replace(/[0-9]+$/, ''), tier = Math.max(1, Math.min(3, Number(id.match(/[0-9]+$/)?.[0]) || 1));
    return (ROPE_COLORS[family] || ROPE_COLORS.digi)[tier - 1];
  }

  function huntMenu() {
    const can = C.canHuntNow(save);
    const date = C.dateOf(save.clock);
    const fields = C.huntFields(save);
    showModal(
      '사냥',
      `<p>${esc(date.seasonName)} ${date.day}일 ${pad(date.hour)}:${pad(date.minute - date.minute % 10)} · ${C.ropeOf(save.rope).name} · 와이어 ${save.wires}개 · 메모리카드 ${save.memoryCard}G · 용량 ${C.usedCapacity(save)}/${C.capacityOf(save)}G</p>
       ${can.ok ? '' : `<p class="warn">${esc(can.reason)}</p>`}
       <div class="menu-list">${fields
         .map((f, i) => {
           const pool = C.huntPool(f, save.clock);
           const off = !f.open || !can.ok || save.bits < f.fee;
           const why = !f.open ? f.reason : save.bits < f.fee ? '비트 부족' : '';
           return `<button data-field="${i}"${off ? ' disabled' : ''}><b>${esc(f.id)}${f.fee ? ` · ${f.fee} ฿` : ''}</b><small>${why ? esc(why) + ' · ' : ''}이번 계절: ${esc(pool.babies.join(', ') || '없음')}${pool.rookies.length ? ` / 성장기 ${esc(pool.rookies.join(', '))}` : ''}${pool.strong.length ? ` / 성숙기 이상 ${esc(pool.strong.join(', '))}` : ''}</small></button>`;
         })
         .join('')}</div>
       ${huntItemsHtml()}
       ${loadoutHtml()}
       <p class="hint">드래그로 디지몬을 둘러싸고 처음 위치 근처에서 손을 떼면 로프가 감깁니다. 감긴 디지몬을 누른 채 끌어 로프를 팽팽하게 유지하세요. 가까우면 로프 게이지가 회복되고, 멀어지면 체력이 줄지만 너무 멀거나 게이지가 다 닳으면 끊어집니다. 체력이 0이 되어 기절하면 눌러서 포획하세요. 성장기 이상은 해당 세대를 잡을 수 있는 로프가 필요합니다. 휠로 확대·축소하고, 이동 도구·오른쪽 드래그·방향키로 화면을 움직일 수 있습니다.</p>`,
      'HUNT',
      '취소',
    );
    $('#modal-body').querySelectorAll('[data-field]').forEach((b) => (b.onclick = () => startHunt(fields[+b.dataset.field])));
    $('#modal-body').querySelectorAll('[data-plugin]').forEach((b) => (b.onclick = () => { save = C.togglePlugin(save, b.dataset.plugin); persist(); huntMenu(); }));
    $('#modal-body').querySelectorAll('[data-hunt-item]').forEach((b) => (b.onclick = () => {
      const scroll=$('#modal').scrollTop,id=b.dataset.huntItem;
      save=C.toggleHuntItem(save,id);persist();huntMenu();
      $('#modal-body').querySelector(`[data-hunt-item="${id}"]`)?.focus({preventScroll:true});
      $('#modal').scrollTop=scroll;
    }));
  }
  // 원본 아이콘을 사용한 준비 화면. 5칸/보유 수량 판정은 기존 엔진을 그대로 호출한다.
  function huntItemsHtml() {
    return window.huntItemLoadoutHtml(C,save,esc);
  }
  // 원작처럼 사냥 전에 플러그인을 장비한다. 칸 수는 랭크에 따라 2·3·4칸 (원본 랭크 표 +20)
  function loadoutHtml() {
    return window.pluginLoadoutHtml(C,save,esc);
  }

  // 화면의 잘라낸 좌표를 ATR의 원본 지도 좌표로 바꾼다. 사육장 카메라/줌은 쓰지 않는다.
  function huntMapPoint(p){return {x:p.x+hunt.view.x,y:p.y+hunt.view.y};}
  // ---- 사냥 카메라: 지도 좌표 ↔ 화면(960×560) ----
  function huntClampCam(){
    if(!hunt?.cam)return;
    const vw=960/hunt.zoom,vh=560/hunt.zoom;
    hunt.cam.x=Math.max(0,Math.min(Math.max(0,hunt.size.w-vw),hunt.cam.x));
    hunt.cam.y=Math.max(0,Math.min(Math.max(0,hunt.size.h-vh),hunt.cam.y));
  }
  function huntCenter(x,y){if(!hunt?.cam)return;hunt.cam.x=x-480/hunt.zoom;hunt.cam.y=y-280/hunt.zoom;huntClampCam();}
  function huntToWorld(s){return hunt?.cam?{x:s.x/hunt.zoom+hunt.cam.x,y:s.y/hunt.zoom+hunt.cam.y}:s;}
  function huntGroundClear(p,radius=4){
    return p.x>=AREA.x0&&p.x<=AREA.x1&&p.y>=AREA.y0&&p.y<=AREA.y1&&C.canStandOnHuntTerrain(hunt.terrain,huntMapPoint(p),radius);
  }
  function huntGroundLine(a,b,radius=4){return C.huntTerrainLineClear(hunt.terrain,huntMapPoint(a),huntMapPoint(b),radius);}
  function huntGroundMove(from,to){
    const result=C.moveOnHuntTerrain(hunt.terrain,huntMapPoint(from),huntMapPoint(to));
    return {...result,x:result.x-hunt.view.x,y:result.y-hunt.view.y,
      path:result.path.map(p=>({x:p.x-hunt.view.x,y:p.y-hunt.view.y}))};
  }
  function spawnWild(field) {
    const id = C.pickWild(field, save.clock, Math.random);
    if (!id) return null;
    const spot=C.pickHuntSpawn(hunt.spawnPoints,Math.random);if(!spot)return null;
    const side = Math.random();
    return {
      id, x:spot.x-hunt.view.x, y:spot.y-hunt.view.y,
      vx: (side < 0.5 ? -1 : 1) * (15 + Math.random() * 20), vy: (Math.random() - 0.5) * 30,
      hp: C.wildHp(id), max: C.wildHp(id), personality: C.newDigimon(0, id, Math.random, true).personality, flee: 0, flash: 0, turn: 1 + Math.random() * 3,
      // 원본 생성 함수: 배 = ⌊크기 ÷ 5⌋ × 4, 졸음 0
      belly: C.wildBellyStart(id), sleepy: 0, hungerTick: C.WILD_HUNGER_TICK,
    };
  }
  function startHunt(field) {
    if (!field.open) return;
    if (save.bits < field.fee) return toast('비트가 부족해요.');
    const terrain=C.huntTerrain(field.id);if(!terrain)return toast('사냥터 지형을 찾을 수 없습니다.');
    // 지도 전체를 쓴다 (예전에는 화면 크기만큼 잘라 썼다). 지도 좌표 = 사냥 좌표
    const W=terrain.width*terrain.tileSize,H=terrain.height*terrain.tileSize;
    const viewport={x:0,y:0};
    Object.assign(AREA,{x0:24,y0:24,x1:W-24,y1:H-24});
    const spawnPoints=C.huntSpawnPoints(terrain,{x0:AREA.x0+24,y0:AREA.y0+24,x1:AREA.x1-24,y1:AREA.y1-24});
    if(!spawnPoints.length)return toast('이 구역에 출현 가능한 바닥이 없습니다. 다시 선택해 주세요.');
    save = { ...save, bits: save.bits - field.fee };
    hunt = { field,terrain,view:viewport,spawnPoints,health:window.createHpBars?.(), pluginHud:window.createHuntPluginHud?.(), plug: C.pluginView(save), items: C.huntItems(save), wilds: [], wires: [], baits: [], traps: [], fx: [], trail: [], drawing: false, tool: 'rope', respawn: 0, notes: [], carried: 0,
      size:{w:W,h:H}, zoom:HUNT_ZOOM.start, cam:{x:0,y:0}, pan:null };
    // 첫 화면은 출현 가능한 바닥 아무 곳을 가운데에 둔다
    const first=C.pickHuntSpawn(spawnPoints,Math.random)||{x:W/2,y:H/2};
    huntCenter(first.x,first.y);
    window.resetHuntItemHud($('#hunt-item-hud'));
    hunt.map = huntMapImage(field);
    for (let i = 0; i < C.HUNT_WILD_COUNT; i++) {
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
    window.resetHuntItemHud($('#hunt-item-hud'));
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
    if (hunt) {
      // 도구를 바꾸기 전 그리던 선은 취소한다. 다음 손 떼기로 와이어가 설치되면 안 된다.
      if (hunt.tool !== tool) { hunt.drawing = false; hunt.trail = []; hunt.pull = null; hunt.pan = null; hunt.lastScreen = null; }
      hunt.tool = tool;
    }
    $('#tool-rope').classList.toggle('active', tool === 'rope');
    $('#tool-wire').classList.toggle('active', tool === 'wire');
    $('#tool-move').classList.toggle('active', tool === 'move');
    $('#tool-gear').classList.toggle('active', tool === 'gear');
    refreshGear();
  }
  // 사냥 장비(샷·고기) 선택값은 내부 select와 원본 아이콘 HUD가 공유한다
  const GEAR = [...C.SHOTS, ...C.BAITS, ...C.GEARS];
  // 장비 목록에서 고른 것이 와이어 종류면 그 장비 (끌어서 설치한다)
  const wireGear = () => (hunt && hunt.tool === 'gear' ? [C.gearOf($('#gear-select').value)].find((x) => x && x.kind === 'wire') : null);
  const wireMode = () => hunt.tool === 'wire' || !!wireGear();
  const huntIsNight = () => C.dateOf(save.clock).hour >= C.HUNT_NIGHT_HOUR;
  // 미끼·라이트·고기에 끌리는지 디지몬마다 판정한다 (원본 확률). 끌리지 않으면 미끼·라이트는 그 미끼를 무시하고,
  // 고기는 1초마다 다시 판정한다
  const isMeatBait = (b) => !b.kind || b.kind === 'bait';
  // 함정에서 디지몬을 풀어 준다 (함정을 옮기거나 포획했을 때)
  function releaseTrap(t) {
    const w = t.heldWild;
    if (w && w.trapped === t) { w.trapped = null; w.stun = 0; w.stunKind = ''; }
    t.heldWild = null; t.held = 0;
  }
  function lureTakes(w, b, dt) {
    if (!b.uid) b.uid = hunt.lureSeq = (hunt.lureSeq || 0) + 1;
    const memo = (w.lureMemo ??= {});
    const m = memo[b.uid];
    // 고기는 배가 차면(종 크기 이상) 그만 먹고 떠난다
    if (m === true) return !(isMeatBait(b) && (w.belly ?? 0) >= C.wildBellyMax(w.id));
    const isMeat = isMeatBait(b);
    if (typeof m === 'number' && (memo[b.uid] = m - dt) > 0) return false;
    const ok = C.attracted(w.id, b.gearId || (b.big ? 'bait2' : 'bait1'), Math.random, C.wildHungry(w.id, w.belly ?? 0));
    // 원본: 고기는 1초(61프레임), 미끼는 부를 때(55~64프레임), 라이트는 25~34프레임마다 다시 판정한다
    memo[b.uid] = ok ? true : isMeat ? 1 : b.kind === 'toy' ? C.decoyPulse() : C.lightPulse();
    return ok;
  }
  // 효과(수면·마비·눈가리기·독)를 디지몬에게 건다. 걸리는지는 그 종의 아이템 내성 등급(원본)으로 정한다
  function applyEffect(w, effect) {
    if (!effect || !C.effectLands(w.id, effect)) return false;
    if (effect === '독') { w.poisonWait = C.POISON_DELAY; w.poisonLeft = 0; return true; }
    // 수면: 바로 재우지 않고 졸음을 최대치의 80%로 맞춘다. 남은 20%가 차면 잠든다 (원본 0x2111DE4)
    if (effect === '수면') { w.sleepy = wildSleepMax(w) * C.SLEEP_DROWSY_RATIO; return true; }
    w.stun = Math.max(w.stun || 0, effect === '눈가리기' ? C.flashSeconds() : C.paralysisSeconds());
    w.scatter = null;
    w.stunKind = effect;
    w.flee = 0;
    return true;
  }
  // 먹기 동작(원본 동작 14번) 한 바퀴 초. 원본은 이 동작이 한 바퀴 돌 때마다 한 입 먹는다(0x2113BB8)
  function eatLoopSeconds(w) { return (w.eatLoop ??= Math.max(0.2, animations.duration(SPRITE_BY_NAME[C.getSpecies(w.id).id], 'eat') || 1)); }
  // 야생 디지몬의 졸음 최대치(초, 원본 종 표 +38 ÷ 10)
  function wildSleepMax(w) { return (w.sleepMax ??= C.wildSleepMax(w.id)); }
  // 자는 동안 무언가에 맞으면 깬다. 졸음은 최대치의 70%까지 내려간다 (원본 0x21138C0 등)
  function wakeFromSleep(w) {
    if (w.stunKind !== '수면') return;
    w.sleepy = Math.min(w.sleepy || 0, wildSleepMax(w) * C.SLEEP_HIT_RATIO);
    w.stun = 0; w.stunKind = '';
  }
  // 아이템 대미지(HP 최대치의 %, 원본). 0이 되면 기절한다
  function itemHit(w, id) {
    const dmg = C.itemDamage(w.id, id, w.max);
    if (!(dmg > 0)) return false;
    w.hp = Math.max(0, w.hp - dmg);
    w.flash = 0.4;
    if (w.hp <= 0 && !w.ko) faint(w);
    return true;
  }
  // 폭발: 범위 안 디지몬에게 대미지와 효과
  function blast(x, y, g) {
    // 원본 입자 풀의 시퀀스·생성 간격을 재생한다. 피해/효과 판정은 아래에서 한 번만 한다.
    hunt.fx.push(huntEquipmentArt.explosion(x,y,g));
    const hits = hunt.wilds.filter((w) => !w.gone && Math.hypot(x - w.x, y - (w.y - 15)) < g.range);
    for (const w of hits) {
      wakeFromSleep(w);
      itemHit(w, g.id);
      if (w.ko) continue;
      applyEffect(w, g.effect);
      if (!g.effect) w.stun = Math.max(w.stun || 0, 1.5);
    }
    huntNote(hits.length ? `${g.name} 폭발! ${hits.length}마리에게 명중${g.effect ? ` · ${g.effect}` : ''}` : `${g.name}이(가) 터졌지만 아무도 없었다.`);
  }
  // 체커 묶음: 샷 / 와이어 / 엔트랩(고기·미끼·라이트·캐치·프리즌) / 대미지 트랩(폭탄·마인). 묶는 방법은 웹판 해석
  function checkKind(x) {
    if (C.shotOf(x.id)) return 'shot';
    if (C.baitOf(x.id)) return 'entrap';
    return x.kind === 'wire' ? 'wire' : x.kind === 'bomb' || x.kind === 'mine' ? 'damage' : 'entrap';
  }
  function refreshGear() {
    const sel=$('#gear-select'),keep=sel.value;
    // 출발할 때 정한 순서와 소진한 칸도 유지한다. 마지막 하나를 썼다고 다음 종류로 바꾸지 않는다.
    const equipped=(hunt?.items??C.huntItems(save)).map(id=>GEAR.find(x=>x.id===id)).filter(Boolean);
    const html=equipped.map(x=>`<option value="${x.id}"${C.gearCount(save,x.id)>0?'':' disabled'}>${esc(x.name)}${hunt?.plug?.check.has(checkKind(x))?` ×${C.gearCount(save,x.id)}`:''}</option>`).join('')||'<option value="">가져온 아이템 없음</option>';
    if(sel.innerHTML!==html)sel.innerHTML=html;
    sel.value=equipped.some(x=>x.id===keep)?keep:(equipped.find(x=>C.gearCount(save,x.id)>0)?.id||'');
    window.renderHuntItemHud($('#hunt-item-hud'),window.huntItemHudHtml(C,save,hunt,sel.value,esc));
  }
  function selectHuntGear(id) {
    if(!hunt||!hunt.items.includes(id)||C.gearCount(save,id)<=0)return false;
    const sel=$('#gear-select');
    if(sel.value!==id){
      // 와이어/로프를 그리는 중 장비를 바꾸면 이전 선이 설치되지 않게 취소한다.
      hunt.drawing=false;hunt.trail=[];hunt.pull=null;hunt.pan=null;hunt.lastScreen=null;
    }
    sel.value=id;setTool('gear');return true;
  }
  // 장비 사용: 샷은 맞은 디지몬을 멈추고, 고기는 기존 엔진 확률대로 근처 개체를 끌어들인다
  function useGearAt(p) {
    const id = $('#gear-select').value, shot = C.shotOf(id), bait = C.baitOf(id), gear = C.gearOf(id);
    if (!shot && !bait && !gear) return huntNote('쓸 장비가 없습니다. 상점에서 사세요.');
    if (!(hunt.items ?? C.huntItems(save)).includes(id)) return huntNote('장비해 오지 않은 아이템입니다.');
    if (gear && gear.nightOnly && !huntIsNight()) return huntNote(`${gear.name}는 밤에만 쓸 수 있습니다.`);
    // 바닥에 놓는 장비는 차단된 칸에 설치하거나 재고를 소비하지 않는다. 샷/투척 폭탄의 범위 판정은 유지한다.
    if((bait||(gear&&gear.kind!=='bomb'))&&!huntGroundClear(p))return huntNote('이곳에는 장비를 놓을 수 없습니다.');
    // 원본: 고기·마인은 동시에 10개까지
    if ((bait || gear?.kind === 'bait') && hunt.baits.filter((b) => b.amount !== undefined).length >= C.MEAT_MAX) return huntNote('고기를 더 놓을 수 없습니다.');
    if (gear?.kind === 'mine' && hunt.traps.filter((t) => t.g.kind === 'mine').length >= C.MINE_MAX) return huntNote('마인을 더 놓을 수 없습니다.');
    const now = performance.now() / 1000;
    if (shot && now < (hunt.shotReady || 0)) return;
    const next = C.useGear(save, id);
    if (!next) return huntNote('남은 수량이 없습니다.');
    save = next;
    refreshGear();
    if (bait) {
      // 원본: 고기는 다 먹힐 때까지 남는다(큰 고기 32, 일반 16)
      hunt.baits.push({ x: p.x, y: p.y, range: bait.range, left: Infinity, big: bait.id === 'bait2', amount: bait.id === 'bait2' ? C.MEAT_AMOUNT.big : C.MEAT_AMOUNT.normal });
      return huntNote(`${bait.name}를 놓았다. 냄새에 디지몬이 모여든다.`);
    }
    if (gear) {
      if (gear.kind === 'bomb') {
        // 원본: 놓고 약 4초 뒤 터진다
        hunt.traps.push({ x: p.x, y: p.y, g: gear, left: 1e9, held: 0, fuse: C.BOMB_FUSE });
        return huntNote(`${gear.name}을(를) 놓았다. 곧 터진다!`);
      }
      if (gear.kind === 'trap') {
        // 원본: 함정은 종류마다 하나. 다시 쓰면 새 자리로 옮기고, 붙잡던 디지몬은 풀린다
        const old = hunt.traps.find((t) => t.g.id === gear.id);
        if (old) { releaseTrap(old); old.left = 0; }
        hunt.traps.push({ x: p.x, y: p.y, g: gear, left: Infinity, held: 0 });
        return huntNote(`${gear.name}을(를) ${old ? '옮겨 ' : ''}설치했다.`);
      }
      if (gear.kind === 'mine') {
        hunt.traps.push({ x: p.x, y: p.y, g: gear, left: Infinity, held: 0 });
        return huntNote(`${gear.name}을(를) 설치했다.`);
      }
      // 특수 고기·미끼 장난감·라이트: 디지몬을 끌어들인다. 원본: 미끼와 라이트는 하나만 놓이고 다시 쓰면 옮긴다
      if (gear.kind === 'toy' || gear.kind === 'light') hunt.baits = hunt.baits.filter((b) => b.kind !== gear.kind);
      hunt.baits.push({ x: p.x, y: p.y, range: gear.range, left: gear.kind === 'bait' ? Infinity : gear.seconds, gearId:gear.id, kind: gear.kind, effect: gear.effect, name: gear.name,
        amount: gear.kind === 'bait' ? C.MEAT_AMOUNT.normal : undefined,
        // 미끼는 3초 서 있다가 보이는 화면 안 아무 곳 쪽으로 걸어간다
        idle: gear.kind === 'toy' ? C.DECOY_IDLE : 0, vx: 0, vy: 0 });
      return huntNote(`${gear.name}을(를) 놓았다.`);
    }
    hunt.shotReady = now + C.shotCooldown(shot);
    hunt.fx.push({ x: p.x, y: p.y, r: shot.spread ? C.SHOT_SPREAD_RADIUS : 14, left: 0.25 });
    // 원본: 산탄은 누른 곳 ±16px 안에 7발이 떨어지고 발마다 따로 맞는다. 보통 샷은 한 발
    const points = shot.spread ? Array.from({ length: C.SHOT_PELLETS }, () => ({ x: p.x + Math.floor(Math.random() * 32) - C.SHOT_JITTER, y: p.y + Math.floor(Math.random() * 32) - C.SHOT_JITTER })) : [p];
    const pellets = [];
    for (const pt of points) {
      const w = hunt.wilds.filter((x) => !x.gone && wildSpriteHit(x, pt)).sort((a, b) => Math.hypot(pt.x - a.x, pt.y - a.y) - Math.hypot(pt.x - b.x, pt.y - b.y))[0];
      if (w) pellets.push(w);
    }
    const hits = [...new Set(pellets)];
    if (!hits.length) return huntNote('빗나갔다!');
    let landed = 0;
    for (const w of pellets) {
      // 원본: 샷은 HP를 깎지 않고 멈추게만 한다. 멈춤은 쌓이며 15초까지. 효과 없는 샷은 풀린 뒤 근처로 달아난다
      wakeFromSleep(w);
      w.stun = Math.min(C.SHOT_STOP_MAX, (w.stun > 0 && !w.stunKind ? w.stun : 0) + C.shotStun(shot, w.id));
      w.stunKind = '';
      w.flee = 0;
      w.scatter = shot.effect ? null : { x: w.x + (Math.random() * 2 - 1) * C.SHOT_SCATTER, y: w.y + (Math.random() * 2 - 1) * C.SHOT_SCATTER };
      if (applyEffect(w, shot.effect)) landed += 1;
      w.flash = 0.4;
    }
    huntNote(`${shot.name} 명중${pellets.length > 1 ? ` ×${pellets.length}` : ''}! ${hits.map((w) => C.getSpecies(w.id).name).join(', ')}${shot.effect ? (landed ? ` ${shot.effect}` : ` (${shot.effect}에 걸리지 않았다)`) : ' 멈춤'}`);
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
      // 이번 틱의 실제 변위. 로프·와이어로 이동하지 못하면 걷기를 재생하지 않는다.
      w.movedX = 0; w.movedY = 0;
      const oldX = w.x, oldY = w.y;
      w.flash = Math.max(0, w.flash - dt);
      if (w.ko) {
        // 기절: 쓰러져 있다. 테이머가 5초 동안 손대지 않으면 천천히 회복하고 80%가 되면 깨어나 달아난다
        w.koTime = (w.koTime || 0) + dt;
        if (w.koTime >= C.FAINT_RECOVER_DELAY) {
          w.hp = C.wildRegen(w.id, w.hp, w.max, dt);
          if (w.hp >= w.max * C.WILD_WAKE_RATIO - 1e-9) {
            // 10%: 비틀거리며 일어나 천천히 달아나기 시작한다
            w.ko = false;
            w.koTime = 0;
            w.waking = true;
            huntNote(`${C.getSpecies(w.id).name}이(가) 비틀거리며 일어났다!`);
          }
        }
        continue;
      }
      if (w.bound > 0) {
        // 로프에 묶이면 로프 끝(테이머가 쥔 곳) 반대쪽으로 끌고 도망친다. 원작 로프 표대로 거리에 따라 게이지·체력이 준다
        const a = w.anchor || { x: w.x, y: w.y - ROPE_BODY_Y + 1 };
        if (!(w.stun > 0)) {
          let dx = w.x - a.x, dy = w.y - ROPE_BODY_Y - a.y;
          let len = Math.hypot(dx, dy);
          if (len < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; len = Math.hypot(dx, dy) || 1; }
          const move = huntGroundMove(w, { x: w.x + (dx / len) * BOUND_RUN_SPEED * dt, y: w.y + (dy / len) * BOUND_RUN_SPEED * dt });
          w.x = move.x; w.y = move.y;
        }
        const dist = Math.hypot(w.x - a.x, w.y - ROPE_BODY_Y - a.y);
        const r = C.ropeTick(save, w.id, { gauge: w.bound, hp: w.hp, max: w.max }, dist, dt);
        w.bound = r.gauge; w.hp = r.hp; w.ropeZone = r.zone;
        if (r.zone === 'pull' && dist > 1) {
          // 원작: 80px 넘게 당기면 디지몬이 로프 끝 쪽으로 끌려온다
          const step = Math.min(dist - C.ROPE_PULL_DISTANCE + 1, C.ROPE_DRAG_SPEED * dt);
          const move = huntGroundMove(w, { x: w.x + ((a.x - w.x) / dist) * step, y: w.y + ((a.y + ROPE_BODY_Y - w.y) / dist) * step });
          w.x = move.x; w.y = move.y;
        }
        w.movedX = w.x - oldX; w.movedY = w.y - oldY;
        if (w.movedX) w.vx = w.movedX; // 그림 방향
        if (w.x <= AREA.x0 || w.x >= AREA.x1 || w.y <= AREA.y0 + 20 || w.y >= AREA.y1) {
          w.bound = 0;
          w.gone = true;
          if (hunt.pull?.w === w) hunt.pull = null;
          huntNote(`${C.getSpecies(w.id).name}이(가) 로프째 도망쳤다!`);
          continue;
        }
        if (w.hp <= 0) { faint(w); continue; }
        if (w.bound <= 0) {
          // 원작 도움말: 끊어져도 몇 번이고 다시 쓸 수 있다
          w.bound = 0;
          if (hunt.pull?.w === w) hunt.pull = null;
          w.flee = 3;
          w.vx = (w.x - AREA.x0 < AREA.x1 - w.x ? -1 : 1) * 95;
          w.vy = (Math.random() - 0.5) * 40;
          huntNote(r.zone === 'snap' ? `너무 멀리 당겨 로프가 끊어졌다! ${C.getSpecies(w.id).name}이(가) 달아난다` : `로프가 버티지 못하고 끊어졌다! ${C.getSpecies(w.id).name}이(가) 달아난다`);
        }
        continue;
      }
      if (w.poisonWait > 0) {
        // 독 고기를 먹고 4초 뒤 독이 돌기 시작한다 (원본)
        w.poisonWait -= dt;
        if (w.poisonWait <= 0) { w.poisonWait = 0; w.poisonLeft = C.poisonSeconds(); w.poisonTick = C.POISON_TICK; }
      }
      if (w.poisonLeft > 0) {
        // 독: 3초마다 HP 최대치의 3% (원본). 0이 되면 기절한다
        w.poisonLeft -= dt;
        w.poisonTick -= dt;
        if (w.poisonTick <= 0) {
          w.poisonTick += C.POISON_TICK;
          w.hp = Math.max(0, w.hp - (w.max * C.POISON_TICK_PERCENT) / 100);
          w.flash = 0.3;
          if (w.hp <= 0) { faint(w); continue; }
        }
      }
      if (w.paraWait > 0) {
        // 마비 고기: 먹고 2초 뒤 마비 (원본)
        w.paraWait -= dt;
        if (w.paraWait <= 0) { w.paraWait = 0; w.stun = Math.max(w.stun || 0, C.paralysisSeconds()); w.stunKind = '마비'; w.flee = 0; }
      }
      w.wireCd = Math.max(0, (w.wireCd || 0) - dt);
      // 6초마다 배 −1, 독이 아니면 HP 최대치의 5% 회복 (원본 0x2110AFC)
      if (!w.ko && (w.hungerTick = (w.hungerTick ?? C.WILD_HUNGER_TICK) - dt) <= 0) {
        w.hungerTick += C.WILD_HUNGER_TICK;
        w.belly = Math.max(0, (w.belly ?? 0) - 1);
        if (!(w.poisonLeft > 0)) w.hp = Math.min(w.max, w.hp + (w.max * C.WILD_HP_REGEN_PERCENT) / 100);
      }
      if (w.trapped) {
        // 함정에 걸린 디지몬은 포획하거나 함정을 옮길 때까지 빠져나가지 못한다 (원본)
        if (hunt.traps.includes(w.trapped)) { w.stun = Math.max(w.stun || 0, 0.1); w.stunKind = '포획'; continue; }
        w.trapped = null; w.stun = 0; w.stunKind = '';
      }
      if (w.stuckWire) {
        // 마그넷 와이어: 그 와이어가 없어질 때까지 붙어 있다 (원본 상태 13)
        if (hunt.wires.includes(w.stuckWire)) continue;
        w.stuckWire = null; w.stun = 0; w.stunKind = '';
      }
      if (w.stun > 0) {
        // 샷·폭탄·함정에 걸려 멈춘 동안은 움직이지 않는다
        w.stun -= dt;
        if (w.stun <= 0 && w.stunKind === '수면') {
          // 잠은 10 + rand(20)초 뒤 졸음 0으로 깬다 (원본 0x2113AD4)
          w.sleepy = 0; w.stunKind = '';
        } else if (w.stun <= 0 && w.spark) {
          // 스파크 감전 0.5초 뒤 마비 (원본 상태 14 → 17)
          w.spark = false; w.stun = C.paralysisSeconds(); w.stunKind = '마비';
        } else if (w.stun <= 0 && w.scatter) {
          // 효과 없는 샷에서 풀리면 근처 아무 곳으로 달아난다 (원본)
          const dx = w.scatter.x - w.x, dy = w.scatter.y - w.y, d = Math.hypot(dx, dy) || 1;
          w.vx = (dx / d) * 95; w.vy = (dy / d) * 95; w.flee = d / 95; w.scatter = null;
        }
        continue;
      }
      // 졸음: 깨어 있는 동안 1초에 1씩 오르고(배가 가득이면 2씩), 최대치에 닿으면 그 자리에서 잠든다 (원본 상태 1·2 → 4)
      if (!w.waking) {
        w.sleepy = (w.sleepy || 0) + dt * ((w.belly ?? 0) >= C.wildBellyMax(w.id) ? 2 : 1);
        if (w.sleepy >= wildSleepMax(w)) {
          w.stun = C.wildSleepSeconds(); w.stunKind = '수면'; w.flee = 0; w.vx = 0; w.vy = 0; w.scatter = null;
          continue;
        }
      }
      const drowsy = !w.waking && w.sleepy >= wildSleepMax(w) * C.SLEEP_DROWSY_RATIO;
      // 마인은 밟으면 터지고, 함정은 밟은 디지몬을 붙잡는다
      // 원본: 마인·함정 그림 첫 셀 크기의 절반 상자 안에 들어오면 발동
      const trap = hunt.traps.find((t) => t.g.kind !== 'bomb' && C.inBox(w.x - t.x, w.y - t.y, (t.g.kind === 'mine' ? C.MINE_BOX : C.TRAP_BOX)[t.g.id] || [16, 12]) && huntGroundLine(w,t));
      if (trap && trap.g.kind === 'mine') {
        trap.left = 0;
        blast(trap.x, trap.y, trap.g);
        continue;
      }
      if (trap && trap.heldWild && trap.heldWild !== w) {
        // 다른 디지몬을 붙잡은 함정은 벽처럼 지나가지 못한다 (원본 0x2112510)
        w.vx = -w.vx; w.vy = -w.vy; w.x -= Math.sign(w.x - trap.x || 1) * -2; w.turn = Math.min(w.turn, 0.3);
      }
      if (trap && trap.g.kind === 'trap' && !trap.heldWild) {
        trap.held = 1; trap.heldWild = w; w.trapped = trap;
        // 원본 여러 층의 포획 그림은 heldWild를 따라 시작하고 붙잡고 있는 동안 유지한다.
        w.stun = 0.1;
        w.stunKind = '포획';
        w.flee = 0;
        huntNote(`${C.getSpecies(w.id).name}이(가) ${trap.g.name}에 걸렸다! 로프로 감으세요.`);
        continue;
      }
      if (w.waking) {
        // 회복하며 로프 끝(없으면 화면 가운데) 반대쪽으로 달아난다. 체력 비율에 따라 졸린 걸음 → 걷기 → 뛰기
        w.hp = C.wildRegen(w.id, w.hp, w.max, dt);
        const from = w.anchor || (hunt.cam ? { x: hunt.cam.x + 480 / hunt.zoom, y: hunt.cam.y + 280 / hunt.zoom } : { x: (AREA.x0 + AREA.x1) / 2, y: (AREA.y0 + AREA.y1) / 2 });
        // 벽에 막혀 지난 틱에 거의 못 움직였으면 옆으로 비켜 간다
        if (w.wakeBlocked) w.wakeTurn = ((w.wakeTurn || 0) + 1) % 4;
        w.wakeBlocked = false;
        const turn = [0, Math.PI / 2, -Math.PI / 2, Math.PI][w.wakeTurn || 0];
        const base = Math.atan2(w.y - from.y, w.x - from.x) + turn;
        const dx = Math.cos(base), dy = Math.sin(base);
        const ratio = w.hp / w.max;
        if (ratio >= C.WILD_RUN_RATIO - 1e-9) {
          w.waking = false;
          w.runAway = WAKE_RUN_SECONDS;
          w.flee = WAKE_RUN_SECONDS;
          w.vx = dx * BOUND_RUN_SPEED;
          w.vy = dy * BOUND_RUN_SPEED;
          huntNote(`${C.getSpecies(w.id).name}이(가) 기운을 되찾고 뛰어 달아난다!`);
        } else {
          const speed = ratio >= C.WILD_WALK_RATIO ? WAKE_WALK_SPEED : WAKE_DROWSY_SPEED;
          w.vx = dx * speed;
          w.vy = dy * speed;
          w.flee = 0.5;
        }
      }
      if (w.runAway > 0) w.runAway -= dt;
      const lure = !(w.flee > 0) && hunt.baits.find((b) => Math.hypot(b.x - w.x, b.y - w.y) < b.range && lureTakes(w, b, dt));
      if (lure) {
        // 고기 냄새를 따라간다. 다 오면 그 자리에 머문다
        const dist = Math.hypot(lure.x - w.x, lure.y - w.y);
        w.vx = dist > 14 ? ((lure.x - w.x) / dist) * 45 : 0;
        w.vy = dist > 14 ? ((lure.y - w.y) / dist) * 45 : 0;
        w.turn = 1;
        // 고기에 닿으면 먹는다: 먹기 동작이 한 바퀴 돌 때마다 세대별 한 입(원본). 독·마비 고기는 한 입마다 효과 판정
        if (dist <= 14 && lure.amount !== undefined && huntGroundLine(w,lure)) {
          w.eatTime = (w.eatTime || 0) + dt;
          const loop = eatLoopSeconds(w);
          if (w.eatTime >= loop) {
            w.eatTime -= loop;
            const bite = Math.min(lure.amount, C.meatBite(w.id));
            lure.amount -= bite;
            w.belly = (w.belly ?? 0) + bite;
            if (lure.amount <= 0) lure.left = 0;
            if (lure.effect === '독' && !(w.poisonWait > 0) && !(w.poisonLeft > 0) && applyEffect(w, '독')) huntNote(`${C.getSpecies(w.id).name}이(가) ${lure.name}를 먹었다! 독`);
            if (lure.effect === '마비' && !(w.paraWait > 0) && w.stunKind !== '마비' && C.itemResist(w.id, 'paralysis') < 3) {
              w.paraWait = C.PARALYSIS_MEAT_DELAY;
              huntNote(`${C.getSpecies(w.id).name}이(가) ${lure.name}를 먹었다! 곧 마비된다`);
            }
          }
        } else w.eatTime = 0;
      } else if (w.flee > 0) {
        w.flee -= dt;
      } else {
        w.turn -= dt;
        if (w.turn <= 0) {
          w.turn = 1.5 + Math.random() * 3;
          // 졸리면(졸음 80% 이상) 천천히 걷는다 (원본 0x2112A94, 속도는 웹판 졸린 걸음)
          const a = Math.random() * Math.PI * 2, v = drowsy ? WAKE_DROWSY_SPEED : 15 + Math.random() * 25;
          w.vx = Math.cos(a) * v;
          w.vy = Math.sin(a) * v * 0.6;
        }
      }
      const target={x:w.x+w.vx*dt,y:w.y+w.vy*dt},edgeX=!(w.flee>0)&&(target.x<AREA.x0||target.x>AREA.x1),edgeY=!(w.flee>0)&&(target.y<AREA.y0+20||target.y>AREA.y1);
      // 화면 경계 보정도 지형 검사 전에 수행해, 나중에 좌표를 잘라 벽 안으로 넣지 않는다.
      if(!(w.flee>0)){target.x=Math.min(AREA.x1,Math.max(AREA.x0,target.x));target.y=Math.min(AREA.y1,Math.max(AREA.y0+20,target.y));}
      const next = huntGroundMove(w,target);
      const wire = hunt.wires.find(l=>next.path.some((p,i)=>i>0&&crosses(next.path[i-1],p,l.a,l.b)));
      if (wire) {
        w.vx = -w.vx;
        w.vy = -w.vy;
        if (wire.g && !w.wireCd) {
          wakeFromSleep(w);
          // 마그넷은 달라붙고, 스파크는 전격 대미지
          // 원본: 마그넷은 내성 등급 1·2면 와이어가 없어질 때까지 달라붙고(3은 튕김),
          // 스파크는 HP 최대치의 %만큼 전격 후 0.5초 감전 → 마비
          w.wireCd = C.WIRE_COOLDOWN;
          if (wire.g.sticky && C.magnetSticks(w.id)) { w.stuckWire = wire; w.stun = 0.1; w.stunKind = '달라붙음'; w.flee = 0; w.vx = 0; w.vy = 0; }
          else if (wire.g.power && itemHit(w, wire.g.id)) { if (w.ko) continue; w.stun = C.SPARK_SHOCK; w.stunKind = '감전'; w.spark = true; w.scatter = null; }
        }
        continue;
      }
      if(next.blockedX||edgeX)w.vx=-w.vx;
      if(next.blockedY||edgeY)w.vy=-w.vy;
      if(next.blockedX||next.blockedY)w.turn=Math.min(w.turn,0.3);
      if((next.blockedX||next.blockedY)&&w.waking)w.wakeBlocked=true;
      w.x = next.x;
      w.y = next.y;
      // 도망치다 사냥 지도 끝(바깥)에 닿으면 놓친다. 테이머가 보고 있는 화면 밖으로 나가는 것은 상관없다
      const out = w.x < AREA.x0 || w.x > AREA.x1 || w.y < AREA.y0 + 20 || w.y > AREA.y1;
      if (out && w.flee > 0) {
        w.gone = true;
        huntNote(`${C.getSpecies(w.id).name}이(가) 도망쳤다!`);
      }
      w.movedX = w.x - oldX;
      w.movedY = w.y - oldY;
    }
    for (const b of hunt.baits) {
      b.left -= dt;
      if (b.kind === 'toy' && b.idle > 0 && (b.idle -= dt) <= 0) {
        // 원본: 3초 뒤 지금 보이는 화면 안 아무 곳 쪽으로 걷기 시작한다
        const vw = 960 / hunt.zoom, vh = 560 / hunt.zoom, cam = hunt.cam || { x: AREA.x0, y: AREA.y0 };
        const tx = cam.x + Math.random() * vw, ty = cam.y + Math.random() * vh, d = Math.hypot(tx - b.x, ty - b.y) || 1;
        b.vx = ((tx - b.x) / d) * C.DECOY_SPEED; b.vy = ((ty - b.y) / d) * C.DECOY_SPEED;
      }
      if (b.vx || b.vy) {
        // 원본: 지형이나 끝에 막히거나 마인을 밟으면(마인은 터진다) 사라진다
        const x=b.x+b.vx*dt,y=b.y+b.vy*dt,target={x:Math.min(AREA.x1-20,Math.max(AREA.x0+20,x)),y:Math.min(AREA.y1-10,Math.max(AREA.y0+40,y))};
        const move=huntGroundMove(b,target);
        b.x=move.x;b.y=move.y;
        if(move.blockedX||move.blockedY||target.x!==x||target.y!==y){b.left=0;huntNote(`${b.name}이(가) 막혀 사라졌다.`);}
        const mine=hunt.traps.find((t)=>t.g.kind==='mine'&&C.inBox(b.x-t.x,b.y-t.y,C.MINE_BOX[t.g.id]||[16,12]));
        if(mine){mine.left=0;blast(mine.x,mine.y,mine.g);b.left=0;}
      }
      // 판정에서는 즉시 제거하되 원본 미끼 소멸 동작과 가속 점멸은 끝까지 그린다.
      if(b.kind==='toy'&&b.left<=0)hunt.fx.push(huntEquipmentArt.retirement(b));
    }
    for (const t of hunt.traps) {
      t.left -= dt;
      // 붙잡은 디지몬을 포획하면 함정도 거둔다 (원본 0x21155C0 → 0x212906C)
      if (t.heldWild?.gone) { t.heldWild = null; t.left = 0; }
      if (t.fuse > 0 && (t.fuse -= dt) <= 0) { t.left = 0; blast(t.x, t.y, t.g); }
    }
    hunt.traps = hunt.traps.filter((t) => t.left > 0);
    hunt.baits = hunt.baits.filter((b) => b.left > 0);
    for (const f of hunt.fx) f.left -= dt;
    hunt.fx = hunt.fx.filter((f) => f.left > 0);
    hunt.wilds = hunt.wilds.filter((w) => !w.gone || now < 0);
    hunt.respawn -= dt;
    if (hunt.wilds.length < C.HUNT_WILD_COUNT && hunt.respawn <= 0) {
      hunt.respawn = 6;
      const w = spawnWild(hunt.field);
      if (w) hunt.wilds.push(w);
    }
    const can = C.canHuntNow(save);
    if (!can.ok) endHunt(can.reason);
  }

  // 로프를 감는다: 닫힌 고리 안의 디지몬을 묶는다. 로프 끝은 고리를 다 그린 곳
  function wrapRope(poly) {
    let any = false;
    for (const w of hunt.wilds) {
      if (w.gone || w.ko || !inside(w, poly)) continue;
      any = true;
      const name = C.getSpecies(w.id).name;
      if (!C.ropeDamage(save, w.id)) {
        const need = C.ropeFor(w.id);
        huntNote(`${name}: 로프가 약해 감기지 않는다 (${need ? need.name + ' 필요' : '로프로는 잡을 수 없다'})`);
        w.flee = 2;
        w.vx = (w.x - AREA.x0 < AREA.x1 - w.x ? -1 : 1) * 80;
        continue;
      }
      w.bound = w.boundMax = C.ropeHoldSeconds(save);
      w.waking = false;
      w.runAway = 0;
      const end = poly[poly.length - 1];
      w.anchor = { x: end.x, y: end.y };
      huntNote(`${name}에게 로프를 감았다! 디지몬을 누른 채 끌어 로프를 팽팽하게 당기세요 (너무 멀면 끊어져요)`);
    }
    if (!any) huntNote('둘러싼 디지몬이 없습니다.');
  }

  // 체력이 0이 되면 그 자리에서 기절한다. 테이머가 누르면 포획
  function faint(w) {
    w.ko = true;
    w.koTime = 0;
    w.bound = 0;
    w.hp = 0;
    w.stun = 0;
    w.vx = 0; w.vy = 0;
    if (hunt.pull?.w === w) hunt.pull = null;
    huntNote(`${C.getSpecies(w.id).name}이(가) 기절했다! 눌러서 포획하세요 (5초가 지나면 회복하기 시작해요)`);
  }
  function captureFainted(w) {
    const r = C.capture(save, w.id, Math.random, hunt.carried, w.personality);
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
      // 데려갈 수 없으면 깨어나 달아난다
      w.ko = false;
      w.hp = 1;
      w.flee = 3;
      w.vx = (w.x - AREA.x0 < AREA.x1 - w.x ? -1 : 1) * 95;
      huntNote(r.message);
      toast(r.message);
    }
  }

  function canvasPoint(e) {
    // 사냥은 화면 좌표로 그린다. 사육장 카메라/줌을 적용하면 로프가 포인터에서 벗어난다.
    // 사냥 카메라가 있으면 지도 좌표로 바꾼다.
    return huntToWorld(screenPoint(e));
  }
  function screenPoint(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width,
      y: (e.clientY - r.top) * canvas.height / r.height };
  }
  function huntPointer(type, e) {
    if (!hunt) return;
    e.preventDefault();
    // OS/브라우저의 터치 취소는 설치/로프 완성과 다르다. 좌표가 없어도 안전하게 정리한다.
    if (type === 'cancel') {
      hunt.drawing = false; hunt.trail = []; hunt.pull = null; hunt.pan = null; hunt.lastScreen = null;
      return;
    }
    if (huntPanPointer(type, e)) return;
    if (canvas.getBoundingClientRect) hunt.lastScreen = type === 'up' ? null : screenPoint(e);
    const p = canvasPoint(e);
    // 분석 대상만 바꾼다. 클릭/드래그의 로프·장비 조작은 아래 경로를 그대로 따른다.
    if(type==='down'||type==='move'){
      const pointed=[...hunt.wilds].sort((a,b)=>b.y-a.y).find(w=>!w.gone&&wildSpriteHit(w,p));
      if(pointed)hunt.inspectWild=pointed;
    }
    if (type === 'down') {
      const ko = [...hunt.wilds].sort((a,b)=>b.y-a.y).find((w) => !w.gone && w.ko && (wildSpriteHit(w,p) || Math.hypot(p.x - w.x, p.y - (w.y - 6)) < 18)); // 쓰러진 그림은 작아서 넉넉히 잡는다
      if (ko) return captureFainted(ko);
    }
    if (type === 'down' && hunt.tool === 'gear' && !wireGear()) return useGearAt(p);
    if (hunt.tool === 'gear' && !wireGear()) return;
    if (type === 'down') {
      const target = hunt.tool === 'rope' && [...hunt.wilds].sort((a,b)=>b.y-a.y).find((w) => !w.gone && w.bound > 0 && wildSpriteHit(w,p));
      hunt.pull = target ? { w: target, to: p } : null;
      if (target) target.anchor = { x: p.x, y: p.y };
      hunt.drawing = !target;
      hunt.trail = target ? [] : [p];
      canvas.setPointerCapture?.(e.pointerId);
    } else if (type === 'move' && hunt.pull) {
      // 누르고 있는 동안 로프 끝이 포인터를 따라온다
      hunt.pull.to = p;
      hunt.pull.w.anchor = { x: p.x, y: p.y };
    } else if (type === 'up' && hunt.pull) {
      // 손을 떼도 로프 끝은 그 자리에 남는다
      hunt.pull.w.anchor = { x: p.x, y: p.y };
      hunt.pull = null;
    } else if (type === 'move' && hunt.drawing) {
      const last = hunt.trail[hunt.trail.length - 1];
      if (Math.hypot(p.x - last.x, p.y - last.y) > 3) hunt.trail.push(p);
      if (hunt.trail.length > 400) hunt.trail.shift();
      if (wireMode() && hunt.trail.length > 2) hunt.trail = [hunt.trail[0], p];
    } else if (type === 'up' && hunt.drawing) {
      hunt.drawing = false;
      const t = hunt.trail;
      hunt.trail = [];
      if (wireMode()) {
        const g = wireGear();
        if (t.length < 2) return;
        if (!g && save.wires <= 0) return huntNote('와이어가 없습니다. 상점에서 사세요.');
        let b = t[t.length - 1];
        const len = Math.hypot(b.x - t[0].x, b.y - t[0].y);
        if (len < 20) return;
        // 길이는 원작 수치(노멀α 24) × WIRE_UNIT
        const k = Math.min(1, ((g ? g.length : 24) * C.WIRE_UNIT) / len);
        b = { x: t[0].x + (b.x - t[0].x) * k, y: t[0].y + (b.y - t[0].y) * k };
        if(!huntGroundClear(t[0])||!huntGroundClear(b)||!huntGroundLine(t[0],b))return huntNote('와이어는 이동 가능한 바닥에만 설치할 수 있습니다.');
        if (g) {
          const next = C.useGear(save, g.id);
          if (!next) return huntNote('남은 수량이 없습니다.');
          save = next;
          refreshGear();
          hunt.wires.push({ a: t[0], b, g });
        } else {
          hunt.wires.push({ a: t[0], b });
          save = { ...save, wires: save.wires - 1 };
        }
        // 원본은 와이어를 2개까지 놓는다. 새로 놓으면 가장 오래된 것이 없어진다
        if (hunt.wires.length > C.HUNT_WIRE_MAX) hunt.wires = hunt.wires.slice(-C.HUNT_WIRE_MAX);
        render();
        return;
      }
      const closed = t.length > 8 && Math.hypot(t[0].x - t[t.length - 1].x, t[0].y - t[t.length - 1].y) < 45;
      if (closed) wrapRope(t);
      else if (t.length > 12) huntNote('고리가 닫히지 않았습니다. 처음 위치 근처에서 손을 떼세요.');
    }
  }

  // 미니맵: 지도 전체, 지금 보이는 범위, 야생 디지몬 위치
  function analyzeText(w, sp) {
    const a = hunt.plug?.analyze;
    if (!a?.size) return '';
    return [a.has('stage') ? C.STAGE_LABEL[sp.stage] : '', a.has('family') ? sp.family : '', a.has('attr') ? sp.attr : '',
      a.has('hp') ? `최대HP ${C.typicalStats(w.id).hp}` : '', a.has('personality') ? w.personality : '', a.has('size') ? `${sp.size}G` : ''].filter(Boolean).join(' · ');
  }
  // 원본 보조 화면은 한 개체의 분석 창이다. 웹은 포인터/당기는 개체를 우선 표시한다.
  function huntAnalysisTarget(){
    const cam=hunt.cam||{x:0,y:0},zoom=hunt.zoom||1;
    const visible=w=>w&&!w.gone&&w.x>=cam.x&&w.x<=cam.x+960/zoom&&w.y>=cam.y&&w.y<=cam.y+560/zoom;
    for(const w of [hunt.pull?.w,hunt.inspectWild])if(hunt.wilds.includes(w)&&visible(w))return w;
    const x=cam.x+480/zoom,y=cam.y+280/zoom;
    return hunt.wilds.filter(visible).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0]||null;
  }
  function drawHuntMinimap() {
    const mm = huntMinimapBox();
    if (!mm) return;
    hunt.pluginHud?.radar(ctx,hunt,mm,C.getSpecies);
  }
  // 사냥 화면 이동: '이동' 도구 왼쪽 끌기, 오른쪽·가운데 버튼 끌기, 미니맵 누르기. 처리했으면 true
  function huntPanPointer(type, e) {
    if (!hunt.cam || !canvas.getBoundingClientRect) return false;
    const s = screenPoint(e), mm = huntMinimapBox();
    if (type === 'down' && mm && s.x >= mm.x && s.x <= mm.x + mm.w && s.y >= mm.y && s.y <= mm.y + mm.h) {
      huntCenter((s.x - mm.x) / mm.k, (s.y - mm.y) / mm.k);
      hunt.pan = { minimap: true };
      return true;
    }
    if (type === 'down' && (hunt.tool === 'move' || e.button === 1 || e.button === 2)) {
      hunt.pan = { x: s.x, y: s.y, cx: hunt.cam.x, cy: hunt.cam.y };
      canvas.setPointerCapture?.(e.pointerId);
      return true;
    }
    if (!hunt.pan) return false;
    if (type === 'move' && hunt.pan.minimap && e.buttons) huntCenter((s.x - mm.x) / mm.k, (s.y - mm.y) / mm.k);
    else if (type === 'move' && !hunt.pan.minimap) {
      hunt.cam.x = hunt.pan.cx - (s.x - hunt.pan.x) / hunt.zoom;
      hunt.cam.y = hunt.pan.cy - (s.y - hunt.pan.y) / hunt.zoom;
      huntClampCam();
    }
    if (type === 'up') hunt.pan = null;
    return true;
  }
  /** 레이더류를 장착한 사냥에서만 지도 표시. 기존 엔진 장착/탐지 규칙을 사용한다. */
  function huntMinimapBox() {
    if (!hunt?.size || !C.equippedPlugins(save).some(p=>p.category===3)) return null;
    const k = 150 / Math.max(hunt.size.w, hunt.size.h);
    return { x: 960 - hunt.size.w * k - 24, y: 560 - hunt.size.h * k - 12, w: hunt.size.w * k, h: hunt.size.h * k, k };
  }
  function huntWheel(e) {
    if (!hunt?.cam) return;
    e.preventDefault();
    const s = screenPoint(e), before = huntToWorld(s);
    hunt.zoom = Math.max(HUNT_ZOOM.min, Math.min(HUNT_ZOOM.max, hunt.zoom * Math.exp(-e.deltaY * 0.0015)));
    hunt.cam.x = before.x - s.x / hunt.zoom;
    hunt.cam.y = before.y - s.y / hunt.zoom;
    huntClampCam();
    // 카메라 배율이 바뀌어도 잡고 있는 로프 끝은 화면의 포인터 아래에 남는다.
    followHuntPointer();
  }
  function followHuntPointer() {
    if (hunt?.pull && hunt.lastScreen) hunt.pull.w.anchor = huntToWorld(hunt.lastScreen);
  }
  // 방향키·WASD로 화면 이동, 로프를 그리다 화면 가장자리에 닿으면 그쪽으로 흘러간다
  const huntKeys = new Set();
  function huntScroll(dt) {
    if (!hunt?.cam) return;
    const v = 520 / hunt.zoom * dt;
    let dx = 0, dy = 0;
    if (huntKeys.has('ArrowLeft') || huntKeys.has('a')) dx -= v;
    if (huntKeys.has('ArrowRight') || huntKeys.has('d')) dx += v;
    if (huntKeys.has('ArrowUp') || huntKeys.has('w')) dy -= v;
    if (huntKeys.has('ArrowDown') || huntKeys.has('s')) dy += v;
    if ((hunt.drawing || hunt.pull) && hunt.lastScreen) {
      const m = 36, e = hunt.lastScreen, k = 360 / hunt.zoom * dt;
      if (e.x < m) dx -= k; else if (e.x > 960 - m) dx += k;
      if (e.y < m) dy -= k; else if (e.y > 560 - m) dy += k;
    }
    hunt.cam.x += dx;
    hunt.cam.y += dy;
    huntClampCam();
    // 가장자리 자동 스크롤/방향키 이동 중에는 pointermove가 없어도 월드 좌표를 갱신한다.
    followHuntPointer();
  }

  function drawHunt(t, dt) {
    hunt.health?.begin();
    window.HDText?.begin(ctx);
    huntScroll(dt);
    const [c1, c2] = FIELD_LOOK[hunt.field.id] || ['#7fb069', '#6a9a57'];
    const map = hunt.map;
    ctx.fillStyle = '#0b1d2a';
    ctx.fillRect(0, 0, 960, 560);
    // 지도 좌표로 그린다 (카메라 이동·확대)
    ctx.save();
    ctx.scale(hunt.zoom || 1, hunt.zoom || 1);
    ctx.translate(-(hunt.cam?.x || 0), -(hunt.cam?.y || 0));
    if (map && map.complete && map.naturalWidth) {
      // 원본 지도는 도트 그대로 그린다
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(map, hunt.view.x, hunt.view.y, hunt.size?.w ?? 960, hunt.size?.h ?? 560, 0, 0, hunt.size?.w ?? 960, hunt.size?.h ?? 560);
    } else {
      ctx.fillStyle = c2;
      ctx.fillRect(0, 0, hunt.size?.w ?? 960, hunt.size?.h ?? 560);
      ctx.fillStyle = c1;
      ctx.fillRect(AREA.x0, AREA.y0, AREA.x1 - AREA.x0, AREA.y1 - AREA.y0);
    }
    // 가장자리 = 출구
    ctx.strokeStyle = '#00000044';
    ctx.setLineDash([10, 8]);
    ctx.lineWidth = 2;
    ctx.strokeRect(AREA.x0, AREA.y0, AREA.x1 - AREA.x0, AREA.y1 - AREA.y0);
    ctx.setLineDash([]);
    for (const t of hunt.traps) {
      if(t.g.kind==='trap')huntEquipmentArt.drawTrap(ctx,t,dt,'back');
      else huntEquipmentArt.draw(ctx,t,dt);
    }
    for (const l of hunt.wires) {
      ctx.strokeStyle = !l.g ? '#d8dde0' : l.g.sticky ? '#e58bd8' : l.g.power ? '#ffe36a' : '#d8dde0';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(l.a.x, l.a.y);
      ctx.lineTo(l.b.x, l.b.y);
      ctx.stroke();
      ctx.fillStyle = '#7a5532';
      for (const p of [l.a, l.b]) ctx.fillRect(p.x - 3, p.y - 8, 6, 12);
    }
    for (const b of hunt.baits) {
      huntEquipmentArt.draw(ctx,b,dt);
    }
    const order = [...hunt.wilds].sort((a, b) => a.y - b.y);
    const analysisTarget=huntAnalysisTarget();
    for (const w of order) {
      const rx = footprint(w.id, false, HUNT_SPRITE_SCALE);
      ctx.fillStyle = '#00000033';
      ctx.beginPath();
      ctx.ellipse(w.x, w.y + 1, rx, Math.max(5, rx * 0.3), 0, 0, 7);
      ctx.fill();
      if (w.bound > 0) {
        // 감긴 로프 (남은 시간만큼 고리가 줄어든다). 색은 쓰는 로프에 따라
        ctx.strokeStyle = ropeColor();
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(w.x, w.y - 7, rx + 5, rx * 0.55 + 6, 0, 0, Math.PI * 2 * (w.bound / (w.boundMax || 1)));
        ctx.stroke();
      }
      if (w.flash > 0 && Math.floor(w.flash * 20) % 2) ctx.globalAlpha = 0.4;
      const spriteId = SPRITE_BY_NAME[C.getSpecies(w.id).id];
      const motion = w.ko
        ? {frame:animations.pose(w,spriteId,'ko',dt),flip:w.vx>0}
        : w.bound>0 || w.runAway>0
        ? {frame:animations.pose(w,spriteId,(w.movedX||w.movedY)?'boundRun':'boundIdle',dt),flip:w.vx>0}
        : w.waking && w.hp < w.max * C.WILD_WALK_RATIO
        ? animations.movement(w, spriteId, w.movedX || 0, w.movedY || 0, dt * 0.5) // 졸린 듯 느린 걸음
        : animations.movement(w, spriteId, w.movedX || 0, w.movedY || 0, dt);
      spriteFrames.set(w,{frame:motion.frame,speciesId:w.id,flip:motion.flip});
      body(ctx, w.id, false, w.x, w.y, HUNT_SPRITE_SCALE, motion.frame, motion.flip);
      ctx.globalAlpha = 1;
      // 앞쪽 고리는 해당 디지몬 위, 이름·HP 안내 아래에 그려 갇힌 모습을 유지한다.
      if(w.trapped&&hunt.traps.includes(w.trapped))huntEquipmentArt.drawTrap(ctx,w.trapped,0,'front');
      const sp = C.getSpecies(w.id);
      const weak = !C.ropeDamage(save, w.id);
      ctx.font = 'bold 8px "Noto Sans KR",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = weak ? '#ffd0c0' : '#ffffff';
      // 종 이름과 정보는 애널라이저 플러그인이 있어야 보인다 (원작 설명: 디지몬의 종류와 ○○를 알 수 있다)
      ctx.fillText((hunt.plug?.species ? sp.name : '???') + (w.ko ? ' (기절 · 눌러서 포획)' : weak ? ` (${C.ropeFor(w.id)?.name ?? '포획 불가'} 필요)` : ''), w.x, w.y + 11);
      const info = w===analysisTarget?analyzeText(w, sp):'';
      if (info) {
        ctx.font = '7px "Noto Sans KR",sans-serif'; ctx.fillStyle = '#d8eef5'; ctx.fillText(info, w.x, w.y + 26);
        // 속성 애널라이저를 장착했을 때만 원본 Va/Vi/Da/Fr 표시를 덧붙인다.
        if(hunt.plug?.analyze.has('attr'))hunt.pluginHud?.attribute(ctx,sp.attr,w.x-ctx.measureText(info).width/2-15,w.y+17,12);
      }
      hunt.health?.draw(ctx,w,w.hp,w.max,w.x-27,w.y+14,54,8);
      if (w.stun > 0) {
        ctx.font = 'bold 10px "Noto Sans KR",sans-serif';
        ctx.fillStyle = w.stunKind === '수면' ? '#bfe3ff' : '#ffe36a';
        ctx.fillText(w.stunKind === '수면' ? 'Zzz' : w.stunKind || '멈춤', w.x, w.y - 34);
      }
    }
    for (const f of hunt.fx) {
      if(f.explosion){huntEquipmentArt.drawExplosion(ctx,f,dt);continue;}
      if(f.retiring){huntEquipmentArt.drawRetiring(ctx,f,dt);continue;}
      if(f.artSequence!==undefined){huntEquipmentArt.draw(ctx,f,dt,f.artSequence);continue;}
      ctx.strokeStyle = '#fff4b0';
      ctx.lineWidth = 3;
      ctx.globalAlpha = Math.max(0, f.left / 0.25);
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const w of hunt.wilds) {
      // 묶인 디지몬과 로프 끝을 잇는 줄. 팽팽할수록 굵고, 끊기기 직전이면 깜빡인다
      if (w.gone || !(w.bound > 0) || !w.anchor) continue;
      const zone = w.ropeZone || 'safe';
      if (zone === 'pull' && w.bound < 2 && Math.floor(performance.now() / 120) % 2) continue;
      ctx.strokeStyle = ropeColor();
      ctx.lineWidth = zone === 'safe' ? 1.5 : zone === 'tense' ? 2.5 : 4;
      ctx.beginPath();
      ctx.moveTo(w.x, w.y - ROPE_BODY_Y);
      ctx.lineTo(w.anchor.x, w.anchor.y);
      ctx.stroke();
    }
    if (hunt.trail.length > 1) {
      ctx.strokeStyle = wireMode() ? '#d8dde0' : ropeColor();
      ctx.lineWidth = wireMode() ? 4 : 3;
      ctx.beginPath();
      ctx.moveTo(hunt.trail[0].x, hunt.trail[0].y);
      for (const p of hunt.trail) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      if (hunt.tool === 'rope') {
        ctx.strokeStyle = ropeColor() + '88';
        ctx.beginPath();
        ctx.arc(hunt.trail[0].x, hunt.trail[0].y, 45, 0, 7);
        ctx.stroke();
      }
    }
    ctx.restore();
    drawHuntMinimap();
    // 카메라 이동/줌과 관계없이 플래시는 사냥 캔버스 안에서만 밝힌다. 정보 글자는 뒤에 그린다.
    const flash=Math.max(0,...hunt.fx.map(f=>huntEquipmentArt.flashAlpha(f)));
    if(flash){ctx.save();ctx.globalAlpha=flash;ctx.fillStyle='#fff';ctx.fillRect(0,0,960,560);ctx.restore();}
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
    const memory=hunt.plug?.memory?hunt.pluginHud?.memory(ctx,hunt.carried,save.memoryCard):null;
    ctx.fillText(`${d.seasonName} ${d.day}일 ${pad(d.hour)}:${pad(d.minute - d.minute % 10)} (22:00 종료) · ${C.ropeOf(save.rope).name}${hunt.plug?.check.has('wire') ? ` · 와이어 ${save.wires}개` : ''}`,230,31,memory?memory.x-240:710);
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
    hunt.health?.end();
    window.HDText?.end(ctx);
  }

  // ---------- 시작 ----------
  load();
  // 이전 저장의 모든 조건 충족 개체도 시간 진행 없이 진화한다(배틀 횟수와 무관).
  const restoredEvolution = C.evaluateEvolutions(save, Math.random);
  save = restoredEvolution.save;
  restoredEvolution.events.forEach(logEvent);
  const board = createCageEditor(
    canvas,
    () => view,
    (message) => {
      if (message) log(message);
      render();
      persist();
    },
    toast,
    () => !!battle || !!hunt || mailOpen || dayEnding || !!window.evolutionScene?.busy,
  );
  // 손으로 디지몬을 움직이지 않고 누르고 있으면 쓰다듬는다 (원작 도움말 help #143, 효과는 원본 0x21185C0)
  // 누르고 있는 동안 지난 사육 분은 tickFarm이 세었으니, 뗄 때는 그 사이 시간이 흐르지 않은 짧은 터치만 1분으로 센다
  const petTicked = new Set();
  board.hitTest = pt=>petAt(pt)?.p; // 끌기·쓰다듬기·치료 도구가 같은 실제 몸 판정을 사용한다.
  board.onGrab = (uid) => { feeding.delete(uid); petTicked.clear(); }; // 프레임 사이에 빠르게 드롭해도 먼 먹이를 소비하지 않는다. 새로 누르면 쓰다듬은 시간 기록을 비운다
  const pettingNow = () => { const uid = board.pressingUid?.(); if (uid == null) return new Set(); petTicked.add(uid); return new Set([uid]); };
  board.onPet = (index) => {
    const p = view.team[index];
    const credit = !!p && !petTicked.has(p.uid);
    petTicked.clear();
    const r = p && C.pet(save, p.uid, Math.random, credit);
    if (!r) return;
    save = r.save;
    if (r.ok&&!C.isSleeping(digi(p.uid))) startCareFx('pet', p, true);
    else if(r.ok)toast(r.message);
    if (r.soothed) log(r.message);
    render();
    persist();
  };
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
  board.centerLayout();
  // 도구 줄은 원작처럼 사육장 화면 안 아래쪽에 겹쳐 둔다 (휠이 확대·축소라 화면 밖 버튼은 쓰기 불편하다)
  document.querySelector('.canvas-wrap').append($('#tray'));
  // 오른쪽 정보 패널은 탭으로 한 번에 한 묶음만 보여 준다 (세로 스크롤을 줄이려고)
  const aside = document.querySelector('aside');
  document.querySelectorAll('.side-tabs button').forEach((b) => {
    b.onclick = () => {
      aside.dataset.pane = b.dataset.pane;
      document.querySelectorAll('.side-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      aside.querySelector('.side-body').scrollTop = 0;
      if (b.dataset.pane === 'log') {
        const j = $('#journal');
        j.scrollTop = j.scrollHeight;
      }
    };
  });
  initFarmInput();
  tipMail('welcome', '디지몬 챔피언십에 참가하게 된 것을 환영합니다!\n디지에그가 곧 부화합니다. 고기를 선택한 뒤 바닥을 터치해 놓고, 똥은 눌러서 치워 주세요.\n23:59가 되면 하루가 끝납니다.');

  $('#training-info').onclick=()=>{if(!battle&&!hunt)trainingMenu();};
  document.querySelectorAll('[data-action]').forEach((b) => (b.onclick = () => act(b.dataset.action)));
  $('#partner-tabs').onclick = (e) => {
    const b = e.target.closest('[data-partner]');
    if (b) {
      view.selected = +b.dataset.partner;
      const p = view.team[view.selected];
      board.centerLayout();
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
  // 다음 날로: 남은 낮 시간을 1분씩 한꺼번에 처리하고(배고픔·진화·편지 등은 그대로 일어난다) 하루 마감을 연다
  $('#next-day').onclick = () => {
    if (battle || titleOpen || dayEnding || board.editing) return;
    if (hunt) endHunt('다음 날로 넘김');
    for (let i = 0; i < 2 * 1440 && !dayEnding; i++) {
      syncTeam();
      const dirtyCages = [...new Set(view.foods.filter((f) => f.kind === 'rotten' && f.cageId).map((f) => f.cageId))];
      const r = C.tickFarm(save, undefined, false, dirtyCages);
      save = r.save;
      r.events.forEach(logEvent);
      spoilFoods();
      checkSchedule();
    }
    clock = 0;
    render();
    persist();
  };
  $('#help').onclick = () =>
    showModal(
      '디지몬 챔피언십 웹판',
      `<ol>
        <li>디지에그에서 시작합니다. 현실10초마다 게임 시간이10분씩 바뀌며, 아침7시부터23:59까지가 하루입니다.23:59가 되면 달력을 보고 다음 날로 넘어갑니다.</li>
        <li>고기를 선택한 뒤 사육장 바닥을 터치하면 배치됩니다. 배고픈 디지몬은 훈련을 멈추고 걸어와 먹습니다. 알약(프로틴)도 바닥에 놓으면 디지몬이 먹고 다음 배틀에서 공격이 오릅니다(과식하면 부상 위험). 병은 약(주사기), 부상은 상처약을 선택한 뒤 디지몬을 터치해 치료합니다. 선택 / 이동 버튼이나 Esc로 도구를 해제합니다. 바닥의 똥과 남은 고기·상한 고기·알약은 빗자루로 클릭하거나 드래그해 함께 치웁니다. 치운 먹이는 재고로 돌아가지 않고 폐기됩니다.</li>
        <li>디지몬을 끌어 케이지에 넣으면 1시간마다 정해진 능력치와 종족·속성 수치가 오릅니다. 양호실은 피로와 부상을 회복합니다.</li>
        <li>진화는 자동입니다. 오른쪽 진화 조건표의 위에서부터 먼저 채운 쪽으로 진화하고, 아무것도 채우지 못하면 수명이 다할 때 ‘시간 경과’ 진화를 합니다.</li>
        <li>배고픔·똥 방치·썩은 고기는 병(페널티)이 됩니다. 병·부상을 이틀 방치하면 로스트됩니다(배틀을 10번 넘게 했거나 완전체 이상이면 디지에그로 다시 태어남).</li>
        <li>타이틀 매치(엔트리 07:00~15:00)에서 이기면 테이머 랭크가 올라 사육 용량, 케이지 공간, 진화 가능 세대가 늘어납니다. 첫 타이틀은 봄 3일 ‘에이스 오브 링’입니다.</li>
        <li>프리 배틀로 배틀 횟수와 비트를 모으고, 상점에서 고기·알약·약·상처약·케이지를 사세요.</li>
      </ol><p class="hint">비공식 비영리 팬게임입니다. 진행은 이 브라우저에 자동 저장되며, 창을 닫아 둔 동안에는 게임 시간이 멈춥니다. 사냥은 아직 웹판에 옮기지 않았습니다.</p>`,
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
    checkSchedule(); // 하루 마감·경기 안내는 이어하기를 누른 뒤에 띄운다
  }
  function startNewGame() {
    farmHealth?.clear();
    endHunt();
    evolutionScene.clear();
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
  canvas.addEventListener('pointercancel', (e) => huntPointer('cancel', e));
  canvas.addEventListener('wheel', (e) => { if (hunt) huntWheel(e); }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => { if (hunt) e.preventDefault(); });
  window.addEventListener('keydown', (e) => {
    if (!hunt || e.ctrlKey || e.metaKey || e.altKey || e.target?.closest?.('input,textarea,select') || $('#modal').open) return;
    if(/^[1-5]$/.test(e.key)){selectHuntGear(hunt.items[Number(e.key)-1]);e.preventDefault();return;}
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'w', 'a', 's', 'd'].includes(k)) { huntKeys.add(k); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => huntKeys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
  window.addEventListener('blur', () => huntKeys.clear());
  $('#tool-rope').onclick = () => setTool('rope');
  $('#tool-wire').onclick = () => setTool('wire');
  $('#tool-move').onclick = () => setTool('move');
  $('#tool-gear').onclick = () => setTool('gear');
  $('#gear-select').onchange = () => setTool('gear');
  $('#hunt-item-hud').onclick = e => {
    const button=e.target.closest('[data-hunt-gear]');
    if(button&&!button.disabled)selectHuntGear(button.dataset.huntGear);
  };
  $('#hunt-leave').onclick = () => endHunt();

  function frame(now) {
    if (titleOpen) drawTitleArt(now / 1000);
    if (selectedItem && farmInputBlocked()) clearItemTool();
    // 화면이 느려도 게임 시계는 실제 경과 시간을 따른다. 움직임만 큰 프레임 간격을 제한한다.
    const elapsed = lastTime ? Math.min(C.OFFLINE_CAP_MINUTES / MINUTES_PER_SECOND, Math.max(0, (now - lastTime) / 1000)) : 0;
    const dt = Math.min(0.05, elapsed);
    lastTime = now;
    if (!document.hidden) {
      if (battle) battleTick(dt);
      else if (!titleOpen && !paused && !board.editing && !mailOpen && !dayEnding && (!window.evolutionScene?.busy || !!hunt)) {
        if (hunt) huntTick(dt);
        clock += elapsed * speed * MINUTES_PER_SECOND;
        let changed = false;
        while (clock+1e-8 >= C.CLOCK_STEP_MINUTES && !dayEnding && (!window.evolutionScene?.busy || !!hunt)) {
          clock = Math.max(0,clock-C.CLOCK_STEP_MINUTES);
          for(let minute=0;minute<C.CLOCK_STEP_MINUTES&&!dayEnding;minute++){
          syncTeam();
          // 상한 먹이가 놓인 케이지에 오래 있으면 병 (help #139·#141)
          const dirtyCages = [...new Set(view.foods.filter((f) => f.kind === 'rotten' && f.cageId).map((f) => f.cageId))];
          const r = C.tickFarm(save, undefined, false, dirtyCages, pettingNow());
          save = r.save;
          r.events.forEach(logEvent);
          spoilFoods();
          changed = true;
          checkSchedule();
          }
        }
        if(dayEnding)clock=0;
        if (changed) {
          render();
          persist();
        }
      }
      if(window.evolutionScene?.busy&&!titleOpen&&!battle&&!hunt&&!mailOpen&&!dayEnding&&!board.editing&&!$('#modal').open)
        window.evolutionScene.update(paused?0:dt);
      if (hunt) drawHunt(now / 1000, !titleOpen && !paused && !board.editing && !mailOpen && !dayEnding ? dt : 0);
      else drawFarm(now / 1000, dt);
      drawPortrait(!titleOpen && !paused && !mailOpen && !dayEnding && !board.editing && !window.evolutionScene?.busy ? dt : 0);
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
    get board() {
      return board;
    },
    get save() {
      return save;
    },
    get view() {
      return view;
    },
    get hunt() {
      return hunt;
    },
    get debugState() {
      return { titleOpen, paused, mailOpen, dayEnding, editing: board.editing, speed, clock, battle: !!battle };
    },
  };
  render();
  // 저장된 밤에는 첫 tick 전에 달력을 연다. 재접속으로 야간 훈련이 발생하지 않는다.
  checkSchedule();
  persist();
  requestAnimationFrame(frame);
})();
