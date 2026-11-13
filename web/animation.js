'use strict';
// 원본 NANR의 유지 시간을 사용한다. 상태 전환 시 0부터 시작하고 일시정지는 dt=0으로 유지한다.
(function(root) {
  function create(data) {
    const actors = new WeakMap();
    const movementActors = new WeakMap();
    function sequence(id, state) {
      return data.banks[data.sprites[id]]?.[data.states[state]] || { frames: [[0, 1]], loop: true, start: 0 };
    }
    function duration(id, state) {
      return sequence(id, state).frames.reduce((n, f) => n + f[1], 0) / data.tickRate;
    }
    function sample(id, state, elapsed) {
      const seq = sequence(id, state), total = duration(id, state) * data.tickRate;
      let tick = Math.max(0, elapsed) * data.tickRate;
      if (tick >= total) {
        if (!seq.loop) return seq.frames[seq.frames.length - 1][0];
        const intro = seq.frames.slice(0, seq.start).reduce((n, f) => n + f[1], 0);
        tick = intro + (tick - total) % (total - intro);
      }
      for (const [cell, hold] of seq.frames) { if (tick < hold) return cell; tick -= hold; }
      return seq.frames[seq.frames.length - 1][0];
    }
    function pose(actor, id, state, dt) {
      let a = actors.get(actor);
      if (!a || a.id !== id || a.state !== state) { a = { id, state, elapsed: 0 }; actors.set(actor, a); }
      else a.elapsed += Math.max(0, dt);
      return sample(id, state, a.elapsed);
    }
    // 속도 예정값 대신 실제 변위를 사용한다. 로프·벽에 막혔거나 수직으로만
    // 움직일 때 방향이 튀지 않도록 마지막 수평 방향을 기억한다(원본은 왼쪽).
    function movement(actor, id, dx, dy, dt, stopped = false) {
      let m = movementActors.get(actor);
      if (!m || m.id !== id) {
        m = {id, state: 'idle', flip: false};
        movementActors.set(actor, m);
      }
      // 정지 중에는 상태와 프레임 모두 유지한다.
      if (dt > 0) {
        m.state = !stopped && Math.hypot(dx, dy) > 0.0001 ? 'walk' : 'idle';
        if (!stopped && Math.abs(dx) > 0.0001) m.flip = dx > 0;
      }
      return {state: m.state, flip: m.flip, frame: pose(actor, id, m.state, dt)};
    }
    return { duration, sample, pose, movement };
  }
  root.createAnimationPlayer = create;
  if (typeof module !== 'undefined') module.exports = { createAnimationPlayer: create };
})(typeof window !== 'undefined' ? window : globalThis);
