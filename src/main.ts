import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { FarmScene } from './scenes/FarmScene';
import { BattleScene } from './scenes/BattleScene';
import { HuntScene } from './scenes/HuntScene';

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 512,
  height: 768,
  backgroundColor: '#1b1d24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, FarmScene, BattleScene, HuntScene],
});
