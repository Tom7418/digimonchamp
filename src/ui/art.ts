import Phaser from 'phaser';
import { getSpecies } from '../core/data';
import type { Family } from '../core/types';
import { FONT } from './Button';

/**
 * 그림·소리 끼우는 자리.
 * - src/assets/sprites/<디지몬 이름>.png (gif, webp 가능)  예: 아구몬.png, 메탈그레이몬(청).png, 디지에그.png
 * - src/assets/sounds/<이름>.mp3 (ogg, wav 가능)  이름: bgm_farm, bgm_battle, se_hit, se_special, se_evolve, se_capture
 * 파일이 없으면 색 원 + 이름표로 대신 그린다.
 */
const spriteUrls = import.meta.glob('../assets/sprites/*.{png,gif,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const soundUrls = import.meta.glob('../assets/sounds/*.{mp3,ogg,wav}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const base = (path: string) => path.split('/').pop()!.replace(/\.[^.]+$/, '').normalize('NFC');

export function preloadAssets(scene: Phaser.Scene) {
  for (const [path, url] of Object.entries(spriteUrls)) scene.load.image(`sp:${base(path)}`, url);
  for (const [path, url] of Object.entries(soundUrls)) scene.load.audio(`snd:${base(path)}`, url);
  // 도트 그림이 확대될 때 흐려지지 않도록 최근접 필터를 쓴다 (글씨는 그대로 부드럽게)
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => {
    for (const key of scene.textures.getTextureKeys()) {
      if (key.startsWith('sp:')) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    }
  });
}

/** 작은 도트(64px 이하)는 정수 배율로 키워 픽셀이 고르게 보이게 한다 */
export function spriteScale(width: number, height: number, target: number) {
  const side = Math.max(width, height);
  const raw = target / side;
  return side <= 64 ? Math.max(1, Math.round(raw)) : raw;
}

const FAMILY_COLOR: Record<Family, number> = {
  용: 0xe8590c,
  짐승: 0xc99a5b,
  물: 0x339af0,
  새: 0x74c0fc,
  벌레풀: 0x51a351,
  기계: 0x868e96,
  성: 0xffe066,
  암흑: 0x7048e8,
};

/** 디지몬 한 마리의 화면 표시. 스프라이트가 있으면 그것을, 없으면 임시 도형을 쓴다 */
export function digimonView(scene: Phaser.Scene, speciesId: string, isEgg = false, showName = true): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0);
  const name = isEgg ? '디지에그' : getSpecies(speciesId).name;
  const stage = isEgg ? 1 : getSpecies(speciesId).stage;
  const size = 26 + stage * 9;
  const key = `sp:${name.normalize('NFC')}`;
  if (scene.textures.exists(key)) {
    const img = scene.add.image(0, 0, key);
    img.setScale(spriteScale(img.width, img.height, size * 1.6));
    c.add(img);
  } else if (isEgg) {
    c.add(scene.add.ellipse(0, 0, size * 0.9, size * 1.15, 0xf8f0dc).setStrokeStyle(2, 0x22232b));
  } else {
    c.add(scene.add.circle(0, 0, size / 2, FAMILY_COLOR[getSpecies(speciesId).family]).setStrokeStyle(2, 0x22232b));
  }
  if (showName) {
    c.add(
      scene.add
        .text(0, size / 2 + 4, name, { fontFamily: FONT, fontSize: '12px', color: '#1e2129', backgroundColor: '#ffffffaa', padding: { x: 3, y: 1 } })
        .setOrigin(0.5, 0),
    );
  }
  c.setSize(size + 10, size + 10);
  return c;
}

export function playSound(scene: Phaser.Scene, name: string, config?: Phaser.Types.Sound.SoundConfig) {
  const key = `snd:${name}`;
  if (!scene.cache.audio.exists(key)) return;
  try {
    scene.sound.play(key, config);
  } catch {
    /* 소리 재생 실패는 무시 */
  }
}

export function playBgm(scene: Phaser.Scene, name: string) {
  scene.sound.stopAll();
  playSound(scene, name, { loop: true, volume: 0.5 });
}
