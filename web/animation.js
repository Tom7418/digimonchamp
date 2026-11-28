'use strict';
// 원본 NANR의 유지 시간을 사용한다. 상태 전환 시 0부터 시작하고 일시정지는 dt=0으로 유지한다.
(function(root) {
  function create(data) {
    const actors = new WeakMap();
    const movementActors = new WeakMap();
    function sequence(id, state) {
      return data.banks[data.sprites[id]]?.[data.states[state]] || { frames: [[0, 1]], loop: true, start: 0 };
    }
    // 원본 스킬은 첫 NANR 프레임이 준비, 그 다음부터 발사 동작이다.
    // 복합 공격의 나머지 프레임은 임의로 잘라내지 않는다.
    function windup(id,state) {
      const seq=sequence(id,state);
      return seq.frames.length>1?seq.frames[0][1]/data.tickRate:0;
    }
    function castExtension(id,state,holdUntil) {
      const frames=sequence(id,state).frames;
      const activeEnd=frames.slice(0,2).reduce((n,f)=>n+f[1],0)/data.tickRate;
      return frames.length>1?Math.max(0,holdUntil-activeEnd):0;
    }
    function castDuration(id,state,holdUntil=0) {
      return duration(id,state)+castExtension(id,state,holdUntil);
    }
    function sampleCast(id,state,elapsed,holdUntil=0) {
      const frames=sequence(id,state).frames;
      const activeEnd=frames.slice(0,2).reduce((n,f)=>n+f[1],0)/data.tickRate;
      const extension=castExtension(id,state,holdUntil);
      // 빔이 길면 발사 프레임을 늘리고, 복귀 프레임은 빔 종료 뒤 원래 순서대로 재생한다.
      const played=elapsed<activeEnd?elapsed:elapsed<activeEnd+extension?activeEnd-1e-6:elapsed-extension;
      return sample(id,state,played);
    }
    function duration(id, state) {
      return sequence(id, state).frames.reduce((n, f) => n + f[1], 0) / data.tickRate;
    }
    function trainingClip(id, cageNo, elapsed, running) {
      const key = `cm${String(cageNo).padStart(2,'0')}`;
      const phases = data.trainingActions[key] ?? [[32]];
      const seconds = ([seq, ticks]) => ticks === undefined ? duration(id, `seq_${seq}`) : ticks / data.tickRate;
      const action = phases.reduce((sum, phase) => sum + seconds(phase), 0);
      // 대기 자세를 사이에 넣어 정지 셀로 된 동작도 세 번 구분되어 보이게 한다.
      const rest = running ? 0.55 : 0.28;
      const cycle = action + rest;
      if (elapsed + 1e-8 >= 2 * cycle + action) return { done: true };
      let time = elapsed % cycle;
      for (const phase of phases) {
        const length = seconds(phase), [seq] = phase;
        if (time < length) return { frame: sample(id, `seq_${seq}`, time), moving: seq === 3 || seq === 11 };
        time -= length;
      }
      return { recovery: true, moving: running, frame: sample(id, running ? 'run' : 'idle', time) };
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
    function movement(actor, id, dx, dy, dt, stopped = false, stateOverride = null) {
      let m = movementActors.get(actor);
      if (!m || m.id !== id) {
        m = {id, state: 'idle', flip: false};
        movementActors.set(actor, m);
      }
      // 정지 중에는 상태와 프레임 모두 유지한다.
      if (dt > 0) {
        m.state = stateOverride || (!stopped && Math.hypot(dx, dy) > 0.0001 ? 'walk' : 'idle');
        if (!stopped && Math.abs(dx) > 0.0001) m.flip = dx > 0;
      }
      return {state: m.state, flip: m.flip, frame: pose(actor, id, m.state, dt)};
    }
    function face(actor,id,dx) {
      let m=movementActors.get(actor);
      if(!m||m.id!==id){m={id,state:'idle',flip:false};movementActors.set(actor,m);}
      // 원본 개체 도트는 왼쪽을 본다. 공격 시 이동 여부와 관계없이 목표를 바라본다.
      if(Math.abs(dx)>0.0001)m.flip=dx>0;
      return m.flip;
    }
    return { duration, sample, pose, movement, face, windup, castDuration, sampleCast, trainingClip };
  }
  root.createAnimationPlayer = create;
  if (typeof module !== 'undefined') module.exports = { createAnimationPlayer: create };
})(typeof window !== 'undefined' ? window : globalThis);
