/**
 * Deterministic 32-bit Mulberry32 PRNG + Crockford base32 Dream Seed Codes.
 */

function fold(x: number): number {
  let z = (x ^ (x >>> 16)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  return (z ^ (z >>> 16)) >>> 0;
}

function hashLabel(state: number, label: string): number {
  let h = (0x811c9dc5 ^ state) >>> 0;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  }
  return fold(h);
}

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = fold(seed >>> 0);
  }

  nextU32(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ (t + Math.imul(t ^ (t >>> 7), t | 61))) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }

  nextInt(max: number): number {
    return Math.floor((this.nextU32() / 4294967296) * max);
  }

  range(lo: number, hi: number): number {
    return lo + this.nextInt(hi - lo + 1);
  }

  nextDouble(): number {
    return this.nextU32() / 4294967296;
  }

  chance(p: number): boolean {
    return this.nextDouble() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[this.nextInt(items.length)];
  }

  pickWeighted<T>(items: readonly T[], weights: readonly number[]): T {
    let total = 0;
    for (const w of weights) total += w;
    let roll = this.nextDouble() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll < 0) return items[i];
    }
    return items[items.length - 1];
  }

  fork(label: string): Rng {
    return new Rng(hashLabel(this.state, label));
  }
}

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const SeedCode = {
  encode(seed: number): string {
    let v = seed >>> 0;
    const chars = new Array<string>(8);
    for (let i = 7; i >= 0; i--) {
      chars[i] = ALPHABET[v & 31];
      v >>>= 5;
    }
    return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`;
  },

  fromInput(input: string): number {
    const trimmed = input.trim();
    if (!trimmed) return 0x4d4f4749;
    const cleaned = trimmed.toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (cleaned.length === 8 && [...cleaned].every((ch) => ALPHABET.includes(ch))) {
      let acc = 0;
      for (const ch of cleaned) {
        acc = ((acc << 5) | ALPHABET.indexOf(ch)) >>> 0;
      }
      return acc;
    }
    let h = 0x811c9dc5;
    for (let i = 0; i < trimmed.length; i++) {
      h = Math.imul(h ^ trimmed.charCodeAt(i), 0x01000193) >>> 0;
    }
    return fold(h);
  },
};
