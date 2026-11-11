'use strict';
window.CageRules = {
  names: { free: '기본 케이지', gym: '미니 체육관', field: '미니 운동장', clinic: '미니 양호실' },
  tick(p) {
    p.cage = this.names[p.cage] ? p.cage : 'free';
    if (p.cage === 'free') { p.cageSeconds = 0; return null; }
    p.cageSeconds = (Number.isFinite(p.cageSeconds) ? p.cageSeconds : 0) + 1;
    if (p.cageSeconds < 15) return null;
    p.cageSeconds = 0;
    if (p.cage === 'clinic') {
      p.energy = Math.min(100, p.energy + 12);
      p.hp = Math.min(100, p.hp + 10);
      return 'recovered';
    }
    if (p.hunger < 15 || p.energy < 15) return 'exhausted';
    p.energy -= 8; p.hunger = Math.max(0, p.hunger - 3);
    if (p.cage === 'gym') { p.attack += 2; p.defense += 1; }
    else { p.speed += 2; p.defense += 1; }
    return 'trained';
  }
};
