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
const OY = 404;

export class BattleScene extends Phaser.Scene {
  private setup!: BattleSetup;
  private sim!: BattleState;
  private rng!: Rng;
  private views: { c: Phaser.GameObjects.Container; hp: Phaser.GameObjects.Rectangle; tp: Phaser.GameObjects.Rectangle }[] = [];
  private panelBars: { hp: Phaser.GameObjects.Rectangle; tp: Phaser.GameObjects.Rectangle }[] = [];
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
    this.panelBars = [];
    this.lines = [];
    this.acc = 0;
    this.fast = 1;
    this.done = false;
    playBgm(this, 'bgm_battle');

    const mine = setup.members.map((m) => entrantOf(state.save.digimon.find((d) => d.uid === m.uid)!, m.mode));
    const foes = makeEnemies(setup.stage, setup.format, setup.scale, defaultRng);
    this.sim = createBattle(mine, foes);
    this.rng = seeded(Math.floor(Math.random() * 1e9));

    // 위 화면: 양 팀 상태와 진행 기록
    this.add.rectangle(W / 2, 192, W, 384, 0x243447);
    this.add.rectangle(W / 2, 22, W, 44, 0x1b2838);
    this.add.text(W / 2, 10, setup.title, { fontFamily: FONT, fontSize: '18px', color: COLORS.text }).setOrigin(0.5, 0);
    this.add.text(12, 52, '우리 팀', { fontFamily: FONT, fontSize: '13px', color: '#74c0fc' });
    this.add.text(W - 12, 52, '상대 팀', { fontFamily: FONT, fontSize: '13px', color: '#ff8787' }).setOrigin(1, 0);
    this.sim.units.forEach((u) => {
      const index = this.sim.units.filter((o) => o.team === u.team && o.id < u.id).length;
      const x = u.team === 0 ? 12 : W / 2 + 8;
      const y = 74 + index * 36;
      const mode = u.team === 0 ? ` · ${setup.members[index].mode}` : '';
      this.add.text(x, y, `${u.name}${mode} · ${u.personality}`, { fontFamily: FONT, fontSize: '12px', color: COLORS.text });
      this.add.rectangle(x, y + 22, 236, 8, 0x0f1620).setOrigin(0, 0.5);
      const hp = this.add.rectangle(x + 1, y + 20, 234, 4, u.team === 0 ? 0x4dabf7 : 0xff6b6b).setOrigin(0, 0.5);
      const tp = this.add.rectangle(x + 1, y + 24, 234, 2, 0xffd43b).setOrigin(0, 0.5);
      this.panelBars.push({ hp, tp });
    });
    this.log = this.add.text(12, 190, '', { fontFamily: FONT, fontSize: '13px', color: COLORS.text, lineSpacing: 3 });
    this.add.rectangle(W / 2, 382, W, 4, 0x0f1620);

    // 아래 화면: 배틀 필드
    this.add.rectangle(W / 2, 576, W, 384, 0xc9a66b);
    this.add.rectangle(OX + ARENA.w / 2, OY + ARENA.h / 2, ARENA.w, ARENA.h, 0xe0b878).setStrokeStyle(3, 0x8a6a3a);
    this.timeText = this.add.text(W / 2, 668, '', { fontFamily: FONT, fontSize: '15px', color: '#1e2129' }).setOrigin(0.5, 0);
    for (const u of this.sim.units) {
      const c = digimonView(this, u.speciesId).setScale(0.8).setPosition(OX + u.x, OY + u.y);
      const back = this.add.rectangle(0, -34, 44, 6, 0x1e2129);
      const hp = this.add.rectangle(-21, -34, 42, 4, u.team === 0 ? 0x4dabf7 : 0xff6b6b).setOrigin(0, 0.5);
      const tp = this.add.rectangle(-21, -29, 42, 2, 0xffd43b).setOrigin(0, 0.5);
      c.add([back, hp, tp]);
      this.views.push({ c, hp, tp });
    }
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
      this.panelBars[i].hp.width = 234 * (u.hp / u.maxHp);
      this.panelBars[i].tp.width = 234 * (u.tp / u.maxTp);
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
    this.log.setText(this.lines.slice(-10).join('\n'));
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
    new Button(this, 110, 742, 180, 34, '사육장으로', () => this.scene.start('Farm'));
  }
}
