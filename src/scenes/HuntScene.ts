import Phaser from 'phaser';
import { advance, capture } from '../core/care';
import { dateOf, FIELDS, SEASON_CODE } from '../core/data';
import { state } from '../state';
import { digimonView, playSound } from '../ui/art';
import { Button, COLORS, FONT } from '../ui/Button';

const W = 512;
const AREA = { x0: 40, x1: W - 40, y0: 430, y1: 690 };
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
  private caught: string[] = [];

  constructor() {
    super('Hunt');
  }

  create(data: { fieldId: string }) {
    this.wilds = [];
    this.trail = [];
    this.left = TIME;
    this.over = false;
    this.caught = [];
    const field = FIELDS.find((f) => f.id === data.fieldId)!;
    const season = SEASON_CODE[dateOf(state.save.clock).season];
    const pool = field.spawns.filter(([, s]) => s.includes(season)).map(([n]) => n);

    // 위 화면: 사냥터 정보
    this.add.rectangle(W / 2, 192, W, 384, 0x243447);
    this.add.rectangle(W / 2, 22, W, 44, 0x1b2838);
    this.add.text(W / 2, 10, `사냥터: ${field.id}`, { fontFamily: FONT, fontSize: '18px', color: COLORS.text }).setOrigin(0.5, 0);
    this.timeText = this.add.text(12, 60, '', { fontFamily: FONT, fontSize: '15px', color: COLORS.text });
    this.add.text(12, 92, `이 계절에 나타나는 디지몬\n${[...new Set(pool)].join(', ')}`, { fontFamily: FONT, fontSize: '13px', color: COLORS.dim, lineSpacing: 4, wordWrap: { width: W - 24 } });
    this.add.text(12, 170, `아래 화면에서 로프를 끌어 디지몬 둘레에 원을 ${LOOPS_NEEDED}번 그리면 잡습니다.\n손을 떼면 감던 로프가 풀립니다. 사육 용량이 부족하면 잡을 수 없습니다.`, {
      fontFamily: FONT,
      fontSize: '12px',
      color: COLORS.dim,
      lineSpacing: 4,
      wordWrap: { width: W - 24 },
    });
    this.msg = this.add.text(12, 250, '', { fontFamily: FONT, fontSize: '15px', color: '#ffd43b', lineSpacing: 4 });
    this.add.rectangle(W / 2, 382, W, 4, 0x0f1620);
    // 아래 화면: 필드
    this.add.rectangle(W / 2, 576, W, 384, 0x8fc98f);
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
    this.timeText.setText(`남은 시간 ${Math.max(0, Math.ceil(this.left))}초`);
    this.rope.clear();
    if (this.trail.length > 1) {
      this.rope.lineStyle(4, 0xfff3bf, 0.9);
      this.rope.strokePoints(this.trail);
    }
    if (this.left <= 0) {
      this.over = true;
      this.caught.push('시간 종료!');
      this.msg.setText(this.caught.join('\n'));
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
    this.caught.push(r.message);
    this.msg.setText(this.caught.slice(-5).join('\n'));
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
