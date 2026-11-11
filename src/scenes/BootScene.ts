import Phaser from 'phaser';
import { state } from '../state';
import { generateMonsterTextures } from '../ui/art';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    state.init();
    generateMonsterTextures(this);
    this.scene.start('Care');
  }
}
