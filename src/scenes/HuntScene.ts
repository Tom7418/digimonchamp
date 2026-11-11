import Phaser from 'phaser';
import { advance, capture } from '../core/care';
import { dateOf, FIELDS, SEASON_CODE } from '../core/data';
import { state } from '../state';
import { digimonView, playSound } from '../ui/art';
import { Button, COLORS, FONT } from '../ui/Button';

const W = 512;
const AREA = { x0: 40, x1: W - 40, y0: 90, y1: 600 };
const LOOPS_NEEDED = 3;
const TIME = 40;

interface Wild {
  id: string;
  c: Phaser.GameObjects.Container;
  angle: number | null;
  turned: number;
  caught: boolean;
  label: Phaser.GameObjects.Text;
}

/** 사냥: 로프(포인터 드래그)로 디지몬 둘레에 원을 그려 포획한다 */
export class HuntScene extends Phaser.Scene {
  private wilds: Wild[] = [];
  private rope!: Phaser.GameObjects.Graphics;
  private trail: Phaser.Math.Vector2[] = [];
  private left = TIME;
  private timeText!: Phaser.GameObjects.Text;
  private msg!: Phaser.GameObjects.Text;
  private over = false;

  constructor() {
    super('Hunt');
  }

  create(data: { fieldId: string }) {
    this.wilds = [];
    this.trail = [];
    this.left = TIME;
    this.over = false;
    const field = FIELDS.find((f) => f.id === data.fieldId)!;
    const season = SEASON_CODE[dateOf(state.save.clock).season];
    const pool = field.spawns.filter(([, s]) => s.includes(season)).map(([n]) => n);

    this.add.rectangle(W / 2, 384, W, 768, 0x8fc98f);
    this.add.rectangle(W / 2, 30, W, 60, COLORS.bg);
    this.add.text(12, 8, `${field.id} — 디지몬 둘레에 원을 ${LOOPS_NEEDED}번 그리세요`, { fontFamily: FONT, fontSize: '14px', color: COLORS.text });
    this.timeText = this.add.text(12, 32, '', { fontFamily: FONT, fontSize: '14px', color: COLORS.dim });
    this.msg = this.add.text(W / 2, 640, '', { fontFamily: FONT, fontSize: '16px', color: '#1e2129', backgroundColor: '#ffffffdd', padding: { x: 8, y: 4 } }).setOrigin(0.5).setVisible(false);
    this.rope = this.add.graphics().setDepth(5);

    for (let i = 0; i < 4; i++) {
      const id = Phaser.Utils.Array.GetRandom(pool);
      const c = digimonView(this, id).setPosition(Phaser.Math.Between(AREA.x0, AREA.x1), Phaser.Math.Between(AREA.y0, AREA.y1));
      const label = this.add.text(0, -40, '', { fontFamily: FONT, fontSize: '13px', color: '#c92a2a', fontStyle: 'bold' }).setOrigin(0.5);
      c.add(label);
      const w: Wild = { id, c, angle: null, turned: 0, caught: false, label };
      this.wilds.push(w);
      this.roam(w);
    }

    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || this.over) return;
      this.trail.push(new Phaser.Math.Vector2(p.x, p.y));
      if (this.trail.length > 60) this.trail.shift();
      for (const w of this.wilds) {
        if (w.caught) continue;
        const dist = Phaser.Math.Distance.Between(p.x, p.y, w.c.x, w.c.y);
        if (dist > 160 || dist < 12) {
          w.angle = null;
          continue;
        }
        const a = Math.atan2(p.y - w.c.y, p.x - w.c.x);
        if (w.angle !== null) w.turned += Phaser.Math.Angle.Wrap(a - w.angle);
        w.angle = a;
        const loops = Math.floor(Math.abs(w.turned) / (Math.PI * 2));
        w.label.setText(loops > 0 ? `${loops}/${LOOPS_NEEDED}` : '');
        if (loops >= LOOPS_NEEDED) this.catch(w);
      }
    });
    this.input.on('pointerup', () => {
      this.trail = [];
      // 로프를 놓으면 감던 것이 풀린다
      for (const w of this.wilds) {
        w.angle = null;
        if (!w.caught) {
          w.turned = 0;
          w.label.setText('');
        }
      }
    });
    new Button(this, W - 70, 742, 110, 32, '돌아가기', () => this.leave());
  }

  update(_t: number, dt: number) {
    if (this.over) return;
    this.left -= dt / 1000;
    this.timeText.setText(`남은 시간 ${Math.max(0, Math.ceil(this.left))}초 · 용량이 부족하면 잡을 수 없습니다`);
    this.rope.clear();
    if (this.trail.length > 1) {
      this.rope.lineStyle(4, 0xfff3bf, 0.9);
      this.rope.strokePoints(this.trail);
    }
    if (this.left <= 0) {
      this.over = true;
      this.msg.setText('시간 종료!').setVisible(true);
    }
  }

  private roam(w: Wild) {
    if (w.caught) return;
    this.tweens.add({
      targets: w.c,
      x: Phaser.Math.Between(AREA.x0, AREA.x1),
      y: Phaser.Math.Between(AREA.y0, AREA.y1),
      duration: Phaser.Math.Between(2800, 4800),
      onComplete: () => this.roam(w),
    });
  }

  private catch(w: Wild) {
    const r = capture(state.save, w.id);
    this.msg.setText(r.message).setVisible(true);
    if (!r.ok) {
      w.turned = 0;
      return;
    }
    state.save = r.save;
    state.selectedUid = r.save.digimon[r.save.digimon.length - 1].uid;
    w.caught = true;
    playSound(this, 'se_capture');
    this.tweens.killTweensOf(w.c);
    this.tweens.add({ targets: w.c, scale: 0, duration: 400, onComplete: () => w.c.destroy() });
  }

  private leave() {
    state.save = advance(state.save, 120).save;
    state.persist();
    this.scene.start('Farm');
  }
}
