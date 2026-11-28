'use strict';

(function (root) {
  // 웹판용 효과음. 주파수는 Hz, 길이와 오프셋은 초다.
  const sounds = {
    menu: [['sine', 580, 850, .075, .18]],
    start: [['triangle', 392, 392, .14, .25], ['triangle', 587, 587, .20, .24, .09]],
    feed: [['triangle', 430, 240, .075, .26], ['noise', 1200, 620, .065, .15]],
    clean: [['noise', 850, 2600, .19, .16], ['sine', 810, 1120, .10, .17, .10]],
    care: [['sine', 523, 523, .13, .20], ['triangle', 784, 784, .20, .21, .09]],
    hatch: [['noise', 1700, 3100, .10, .14], ['triangle', 523, 784, .21, .22, .06]],
    evolution: [['triangle', 392, 392, .19, .20], ['triangle', 494, 494, .20, .20, .10],
      ['triangle', 659, 659, .22, .20, .20], ['sine', 988, 988, .40, .24, .29]],
    rope: [['noise', 1200, 330, .14, .21], ['triangle', 380, 205, .12, .19]],
    snap: [['noise', 2750, 550, .11, .30], ['square', 218, 106, .08, .11]],
    shot: [['noise', 2700, 730, .12, .30], ['triangle', 260, 105, .10, .23]],
    capture: [['triangle', 440, 440, .14, .20], ['triangle', 554, 554, .16, .20, .075], ['sine', 831, 831, .27, .24, .15]],
    cast: [['triangle', 300, 1030, .23, .20], ['noise', 530, 2200, .16, .09]],
    hit: [['triangle', 148, 52, .135, .28], ['noise', 1560, 340, .115, .23]],
    critical: [['triangle', 216, 49, .21, .33], ['noise', 2540, 410, .17, .27]],
    guard: [['triangle', 1030, 680, .13, .22], ['sine', 1560, 1120, .10, .14]],
    win: [['triangle', 392, 392, .17, .22], ['triangle', 587, 587, .24, .22, .11]],
    medal: [['triangle', 392, 392, .17, .20], ['triangle', 587, 587, .20, .19, .11],
      ['sine', 784, 784, .33, .23, .46], ['sine', 1175, 1175, .28, .12, .46]],
    lose: [['triangle', 392, 349, .16, .18], ['triangle', 294, 220, .29, .22, .12]],
  };
  // 원작 이름이 다른 변형은 음원이 없을 때 같은 합성음을 쓴다.
  sounds.feedLarge = sounds.feed;
  sounds.protein = sounds.feed;
  sounds.spread = sounds.shot;
  sounds.buy = sounds.menu;
  sounds.cancel = [['sine', 620, 420, .07, .15]];
  // 원작 대응표(sound-cues.js)와 음원 목록(assets/audio/manifest.js). 음원이 있으면 합성음 대신 재생한다.
  const cues = root.ORIGINAL_SOUND_CUES || {};
  // 항목은 'assets/audio/x.mp3' 문자열 또는 { src, dur, loop: [시작초, 끝초] } (tools/convert_sound_wav.py)
  const files = () => root.ORIGINAL_SOUND_FILES || {};
  const hasFile = (name) => !!(name && files()[name]);
  const infoOf = (name) => { const e = files()[name]; return typeof e === 'string' ? { src: e } : e || null; };
  const key = 'champion-sound-v1';
  const Audio = root.AudioContext || root.webkitAudioContext;
  let preferences = { enabled: true, volume: .4 };
  try {
    const saved = JSON.parse(root.localStorage.getItem(key));
    if (typeof saved?.enabled === 'boolean') preferences.enabled = saved.enabled;
    if (Number.isFinite(saved?.volume)) preferences.volume = Math.max(0, Math.min(1, saved.volume));
  } catch {} // 저장이 차단돼도 현재 페이지의 설정은 사용할 수 있다.

  const document = root.document;
  const toggles = [...document.querySelectorAll('[data-sound-toggle]')];
  const volume = document.querySelector('#sound-volume');
  const lastPlayed = new Map();
  let context, master, noise, opening, ambience;
  let huntField = null, huntNight = false, huntPaused = false;
  const buffers = new Map();
  let music = null, musicName = null, sceneMusic = null, menuMusic = null, baseMusic = null;
  const loops = new Map(), loopWanted = new Set();

  function buffer(name) {
    if (!hasFile(name) || !context) return null;
    if (!buffers.has(name)) buffers.set(name, fetch(infoOf(name).src).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status))).then((b) => context.decodeAudioData(b)).catch(() => null));
    return buffers.get(name);
  }
  // 원작 음원 하나를 master로 재생한다. 손잡이(stop)를 돌려주며, 읽기 전에 멈추면 재생하지 않는다.
  // loop=true: 원작 반복 구간이 있으면 그 구간을, 길이 정보만 있으면(반복 없는 곡·징글) 한 번만, 문자열 항목이면 파일 전체를 반복한다.
  // place: { volume 0~127(원작 플레이어 음량), pan −128~127(원작 트랙 좌우, 중앙 64에 더함) } — 사냥 위치 효과음
  function gainOf(volume) {
    const table = cues.decibel, v = Math.max(0, Math.min(127, Math.round(volume)));
    return table ? Math.pow(10, table[v] / 200) : (v / 127) ** 2;
  }
  function playFile(name, loop = false, place = null) {
    const pending = buffer(name);
    if (!pending) return null;
    const info = infoOf(name);
    const handle = { stopped: false, source: null, stop() { this.stopped = true; try { this.source?.stop(); } catch {} } };
    pending.then((data) => {
      if (!data || handle.stopped || context.state !== 'running') return;
      const source = context.createBufferSource();
      source.buffer = data;
      if (loop && info.loop) {
        // MP3 앞 공백을 디코더가 지우지 않은 브라우저면(길이가 원본보다 길다) 그만큼 반복 지점을 민다. LAME 기본 지연 1105표본(32 kHz)
        const extra = Number.isFinite(info.dur) ? data.duration - info.dur : 0;
        const lead = extra > .02 ? Math.min(extra, 1105 / 32000) : 0;
        source.loop = true;
        source.loopStart = info.loop[0] + lead;
        source.loopEnd = Math.min(info.loop[1] + lead, data.duration);
      } else source.loop = loop && !Number.isFinite(info.dur);
      let out = source;
      if (place) {
        const gain = context.createGain();
        gain.gain.value = gainOf(place.volume ?? 127);
        out.connect(gain); out = gain;
        if (place.pan && context.createStereoPanner) {
          const panner = context.createStereoPanner();
          panner.pan.value = Math.max(-1, Math.min(1, place.pan / 64));
          out.connect(panner); out = panner;
        }
      }
      out.connect(master);
      source.onended = () => { source.disconnect(); if (out !== source) out.disconnect(); };
      source.start();
      handle.source = source;
    });
    return handle;
  }
  // 배경곡 우선순위: 장면(배틀·결과) → 메뉴 창(상점·도감·사냥터 선택·배틀 접수) → 사냥터 곡 → 기본 화면(육성·타이틀).
  // 사냥 중에는 기본 화면 곡을 틀지 않는다(사냥터 곡 음원이 없으면 합성 환경음). 음원이 없으면 아무것도 틀지 않는다.
  function syncMusic() {
    const running = context?.state === 'running' && preferences.enabled;
    const field = cues.huntBgm?.[huntField];
    const want = running ? (sceneMusic ?? menuMusic ?? (huntField ? (hasFile(field) ? field : null) : baseMusic)) : null;
    const name = hasFile(want) ? want : null;
    if (name === musicName) return;
    music?.stop();
    music = name ? playFile(name, true) : null;
    musicName = name;
  }
  function setMusic(name) {
    sceneMusic = name || null;
    syncMusic();
  }
  function setMenu(name) {
    if ((name || null) === menuMusic) return;
    menuMusic = name || null;
    syncMusic();
  }
  function setBase(name) {
    if ((name || null) === baseMusic) return;
    baseMusic = name || null;
    syncMusic();
  }
  function syncLoops() {
    const running = context?.state === 'running' && preferences.enabled;
    for (const [key, handle] of loops) if (!running || !loopWanted.has(key)) { handle.stop(); loops.delete(key); }
    if (running) for (const key of loopWanted) if (!loops.has(key)) { const h = playFile(cues.loops?.[key], true); if (h) loops.set(key, h); }
  }
  // 반복음(사냥 선 긋기 등)을 켜고 끈다. 음원이 없으면 소리 없음
  function setLoop(key, on) {
    if (on === loopWanted.has(key)) return;
    if (on) loopWanted.add(key); else loopWanted.delete(key);
    syncLoops();
  }

  function syncHunt() {
    if (context?.state !== 'running' || !master) return;
    syncMusic();
    syncLoops();
    // 사냥터 원작 배경곡 음원이 있으면 웹판 합성 환경음 대신 그 곡을 쓴다.
    const replaced = hasFile(cues.huntBgm?.[huntField]);
    const field = preferences.enabled && preferences.volume > 0 && !document.hidden && !replaced && !huntPaused ? huntField : null;
    if (field && !ambience) ambience = root.createHuntAmbience?.(context, master);
    ambience?.set(field, huntNight);
  }

  // paused: 메일·일시정지 등으로 사냥이 멈춘 동안. 합성 환경음만 멈추고 사냥터 곡은 유지한다(육성 곡으로 바뀌지 않게).
  function setHunt(field, night = false, paused = false) {
    if (field === huntField && night === huntNight && paused === huntPaused) return;
    huntField = field;
    huntNight = night;
    huntPaused = paused;
    syncHunt();
  }

  function update() {
    for (const toggle of toggles) {
      toggle.disabled = !Audio;
      toggle.textContent = preferences.enabled ? '소리 켜짐' : '소리 꺼짐';
      toggle.setAttribute('aria-pressed', String(preferences.enabled));
    }
    if (volume) {
      volume.disabled = !Audio;
      volume.value = String(Math.round(preferences.volume * 100));
    }
    if (master) {
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setTargetAtTime(preferences.enabled && !document.hidden ? preferences.volume : 0, context.currentTime, .012);
    }
    syncHunt();
  }

  function save() {
    try { root.localStorage.setItem(key, JSON.stringify(preferences)); } catch {}
    update();
  }

  function unlock() {
    if (!Audio || !preferences.enabled || document.hidden || opening) return;
    try {
      // 브라우저가 허용하는 실제 사용자 조작에서만 오디오 출력을 연다.
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = 0;
        master.connect(context.destination);
        context.addEventListener('statechange', syncHunt);
        update();
        // 짧은 효과음·징글(배경곡 SEQ_ 제외, 합쳐 약 1.3 MB)은 처음 울릴 때 늦지 않게 미리 읽는다.
        const short = Object.keys(files()).filter((n) => !n.startsWith('SEQ_'));
        if (root.setTimeout) short.forEach((n, i) => root.setTimeout(() => buffer(n), 200 + i * 15));
      }
      if (context.state !== 'running') {
        opening = Promise.resolve(context.resume()).catch(() => {}).finally(() => { opening = null; });
      }
    } catch {}
  }

  function noiseSource(from, to, duration, start) {
    if (!noise) {
      noise = context.createBuffer(1, Math.ceil(context.sampleRate * .25), context.sampleRate);
      const samples = noise.getChannelData(0);
      // 효과음의 잡음은 별도 시드로 만든다. 게임 판정의 난수와 무관하다.
      let seed = 0x583127;
      for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        samples[i] = seed / 0x80000000 - 1;
      }
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    source.buffer = noise;
    filter.type = 'bandpass';
    filter.Q.value = .72;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + duration);
    source.connect(filter);
    return { source, output: filter };
  }

  // 배틀 기술 레코드별 원작 효과음 (assets/battle/skill-sounds.js, tools/extract_battle_sounds.py)
  function originalOf(name, detail) {
    const skill = root.BATTLE_SKILL_SOUNDS || {}, record = detail?.record;
    if (record != null && (name === 'hit' || name === 'critical') && skill.hit?.[record]) return skill.hit[record];
    if (record != null && name === 'cast' && skill.cast?.[record]) return skill.cast[record];
    if (name === 'guard' && skill.guard) return skill.guard;
    if (name === 'footstep') return detail?.sound;
    return cues.effects?.[name];
  }

  function play(name, detail) {
    const original = originalOf(name, detail);
    const layers = sounds[name];
    if ((!layers && !hasFile(original)) || !preferences.enabled || preferences.volume === 0 || document.hidden) return;
    if (opening) { opening.then(() => { if (context?.state === 'running') play(name, detail); }); return; }
    if (!master || context?.state !== 'running') return;
    const now = context.currentTime;
    // 위치 효과음(사냥의 폭발·발소리)은 물체마다 울리므로 겹침 방지를 하지 않는다. 음량 0이면 안 낸다.
    const place = detail?.volume != null ? { volume: detail.volume, pan: detail.pan ?? 0 } : null;
    if (place && place.volume <= 0) return;
    // 3:3 동시 명중과 일괄 시간 진행에서 같은 효과음이 겹쳐 커지지 않게 한다.
    if (!place && now - (lastPlayed.get(name) ?? -Infinity) < .085) return;
    lastPlayed.set(name, now);
    if (hasFile(original)) { playFile(original, false, place); return; }
    for (const [wave, from, to, duration, level, offset = 0] of layers) {
      const start = now + .008 + offset;
      let source, output;
      if (wave === 'noise') {
        ({ source, output } = noiseSource(from, to, duration, start));
      } else {
        source = output = context.createOscillator();
        source.type = wave;
        source.frequency.setValueAtTime(from, start);
        source.frequency.exponentialRampToValueAtTime(to, start + duration);
      }
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(.0001, start);
      envelope.gain.exponentialRampToValueAtTime(level, start + .012);
      envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
      output.connect(envelope);
      envelope.connect(master);
      source.onended = () => { source.disconnect(); if (output !== source) output.disconnect(); envelope.disconnect(); };
      source.start(start);
      source.stop(start + duration);
    }
  }

  for (const toggle of toggles) toggle.addEventListener('click', () => {
    preferences.enabled = !preferences.enabled;
    save();
    if (preferences.enabled) { unlock(); play('menu'); }
  });
  volume?.addEventListener('input', () => { preferences.volume = Number(volume.value) / 100; save(); });
  volume?.addEventListener('change', () => play('menu'));
  for (const event of ['pointerdown', 'pointerup', 'keydown']) document.addEventListener(event, unlock, true);
  document.addEventListener('visibilitychange', update);
  update();
  // 곡을 끄기만 하는 자리표시(음원 목록에 없는 이름이라 아무것도 틀지 않는다)
  const SILENCE = '(silence)';
  root.ChampSound = { play, setHunt, setMusic, setMenu, setBase, setLoop, cues, hasFile, SILENCE };
})(window);
