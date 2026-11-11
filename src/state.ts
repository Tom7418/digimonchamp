import { loadDiscovered, loadGame, saveDiscovered, saveGame } from './core/save';
import type { Monster, SaveData } from './core/types';

/** 씬끼리 공유하는 게임 상태 */
class GameState {
  save!: SaveData;
  discovered!: Set<string>;
  offlineMinutes = 0;
  speed = 1;

  init() {
    const r = loadGame();
    this.save = r.save;
    this.offlineMinutes = r.offlineMinutes;
    this.discovered = loadDiscovered();
    this.discover(this.save.monster.speciesId);
  }

  get monster(): Monster {
    return this.save.monster;
  }

  set monster(m: Monster) {
    this.save = { ...this.save, monster: m };
  }

  discover(id: string) {
    if (!this.discovered.has(id)) {
      this.discovered.add(id);
      saveDiscovered(this.discovered);
    }
  }

  persist() {
    saveGame(this.save);
  }
}

export const state = new GameState();
