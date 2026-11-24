'use strict';

(function (root) {
  // 원작 기술 레코드의 속도·발사 위치·배율과 비행/도착 NANR 번호(0부터 시작).
  const throws = [
    [346, 'cherrybomb', 2.5, [16, -10, 2], 1, 2],
    [385, 'bitbomb', 3.5, [16, -10, 1], 1, 2],
    [88, 'rock', 2.5, [16, -16, 1], 1, 2],
    [310, 'icerock', 2.5, [16, -16, 1], 1, 2],
    [391, 'hart', 2.5, [16, -10, 1], 1, 2],
    [425, 'hart', 2.5, [16, -10, 1], 1, 2],
    [552, 'banana', 2.5, [5, -24, 1], 0, 1],
  ];
  const signatures = {ncer: 'RECN', ncbr: 'RGCN', nclr: 'RLCN', nanr: 'RNAN'};
  const storageKey = 'champion-battle-lob-files-v1';
  const sourceNames = [...new Set(throws.map(([, key]) => key))]
    .flatMap(key => Object.keys(signatures).map(ext => `e003_${key}00.${ext}`));
  const width = 96, height = 80;
  let current;
  let saved = false;

  const sizes = [
    [[8,8],[16,16],[32,32],[64,64]],
    [[16,8],[32,8],[32,16],[64,32]],
    [[8,16],[8,32],[16,32],[32,64]],
  ];

  function readSequence(animation, sequence) {
    if (sequence >= animation.getUint16(24, true)) throw new RangeError('Missing effect sequence');
    const entry = 24 + animation.getUint32(28, true) + sequence * 16;
    const count = animation.getUint16(entry, true);
    const start = animation.getUint16(entry + 2, true);
    const mode = animation.getUint32(entry + 8, true);
    if (count === 0 || count > 32 || start >= count || ![1, 2].includes(mode)
      || animation.getUint32(entry + 4, true) !== 0x10000) throw new Error('Invalid effect sequence');
    const framesOffset = 24 + animation.getUint32(32, true) + animation.getUint32(entry + 12, true);
    const cellsOffset = 24 + animation.getUint32(36, true);
    const frames = [];
    let loopStart = 0;
    for (let index = 0; index < count; index++) {
      const offset = framesOffset + index * 8;
      const ticks = animation.getUint16(offset + 4, true);
      if (!ticks) continue;
      const cell = animation.getUint16(cellsOffset + animation.getUint32(offset, true), true);
      frames.push([cell, ticks]);
      if (index < start) loopStart++;
    }
    if (frames.length <= loopStart) throw new Error('Empty effect sequence');
    return {frames, start: loopStart, loop: mode === 2};
  }

  function paintCell(ctx, {ncer, ncbr, nclr}, cell) {
    const {width, height} = ctx.canvas;
    const pixels = ctx.createImageData(width, height);
    const bank = 24 + ncer.getUint32(28, true);
    const stride = ncer.getUint16(26, true) ? 16 : 8;
    const entry = bank + cell * stride;
    const objects = bank + ncer.getUint16(24, true) * stride + ncer.getUint32(entry + 4, true);
    const mapping = ncer.getUint32(32, true);
    const transfer = ncer.getUint32(36, true);
    const tileBase = transfer ? ncer.getUint32(32 + transfer + cell * 8, true) : 0;
    const eightBit = ncbr.getUint32(28, true) === 4;
    for (let object = ncer.getUint16(entry, true) - 1; object >= 0; object--) {
      const offset = objects + object * 6;
      const a = ncer.getUint16(offset, true);
      const b = ncer.getUint16(offset + 2, true);
      const d = ncer.getUint16(offset + 4, true);
      if ((a >>> 14) === 3) continue;
      const [w, h] = sizes[a >>> 14][b >>> 14];
      const x = ((b & 255) - (b & 256)) + width / 2;
      const y = ((a & 127) - (a & 128)) + height / 2;
      const start = 48 + tileBase + (d & 1023) * (32 << mapping);
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          if (x + px < 0 || x + px >= width || y + py < 0 || y + py >= height) {
            throw new RangeError('Cell exceeds the effect canvas');
          }
          const sx = b & 4096 ? w - 1 - px : px;
          const sy = b & 8192 ? h - 1 - py : py;
          const pixel = sy * w + sx;
          const value = ncbr.getUint8(start + (eightBit ? pixel : pixel >> 1));
          const index = eightBit ? value : (value >> ((pixel & 1) * 4)) & 15;
          if (!index) continue;
          const paletteIndex = eightBit ? index : (d >>> 12) * 16 + index;
          const color = nclr.getUint16(40 + paletteIndex * 2, true);
          for (let shift = 0; shift < 3; shift++) {
            pixels.data[((y + py) * width + x + px) * 4 + shift] =
              Math.floor(((color >>> (shift * 5)) & 31) * 255 / 31);
          }
          pixels.data[((y + py) * width + x + px) * 4 + 3] = 255;
        }
      }
    }
    return pixels;
  }

  function readBank(files, key, sequenceIds) {
    const stem = 'e003_' + key + '00';
    const data = Object.fromEntries(Object.entries(signatures).map(([ext, signature]) => {
      const name = stem + '.' + ext;
      const bytes = files[name];
      if (!bytes) throw new Error(name + ' 파일이 없습니다.');
      if (bytes.length < 40 || bytes.length > 65536) throw new Error(name + ' 파일 크기가 올바르지 않습니다.');
      const header = String.fromCharCode(...bytes.subarray(0, 4));
      if (header !== signature) throw new Error(name + ' 파일 형식이 올바르지 않습니다.');
      return [ext, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)];
    }));
    const sequences = Object.fromEntries(sequenceIds.map(id => [id, readSequence(data.nanr, id)]));
    const indices = [...new Set(Object.values(sequences).flatMap(sequence => sequence.frames.map(([id]) => id)))];
    const image = document.createElement('canvas');
    image.width = width * indices.length;
    image.height = height;
    const ctx = image.getContext('2d');
    // 셀은 브라우저 메모리에서만 조합하고 NCER 원점을 유지한다.
    const cellContext = {canvas: {width, height}, createImageData: (w, h) => ctx.createImageData(w, h)};
    const cells = Object.fromEntries(indices.map((id, index) => {
      if (id >= data.ncer.getUint16(24, true)) throw new RangeError('Missing effect cell');
      const x = index * width;
      ctx.putImageData(paintCell(cellContext, data, id), x, 0);
      return [id, {x, y: 0, w: width, h: height, left: -width / 2, top: -height / 2}];
    }));
    return {image, sequences, cells};
  }

  function apply(files) {
    const banks = {};
    const records = {};
    for (const [record, key, speed, flightOffset, flight, finish] of throws) {
      banks[key] ??= readBank(files, key, [flight, finish]);
      records[record] = {
        kind: 'lob', speed, flightOffset, flight: [key, flight], finish: [key, finish],
        impact: root.BATTLE_SKILL_EFFECTS.records[record].impact,
      };
    }
    current = {banks, records};
  }

  async function load(input) {
    const files = new Map(Array.from(input, file => [file.name.toLowerCase(), file]));
    const bytes = Object.fromEntries(await Promise.all(sourceNames.map(async name => {
      const file = files.get(name);
      if (!file) throw new Error(name + ' 파일이 없습니다.');
      if (file.size < 40 || file.size > 65536) throw new Error(name + ' 파일 크기가 올바르지 않습니다.');
      return [name, new Uint8Array(await file.arrayBuffer())];
    })));
    apply(bytes);
    // 선택한 24개 파일만 게임 저장과 별도의 브라우저 저장소에 기록한다.
    saved = false;
    try {
      const encoded = Object.fromEntries(sourceNames.map(name =>
        [name, btoa(Array.from(bytes[name], byte => String.fromCharCode(byte)).join(''))]));
      localStorage.setItem(storageKey, JSON.stringify(encoded));
      saved = true;
    } catch {
      // 저장이 차단된 브라우저에서도 이번 탭에서는 표시할 수 있다.
    }
    return throws.length;
  }

  // 첫 배틀을 열기 전에 복원해 입장 시점과 관계없이 같은 효과를 사용한다.
  try {
    const encoded = JSON.parse(localStorage.getItem(storageKey));
    if (encoded) {
      const bytes = Object.fromEntries(sourceNames.map(name =>
        [name, Uint8Array.from(atob(encoded[name]), character => character.charCodeAt(0))]));
      apply(bytes);
      saved = true;
    }
  } catch {
    // 읽을 수 없는 저장에서는 일반 전투 효과로 시작한다.
  }
  root.BattleLocalLobs = {load, get current() { return current; }, get saved() { return saved; }};
})(window);
