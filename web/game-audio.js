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
  let context, master, noise, opening;

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
        update();
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

  function play(name) {
    const layers = sounds[name];
    if (!layers || !preferences.enabled || preferences.volume === 0 || document.hidden) return;
    if (opening) { opening.then(() => { if (context?.state === 'running') play(name); }); return; }
    if (!master || context?.state !== 'running') return;
    const now = context.currentTime;
    // 3:3 동시 명중과 일괄 시간 진행에서 같은 효과음이 겹쳐 커지지 않게 한다.
    if (now - (lastPlayed.get(name) ?? -Infinity) < .085) return;
    lastPlayed.set(name, now);
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
  root.ChampSound = { play };
})(window);
