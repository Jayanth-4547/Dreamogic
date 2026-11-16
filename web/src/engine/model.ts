export type TileKind = 'wall' | 'pillar' | 'start' | 'path' | 'gold' | 'door';

export type ClassifierKind =
  | 'quiet'
  | 'loud'
  | 'odd'
  | 'even'
  | 'hue'
  | 'flowUp'
  | 'flowDown';

export type ModifierKind = 'none' | 'stillness' | 'once' | 'tether';

export type GateMode = 'doorbell' | 'unison' | 'patience';

export type GateAction = 'tap' | 'together' | 'stand';

export type Subject =
  | 'trees'
  | 'roots'
  | 'colors'
  | 'stillness'
  | 'footprints'
  | 'togetherness'
  | 'gold';

export type Tier = 'chill' | 'standard' | 'tricky' | 'nightmare';

export type PlayMode = 'solo-ai' | 'solo-pure' | 'couch-duo' | 'room-group' | 'room-random';

export type HeadStyle = 'hood' | 'crown' | 'turban' | 'hat' | 'hair';
export type CloakStyle = 'long' | 'poncho' | 'split' | 'shawl';
export type CharmStyle = 'lantern' | 'staff' | 'compass' | 'none';

export interface CharacterProfile {
  name: string;
  head: HeadStyle;
  cloak: CloakStyle;
  paletteIndex: number;
  charm: CharmStyle;
}

export const CHARACTER_PALETTES: readonly {
  id: string;
  name: string;
  cloak: string;
  trim: string;
  tunic: string;
  glow: string;
}[] = [
  { id: 'saffron', name: 'Saffron Dusk', cloak: '#E49B3B', trim: '#FFE099', tunic: '#4C332B', glow: '#FFC857' },
  { id: 'jade', name: 'Jade Mist', cloak: '#489E82', trim: '#C6F4DF', tunic: '#1E3D3A', glow: '#7BC8A4' },
  { id: 'cobalt', name: 'Cobalt Night', cloak: '#4F69C6', trim: '#D1DCFF', tunic: '#22274A', glow: '#8FA8FF' },
  { id: 'terracotta', name: 'Terracotta Clay', cloak: '#C85E4B', trim: '#FFD2C2', tunic: '#4A2524', glow: '#FF8A75' },
  { id: 'ivory', name: 'Ivory Moon', cloak: '#DDD6C7', trim: '#FFF8EB', tunic: '#3B364A', glow: '#F6EFE3' },
  { id: 'plum', name: 'Plum Velvet', cloak: '#8D54A8', trim: '#E8C8FA', tunic: '#331E42', glow: '#C98BF0' },
];

export const CLASSIFIER_KINDS: ClassifierKind[] = [
  'quiet',
  'loud',
  'odd',
  'even',
  'hue',
  'flowUp',
  'flowDown',
];

export const MODIFIER_KINDS: ModifierKind[] = ['none', 'stillness', 'once', 'tether'];

export const GATE_MODES: GateMode[] = ['doorbell', 'unison', 'patience'];

export function classifierSubject(k: ClassifierKind): Subject {
  switch (k) {
    case 'quiet':
    case 'loud':
    case 'odd':
    case 'even':
      return 'trees';
    case 'hue':
      return 'colors';
    case 'flowUp':
    case 'flowDown':
      return 'roots';
  }
}

export function inverseClassifier(k: ClassifierKind): ClassifierKind {
  switch (k) {
    case 'quiet':
      return 'loud';
    case 'loud':
      return 'quiet';
    case 'odd':
      return 'even';
    case 'even':
      return 'odd';
    case 'flowUp':
      return 'flowDown';
    case 'flowDown':
      return 'flowUp';
    case 'hue':
      return 'hue';
  }
}

export function gateAction(g: GateMode): GateAction {
  switch (g) {
    case 'doorbell':
      return 'tap';
    case 'unison':
      return 'together';
    case 'patience':
      return 'stand';
  }
}

export function isWalkableKind(kind: TileKind): boolean {
  return kind === 'start' || kind === 'path' || kind === 'gold' || kind === 'door';
}

export interface Tile {
  readonly row: number;
  readonly col: number;
  readonly kind: TileKind;
  readonly sprouts: number;
  readonly hue: number;
  /** 0 forward (-Z), 1 right (+X), 2 back (+Z), 3 left (-X) */
  readonly root: number;
  readonly decor: number;
  readonly seed: number;
  readonly elevation: number;
}

export interface GateSpec {
  readonly mode: GateMode;
  readonly windowMs: number;
  readonly unisonGapMs: number;
  readonly holdMs: number;
  readonly reserveMs: number;
}

export interface ModifierSpec {
  readonly kind: ModifierKind;
  readonly stillMs: number;
  readonly tetherRows: number;
  readonly tetherGraceMs: number;
}

export interface Biome {
  readonly id: number;
  readonly name: string;
  readonly skyTop: string;
  readonly skyBottom: string;
  readonly fogColor: string;
  readonly tileTop: string;
  readonly tileSide: string;
  readonly wallColor: string;
  readonly sprout: string;
  readonly sproutTip: string;
  readonly root: string;
  readonly accent: string;
  readonly rootMidi: number;
  readonly scale: number[];
  readonly nouns: string[];
}

export type WhisperRole = 'path' | 'modifier' | 'flip' | 'gate';

export interface WhisperLine {
  readonly id: string;
  readonly role: WhisperRole;
}

export interface Whisper {
  readonly lines: WhisperLine[];
  readonly pathPrior: Partial<Record<ClassifierKind, number>>;
  readonly gatePrior: Partial<Record<GateAction, number>>;
  readonly hintIds: string[];
}

export interface Dream {
  readonly seed: number;
  readonly code: string;
  readonly layoutIndex: number;
  readonly name: string;
  readonly biome: Biome;
  readonly classifier: ClassifierKind;
  readonly modifier: ModifierSpec;
  readonly flipRow: number;
  readonly gate: GateSpec;
  readonly tolerance: number;
  readonly hopMs: number;
  readonly lanternHue: number;
  readonly grid: Tile[][];
  readonly rows: number;
  readonly cols: number;
  readonly pathRows: number;
  readonly gateRow: number;
  readonly doorCol: number;
  readonly goldCols: [number, number];
  readonly startCols: [number, number];
  readonly rivalStartCols: [number, number];
  readonly safeCols: Set<number>[];
  readonly whisper: Whisper;
  readonly tier: Tier;
  readonly rarity: number;
}

export function tellStrength(dream: Dream, row: number): number {
  const minStrength =
    dream.tier === 'chill'
      ? 0.36
      : dream.tier === 'standard'
        ? 0.25
        : dream.tier === 'tricky'
          ? 0.18
          : 0.13;
  if (dream.pathRows <= 1) return 1.0;
  const t = Math.max(0, Math.min(1, (row - 1) / (dream.pathRows - 1)));
  const eased = Math.pow(t, 0.8);
  return 1.0 - (1.0 - minStrength) * eased;
}
