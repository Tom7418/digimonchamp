import Phaser from 'phaser';
import { state } from '../state';
import { preloadAssets } from '../ui/art';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    preloadAssets(this);
  }

  create() {
    state.init();
    if (!this.textures.exists('poop')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0x8b5a2b).fillEllipse(12, 18, 22, 9).fillEllipse(12, 12, 15, 8).fillEllipse(12, 7, 8, 6);
      g.generateTexture('poop', 24, 24);
      g.destroy();
    }
    this.scene.start('Farm');
  }
}
