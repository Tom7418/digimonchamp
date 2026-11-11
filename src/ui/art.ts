import Phaser from 'phaser';
import { SPECIES } from '../core/data';
import type { ArtSpec } from '../core/types';

const TEX = 128;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

/** 오리지널 임시 그래픽: ArtSpec을 도형으로 그린다. sprite 경로가 생기면 그걸 우선 사용 */
function drawMonster(g: Phaser.GameObjects.Graphics, art: ArtSpec) {
  const c = hex(art.color);
  const a = hex(art.accent);
  const cx = TEX / 2;
  const s = 40 * art.size;
  const cy = TEX / 2 + 10;
  const outline = 0x22232b;

  g.lineStyle(3, outline, 1);

  if (art.body === 'round') {
    // 알
    g.fillStyle(c).fillEllipse(cx, cy, s * 1.5, s * 1.9).strokeEllipse(cx, cy, s * 1.5, s * 1.9);
    g.fillStyle(a);
    for (const [dx, dy, r] of [[-12, -15, 7], [10, 2, 9], [-6, 20, 6]]) g.fillCircle(cx + dx, cy + dy, r);
    return;
  }

  if (art.wings) {
    g.fillStyle(a, 0.85);
    g.fillTriangle(cx - s * 0.5, cy - s * 0.2, cx - s * 1.5, cy - s * 0.9, cx - s * 1.1, cy + s * 0.4);
    g.fillTriangle(cx + s * 0.5, cy - s * 0.2, cx + s * 1.5, cy - s * 0.9, cx + s * 1.1, cy + s * 0.4);
  }
  if (art.tail) {
    g.fillStyle(c).fillTriangle(cx + s * 0.6, cy + s * 0.3, cx + s * 1.4, cy - s * 0.1, cx + s * 0.7, cy + s * 0.6);
    g.fillStyle(a).fillCircle(cx + s * 1.4, cy - s * 0.15, s * 0.18);
  }

  g.fillStyle(c);
  switch (art.body) {
    case 'blob':
      g.fillEllipse(cx, cy + s * 0.2, s * 2, s * 1.5).strokeEllipse(cx, cy + s * 0.2, s * 2, s * 1.5);
      break;
    case 'beast':
      g.fillEllipse(cx, cy + s * 0.25, s * 1.6, s * 1.3).strokeEllipse(cx, cy + s * 0.25, s * 1.6, s * 1.3);
      g.fillCircle(cx, cy - s * 0.45, s * 0.6).strokeCircle(cx, cy - s * 0.45, s * 0.6);
      g.fillRect(cx - s * 0.6, cy + s * 0.7, s * 0.35, s * 0.4).fillRect(cx + s * 0.25, cy + s * 0.7, s * 0.35, s * 0.4);
      break;
    case 'drake':
      g.fillEllipse(cx, cy + s * 0.3, s * 1.5, s * 1.4).strokeEllipse(cx, cy + s * 0.3, s * 1.5, s * 1.4);
      g.fillEllipse(cx - s * 0.15, cy - s * 0.55, s * 1.2, s * 0.8).strokeEllipse(cx - s * 0.15, cy - s * 0.55, s * 1.2, s * 0.8);
      g.fillStyle(a).fillEllipse(cx, cy + s * 0.45, s * 0.8, s * 0.8);
      break;
    case 'golem':
      g.fillRoundedRect(cx - s, cy - s * 0.6, s * 2, s * 1.7, 14).strokeRoundedRect(cx - s, cy - s * 0.6, s * 2, s * 1.7, 14);
      g.fillStyle(a).fillRoundedRect(cx - s * 0.8, cy - s * 0.75, s * 1.6, s * 0.35, 8);
      break;
    case 'spirit':
      g.fillCircle(cx, cy - s * 0.1, s * 0.9).strokeCircle(cx, cy - s * 0.1, s * 0.9);
      g.fillTriangle(cx - s * 0.6, cy + s * 0.5, cx + s * 0.6, cy + s * 0.5, cx, cy + s * 1.3);
      break;
  }

  if (art.spikes) {
    g.fillStyle(a);
    for (let i = -2; i <= 2; i++) {
      const x = cx + i * s * 0.35;
      g.fillTriangle(x - 7, cy - s * 0.6, x + 7, cy - s * 0.6, x, cy - s * 0.6 - 14);
    }
  }
  if (art.horns) {
    g.fillStyle(a);
    const hy = art.body === 'golem' ? cy - s * 0.8 : cy - s * 0.95;
    for (let i = 0; i < art.horns; i++) {
      const x = cx + (i - (art.horns - 1) / 2) * s * 0.55;
      g.fillTriangle(x - 6, hy + 6, x + 6, hy + 6, x, hy - 14);
    }
  }

  // 눈
  const ey = art.body === 'beast' ? cy - s * 0.5 : art.body === 'drake' ? cy - s * 0.6 : cy - s * 0.1;
  const ex = art.body === 'drake' ? cx - s * 0.35 : cx;
  g.fillStyle(0xffffff).fillCircle(ex - s * 0.3, ey, s * 0.18).fillCircle(ex + s * 0.3, ey, s * 0.18);
  g.fillStyle(outline).fillCircle(ex - s * 0.27, ey + 1, s * 0.09).fillCircle(ex + s * 0.33, ey + 1, s * 0.09);
}

export function monsterTextureKey(id: string) {
  return `mon-${id}`;
}

export function generateMonsterTextures(scene: Phaser.Scene) {
  for (const sp of Object.values(SPECIES)) {
    const key = monsterTextureKey(sp.id);
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    drawMonster(g, sp.art);
    g.generateTexture(key, TEX, TEX);
    g.destroy();
  }
  // 똥, 아이콘
  if (!scene.textures.exists('poop')) {
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x8b5a2b).fillEllipse(16, 24, 28, 12).fillEllipse(16, 16, 20, 10).fillEllipse(16, 9, 10, 8);
    g.generateTexture('poop', 32, 32);
    g.destroy();
  }
}
