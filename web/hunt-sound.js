'use strict';
// 사냥 효과음의 거리 음량·좌우와 야생 발소리 (원본 overlay9_0). 좌표는 화면 중앙 기준 지도 px.
// 원작 화면은 256×192이고 카메라 좌상단 기준으로 계산하지만, 여기서는 중앙(128,96)을 뺀 값을 받는다.
(function (root) {
  // 화면 밖 80px까지만 울린다: 카메라 기준 x −80~336, y −80~272 (경계 값은 안 울림) — 0x021214D8, 0x021116BC
  const audible = (dx, dy) => dx > -208 && dx < 208 && dy > -176 && dy < 176;
  // 화면 중앙 거리(정수 px). 원본은 하드웨어 제곱근 결과를 반올림한 뒤 >>12 (0x02002B8C)
  const dist = (dx, dy) => Math.floor(Math.hypot(dx, dy));

  // 일반 위치 효과음(폭탄·마인 폭발) 0x021214D8: d<128이면 127, 아니면 d−127.
  // 원본 그대로라 화면 가장자리(128~160)는 작고, 화면 밖으로 갈수록 다시 커진다(127에서 자름은 웹판 가정).
  function area(dx, dy) {
    if (!audible(dx, dy)) return null;
    const d = dist(dx, dy);
    return { volume: d < 128 ? 127 : Math.min(127, d - 127), pan: 0 };
  }

  // 발소리 0x02111738~0x021117AC: 음량 127 − min(127, d/2), 좌우 = −floor((128−x)·120/208) (x는 카메라 기준)
  function footstep(dx, dy) {
    if (!audible(dx, dy)) return null;
    const half = Math.min(127, Math.floor(dist(dx, dy) / 2));
    return { volume: 127 - half, pan: -Math.floor((128 - (dx + 128)) * 120 / 208) };
  }

  // 발소리 종류 0x0211177C~0x021117A0: 지형 분류 2(ATR bit1, 벽 bit0 아님)면 038_2,
  // 아니면 생성 때 셀 넓이(+0x508) > 0x400이면 무거운 107M, 아니면 036_3. 분류 함수 0x0207BEA4
  function footstepSound(spriteId, terrainBits) {
    if (!(terrainBits & 1) && (terrainBits & 2)) return 'DIGI_SE_038_2';
    return (root.HUNT_FOOTSTEP_AREA?.[spriteId] ?? 0) > 0x400 ? 'DIGI_SE_107M' : 'DIGI_SE_036_3';
  }

  // 한 걸음 = 이동 거리 누적이 12px(0xC000)을 넘을 때. 화면 밖 80px 바깥에서는 쌓지 않는다 (0x021116F0~0x02111708)
  const STEP = 12;

  root.HuntSound = { area, footstep, footstepSound, STEP };
})(typeof window !== 'undefined' ? window : globalThis);
