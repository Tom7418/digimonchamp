import Phaser from 'phaser';
import { buy, CAPACITY, clean, feed, feedRotten, freshSave, heal, release, setCage, shopItems, tickFarm, usedCapacity, type ActionResult, type FarmEvent } from '../core/care';
import { CAGES, dateOf, FIELDS, getCage, getSpecies, LIFESPAN, SEASON_CODE, STAGE_LABEL } from '../core/data';
import { hints, maxStageForRank } from '../core/evolution';
import { resetGame } from '../core/save';
import { tamerRank, todaysMatches, upcoming, type Match } from '../core/titles';
import { ATTRS, FAMILIES, STAT_KEYS, STAT_LABEL, type AttackMode, type Digimon } from '../core/types';
import { state } from '../state';
import { digimonView, playBgm, playSound } from '../ui/art';
import { bar, Button, COLORS, FONT } from '../ui/Button';

const W = 512;
const TOP_H = 384;
const HEX_R = 36;
/** 기본 케이지(4칸)의 육각형 중심 */
const BASIC_HEX = [
  { x: 48, y: 470 },
  { x: 102, y: 501 },
  { x: 48, y: 532 },
  { x: 102, y: 563 },
];
/** 확장 공간: 6열 × 3행 벌집 */
const slotPos = (i: number) => {
  const col = i % 6;
  const row = Math.floor(i / 6);
  return { x: 196 + col * 54, y: 440 + row * 62 + (col % 2 ? 31 : 0) };
};
const CAGE_COLOR: Record<string, number> = { rest: 0xf4a6c0, train: 0xf0d58c, basic: 0xa9dba9 };

export interface BattleSetup {
  title: string;
  match?: Match;
  format: 1 | 3;
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  scale: number;
  prize: number;
  members: { uid: number; mode: AttackMode }[];
}

interface View {
  c: Phaser.GameObjects.Container;
  sig: string;
  poops: Phaser.GameObjects.Image[];
  dragging: boolean;
}

export class FarmScene extends Phaser.Scene {
  private views = new Map<number, View>();
  private hexGfx!: Phaser.GameObjects.Graphics;
  private hexLabels: Phaser.GameObjects.Text[] = [];
  private hexSig = '';
  private ring!: Phaser.GameObjects.Ellipse;
  private portrait?: Phaser.GameObjects.Container;
  private portraitSig = '';
  private headText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private apText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private noticeText!: Phaser.GameObjects.Text;
  private msgText!: Phaser.GameObjects.Text;
  private hungerBar!: ReturnType<typeof bar>;
  private fatigueBar!: ReturnType<typeof bar>;
  private lifeBar!: ReturnType<typeof bar>;
  private speedButtons: Button[] = [];
  private overlay?: Phaser.GameObjects.Container;
  private acc = 0;
  private saveAcc = 0;

  constructor() {
    super('Farm');
  }

  create() {
    this.views = new Map();
    this.speedButtons = [];
    this.hexLabels = [];
    this.hexSig = '';
    this.portrait = undefined;
    this.portraitSig = '';
    this.overlay = undefined;
    playBgm(this, 'bgm_farm');

    // ── 위 화면: 정보 ──
    this.add.rectangle(W / 2, TOP_H / 2, W, TOP_H, 0x243447);
    this.add.rectangle(W / 2, 28, W, 56, 0x1b2838);
    this.headText = this.add.text(10, 8, '', { fontFamily: FONT, fontSize: '15px', color: COLORS.text });
    this.infoText = this.add.text(10, 31, '', { fontFamily: FONT, fontSize: '12px', color: COLORS.dim });
    [1, 10, 60].forEach((sp, i) => this.speedButtons.push(new Button(this, W - 108 + i * 42, 28, 38, 24, `×${sp}`, () => this.setSpeed(sp))));
    this.setSpeed(state.speed);

    this.add.ellipse(92, 232, 150, 44, 0x1b2838);
    this.add.rectangle(92, 150, 160, 170, 0x2f4a66).setStrokeStyle(2, 0x4a6b8a);
    new Button(this, 30, 262, 32, 26, '◀', () => this.cycle(-1));
    new Button(this, 154, 262, 32, 26, '▶', () => this.cycle(1));
    this.nameText = this.add.text(186, 68, '', { fontFamily: FONT, fontSize: '19px', color: COLORS.text });
    this.subText = this.add.text(186, 94, '', { fontFamily: FONT, fontSize: '13px', color: COLORS.dim });
    const label = (y: number, t: string) => this.add.text(186, y, t, { fontFamily: FONT, fontSize: '12px', color: COLORS.dim }).setOrigin(0, 0.5);
    label(124, '배부름');
    this.hungerBar = bar(this, 236, 124, 262, 11, 0xffa94d);
    label(142, '피로');
    this.fatigueBar = bar(this, 236, 142, 262, 11, 0xff8787);
    label(160, '수명');
    this.lifeBar = bar(this, 236, 160, 262, 11, 0xb197fc);
    this.statsText = this.add.text(186, 174, '', { fontFamily: FONT, fontSize: '14px', color: COLORS.text, lineSpacing: 4 });
    this.apText = this.add.text(186, 220, '', { fontFamily: FONT, fontSize: '12px', color: '#ffd43b', wordWrap: { width: 316 } });
    this.recordText = this.add.text(12, 286, '', { fontFamily: FONT, fontSize: '12px', color: COLORS.dim, lineSpacing: 3 });
    this.noticeText = this.add.text(12, 328, '', { fontFamily: FONT, fontSize: '13px', color: '#ffd43b' });
    this.msgText = this.add
      .text(W / 2, 362, '', { fontFamily: FONT, fontSize: '14px', color: '#1e2129', backgroundColor: '#ffffffee', padding: { x: 8, y: 3 } })
      .setOrigin(0.5)
      .setAlpha(0)
      .setDepth(5);
    this.add.rectangle(W / 2, TOP_H - 2, W, 4, 0x0f1620);

    // ── 아래 화면: 육각형 케이지 사육장 ──
    this.add.rectangle(W / 2, TOP_H + 192, W, 384, 0x6fae78);
    this.add.text(10, TOP_H + 6, '기본 케이지', { fontFamily: FONT, fontSize: '11px', color: '#1e2129' });
    this.add.text(170, TOP_H + 6, '확장 공간 — 디지몬을 끌어서 케이지로 옮기세요', { fontFamily: FONT, fontSize: '11px', color: '#1e2129' });
    this.hexGfx = this.add.graphics();
    this.ring = this.add.ellipse(0, 0, 44, 14).setStrokeStyle(2, 0xffffff).setFillStyle(0xffffff, 0.35);
    this.add.rectangle(W / 2, 706, W, 124, COLORS.bg);

    const bw = 94;
    const row = (y: number, items: [string, () => void][]) => items.forEach(([t, fn], i) => new Button(this, 12 + bw / 2 + i * (bw + 4.5), y, bw, 34, t, fn));
    row(668, [
      ['먹이', () => this.act(feed(state.save, state.selectedUid))],
      ['썩은 고기', () => this.act(feedRotten(state.save, state.selectedUid))],
      ['청소', () => this.act(clean(state.save, state.selectedUid))],
      ['치료', () => this.act(heal(state.save, state.selectedUid))],
      ['진화 힌트', () => this.showHints()],
    ]);
    row(708, [
      ['배틀', () => this.showBattleMenu()],
      ['사냥', () => this.showHunt()],
      ['상점', () => this.showShop()],
      ['일정', () => this.showSchedule()],
      ['기타', () => this.showEtc()],
    ]);
    this.add.text(W / 2, 750, '현실 1초 = 게임 1분 · 자동 저장', { fontFamily: FONT, fontSize: '11px', color: COLORS.dim }).setOrigin(0.5);

    this.input.on('dragstart', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => {
      const uid = obj.getData('uid') as number;
      const v = this.views.get(uid);
      if (!v) return;
      v.dragging = true;
      obj.setDepth(4);
      state.selectedUid = uid;
      this.refresh();
    });
    this.input.on('drag', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container, x: number, y: number) => obj.setPosition(x, y));
    this.input.on('dragend', (_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.Container) => {
      const uid = obj.getData('uid') as number;
      const v = this.views.get(uid);
      if (!v) return;
      v.dragging = false;
      obj.setDepth(1);
      const target = this.cageAt(obj.x, obj.y);
      const d = state.save.digimon.find((x) => x.uid === uid);
      if (target && d && target !== d.cage) this.act(setCage(state.save, uid, target));
      else this.refresh();
    });

    this.refresh();
    if (state.offlineMinutes > 0) {
      this.say(`자리를 비운 동안 ${Math.floor(state.offlineMinutes / 60)}시간 ${state.offlineMinutes % 60}분이 흘렀다.`);
      state.offlineMinutes = 0;
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => state.persist());
  }

  update(_t: number, dt: number) {
    this.acc += dt * state.speed;
    let ticks = 0;
    while (this.acc >= 1000 && ticks < 120) {
      this.acc -= 1000;
      ticks++;
      const r = tickFarm(state.save);
      state.save = r.save;
      this.handleEvents(r.events);
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

  private cycle(dir: number) {
    const list = state.save.digimon;
    const i = list.findIndex((d) => d.uid === state.selectedUid);
    state.selectedUid = list[(i + dir + list.length) % list.length].uid;
    this.refresh();
  }

  private act(r: ActionResult) {
    if (r.ok) {
      state.save = r.save;
      state.persist();
    }
    this.closeOverlay();
    this.say(r.message, !r.ok);
    this.refresh();
  }

  private handleEvents(events: FarmEvent[]) {
    for (const e of events) {
      if (e.type === 'hatched') this.say(`디지에그가 부화했다! ${e.to} 탄생!`);
      if (e.type === 'evolved') {
        this.say(`${e.from}이(가) ${e.to}(으)로 진화했다!`);
        playSound(this, 'se_evolve');
        this.cameras.main.flash(300, 255, 255, 255);
      }
      if (e.type === 'egg') this.say(`${e.from}이(가) 수명을 다해 디지에그로 돌아갔다.`);
      if (e.type === 'lost') this.say(`${e.name}을(를) 잃었다… (${e.reason})`, true);
      if (e.type === 'sick') this.say(`${e.name}이(가) 병에 걸렸다! (페널티 +1)`, true);
      if (e.type === 'blocked')
        this.say(e.reason === 'rank' ? `${e.name}: 테이머 랭크가 낮아 진화할 수 없다! 타이틀을 따자.` : `${e.name}: 사육 용량이 부족해 진화할 수 없다!`, true);
    }
  }

  // ---------- 케이지 배치 ----------
  private expansionCages() {
    return state.save.cages.filter((id) => id !== '기본 케이지');
  }

  private cageCenters(cageId: string): { x: number; y: number }[] {
    if (cageId === '기본 케이지') return BASIC_HEX;
    const i = this.expansionCages().indexOf(cageId);
    return i < 0 ? BASIC_HEX : [slotPos(i)];
  }

  private cageAt(x: number, y: number): string | null {
    for (const id of state.save.cages) for (const c of this.cageCenters(id)) if (Phaser.Math.Distance.Between(x, y, c.x, c.y) <= HEX_R) return id;
    return null;
  }

  private drawHexes() {
    const sig = state.save.cages.join('|');
    if (sig === this.hexSig) return;
    this.hexSig = sig;
    const g = this.hexGfx.clear();
    this.hexLabels.forEach((t) => t.destroy());
    this.hexLabels = [];
    const hex = (x: number, y: number, fill: number, alpha = 1) => {
      const pts = Array.from({ length: 6 }, (_, k) => new Phaser.Math.Vector2(x + HEX_R * Math.cos((Math.PI / 3) * k), y + HEX_R * Math.sin((Math.PI / 3) * k)));
      g.fillStyle(fill, alpha).fillPoints(pts, true);
      g.lineStyle(2, 0x2f5d3a, alpha).strokePoints(pts, true);
    };
    for (let i = 0; i < 18; i++) hex(slotPos(i).x, slotPos(i).y, 0x5c9a66, 0.5);
    BASIC_HEX.forEach((p) => hex(p.x, p.y, CAGE_COLOR.basic));
    this.expansionCages().forEach((id, i) => {
      const cage = getCage(id);
      const p = slotPos(i);
      hex(p.x, p.y, cage.rest ? CAGE_COLOR.rest : CAGE_COLOR.train);
      const effect = cage.rest ? '회복' : [...(cage.up ?? []).map((k) => STAT_LABEL[k]), ...(cage.apUp ?? [])].slice(0, 2).join('·') + '↑';
      this.hexLabels.push(
        this.add.text(p.x, p.y - 30, id.replace('미니 ', ''), { fontFamily: FONT, fontSize: '10px', color: '#1e2129' }).setOrigin(0.5, 0),
        this.add.text(p.x, p.y + 30, effect, { fontFamily: FONT, fontSize: '9px', color: '#5c3d00' }).setOrigin(0.5, 1),
      );
    });
  }

  // ---------- 화면 갱신 ----------
  private refresh() {
    const save = state.save;
    if (!save.digimon.some((d) => d.uid === state.selectedUid)) state.selectedUid = save.digimon[0].uid;
    this.drawHexes();

    const alive = new Set(save.digimon.map((d) => d.uid));
    for (const [uid, v] of this.views) {
      if (!alive.has(uid)) {
        v.c.destroy();
        v.poops.forEach((p) => p.destroy());
        this.views.delete(uid);
      }
    }
    const seat = new Map<string, number>();
    for (const d of save.digimon) {
      const sig = `${d.speciesId}:${d.isEgg}`;
      let v = this.views.get(d.uid);
      if (!v || v.sig !== sig) {
        v?.c.destroy();
        const c = digimonView(this, d.speciesId, d.isEgg).setScale(0.55).setDepth(1).setData('uid', d.uid);
        c.setInteractive({ useHandCursor: true, draggable: true });
        c.on('pointerdown', () => {
          state.selectedUid = d.uid;
          this.refresh();
        });
        v = { c, sig, poops: v?.poops ?? [], dragging: false };
        this.views.set(d.uid, v);
      }
      // 케이지 안 자리 배정
      const n = seat.get(d.cage) ?? 0;
      seat.set(d.cage, n + 1);
      const centers = this.cageCenters(d.cage);
      const center = centers[n % centers.length];
      const ringSlot = Math.floor(n / centers.length);
      const cap = d.cage === '기본 케이지' ? 3 : getCage(d.cage).capacity;
      const angle = (Math.PI * 2 * (d.cage === '기본 케이지' ? ringSlot : n)) / Math.max(1, cap) + Math.PI / 2;
      const spread = cap <= 1 || (d.cage === '기본 케이지' && ringSlot === 0 && save.digimon.length <= 4) ? 0 : 15;
      if (!v.dragging) v.c.setPosition(center.x + Math.cos(angle) * spread, center.y + Math.sin(angle) * spread - 4);
      if (v.poops.length !== d.poop) {
        v.poops.forEach((p) => p.destroy());
        v.poops = Array.from({ length: d.poop }, () => this.add.image(0, 0, 'poop').setScale(0.7));
      }
      v.poops.forEach((p, i) => p.setPosition(v!.c.x - 16 + i * 9, v!.c.y + 20));
      v.c.setAlpha(d.sick || d.injured ? 0.55 : 1);
    }

    const date = dateOf(save.clock);
    const rank = tamerRank(save);
    this.headText.setText(`${date.year}년째 ${date.seasonName} ${date.day}일 ${String(date.hour).padStart(2, '0')}:${String(date.minute).padStart(2, '0')}  랭크 ${rank}  ${save.bits} bit`);
    this.infoText.setText(`용량 ${usedCapacity(save)}/${CAPACITY}G · 고기 ${save.meat} · 알약 ${save.pills} · 썩은 고기 ${save.rotten}`);
    const matches = todaysMatches(save);
    this.noticeText.setText(matches.length ? `★ 오늘의 매치: ${matches.map((m) => m.name).join(', ')} (15시까지 엔트리)` : '');

    const d = state.selected;
    const sp = getSpecies(d.speciesId);
    const view = this.views.get(d.uid);
    if (view) this.ring.setPosition(view.c.x, view.c.y + 14);
    const pSig = `${d.speciesId}:${d.isEgg}`;
    if (pSig !== this.portraitSig) {
      this.portraitSig = pSig;
      this.portrait?.destroy();
      this.portrait = digimonView(this, d.speciesId, d.isEgg, false).setPosition(92, 160).setScale(d.isEgg ? 2.2 : Math.min(2.2, 110 / (26 + sp.stage * 9)));
    }
    const idx = save.digimon.findIndex((x) => x.uid === d.uid) + 1;
    if (d.isEgg) {
      this.nameText.setText('디지에그');
      this.subText.setText(`${idx}/${save.digimon.length}마리째 · 곧 부화합니다`);
      this.statsText.setText('');
      this.apText.setText('');
      this.recordText.setText(`디지에그화 ${d.eggs}회 · 태어날 디지몬: ${d.originBaby}`);
      this.hungerBar.set(0);
      this.fatigueBar.set(0);
      this.lifeBar.set(0);
      return;
    }
    const status = [d.sick ? '병' : '', d.injured ? '부상' : ''].filter(Boolean).join('·');
    this.nameText.setText(sp.name + (status ? `  ⚠${status}` : ''));
    this.subText.setText(`${STAGE_LABEL[sp.stage]} · ${sp.family} · ${sp.attr} · ${sp.size}G · ${idx}/${save.digimon.length}마리째`);
    this.hungerBar.set(d.hunger / 100);
    this.fatigueBar.set(d.fatigue / 100);
    this.lifeBar.set(Math.min(1, d.stageAge / LIFESPAN[sp.stage]));
    this.statsText.setText(
      STAT_KEYS.slice(0, 3).map((k) => `${STAT_LABEL[k]} ${d.stats[k]}`).join('   ') + '\n' + STAT_KEYS.slice(3).map((k) => `${STAT_LABEL[k]} ${d.stats[k]}`).join('   '),
    );
    const aps = [...FAMILIES, ...ATTRS].filter((k) => d.ap[k] >= 1).map((k) => `${k} ${Math.floor(d.ap[k])}`);
    this.apText.setText(aps.length ? `속성: ${aps.join(' · ')}` : '속성: 아직 없음 (훈련 케이지에 넣으면 오릅니다)');
    this.recordText.setText(`성격 ${d.personality} · 케이지 ${d.cage}\n배틀 ${d.battles}회 (승 ${d.wins}) · 페널티 ${d.penalties} · 디지에그화 ${d.eggs}`);
  }

  private say(text: string, bad = false) {
    this.msgText.setText(text).setColor(bad ? '#b02a2a' : '#1e2129');
    this.tweens.killTweensOf(this.msgText);
    this.msgText.setAlpha(1);
    this.tweens.add({ targets: this.msgText, alpha: 0, delay: 2600, duration: 500 });
  }

  private showCredits() {
    const o = this.openOverlay('크레딧', 460);
    o.text('비영리 팬게임입니다. 공식 게임과 관계가 없습니다.', COLORS.text, 14);
    o.gap();
    o.text('디지몬 및 디지몬 챔피언쉽: © 본고 아키요시 · 토에이 애니메이션 / 반다이남코', COLORS.dim, 12);
    o.text('진화 루트·진화 조건·시스템 설명: 나무위키 「디지몬 챔피언십」 문서 (CC BY-NC-SA 2.0 KR)', COLORS.dim, 12);
    o.text('게임 엔진: Phaser 3 (MIT)', COLORS.dim, 12);
    o.text('이 게임의 소스 코드: MIT (저장소의 LICENSE 파일)', COLORS.dim, 12);
    o.text('디지몬 그림·소리: 포함되어 있지 않음 (임시 도형 사용)', COLORS.dim, 12);
    o.gap();
    o.text('버그 제보 · 문의 · 삭제 요청:\ngithub.com/Tom7418/digimonchamp/issues', COLORS.text, 13);
  }

  private showEtc() {
    const o = this.openOverlay('기타', 300);
    o.gap(10);
    o.button('크레딧', () => this.showCredits(), 280);
    o.button('선택한 디지몬 놓아주기', () => this.confirm('이 디지몬을 놓아줄까요?', () => this.act(release(state.save, state.selectedUid))), 280);
    o.button('처음부터 다시 시작', () => this.confirm('모든 진행을 지우고 처음부터 시작할까요?', () => this.resetAll()), 280);
  }

  // ---------- 오버레이 ----------
  private openOverlay(title: string, height = 600) {
    this.closeOverlay();
    const c = this.add.container(0, 0).setDepth(10);
    c.add(this.add.rectangle(W / 2, 384, W, 768, 0x000000, 0.65).setInteractive());
    c.add(this.add.rectangle(W / 2, 384, W - 32, height, COLORS.panel).setStrokeStyle(2, COLORS.accent));
    c.add(this.add.text(W / 2, 384 - height / 2 + 22, title, { fontFamily: FONT, fontSize: '19px', color: COLORS.text }).setOrigin(0.5));
    c.add(new Button(this, W / 2, 384 + height / 2 - 28, 120, 34, '닫기', () => this.closeOverlay()));
    this.overlay = c;
    let y = 384 - height / 2 + 50;
    const text = (t: string, color: string = COLORS.text, size = 14, x = 36) => {
      const o = this.add.text(x, y, t, { fontFamily: FONT, fontSize: `${size}px`, color, wordWrap: { width: W - 2 * x } });
      c.add(o);
      y += o.height + 4;
    };
    const button = (t: string, fn: () => void, w = W - 80, enabled = true) => {
      const b = new Button(this, W / 2, y + 16, w, 30, t, fn).setEnabled(enabled);
      c.add(b);
      y += 36;
      return b;
    };
    return { c, text, button, gap: (n = 8) => (y += n), y: () => y };
  }

  private closeOverlay() {
    this.overlay?.destroy(true);
    this.overlay = undefined;
  }

  private confirm(question: string, yes: () => void) {
    const o = this.openOverlay(question, 220);
    o.gap(20);
    o.button('네', yes, 200);
  }

  private resetAll() {
    resetGame();
    state.save = freshSave();
    state.selectedUid = state.save.digimon[0].uid;
    state.persist();
    this.scene.restart();
  }

  private showHints() {
    const d = state.selected;
    const o = this.openOverlay('진화 힌트', 660);
    if (d.isEgg) return o.text('아직 디지에그입니다.', COLORS.dim);
    const sp = getSpecies(d.speciesId);
    const list = hints(d, new Set(state.save.seen));
    if (!list.length) return o.text('더 진화하지 않습니다. 수명이 다하면 디지에그로 돌아갑니다.', COLORS.dim);
    const remain = Math.max(0, LIFESPAN[sp.stage] - d.stageAge);
    const early = Math.max(0, LIFESPAN[sp.stage] * 0.2 - d.stageAge);
    o.text(
      `수명까지 약 ${Math.ceil(remain / 60)}시간` + (early > 0 ? ` · 조건 진화는 ${Math.ceil(early / 60)}시간 뒤부터` : ' · 조건을 채우면 한 시간 안에 진화'),
      COLORS.dim,
      12,
    );
    if (sp.stage + 1 > maxStageForRank(tamerRank(state.save))) o.text('※ 테이머 랭크가 낮아 다음 세대로 진화할 수 없습니다. 타이틀 매치에서 이기세요.', COLORS.bad, 12);
    list.forEach((h, i) => {
      o.text(`${i + 1}. ${h.name} (${h.stage})${h.ready ? '  ← 충족' : ''}`, h.ready ? COLORS.good : COLORS.text, 15);
      h.checks.forEach((ch) => o.text(`${ch.met ? '✔' : '✘'} ${ch.label}`, ch.met ? COLORS.good : COLORS.bad, 12, 52));
      o.gap(2);
    });
    o.text('위에서부터 검사해 처음 충족하는 쪽으로 진화합니다.', COLORS.dim, 11);
  }

  private showShop() {
    const o = this.openOverlay(`상점 (${state.save.bits} bit)`, 680);
    for (const item of shopItems(state.save)) {
      o.button(`${item.name}  —  ${item.price} bit`, () => {
        const r = buy(state.save, item);
        if (r.ok) state.save = r.save;
        this.say(r.message, !r.ok);
        this.refresh();
        this.showShop();
      });
    }
    const locked = CAGES.filter((c) => c.price > 0 && !state.save.cages.includes(c.id) && tamerRank(state.save) < c.minRank);
    if (locked.length) o.text(`랭크가 오르면 추가: ${locked.map((c) => c.id).join(', ')}`, COLORS.dim, 12);
  }

  private showSchedule() {
    const o = this.openOverlay('일정', 420);
    const rank = tamerRank(state.save);
    o.text(`테이머 랭크 ${rank} · 진화 가능 세대: ${STAGE_LABEL[maxStageForRank(rank)]}까지`, COLORS.text, 14);
    o.text(`획득 타이틀 ${state.save.titles.length}개${state.save.champion ? ' · 챔피언십 우승!' : ''}`, COLORS.dim, 13);
    o.gap();
    o.text('도전할 수 있는 매치 (당일 08:00~15:00 엔트리)', COLORS.dim, 12);
    upcoming(state.save).forEach((l) => o.text(l));
    o.text('한 계절은 10일, 1년은 40일입니다.', COLORS.dim, 11);
  }

  private showHunt() {
    const date = dateOf(state.save.clock);
    if (date.hour >= 22 || date.hour < 6) return this.say('22시 이후에는 사냥할 수 없어요.', true);
    const rank = tamerRank(state.save);
    const o = this.openOverlay(`사냥터 (${date.seasonName})`, 560);
    o.text('로프로 디지몬 둘레에 원을 세 번 그리면 잡습니다. 사냥에는 2시간이 걸립니다.', COLORS.dim, 12);
    for (const f of FIELDS) {
      const here = f.spawns.filter(([, seasons]) => seasons.includes(SEASON_CODE[date.season])).length;
      const ok = rank >= f.minRank && state.save.bits >= f.fee && here > 0;
      const note = rank < f.minRank ? `랭크 ${f.minRank} 필요` : here === 0 ? '이 계절엔 없음' : f.fee ? `${f.fee} bit` : '무료';
      o.button(`${f.id}  (${note})`, () => {
        state.save = { ...state.save, bits: state.save.bits - f.fee };
        state.persist();
        this.scene.start('Hunt', { fieldId: f.id });
      }, W - 80, ok);
    }
  }

  private showBattleMenu() {
    const date = dateOf(state.save.clock);
    const o = this.openOverlay('배틀', 620);
    const matches = todaysMatches(state.save);
    o.text('타이틀 매치', COLORS.dim, 12);
    if (!matches.length) o.text('오늘은 도전할 매치가 없습니다. (일정 참고)', COLORS.dim, 13);
    for (const m of matches) {
      const eggsOk = !m.needEggs || state.save.digimon.some((d) => d.eggs >= m.needEggs!);
      o.button(`${m.name} (${m.format}:${m.format}, 상대 ${STAGE_LABEL[m.stage]})${eggsOk ? '' : ` — 디지에그화 ${m.needEggs}회 필요`}`, () =>
        this.showMembers({ title: m.name, match: m, format: m.format, stage: m.stage, scale: m.scale, prize: m.prize, members: [] }), W - 80, eggsOk);
    }
    o.gap();
    o.text(`프리 배틀 (${String(date.hour).padStart(2, '0')}시) — ★이 많을수록 상대 세대가 높습니다`, COLORS.dim, 12);
    for (let stars = 1; stars <= 5; stars++) {
      const stage = (stars + 1) as 2 | 3 | 4 | 5 | 6;
      const y = o.y();
      for (const [i, format] of ([1, 3] as const).entries()) {
        const prize = 60 * stars * (format === 3 ? 2 : 1);
        const b = new Button(this, 140 + i * 232, y + 16, 220, 30, `${'★'.repeat(stars)} ${format}:${format} (${prize} bit)`, () =>
          this.showMembers({ title: `프리 배틀 ${'★'.repeat(stars)}`, format, stage, scale: 1, prize, members: [] }));
        o.c.add(b);
      }
      o.gap(36);
    }
  }

  private showMembers(setup: BattleSetup) {
    const o = this.openOverlay(`${setup.title} — 출전 선택`, 660);
    o.text(`${setup.format}마리까지 고르고, 공격 타입을 정하세요. 배틀 중에는 지시할 수 없습니다.`, COLORS.dim, 12);
    const ready = (d: Digimon) => !d.isEgg && !d.sick && !d.injured && d.fatigue < 90 && d.hunger > 5;
    const chosen = new Map<number, AttackMode>(setup.members.map((m) => [m.uid, m.mode]));
    const modes: AttackMode[] = ['일반', '특수', '지원'];
    const list = state.save.digimon.filter((d) => !d.isEgg).slice(0, 11);
    for (const d of list) {
      const ok = ready(d);
      const mode = chosen.get(d.uid);
      const sp = getSpecies(d.speciesId);
      const y = o.y();
      const pickBtn = new Button(this, 190, y + 16, 300, 30, `${mode ? '☑' : '☐'} ${sp.name} [${STAGE_LABEL[sp.stage]}] ${d.personality}${ok ? '' : ' (출전 불가)'}`, () => {
        if (chosen.has(d.uid)) chosen.delete(d.uid);
        else if (chosen.size < setup.format) chosen.set(d.uid, '일반');
        this.showMembers({ ...setup, members: [...chosen].map(([uid, m]) => ({ uid, mode: m })) });
      }).setEnabled(ok);
      const modeBtn = new Button(this, 410, y + 16, 120, 30, mode ? `${mode} 공격` : '-', () => {
        if (!mode) return;
        chosen.set(d.uid, modes[(modes.indexOf(mode) + 1) % 3]);
        this.showMembers({ ...setup, members: [...chosen].map(([uid, m]) => ({ uid, mode: m })) });
      }).setEnabled(!!mode);
      o.c.add([pickBtn, modeBtn]);
      o.gap(36);
    }
    o.gap();
    o.button('배틀 시작!', () => {
      state.persist();
      this.scene.start('Battle', { ...setup, members: [...chosen].map(([uid, m]) => ({ uid, mode: m })) });
    }, 220, chosen.size > 0);
  }
}
