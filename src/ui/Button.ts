import Phaser from 'phaser';

export const FONT = '"Galmuri11", "DungGeunMo", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif';

export const COLORS = {
  bg: 0x2b2f3a,
  panel: 0x3a3f4d,
  panelLight: 0x4a5163,
  text: '#f1f1f1',
  dim: '#a0a6b5',
  good: '#7ee081',
  bad: '#ff7a7a',
  accent: 0xffc857,
};

export class Button extends Phaser.GameObjects.Container {
  private bgRect: Phaser.GameObjects.Rectangle;
  private label: Phaser.GameObjects.Text;
  private enabledState = true;

  constructor(scene: Phaser.Scene, x: number, y: number, w: number, h: number, text: string, onClick: () => void) {
    super(scene, x, y);
    this.bgRect = scene.add.rectangle(0, 0, w, h, COLORS.panelLight).setStrokeStyle(2, 0x1e2129);
    this.label = scene.add.text(0, 0, text, { fontFamily: FONT, fontSize: '15px', color: COLORS.text }).setOrigin(0.5);
    this.add([this.bgRect, this.label]);
    this.setSize(w, h);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.enabledState && this.bgRect.setFillStyle(0x5d6680));
    this.on('pointerout', () => this.bgRect.setFillStyle(this.enabledState ? COLORS.panelLight : 0x333744));
    this.on('pointerdown', () => {
      if (!this.enabledState) return;
      this.bgRect.setFillStyle(0x7480a0);
      onClick();
    });
    this.on('pointerup', () => this.enabledState && this.bgRect.setFillStyle(0x5d6680));
    scene.add.existing(this);
  }

  setText(t: string) {
    this.label.setText(t);
    return this;
  }

  setEnabled(v: boolean) {
    this.enabledState = v;
    this.bgRect.setFillStyle(v ? COLORS.panelLight : 0x333744);
    this.label.setColor(v ? COLORS.text : COLORS.dim);
    return this;
  }

  setActiveLook(v: boolean) {
    this.bgRect.setStrokeStyle(2, v ? COLORS.accent : 0x1e2129);
    return this;
  }
}

export function bar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
): { set: (ratio: number) => void; objects: Phaser.GameObjects.GameObject[] } {
  const back = scene.add.rectangle(x, y, w, h, 0x1e2129).setOrigin(0, 0.5);
  const fill = scene.add.rectangle(x + 1, y, w - 2, h - 2, color).setOrigin(0, 0.5);
  return {
    set: (r: number) => {
      fill.width = Math.max(0, Math.min(1, r)) * (w - 2);
    },
    objects: [back, fill],
  };
}
