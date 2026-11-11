import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { FarmScene } from './scenes/FarmScene';
import { BattleScene } from './scenes/BattleScene';
import { HuntScene } from './scenes/HuntScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: 512,
  height: 768,
  backgroundColor: '#1b1d24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, FarmScene, BattleScene, HuntScene],
});
// 디버깅용: 브라우저 콘솔에서 __game으로 접근
(window as unknown as { __game: Phaser.Game }).__game = game;
