export type Rng = () => number;

/** 시드 고정 난수 (mulberry32). 테스트와 배틀 재현용 */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const defaultRng: Rng = Math.random;
export const range = (rng: Rng, min: number, max: number) => min + rng() * (max - min);
export const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];
