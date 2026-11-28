'use strict';

(function (root) {
  // 각 장소의 환경음은 웹판용 합성이다. 배경 잡음 대역과 그 위에 들리는 소리를 따로 정한다.
  // 배경 [저역 Hz, 고역 Hz, 소리 크기, 반복 초], 포인트 [시작 초, 길이 초, 시작 Hz, 끝 Hz, 크기, 종류]
  const fields = {
    '다이나 초원': { bed:[390,1840,.24,4.5], accents:[[.7,.14,1590,2440,.10,'bird'],[1.03,.18,2000,1430,.09,'bird'],[7.7,.21,1680,2600,.085,'bird']] },
    '대초원': { bed:[230,1050,.36,6.3], accents:[[2.5,1.45,320,148,.055,'wind'],[8.5,.57,740,515,.046,'bird']] },
    '모쥬라의 숲': { bed:[300,1400,.27,4], accents:[[.8,.21,870,1260,.13,'bird'],[1.1,.20,1260,950,.10,'bird'],[5.4,.37,1050,700,.10,'bird'],[9,.65,420,960,.09,'wind']] },
    '부츠 정글': { bed:[810,3650,.24,2.7], accents:[[.3,.95,2000,3350,.075,'insect'],[2.6,.33,520,930,.105,'bird'],[3,.23,970,590,.098,'bird'],[6.7,1.5,2980,1860,.09,'insect']] },
    '미끌미끌 늪': { bed:[83,390,.39,4.2], accents:[[.7,.31,180,96,.13,'frog'],[1.11,.3,152,88,.10,'frog'],[4.9,.25,98,270,.10,'bird'],[7.9,.52,106,70,.09,'frog']] },
    '파도치는 해변': { bed:[82,1950,.58,3.25], accents:[[.2,2.6,340,1700,.32,'wind'],[3.55,2.55,660,1350,.25,'wind'],[6.7,2.8,280,1720,.33,'wind'],[10,.45,1750,920,.065,'bird']] },
    '암반 계곡': { bed:[540,3180,.24,3.8], accents:[[.32,1.1,1840,940,.10,'wind'],[4.1,.20,190,73,.08,'drip'],[6.6,.34,430,251,.10,'drip'],[6.99,.41,430,251,.037,'drip']] },
    '크롬 광산': { bed:[48,270,.28,7.8], accents:[[.25,.85,1140,610,.10,'metal'],[1,.68,1140,610,.032,'metal'],[5.2,.47,690,360,.085,'metal'],[9.25,.9,890,560,.091,'metal']] },
    '기계 공장': { bed:[113,610,.31,.8], accents:[[.08,1.06,105,103,.10,'metal'],[1.9,.26,265,167,.105,'metal'],[3.5,.86,135,120,.10,'metal'],[5.3,.19,490,260,.09,'metal'],[7.2,.82,105,92,.10,'metal'],[9,.58,204,166,.10,'metal']] },
    '하수도': { bed:[190,700,.28,6.1], accents:[[.54,.64,850,220,.10,'drip'],[.94,.38,850,250,.035,'drip'],[3.2,.43,520,180,.10,'drip'],[7.4,.72,921,270,.087,'drip'],[9.2,1.2,350,680,.12,'wind']] },
    '눈의 왕국': { bed:[900,2700,.24,5.3], accents:[[.6,.64,1760,1318,.053,'metal'],[1.03,.85,2348,2120,.046,'metal'],[7.2,1.8,2400,840,.18,'wind'],[9.5,.59,1568,1320,.043,'metal']] },
    '바위산': { bed:[225,1250,.47,4.0], accents:[[1.2,2.1,660,225,.24,'wind'],[5.9,.20,330,89,.12,'drip'],[7.7,2.3,1200,400,.21,'wind']] },
    '용암지대': { bed:[29,235,.57,2.6], accents:[[.6,1.34,67,32,.16,'frog'],[2.7,.26,520,190,.11,'wind'],[5.2,.6,93,41,.16,'frog'],[7.6,1.9,350,75,.20,'wind']] },
    '이글이글 사막': { bed:[285,1050,.32,6.6], accents:[[1.3,2,1380,410,.21,'wind'],[4.9,.83,3700,2140,.14,'wind'],[7.9,.73,2610,1530,.11,'wind'],[9.1,1.85,720,260,.18,'wind']] },
    '오아시스': { bed:[590,2530,.26,4.1], accents:[[.6,.22,1260,594,.10,'drip'],[1.2,.14,1920,1320,.085,'drip'],[3.9,.22,1250,1810,.10,'bird'],[4.13,.26,1640,1240,.09,'bird'],[8.9,1.55,1020,1540,.13,'wind']] },
    '잉카 유적': { bed:[120,870,.27,5.7], accents:[[.55,.54,293,300,.13,'metal'],[1.1,.51,293,298,.041,'metal'],[3.48,.89,439,444,.10,'metal'],[6.8,1.35,980,350,.13,'wind'],[9.1,.72,196,199,.13,'metal']] },
  };

  const sampleRate = 16000;
  const tau = Math.PI * 2;

  function synthesize(context, field, night) {
    const seconds = 12;
    const buffer = context.createBuffer(1, seconds * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);
    const [low, high, strength, period] = field.bed;
    const smoothing = hz => 1 - Math.exp(-tau * hz / sampleRate);
    const slow = smoothing(low);
    const fast = smoothing(high * (night ? .63 : 1));
    let seed = 0x32f15a1;
    let lowNoise = 0, highNoise = 0;
    function nextNoise() {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x80000000 - 1;
    }
    for (let i = 0; i < data.length; i++) {
      const noise = nextNoise();
      lowNoise += (noise - lowNoise) * slow;
      highNoise += (noise - highNoise) * fast;
      const t = i / sampleRate;
      const edge = Math.min(1, t / .2, (seconds - t) / .2);
      const swell = .53 + .26 * Math.sin(tau * t / period) + .12 * Math.sin(tau * t / (period * .37));
      data[i] = (highNoise - lowNoise) * strength * swell * edge;
    }

    for (const [when, duration, from, to, level, daytimeType] of field.accents) {
      const type = night && daytimeType === 'bird' ? 'insect' : daytimeType;
      const start = Math.floor((when + (night ? .16 : 0)) * sampleRate);
      const length = Math.min(Math.floor(duration * sampleRate), data.length - start);
      let phase = 0, wind = 0;
      for (let j = 0; j < length; j++) {
        const p = j / length;
        const t = j / sampleRate;
        const hz = (from + (to - from) * p) * (night && type !== 'insect' ? .81 : 1);
        phase += tau * hz / sampleRate;
        const fade = Math.sin(Math.PI * p);
        let sample;
        switch (type) {
          case 'wind':
            wind += (nextNoise() - wind) * smoothing(hz);
            sample = wind * fade;
            break;
          case 'metal':
            sample = (Math.sin(phase) * .63 + Math.sin(phase * 2.78) * .24 + Math.sin(phase * 4.11) * .13) * Math.exp(-3.8 * p);
            break;
          case 'frog':
            sample = Math.sin(phase + 1.7 * Math.sin(phase * 2)) * (.55 + .45 * Math.cos(tau * t * 21));
            break;
          case 'insect':
            sample = Math.sin(phase) * Math.pow(Math.max(0, Math.sin(tau * t * (night ? 18 : 11))), 4);
            break;
          case 'drip':
            sample = (Math.sin(phase) + .22 * Math.sin(phase * 2)) * Math.exp(-6 * p);
            break;
          default: // 새소리는 미세한 떨림을 넣는다.
            sample = Math.sin(phase + .61 * Math.sin(tau * t * 13));
        }
        data[start + j] += sample * level * fade * (night ? .76 : 1);
      }
    }
    return buffer;
  }

  root.createHuntAmbience = function (context, destination) {
    const buffers = new Map();
    let playing;
    function set(fieldName, night = false) {
      const field = fields[fieldName];
      const key = field && fieldName + (night ? ':night' : ':day');
      if (playing?.key === key) return;
      const now = context.currentTime;
      if (playing) {
        const { source, gain, fadeIn } = playing;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(.7 * Math.min(1, (now - fadeIn) / .18), now);
        gain.gain.linearRampToValueAtTime(0, now + .18);
        source.stop(now + .20);
        playing = undefined;
      }
      if (!field) return;
      let buffer = buffers.get(key);
      if (!buffer) {
        buffer = synthesize(context, field, night);
        if (buffers.size >= 4) buffers.delete(buffers.keys().next().value);
        buffers.set(key, buffer);
      }
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(.7, now + .18);
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      gain.connect(destination);
      source.onended = () => { source.disconnect(); gain.disconnect(); };
      source.start(now);
      playing = { key, source, gain, fadeIn: now };
    }
    return { set };
  };
})(window);
