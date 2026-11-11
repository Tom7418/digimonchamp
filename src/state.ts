import { loadGame, saveGame } from './core/save';
import type { SaveData } from './core/types';

/** 씬끼리 공유하는 게임 상태 */
class GameState {
  save!: SaveData;
  offlineMinutes = 0;
  speed = 1;
  selectedUid = 0;

  init() {
    const r = loadGame();
    this.save = r.save;
    this.offlineMinutes = r.offlineMinutes;
    this.selectedUid = this.save.digimon[0].uid;
    this.persist();
    window.addEventListener('pagehide', () => this.persist());
  }

  get selected() {
    return this.save.digimon.find((d) => d.uid === this.selectedUid) ?? this.save.digimon[0];
  }

  persist() {
    saveGame(this.save);
  }
}

export const state = new GameState();
