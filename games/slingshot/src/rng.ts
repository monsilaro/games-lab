// Tiny seedable RNG so story levels generate the same layout every time. Arcade
// keeps using Math.random (passed in as the default), story passes a seeded one.

export type Rng = () => number; // returns a float in [0, 1)

/** mulberry32 — fast, decent-quality, fully deterministic from a 32-bit seed. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randRange(r: Rng, min: number, max: number): number {
  return min + r() * (max - min);
}

export function pick<T>(r: Rng, arr: readonly T[]): T {
  return arr[(r() * arr.length) | 0]!;
}
