'use strict';
window.CageRules = {
  // 시설 종류별 15초 주기 효과. 점유 칸/정원/배치는 CageLayout에서 검사한다.
  names: { free: '기본 케이지', gym: '체육관', field: '운동장', clinic: '양호실' },
  tick(p) {
    // 자유 활동은 시설 훈련 시간을 누적하지 않는다.
    p.cage = this.names[p.cage] ? p.cage : 'free';
    if (p.cage === 'free') { p.cageSeconds = 0; return null; }
    p.cageSeconds = (Number.isFinite(p.cageSeconds) ? p.cageSeconds : 0) + 1;
    // 완료될 때만 한 번 효과를 적용하고 다음 주기의 타이머를 시작한다.
    if (p.cageSeconds < 15) return null;
    p.cageSeconds = 0;
    if (p.cage === 'clinic') {
      p.energy = Math.min(100, p.energy + 12);
      p.hp = Math.min(100, p.hp + 10);
      return 'recovered';
    }
    // 탈진 시 능력치도 오르지 않고 훈련 비용도 소모하지 않는다.
    if (p.hunger < 15 || p.energy < 15) return 'exhausted';
    p.energy -= 8; p.hunger = Math.max(0, p.hunger - 3);
    if (p.cage === 'gym') { p.attack += 2; p.defense += 1; }
    else { p.speed += 2; p.defense += 1; }
    return 'trained';
  }
};
