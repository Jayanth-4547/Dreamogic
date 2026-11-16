import { BIOMES, generateDreamName } from './biomes';
import {
  CLASSIFIER_KINDS,
  ClassifierKind,
  Dream,
  GATE_MODES,
  GateAction,
  GateMode,
  GateSpec,
  inverseClassifier,
  isWalkableKind,
  MODIFIER_KINDS,
  ModifierKind,
  ModifierSpec,
  Tier,
  Tile,
  TileKind,
  Whisper,
  WhisperLine,
  gateAction,
} from './model';
import { Rng, SeedCode } from './rng';

export function hypothesisSafe(
  k: ClassifierKind,
  row: readonly Tile[],
  lanternHue: number,
): Set<number> {
  const walkable = row.filter((t) => isWalkableKind(t.kind));
  const out = new Set<number>();
  if (walkable.length === 0) return out;

  switch (k) {
    case 'quiet': {
      const m = Math.min(...walkable.map((t) => t.sprouts));
      for (const t of walkable) if (t.sprouts === m) out.add(t.col);
      break;
    }
    case 'loud': {
      const m = Math.max(...walkable.map((t) => t.sprouts));
      for (const t of walkable) if (t.sprouts === m) out.add(t.col);
      break;
    }
    case 'odd':
      for (const t of walkable) if (t.sprouts % 2 === 1) out.add(t.col);
      break;
    case 'even':
      for (const t of walkable) if (t.sprouts % 2 === 0) out.add(t.col);
      break;
    case 'hue':
      for (const t of walkable) if (t.hue === lanternHue) out.add(t.col);
      break;
    case 'flowUp':
      for (const t of walkable) if (t.root === 0) out.add(t.col);
      break;
    case 'flowDown':
      for (const t of walkable) if (t.root === 2) out.add(t.col);
      break;
  }
  return out;
}

const PATH_TEMPLATES: { id: string; truth: ClassifierKind }[] = [
  { id: 'q1', truth: 'quiet' },
  { id: 'q2', truth: 'quiet' },
  { id: 'q3', truth: 'quiet' },
  { id: 'l1', truth: 'loud' },
  { id: 'l2', truth: 'loud' },
  { id: 'l3', truth: 'loud' },
  { id: 'o1', truth: 'odd' },
  { id: 'o2', truth: 'odd' },
  { id: 'o3', truth: 'odd' },
  { id: 'e1', truth: 'even' },
  { id: 'e2', truth: 'even' },
  { id: 'e3', truth: 'even' },
  { id: 'h1', truth: 'hue' },
  { id: 'h2', truth: 'hue' },
  { id: 'h3', truth: 'hue' },
  { id: 'f1', truth: 'flowUp' },
  { id: 'f2', truth: 'flowUp' },
  { id: 'f3', truth: 'flowUp' },
  { id: 'd1', truth: 'flowDown' },
  { id: 'd2', truth: 'flowDown' },
  { id: 'd3', truth: 'flowDown' },
];

const GATE_TEMPLATES: { id: string; truth: GateMode }[] = [
  { id: 'bell1', truth: 'doorbell' },
  { id: 'bell2', truth: 'doorbell' },
  { id: 'bell3', truth: 'doorbell' },
  { id: 'uni1', truth: 'unison' },
  { id: 'uni2', truth: 'unison' },
  { id: 'uni3', truth: 'unison' },
  { id: 'pat1', truth: 'patience' },
  { id: 'pat2', truth: 'patience' },
  { id: 'pat3', truth: 'patience' },
];

function composeWhisper(
  rng: Rng,
  classifier: ClassifierKind,
  modifier: ModifierKind,
  flip: boolean,
  gate: GateMode,
): Whisper {
  const pt = rng.pick(PATH_TEMPLATES.filter((t) => t.truth === classifier));
  const gt = rng.pick(GATE_TEMPLATES.filter((t) => t.truth === gate));

  const lines: WhisperLine[] = [{ id: `path.${pt.id}`, role: 'path' }];
  const hints: string[] = [`hint.${classifier}`];

  if (modifier !== 'none') {
    const n = rng.range(1, 3);
    const prefix = modifier === 'stillness' ? 'still' : modifier === 'once' ? 'once' : 'tether';
    lines.push({ id: `mod.${prefix}${n}`, role: 'modifier' });
    hints.push(`hint.${modifier}`);
  }
  if (flip) {
    lines.push({ id: `flip.${rng.range(1, 3)}`, role: 'flip' });
    hints.push('hint.flip');
  }
  lines.push({ id: `gate.${gt.id}`, role: 'gate' });
  hints.push(`hint.${gate}`);

  const prior: Partial<Record<ClassifierKind, number>> = { [classifier]: 0.5 };
  const gateP: Partial<Record<GateAction, number>> = { [gateAction(gate)]: 0.5 };
  return { lines, pathPrior: prior, gatePrior: gateP, hintIds: hints };
}

function lerpInt(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

interface BuiltDungeonLayout {
  grid: Tile[][];
  safe: Set<number>[];
  cols: number;
  doorCol: number;
  goldCols: [number, number];
  startCols: [number, number];
  rivalStartCols: [number, number];
}

/**
 * Carves a genuine random-shaped dungeon chamber:
 * - Intro tiers / short shards (pathRows <= 10 && tier === 'chill') stay compact (5 cols)
 * - Standard/Tricky/Forge/Daily chambers carve wide 7..9-col winding multi-wing halls
 *   with dramatic S-curves, central pillared courtyards, side alcoves, and off-center exits!
 */
function generateDungeonLayout(
  rng: Rng,
  pathRows: number,
  classifier: ClassifierKind,
  flipRow: number,
  modifier: ModifierKind,
  lanternHue: number,
  tier: Tier,
): BuiltDungeonLayout {
  const compactIntro = tier === 'chill' && pathRows <= 10;
  const cols = compactIntro ? rng.pick([6, 7]) : rng.pick([7, 8, 9]);

  // Place exit asymmetrically on wider rooms so halls never feel like rigid bowling alleys
  const doorCol = compactIntro ? rng.range(2, cols - 3) : rng.range(1, cols - 2);
  const goldCols: [number, number] = [Math.max(0, doorCol - 1), Math.min(cols - 1, doorCol + 1)];

  // 1) Carve a truly winding curved room spine across columns
  const spine = new Array<number>(pathRows + 2).fill(doorCol);
  spine[pathRows] = doorCol;
  spine[pathRows - 1] = doorCol;
  let driftDir = rng.chance(0.5) ? 1 : -1;

  for (let r = pathRows - 2; r >= 1; r--) {
    const prev = spine[r + 1];
    // Encourage multi-row sweeping bends rather than staying near center
    if (rng.chance(0.26)) driftDir = -driftDir;
    const targetCol = Math.max(1, Math.min(cols - 2, prev + driftDir));
    const opts = [prev - 1, prev, prev + 1].filter((c) => c >= 1 && c <= cols - 2);
    const w = opts.map((c) => (c === targetCol ? 2.4 : c === prev ? 0.9 : 0.7));
    spine[r] = rng.pickWeighted(opts, w);
  }
  spine[0] = Math.max(1, Math.min(cols - 2, spine[1]));

  // 2) Carve sweeping chambers, plazas, alcoves, and inner pillars around the curving spine
  const roomMask: TileKind[][] = [];
  for (let r = 0; r <= pathRows + 1; r++) {
    const rowKinds = new Array<TileKind>(cols).fill('wall');
    if (r === 0) {
      const sMin = Math.max(0, spine[0] - 2);
      const sMax = Math.min(cols - 1, spine[0] + 2);
      for (let c = sMin; c <= sMax; c++) rowKinds[c] = 'start';
    } else if (r === pathRows + 1) {
      rowKinds[goldCols[0]] = 'gold';
      rowKinds[doorCol] = 'door';
      rowKinds[goldCols[1]] = 'gold';
    } else {
      const isCourtyard = r >= 3 && r <= pathRows - 2 && rng.chance(0.48);
      const leftReach = isCourtyard ? rng.range(2, 3) : rng.range(1, 2);
      const rightReach = isCourtyard ? rng.range(2, 3) : rng.range(1, 2);
      const minC = Math.max(0, spine[r] - leftReach);
      const maxC = Math.min(cols - 1, spine[r] + rightReach);
      for (let c = minC; c <= maxC; c++) rowKinds[c] = 'path';

      // Connect laterally to previous spine so bends have wide landing corners
      if (r > 1) {
        const lo = Math.min(spine[r - 1], spine[r]);
        const hi = Math.max(spine[r - 1], spine[r]);
        for (let c = lo; c <= hi; c++) rowKinds[c] = 'path';
      }
      if (r === pathRows) {
        for (let c = goldCols[0]; c <= goldCols[1]; c++) rowKinds[c] = 'path';
      }

      // Carved inner pillars in wide courtyards (never blocking the golden spine)
      const floorCols = rowKinds.map((k, idx) => (k === 'path' ? idx : -1)).filter((x) => x >= 0);
      if (floorCols.length >= 5 && rng.chance(0.55)) {
        const pillarOpts = floorCols.filter(
          (c) => Math.abs(c - spine[r]) >= 2 && (r < pathRows || c < goldCols[0] || c > goldCols[1]),
        );
        if (pillarOpts.length > 0) {
          rowKinds[rng.pick(pillarOpts)] = 'pillar';
        }
      }
    }
    roomMask.push(rowKinds);
  }

  // 2) Assign intended safe tiles per row
  const intended: Set<number>[] = Array.from({ length: pathRows + 2 }, () => new Set<number>());
  for (let r = 1; r <= pathRows; r++) {
    const floorCols = roomMask[r].map((k, c) => (k === 'path' ? c : -1)).filter((c) => c >= 0);
    if (modifier === 'once' && floorCols.length >= 3 && r < pathRows) {
      // Multiple safe options so players don't trap themselves on "visit once"
      const pickTwo = new Set<number>([spine[r]]);
      const others = floorCols.filter((c) => c !== spine[r]);
      if (others.length > 0) pickTwo.add(rng.pick(others));
      intended[r] = pickTwo;
    } else {
      intended[r] = new Set([spine[r]]);
      // In wider rooms also occasionally allow a second safe tile so branching feels exploratory
      if (floorCols.length >= 4 && rng.chance(0.35)) {
        const adj = floorCols.filter((c) => Math.abs(c - spine[r]) === 1);
        if (adj.length > 0) intended[r].add(rng.pick(adj));
      }
    }
  }
  intended[pathRows].add(goldCols[0]);
  intended[pathRows].add(goldCols[1]);

  // 3) Fill tile attributes row-by-row on walkable floor tiles
  const grid: Tile[][] = [];
  for (let r = 0; r <= pathRows; r++) {
    const t = r === 0 ? 0 : pathRows <= 1 ? 0 : Math.min(1, Math.max(0, (r - 1) / (pathRows - 1)));
    const k = flipRow >= 0 && r >= flipRow ? inverseClassifier(classifier) : classifier;
    const maxCount = Math.max(2, Math.min(6, lerpInt(5, 3, t)));
    const gap = Math.max(1, lerpInt(3, 1, t));
    const sprouts = new Array<number>(cols).fill(0);
    const hues = Array.from({ length: cols }, () => rng.nextInt(24));
    const roots = Array.from({ length: cols }, () => rng.nextInt(4));

    for (let c = 0; c < cols; c++) sprouts[c] = rng.range(0, maxCount);

    if (r > 0) {
      switch (k) {
        case 'quiet': {
          const lo = t > 0.55 ? 0 : rng.range(0, 1);
          for (let c = 0; c < cols; c++) {
            sprouts[c] = intended[r].has(c)
              ? lo
              : rng.range(lo + 1, Math.min(6, lo + gap + (t < 0.3 ? 1 : 0)));
          }
          break;
        }
        case 'loud': {
          const hi = rng.range(Math.max(2, maxCount - 1), maxCount);
          for (let c = 0; c < cols; c++) {
            sprouts[c] = intended[r].has(c) ? hi : rng.range(Math.max(0, hi - gap), hi - 1);
          }
          break;
        }
        case 'odd': {
          const odds: number[] = [];
          const evens: number[] = [];
          for (let v = 0; v <= maxCount; v++) (v % 2 === 1 ? odds : evens).push(v);
          for (let c = 0; c < cols; c++) {
            sprouts[c] = intended[r].has(c) ? rng.pick(odds) : rng.pick(evens);
          }
          break;
        }
        case 'even': {
          const odds: number[] = [];
          const evens: number[] = [];
          for (let v = 0; v <= maxCount; v++) (v % 2 === 0 ? evens : odds).push(v);
          for (let c = 0; c < cols; c++) {
            sprouts[c] = intended[r].has(c) ? rng.pick(evens) : rng.pick(odds);
          }
          break;
        }
        case 'hue': {
          const minOff = lerpInt(7, 2, t);
          for (let c = 0; c < cols; c++) {
            if (intended[r].has(c)) {
              hues[c] = lanternHue;
            } else {
              const off = rng.range(minOff, 12) * (rng.chance(0.5) ? 1 : -1);
              hues[c] = (lanternHue + off + 24) % 24;
            }
          }
          break;
        }
        case 'flowUp':
          for (let c = 0; c < cols; c++) {
            roots[c] = intended[r].has(c) ? 0 : rng.pick([1, 2, 3]);
          }
          break;
        case 'flowDown':
          for (let c = 0; c < cols; c++) {
            roots[c] = intended[r].has(c) ? 2 : rng.pick([0, 1, 3]);
          }
          break;
      }
    }

    grid.push(
      roomMask[r].map((kind, c) => ({
        row: r,
        col: c,
        kind,
        sprouts: kind === 'path' ? sprouts[c] : 0,
        hue: hues[c],
        root: kind === 'path' ? roots[c] : 0,
        decor: rng.nextInt(8),
        seed: rng.nextU32(),
        elevation: kind === 'wall' ? 1 : kind === 'pillar' ? 2 : 0,
      })),
    );
  }

  // Gate row
  grid.push(
    roomMask[pathRows + 1].map((kind, c) => ({
      row: pathRows + 1,
      col: c,
      kind,
      sprouts: 0,
      hue: lanternHue,
      root: 0,
      decor: 0,
      seed: rng.nextU32(),
      elevation: kind === 'wall' ? 1 : 0,
    })),
  );

  // Compute true safe columns per row
  const safe: Set<number>[] = [];
  for (let r = 0; r <= pathRows; r++) {
    if (r === 0) {
      safe.push(new Set(grid[0].map((t, c) => (isWalkableKind(t.kind) ? c : -1)).filter((c) => c >= 0)));
    } else {
      const k = flipRow >= 0 && r >= flipRow ? inverseClassifier(classifier) : classifier;
      safe.push(hypothesisSafe(k, grid[r], lanternHue));
    }
  }
  safe.push(new Set([goldCols[0], doorCol, goldCols[1]]));

  const startFloor = grid[0].map((t, c) => (t.kind === 'start' ? c : -1)).filter((c) => c >= 0);
  const s0 = startFloor[Math.min(1, startFloor.length - 1)] ?? spine[0];
  const s1 = startFloor[Math.max(0, startFloor.length - 2)] ?? spine[0];
  const rs0 = startFloor[0] ?? 0;
  const rs1 = startFloor[startFloor.length - 1] ?? cols - 1;

  return {
    grid,
    safe,
    cols,
    doorCol,
    goldCols,
    startCols: [s0, s1],
    rivalStartCols: [rs0, rs1],
  };
}

function setEq(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

function generateValidLayout(
  rng: Rng,
  pathRows: number,
  classifier: ClassifierKind,
  flipRow: number,
  modifier: ModifierKind,
  lanternHue: number,
  tier: Tier,
  tries = 20,
): BuiltDungeonLayout {
  let best: BuiltDungeonLayout | null = null;
  let bestScore = -1;
  for (let i = 0; i < tries; i++) {
    const cand = generateDungeonLayout(
      rng.fork(`d${i}`),
      pathRows,
      classifier,
      flipRow,
      modifier,
      lanternHue,
      tier,
    );
    const early = Math.min(4, pathRows);
    let ok = true;
    let score = 0;
    for (const h of CLASSIFIER_KINDS) {
      if (h === classifier) continue;
      let diff = 0;
      let diffEarly = 0;
      for (let r = 1; r <= pathRows; r++) {
        const s = hypothesisSafe(h, cand.grid[r], lanternHue);
        if (!setEq(s, cand.safe[r])) {
          diff++;
          if (r <= early) diffEarly++;
        }
      }
      const needTotal = Math.max(3, Math.round(pathRows * 0.35));
      if (diff < needTotal || diffEarly < 2) ok = false;
      score += Math.min(diff, needTotal) / needTotal + Math.min(diffEarly, 2) / 2;
    }
    if (ok) return cand;
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best!;
}

export interface DreamSpec {
  classifier?: ClassifierKind;
  modifier?: ModifierKind;
  gate?: GateMode;
  flip?: boolean;
  pathRows?: number;
  tier?: Tier;
  biome?: number;
  tolerance?: number;
  name?: string;
}

function tierIndex(t: Tier): number {
  return t === 'chill' ? 0 : t === 'standard' ? 1 : t === 'tricky' ? 2 : 3;
}

function modifierSpec(kind: ModifierKind, tier: Tier): ModifierSpec {
  const i = tierIndex(tier);
  return {
    kind,
    stillMs: [4000, 3400, 2900, 2500][i],
    tetherRows: tier === 'chill' ? 2 : 1,
    tetherGraceMs: [2400, 2000, 1700, 1400][i],
  };
}

function gateSpec(mode: GateMode, tier: Tier): GateSpec {
  const i = tierIndex(tier);
  if (mode === 'doorbell') {
    return {
      mode,
      windowMs: [4400, 3600, 3000, 2500][i],
      unisonGapMs: 1800,
      holdMs: 2000,
      reserveMs: [4800, 4000, 3400, 2900][i],
    };
  }
  if (mode === 'unison') {
    return {
      mode,
      windowMs: [4800, 4200, 3600, 3200][i],
      unisonGapMs: [2600, 2000, 1500, 1200][i],
      holdMs: 2000,
      reserveMs: [4800, 4000, 3400, 2900][i],
    };
  }
  return {
    mode: 'patience',
    windowMs: [4600, 3900, 3300, 2800][i],
    unisonGapMs: 1400,
    holdMs: [2200, 2100, 2000, 1800][i],
    reserveMs: [5500, 4500, 3800, 3200][i],
  };
}

export function buildDream(seed: number, spec: DreamSpec = {}): Dream {
  const specRng = new Rng(seed).fork('spec');
  const tier: Tier = spec.tier ?? specRng.pick(['chill', 'standard', 'tricky']);
  const classifier = spec.classifier ?? specRng.pick(CLASSIFIER_KINDS);
  const modifier = spec.modifier ?? (tier === 'chill' ? 'none' : specRng.pick(MODIFIER_KINDS));
  const gate = spec.gate ?? specRng.pick(GATE_MODES);
  const pathRows = spec.pathRows ?? (tier === 'chill' ? 10 : tier === 'standard' ? 11 : 12);
  const hasFlip = spec.flip ?? (tier === 'tricky' || tier === 'nightmare');
  const flipRow = hasFlip && classifier !== 'hue' ? Math.max(4, Math.floor(pathRows / 2) + 1) : -1;
  const tolerance = spec.tolerance ?? (tier === 'chill' ? 2 : tier === 'nightmare' ? 0 : 1);

  const styleRng = new Rng(seed).fork('style');
  const biome = BIOMES[spec.biome ?? styleRng.nextInt(BIOMES.length)];
  const lanternHue = styleRng.nextInt(24);
  const name = spec.name ?? generateDreamName(styleRng.fork('name'), biome);
  const whisper = composeWhisper(
    new Rng(seed).fork('whisper'),
    classifier,
    modifier,
    flipRow >= 0,
    gate,
  );
  const modSpec = modifierSpec(modifier, tier);
  const gSpec = gateSpec(gate, tier);
  const layout = generateValidLayout(
    new Rng(seed).fork('layout0'),
    pathRows,
    classifier,
    flipRow,
    modifier,
    lanternHue,
    tier,
  );

  const rarity = Math.min(3, 1 + (modifier !== 'none' ? 1 : 0) + (flipRow >= 0 ? 1 : 0));

  return {
    seed,
    code: SeedCode.encode(seed),
    layoutIndex: 0,
    name,
    biome,
    classifier,
    modifier: modSpec,
    flipRow,
    gate: gSpec,
    tolerance,
    hopMs: 300,
    lanternHue,
    grid: layout.grid,
    rows: layout.grid.length,
    cols: layout.cols,
    pathRows,
    gateRow: pathRows + 1,
    doorCol: layout.doorCol,
    goldCols: layout.goldCols,
    startCols: layout.startCols,
    rivalStartCols: layout.rivalStartCols,
    safeCols: layout.safe,
    whisper,
    tier,
    rarity,
  };
}

export function relayoutDream(dream: Dream, attempt: number): Dream {
  const layout = generateValidLayout(
    new Rng(dream.seed).fork(`retry${attempt}`),
    dream.pathRows,
    dream.classifier,
    dream.flipRow,
    dream.modifier.kind,
    dream.lanternHue,
    dream.tier,
  );
  return {
    ...dream,
    layoutIndex: attempt,
    grid: layout.grid,
    cols: layout.cols,
    doorCol: layout.doorCol,
    goldCols: layout.goldCols,
    startCols: layout.startCols,
    rivalStartCols: layout.rivalStartCols,
    safeCols: layout.safe,
  };
}

export interface StoryShard {
  id: string;
  chapter: number;
  index: number;
  title: string;
  seed: number;
  spec: DreamSpec;
  boss?: boolean;
}

export interface StoryChapter {
  number: number;
  title: string;
  whisperer: string;
  intro: string;
  outro: string;
  shards: StoryShard[];
}

function s(
  chapter: number,
  index: number,
  title: string,
  seed: number,
  classifier: ClassifierKind,
  modifier: ModifierKind,
  gate: GateMode,
  opts: Partial<DreamSpec> & { boss?: boolean } = {},
): StoryShard {
  return {
    id: `${chapter}-${index}`,
    chapter,
    index,
    title,
    seed,
    boss: opts.boss,
    spec: {
      classifier,
      modifier,
      gate,
      tier: opts.tier ?? 'standard',
      pathRows: opts.pathRows ?? 10,
      biome: opts.biome ?? chapter - 1,
      tolerance: opts.tolerance,
      flip: opts.flip ?? false,
      name: title,
    },
  };
}

export const STORY_CHAPTERS: readonly StoryChapter[] = [
  {
    number: 1,
    title: 'Dusk Sanctuary',
    whisperer: 'The Lantern Keeper',
    intro:
      'A hooded traveler steps from the exit hall holding a dying lantern.\n“Don’t enter without remembering… the shoots shrink as you cross, and the gold pours away…”',
    outro:
      'The keeper’s silhouette softens.\n“Now you see—it wasn’t luck. The tiny shoots and draining gold told you the whole truth.”',
    shards: [
      s(1, 1, 'The Last Gold', 1101, 'quiet', 'none', 'patience', { tier: 'chill', pathRows: 10, tolerance: 2 }),
      s(1, 2, 'The Crowded Hall', 1102, 'loud', 'none', 'doorbell', { tier: 'chill', pathRows: 10, tolerance: 2 }),
      s(1, 3, 'Odd Company', 1103, 'odd', 'none', 'unison', { tier: 'standard', pathRows: 11, tolerance: 2 }),
      s(1, 4, 'Where Roots Remember', 1104, 'flowUp', 'stillness', 'doorbell', { tier: 'standard', pathRows: 11, tolerance: 2 }),
      s(1, 5, 'The Fair Sleep', 1105, 'even', 'none', 'patience', { tier: 'standard', pathRows: 11, tolerance: 2 }),
      s(1, 6, 'The Mossy Ledger', 1106, 'quiet', 'once', 'unison', { tier: 'standard', pathRows: 11, tolerance: 2 }),
      s(1, 7, 'A Slow Walk Home', 1107, 'loud', 'tether', 'patience', { tier: 'standard', pathRows: 12, tolerance: 2 }),
      s(1, 8, 'The Hush', 1108, 'odd', 'stillness', 'patience', { tier: 'standard', pathRows: 12, boss: true }),
    ],
  },
  {
    number: 2,
    title: 'Salt Cistern',
    whisperer: 'The Shell Listener',
    intro:
      'Salt mist fills the sunken hall.\n“The tide whispered which stone holds—then washed the ending from my memory.”',
    outro: 'She hums a quiet chord.\n“Hold the lantern colour even after the sky shifts.”',
    shards: [
      s(2, 1, 'The Glass Shore', 2101, 'hue', 'none', 'doorbell', { biome: 1 }),
      s(2, 2, 'The Patient Tide', 2102, 'flowDown', 'stillness', 'unison', { biome: 1 }),
      s(2, 3, 'Salt and Memory', 2103, 'even', 'once', 'doorbell', { biome: 1 }),
      s(2, 4, 'Low Tide, High Moon', 2104, 'quiet', 'none', 'patience', { biome: 1, flip: true, pathRows: 11 }),
      s(2, 5, 'Two Lanterns, One Hall', 2105, 'hue', 'tether', 'unison', { biome: 1 }),
      s(2, 6, 'The Drowned Vault', 2106, 'loud', 'stillness', 'doorbell', { biome: 1, flip: true, pathRows: 11 }),
      s(2, 7, 'Pearl Count', 2107, 'odd', 'once', 'patience', { biome: 1 }),
      s(2, 8, 'The Undertow', 2108, 'hue', 'once', 'unison', { biome: 1, tier: 'tricky', pathRows: 11, boss: true }),
    ],
  },
  {
    number: 3,
    title: 'Clockwork Vault',
    whisperer: 'The Winder',
    intro:
      'A hooded traveler winds a brass key over cracked tiles.\n“Beware the turning arch—halfway through, the floor forgets its own rule.”',
    outro: 'Every clock stops at once. In the silence you realize the warnings echoed your own voice.',
    shards: [
      s(3, 1, 'Gears Asleep', 3101, 'flowUp', 'once', 'unison', { biome: 2, tier: 'tricky', pathRows: 11 }),
      s(3, 2, 'The Winding Stair', 3102, 'even', 'tether', 'patience', { biome: 2, tier: 'tricky', pathRows: 11 }),
      s(3, 3, 'Dust Has Opinions', 3103, 'quiet', 'stillness', 'unison', { biome: 2, tier: 'tricky', pathRows: 11, flip: true }),
      s(3, 4, 'A Clock That Remembers', 3104, 'flowDown', 'once', 'doorbell', { biome: 2, tier: 'tricky', pathRows: 12, flip: true }),
      s(3, 5, 'The Mainspring', 3105, 'hue', 'stillness', 'patience', { biome: 2, tier: 'tricky', pathRows: 11 }),
      s(3, 6, 'Quiet Cogs', 3106, 'odd', 'tether', 'unison', { biome: 2, tier: 'tricky', pathRows: 12, flip: true }),
      s(3, 7, 'The Last Hour', 3107, 'loud', 'once', 'patience', { biome: 2, tier: 'tricky', pathRows: 12, flip: true }),
      s(3, 8, 'The Winder', 3108, 'quiet', 'once', 'unison', { biome: 2, tier: 'nightmare', pathRows: 12, flip: true, boss: true }),
    ],
  },
];

export function buildDailyDream(date = new Date()): { dayNumber: number; dream: Dream } {
  const epoch = Date.UTC(2026, 0, 1);
  const utcDay = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const day = Math.floor((utcDay - epoch) / 86400000);
  const seed = (new Rng(0xd2ea11 + day * 7919).nextU32() ^ ((day & 0xff) << 24)) >>> 0;
  const weekday = date.getUTCDay();
  const tier: Tier = weekday === 1 ? 'chill' : weekday >= 5 || weekday === 0 ? 'tricky' : 'standard';
  return { dayNumber: day, dream: buildDream(seed, { tier }) };
}
