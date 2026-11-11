import Phaser from 'phaser';
import { clean, feed, heal, rest, tickMinute, train, vitamin, TRAIN_LABEL, type ActionResult, type CareEvent } from '../core/care';
import { getSpecies, stageIndex, STAGE_LABEL } from '../core/data';
import { evolutionHints } from '../core/evolution';
import { RANK_INFO, type Rank } from '../core/battle';
import { resetGame, freshSave } from '../core/save';
import type { Monster, Tactic } from '../core/types';
import { state } from '../state';
import { monsterTextureKey } from '../ui/art';
import { bar, Button, COLORS, FONT } from '../ui/Button';

const W = 512;
const TOP_H = 384;

export class CareScene extends Phaser.Scene {
  private sprite!: Phaser.GameObjects.Image;
  private poops: Phaser.GameObjects.Image[] = [];
  private nameText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;
  private sickText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private hungerBar!: ReturnType<typeof bar>;
  private energyBar!: ReturnType<typeof bar>;
  private stageBar!: ReturnType<typeof bar>;
  private speedButtons: Button[] = [];
  private overlay?: Phaser.GameObjects.Container;
  private acc = 0;
  private saveAcc = 0;
  private busy = false;

  constructor() {
    super('Care');
  }

  create() {
    this.poops = [];
    this.speedButtons = [];
    this.overlay = undefined;
    this.busy = false;

    // 위 화면: 사육장
    this.add.rectangle(W / 2, TOP_H / 2, W, TOP_H, 0x9ed8a4);
    this.add.rectangle(W / 2, 80, W, 160, 0xbfe6ff);
    this.add.rectangle(W / 2, TOP_H - 2, W, 4, 0x1e2129);
    this.sprite = this.add.image(W / 2, 240, monsterTextureKey(state.monster.speciesId)).setScale(1.3);
    this.tweens.add({ targets: this.sprite, y: 230, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.nameText = this.add.text(12, 10, '', { fontFamily: FONT, fontSize: '18px', color: '#1e2129' });
    this.clockText = this.add.text(W - 12, 10, '', { fontFamily: FONT, fontSize: '16px', color: '#1e2129' }).setOrigin(1, 0);
    this.sickText = this.add.text(W / 2, 140, '', { fontFamily: FONT, fontSize: '18px', color: '#c0392b' }).setOrigin(0.5);
    this.msgText = this.add
      .text(W / 2, 340, '', { fontFamily: FONT, fontSize: '16px', color: '#1e2129', backgroundColor: '#ffffffcc', padding: { x: 8, y: 4 } })
      .setOrigin(0.5)
      .setAlpha(0);

    [1, 10, 60].forEach((sp, i) => {
      const b = new Button(this, W - 120 + i * 42, 48, 38, 24, `×${sp}`, () => this.setSpeed(sp));
      this.speedButtons.push(b);
    });
    this.setSpeed(state.speed);

    // 아래 화면: 상태 + 메뉴
    const y0 = TOP_H;
    this.add.rectangle(W / 2, y0 + 192, W, 384, COLORS.bg);
    const label = (x: number, y: number, t: string) =>
      this.add.text(x, y, t, { fontFamily: FONT, fontSize: '14px', color: COLORS.dim }).setOrigin(0, 0.5);
    label(16, y0 + 22, '배부름');
    this.hungerBar = bar(this, 80, y0 + 22, 160, 14, 0xffa94d);
    label(260, y0 + 22, '기력');
    this.energyBar = bar(this, 310, y0 + 22, 186, 14, 0x74c0fc);
    label(16, y0 + 46, '성장');
    this.stageBar = bar(this, 80, y0 + 46, 416, 10, 0xb197fc);

    this.statsText = this.add.text(16, y0 + 62, '', { fontFamily: FONT, fontSize: '15px', color: COLORS.text });
    this.recordText = this.add.text(16, y0 + 86, '', { fontFamily: FONT, fontSize: '13px', color: COLORS.dim });

    const bw = 91;
    const gx = (i: number) => 16 + bw / 2 + i * (bw + 6);
    const row = (y: number, items: [string, () => void][]) =>
      items.forEach(([t, fn], i) => new Button(this, gx(i), y, bw, 38, t, fn));

    label(16, y0 + 122, '돌보기');
    row(y0 + 150, [
      ['먹이', () => this.act(feed(state.monster))],
      ['영양제', () => this.act(vitamin(state.monster))],
      ['청소', () => this.act(clean(state.monster))],
      ['치료', () => this.act(heal(state.monster))],
      ['휴식', () => this.act(rest(state.monster))],
    ]);
    label(16, y0 + 186, '훈련');
    row(
      y0 + 214,
      (['atk', 'def', 'spd', 'int'] as const).map((k) => [TRAIN_LABEL[k], () => this.act(train(state.monster, k))]),
    );
    label(16, y0 + 250, '기타');
    row(y0 + 278, [
      ['진화 힌트', () => this.showHints()],
      ['배틀', () => this.showBattleMenu()],
      ['처음부터', () => this.confirmReset()],
    ]);
    this.add
      .text(W / 2, y0 + 360, '현실 1초 = 게임 1분 · 자동 저장', { fontFamily: FONT, fontSize: '12px', color: COLORS.dim })
      .setOrigin(0.5);

    this.syncPoop();
    this.refresh();
    if (state.offlineMinutes > 0) {
      const h = Math.floor(state.offlineMinutes / 60);
      this.say(`자리를 비운 동안 ${h > 0 ? `${h}시간 ` : ''}${state.offlineMinutes % 60}분이 흘렀다.`);
      state.offlineMinutes = 0;
    }
    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => state.persist());
  }

  update(_t: number, dt: number) {
    if (this.busy) return;
    this.acc += dt * state.speed;
    let ticks = 0;
    while (this.acc >= 1000 && ticks < 120) {
      this.acc -= 1000;
      ticks++;
      const r = tickMinute(state.monster);
      state.monster = r.monster;
      state.save = { ...state.save, clock: state.save.clock + 1 };
      this.handleEvents(r.events);
      if (this.busy) break;
    }
    if (ticks) this.refresh();
    this.saveAcc += dt;
    if (this.saveAcc > 5000) {
      this.saveAcc = 0;
      state.persist();
    }
  }

  private setSpeed(sp: number) {
    state.speed = sp;
    this.speedButtons.forEach((b, i) => b.setActiveLook([1, 10, 60][i] === sp));
  }

  private act(r: ActionResult) {
    if (this.busy || this.overlay) return;
    if (r.ok) {
      state.monster = r.monster;
      state.persist();
      this.syncPoop();
      this.tweens.add({ targets: this.sprite, scale: 1.45, duration: 90, yoyo: true });
    }
    this.say(r.message, !r.ok);
    this.refresh();
  }

  private handleEvents(events: CareEvent[]) {
    for (const e of events) {
      if (e.type === 'poop') this.syncPoop();
      if (e.type === 'mistake') this.say(`돌봄 실수! (${e.reason})`, true);
      if (e.type === 'sick') this.say('몬스터가 아프다! 치료해 주세요.', true);
      if (e.type === 'hatched' || e.type === 'evolved') this.playEvolution(e.from, e.to, e.type === 'hatched');
    }
  }

  private playEvolution(from: string, to: string, hatched: boolean) {
    this.busy = true;
    state.discover(to);
    state.persist();
    const flash = this.add.rectangle(W / 2, TOP_H / 2, W, TOP_H, 0xffffff).setAlpha(0);
    this.tweens.chain({
      targets: this.sprite,
      tweens: [
        { alpha: 0.2, duration: 120, yoyo: true, repeat: 4 },
        {
          scale: 0.2,
          duration: 300,
          onComplete: () => {
            this.sprite.setTexture(monsterTextureKey(to));
            this.tweens.add({ targets: flash, alpha: 1, duration: 150, yoyo: true, onComplete: () => flash.destroy() });
          },
        },
        { scale: 1.3, duration: 400, ease: 'Back.out' },
      ],
      onComplete: () => {
        this.busy = false;
        const fromName = getSpecies(from).name;
        const toName = getSpecies(to).name;
        this.say(hatched ? `알이 부화했다! ${toName} 탄생!` : `${fromName}이(가) ${toName}(으)로 진화했다!`);
        this.syncPoop();
        this.refresh();
      },
    });
  }

  private syncPoop() {
    this.poops.forEach((p) => p.destroy());
    this.poops = [];
    for (let i = 0; i < state.monster.poop; i++) {
      this.poops.push(this.add.image(60 + i * 44 + (i % 2) * 6, 330 - (i % 2) * 14, 'poop'));
    }
  }

  private refresh() {
    const m = state.monster;
    const sp = getSpecies(m.speciesId);
    this.nameText.setText(`${sp.name}  [${STAGE_LABEL[sp.stage]}]`);
    const clock = state.save.clock;
    const day = Math.floor(clock / 1440) + 1;
    const hh = String(Math.floor((clock % 1440) / 60)).padStart(2, '0');
    const mm = String(clock % 60).padStart(2, '0');
    this.clockText.setText(`${day}일차 ${hh}:${mm}`);
    this.sickText.setText(m.sick ? '☠ 아픔' : '');
    this.hungerBar.set(m.hunger / 100);
    this.energyBar.set(m.energy / 100);
    this.stageBar.set(sp.stageMinutes > 0 ? m.stageAge / sp.stageMinutes : 1);
    const s = m.stats;
    this.statsText.setText(`HP ${s.hp}   공격 ${s.atk}   방어 ${s.def}   속도 ${s.spd}   지능 ${s.int}`);
    this.recordText.setText(
      `체중 ${m.weight}  ·  돌봄 실수 ${m.careMistakes}  ·  훈련 ${m.trainings}  ·  배틀 ${m.battles}  ·  승리 ${m.wins}`,
    );
  }

  private say(text: string, bad = false) {
    this.msgText.setText(text).setColor(bad ? '#b02a2a' : '#1e2129');
    this.tweens.killTweensOf(this.msgText);
    this.msgText.setAlpha(1);
    this.tweens.add({ targets: this.msgText, alpha: 0, delay: 2200, duration: 500 });
  }

  // ---------- 오버레이 ----------
  private openOverlay(title: string, height = 520) {
    this.closeOverlay();
    const c = this.add.container(0, 0).setDepth(10);
    const dim = this.add.rectangle(W / 2, 384, W, 768, 0x000000, 0.6).setInteractive();
    const panel = this.add.rectangle(W / 2, 384, W - 40, height, COLORS.panel).setStrokeStyle(2, COLORS.accent);
    const t = this.add.text(W / 2, 384 - height / 2 + 24, title, { fontFamily: FONT, fontSize: '20px', color: COLORS.text }).setOrigin(0.5);
    const close = new Button(this, W / 2, 384 + height / 2 - 30, 120, 36, '닫기', () => this.closeOverlay());
    c.add([dim, panel, t, close]);
    this.overlay = c;
    return { c, top: 384 - height / 2 + 56 };
  }

  private closeOverlay() {
    this.overlay?.destroy(true);
    this.overlay = undefined;
  }

  private showHints() {
    const m = state.monster;
    const sp = getSpecies(m.speciesId);
    const { c, top } = this.openOverlay('진화 힌트');
    const hints = evolutionHints(m, state.discovered);
    let y = top;
    const txt = (x: number, t: string, color: string = COLORS.text, size = 15) => {
      const o = this.add.text(x, y, t, { fontFamily: FONT, fontSize: `${size}px`, color, wordWrap: { width: W - 90 } });
      c.add(o);
      y += o.height + 4;
      return o;
    };
    if (!hints.length) {
      txt(40, '최종 단계입니다. 더 이상 진화하지 않아요.', COLORS.dim);
      return;
    }
    const remain = Math.max(0, sp.stageMinutes - m.stageAge);
    txt(40, remain > 0 ? `진화까지 약 ${Math.ceil(remain / 60)}시간 (게임 시간)` : '진화 시기가 됐어요! 조건을 맞추면 1시간 안에 진화합니다.', COLORS.dim, 13);
    y += 6;
    hints.forEach((h, i) => {
      txt(40, `${i + 1}. ${h.name}  (${h.stage})${h.ready ? '  ← 현재 조건 충족' : ''}`, h.ready ? COLORS.good : COLORS.text, 16);
      h.checks.forEach((ch) => txt(60, `${ch.met ? '✔' : '✘'} ${ch.label}`, ch.met ? COLORS.good : COLORS.bad, 14));
      y += 8;
    });
    txt(40, '위에서부터 순서대로 검사해, 처음 충족하는 쪽으로 진화합니다.', COLORS.dim, 12);
  }

  private showBattleMenu() {
    const m = state.monster;
    if (stageIndex(getSpecies(m.speciesId).stage) < 3) {
      this.say('성장기부터 배틀에 나갈 수 있어요.', true);
      return;
    }
    if (m.sick) return this.say('아파서 배틀에 나갈 수 없어요.', true);
    if (m.energy < 20) return this.say('기력이 부족해요. (20 이상 필요)', true);
    if (m.hunger < 10) return this.say('배가 너무 고파요.', true);

    let rank: Rank = 'novice';
    let tactic: Tactic = 'balanced';
    const { c, top } = this.openOverlay('연습 시합', 400);
    const rankBtns: Button[] = [];
    const tacticBtns: Button[] = [];
    const ranks: Rank[] = ['novice', 'regular', 'expert'];
    const tactics: [Tactic, string][] = [
      ['aggressive', '공격형'],
      ['balanced', '균형형'],
      ['careful', '신중형'],
    ];
    const updateLook = () => {
      rankBtns.forEach((b, i) => b.setActiveLook(ranks[i] === rank));
      tacticBtns.forEach((b, i) => b.setActiveLook(tactics[i][0] === tactic));
    };
    c.add(this.add.text(48, top, '상대 랭크', { fontFamily: FONT, fontSize: '15px', color: COLORS.dim }));
    ranks.forEach((r, i) => {
      const b = new Button(this, 120 + i * 136, top + 44, 124, 40, RANK_INFO[r].label, () => {
        rank = r;
        updateLook();
      });
      rankBtns.push(b);
      c.add(b);
    });
    c.add(this.add.text(48, top + 84, '작전 (배틀 중에는 지시할 수 없어요)', { fontFamily: FONT, fontSize: '15px', color: COLORS.dim }));
    tactics.forEach(([t, l], i) => {
      const b = new Button(this, 120 + i * 136, top + 128, 124, 40, l, () => {
        tactic = t;
        updateLook();
      });
      tacticBtns.push(b);
      c.add(b);
    });
    const start = new Button(this, W / 2, top + 200, 200, 44, '시합 시작!', () => {
      state.persist();
      this.scene.start('Battle', { rank, tactic });
    });
    c.add(start);
    updateLook();
  }

  private confirmReset() {
    const { c, top } = this.openOverlay('처음부터 다시 시작할까요?', 260);
    c.add(this.add.text(W / 2, top + 20, '지금 키우는 몬스터가 사라집니다.', { fontFamily: FONT, fontSize: '15px', color: COLORS.bad }).setOrigin(0.5));
    c.add(
      new Button(this, W / 2, top + 80, 180, 42, '네, 새 알 받기', () => {
        resetGame();
        state.save = freshSave();
        state.persist();
        this.scene.restart();
      }),
    );
  }
}

export type { Monster };
