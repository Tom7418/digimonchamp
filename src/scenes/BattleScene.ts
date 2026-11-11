import Phaser from 'phaser';
import { advance } from '../core/care';
import { applyBattleResult, ARENA, createBattle, entrantOf, makeEnemies, stepBattle, TIME_LIMIT, type BattleState } from '../core/battle';
import { defaultRng, seeded, type Rng } from '../core/rng';
import { applyWin } from '../core/titles';
import { state } from '../state';
import { digimonView, playBgm, playSound } from '../ui/art';
import { Button, COLORS, FONT } from '../ui/Button';
import type { BattleSetup } from './FarmScene';

const W = 512;
const OX = 16;
const OY = 96;

export class BattleScene extends Phaser.Scene {
  private setup!: BattleSetup;
  private sim!: BattleState;
  private rng!: Rng;
  private views: { c: Phaser.GameObjects.Container; hp: Phaser.GameObjects.Rectangle; tp: Phaser.GameObjects.Rectangle }[] = [];
  private timeText!: Phaser.GameObjects.Text;
  private log!: Phaser.GameObjects.Text;
  private lines: string[] = [];
  private acc = 0;
  private fast = 1;
  private done = false;

  constructor() {
    super('Battle');
  }

  create(setup: BattleSetup) {
    this.setup = setup;
    this.views = [];
    this.lines = [];
    this.acc = 0;
    this.fast = 1;
    this.done = false;
    playBgm(this, 'bgm_battle');

    const mine = setup.members.map((m) => entrantOf(state.save.digimon.find((d) => d.uid === m.uid)!, m.mode));
    const foes = makeEnemies(setup.stage, setup.format, setup.scale, defaultRng);
    this.sim = createBattle(mine, foes);
    this.rng = seeded(Math.floor(Math.random() * 1e9));

    this.add.rectangle(W / 2, 192, W, 384, 0xf2d6a2);
    this.add.rectangle(OX + ARENA.w / 2, OY + ARENA.h / 2, ARENA.w, ARENA.h, 0xe0b878).setStrokeStyle(3, 0x8a6a3a);
    this.add.rectangle(W / 2, 382, W, 4, 0x1e2129);
    this.add.text(W / 2, 10, setup.title, { fontFamily: FONT, fontSize: '18px', color: '#1e2129' }).setOrigin(0.5, 0);
    this.add.text(16, 40, '우리 팀 ▶', { fontFamily: FONT, fontSize: '13px', color: '#1c7ed6' });
    this.add.text(W - 16, 40, '◀ 상대 팀', { fontFamily: FONT, fontSize: '13px', color: '#c92a2a' }).setOrigin(1, 0);
    this.timeText = this.add.text(W / 2, 40, '', { fontFamily: FONT, fontSize: '15px', color: '#1e2129' }).setOrigin(0.5, 0);

    for (const u of this.sim.units) {
      const c = digimonView(this, u.speciesId).setPosition(OX + u.x, OY + u.y);
      const back = this.add.rectangle(0, -34, 44, 6, 0x1e2129);
      const hp = this.add.rectangle(-21, -34, 42, 4, u.team === 0 ? 0x4dabf7 : 0xff6b6b).setOrigin(0, 0.5);
      const tp = this.add.rectangle(-21, -29, 42, 2, 0xffd43b).setOrigin(0, 0.5);
      c.add([back, hp, tp]);
      this.views.push({ c, hp, tp });
    }

    this.add.rectangle(W / 2, 576, W, 384, COLORS.bg);
    this.add.text(16, 392, mine.map((_, i) => `${this.sim.units[i].name}: ${setup.members[i].mode} 공격 · ${this.sim.units[i].personality}`).join('\n'), {
      fontFamily: FONT,
      fontSize: '12px',
      color: COLORS.dim,
    });
    this.log = this.add.text(16, 452, '', { fontFamily: FONT, fontSize: '14px', color: COLORS.text, lineSpacing: 3 });
    this.push('배틀 시작!');
    const ff = new Button(this, W - 70, 742, 110, 32, '빨리 감기', () => {
      this.fast = this.fast === 1 ? 5 : 1;
      ff.setActiveLook(this.fast > 1);
    });
  }

  update(_t: number, dt: number) {
    if (this.done) return;
    this.acc += dt * this.fast;
    while (this.acc >= 100 && !this.sim.over) {
      this.acc -= 100;
      for (const e of stepBattle(this.sim, this.rng)) {
        const name = (id: number) => `${this.sim.units[id].team === 0 ? '' : '상대 '}${this.sim.units[id].name}`;
        if (e.type === 'hit') {
          this.push(`${name(e.from)}의 ${e.special ? '필살기' : '공격'}! ${name(e.to)}에게 ${e.damage}`);
          this.floatText(e.to, `-${e.damage}`, e.special ? '#e03131' : '#1e2129');
          playSound(this, e.special ? 'se_special' : 'se_hit', { volume: 0.6 });
          if (e.special) this.cameras.main.shake(90, 0.008);
        } else if (e.type === 'heal') {
          this.push(`${name(e.from)}의 지원! ${name(e.to)} 회복 +${e.amount}`);
          this.floatText(e.to, `+${e.amount}`, '#2f9e44');
        } else this.push(`${name(e.id)}이(가) 쓰러졌다!`);
      }
    }
    this.sim.units.forEach((u, i) => {
      const v = this.views[i];
      v.c.setPosition(OX + u.x, OY + u.y).setAlpha(u.alive ? 1 : 0.25);
      v.hp.width = 42 * (u.hp / u.maxHp);
      v.tp.width = 42 * (u.tp / u.maxTp);
    });
    this.timeText.setText(`남은 시간 ${Math.max(0, Math.ceil(TIME_LIMIT - this.sim.t))}초`);
    if (this.sim.over) this.finish();
  }

  private floatText(id: number, text: string, color: string) {
    const u = this.sim.units[id];
    const t = this.add.text(OX + u.x, OY + u.y - 44, text, { fontFamily: FONT, fontSize: '15px', color, fontStyle: 'bold' }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 24, alpha: 0, duration: 700, onComplete: () => t.destroy() });
  }

  private push(s: string) {
    this.lines.push(s);
    this.log.setText(this.lines.slice(-12).join('\n'));
  }

  private finish() {
    this.done = true;
    const won = this.sim.winner === 0;
    this.push(this.sim.reason === 'timeout' ? '시간 종료! 남은 체력으로 판정.' : won ? '상대 팀을 모두 쓰러뜨렸다!' : '우리 팀이 모두 쓰러졌다…');
    let save = state.save;
    const koUids = new Set(this.sim.units.filter((u) => u.team === 0 && !u.alive).map((u) => u.uid));
    save = {
      ...save,
      digimon: save.digimon.map((d) => (this.setup.members.some((m) => m.uid === d.uid) ? applyBattleResult(d, won, koUids.has(d.uid), defaultRng) : d)),
    };
    if (won) {
      if (this.setup.match) {
        save = applyWin(save, this.setup.match);
        this.push(`★ ${this.setup.match.name} 승리! 상금 ${this.setup.prize} bit ★`);
      } else {
        save = { ...save, bits: save.bits + this.setup.prize };
        this.push(`★ 승리! 상금 ${this.setup.prize} bit ★`);
      }
    } else this.push('패배… 다음엔 더 강해지자.');
    // 배틀에는 게임 시간 1시간이 걸린다
    state.save = advance(save, 60).save;
    state.persist();
    new Button(this, W / 2, 742, 180, 34, '사육장으로', () => this.scene.start('Farm'));
  }
}
