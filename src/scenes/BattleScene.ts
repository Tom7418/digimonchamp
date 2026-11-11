import Phaser from 'phaser';
import { makeOpponent, RANK_INFO, simulateBattle, type BattleEvent, type Fighter, type Rank } from '../core/battle';
import { getMove, getSpecies } from '../core/data';
import { defaultRng, seeded } from '../core/rng';
import type { Tactic } from '../core/types';
import { state } from '../state';
import { monsterTextureKey } from '../ui/art';
import { bar, Button, COLORS, FONT } from '../ui/Button';

const W = 512;
const TACTIC_LABEL: Record<Tactic, string> = { aggressive: '공격형', balanced: '균형형', careful: '신중형' };

export class BattleScene extends Phaser.Scene {
  constructor() {
    super('Battle');
  }

  create(data: { rank: Rank; tactic: Tactic }) {
    const m = state.monster;
    const sp = getSpecies(m.speciesId);
    const me: Fighter = { name: sp.name, speciesId: sp.id, stats: m.stats, moves: sp.moves, tactic: data.tactic };
    const foe = makeOpponent(data.rank, defaultRng);
    const seed = Math.floor(Math.random() * 1e9);
    const result = simulateBattle(me, foe, seeded(seed));

    // 위 화면: 경기장
    this.add.rectangle(W / 2, 192, W, 384, 0xf2d6a2);
    this.add.ellipse(W / 2, 290, 460, 120, 0xe0b878);
    this.add.rectangle(W / 2, 382, W, 4, 0x1e2129);
    this.add
      .text(W / 2, 14, `연습 시합 · ${RANK_INFO[data.rank].label}`, { fontFamily: FONT, fontSize: '18px', color: '#1e2129' })
      .setOrigin(0.5, 0);

    const mine = this.add.image(140, 250, monsterTextureKey(me.speciesId)).setScale(1.2);
    const theirs = this.add.image(372, 250, monsterTextureKey(foe.speciesId)).setScale(1.2).setFlipX(true);
    const sprites = [mine, theirs];

    const hpBars = [bar(this, 30, 60, 200, 14, 0x51cf66), bar(this, 282, 60, 200, 14, 0x51cf66)];
    const hpText = [
      this.add.text(30, 72, '', { fontFamily: FONT, fontSize: '14px', color: '#1e2129' }),
      this.add.text(482, 72, '', { fontFamily: FONT, fontSize: '14px', color: '#1e2129' }).setOrigin(1, 0),
    ];
    this.add.text(30, 36, `${me.name} (나)`, { fontFamily: FONT, fontSize: '15px', color: '#1e2129' });
    this.add.text(482, 36, foe.name, { fontFamily: FONT, fontSize: '15px', color: '#1e2129' }).setOrigin(1, 0);
    const setHp = (hp: [number, number]) =>
      [0, 1].forEach((i) => {
        hpBars[i].set(hp[i] / result.maxHp[i]);
        hpText[i].setText(`${hp[i]} / ${result.maxHp[i]}`);
      });
    setHp([...result.maxHp]);

    // 아래 화면: 로그
    this.add.rectangle(W / 2, 576, W, 384, COLORS.bg);
    this.add.text(16, 396, `작전: ${TACTIC_LABEL[me.tactic]}   상대 작전: ${TACTIC_LABEL[foe.tactic]}`, {
      fontFamily: FONT,
      fontSize: '13px',
      color: COLORS.dim,
    });
    const fs = foe.stats;
    this.add.text(16, 416, `상대 능력치  공격 ${fs.atk} 방어 ${fs.def} 속도 ${fs.spd} 지능 ${fs.int}`, {
      fontFamily: FONT,
      fontSize: '13px',
      color: COLORS.dim,
    });
    const lines: string[] = [];
    const log = this.add.text(16, 446, '', { fontFamily: FONT, fontSize: '14px', color: COLORS.text, lineSpacing: 4 });
    const push = (s: string) => {
      lines.push(s);
      log.setText(lines.slice(-11).join('\n'));
    };
    push('시합 시작!');

    const names = [`${me.name}(나)`, `상대 ${foe.name}`];
    let i = 0;
    let speedUp = 1;
    const skip = new Button(this, W - 70, 740, 110, 32, '빨리 감기', () => {
      speedUp = 6;
      skip.setEnabled(false);
    });

    const step = () => {
      const e: BattleEvent | undefined = result.events[i++];
      if (!e) return;
      if (e.type === 'end') return this.finish(e.winner === 0, e.reason, push, skip);
      const attacker = sprites[e.side];
      const target = sprites[1 - e.side];
      const mv = getMove(e.move).name;
      if (e.type === 'guard') {
        push(`${names[e.side]}의 ${mv}! 방어 태세.`);
        this.tweens.add({ targets: attacker, scaleX: 1.0, scaleY: 1.0, duration: 120, yoyo: true });
      } else if (e.type === 'miss') {
        push(`${names[e.side]}의 ${mv}! …빗나갔다.`);
        this.tweens.add({ targets: target, x: target.x + (e.side === 0 ? 20 : -20), duration: 100, yoyo: true });
      } else {
        push(`${names[e.side]}의 ${mv}! ${e.damage} 데미지${e.crit ? ' (급소!)' : ''}`);
        const dir = e.side === 0 ? 1 : -1;
        this.tweens.add({ targets: attacker, x: attacker.x + 40 * dir, duration: 90, yoyo: true });
        this.time.delayedCall(90, () => {
          target.setTint(0xff6b6b);
          this.cameras.main.shake(80, e.crit ? 0.012 : 0.005);
          this.time.delayedCall(120, () => target.clearTint());
          setHp(e.hp);
        });
      }
      this.time.delayedCall(650 / speedUp, step);
    };
    this.time.delayedCall(600, step);
  }

  private finish(won: boolean, reason: 'ko' | 'timeout', push: (s: string) => void, skip: Button) {
    skip.destroy();
    push(reason === 'timeout' ? '시간 종료! 남은 체력으로 판정.' : won ? '상대를 쓰러뜨렸다!' : '쓰러지고 말았다…');
    push(won ? '★ 승리! ★' : '패배… 다음엔 더 강해지자.');
    const m = state.monster;
    state.monster = {
      ...m,
      battles: m.battles + 1,
      wins: m.wins + (won ? 1 : 0),
      energy: Math.max(0, m.energy - 20),
      hunger: Math.max(0, m.hunger - 10),
    };
    state.persist();
    new Button(this, W / 2, 740, 180, 36, '사육장으로', () => this.scene.start('Care'));
  }
}
