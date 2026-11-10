/// Biomes (the look & sound of a dream), quirks (world modifiers) and the
/// poetic name generator.
library;

import 'rng.dart';

class Biome {
  const Biome({
    required this.id,
    required this.name,
    required this.skyTop,
    required this.skyBottom,
    required this.tileTop,
    required this.tileSide,
    required this.sprout,
    required this.root,
    required this.accent,
    required this.rootMidi,
    required this.scale,
    required this.nouns,
  });

  final int id;
  final String name;

  /// Colours are 0xAARRGGBB.
  final int skyTop;
  final int skyBottom;
  final int tileTop;
  final int tileSide;
  final int sprout;
  final int root;
  final int accent;

  /// Root note (MIDI) and scale intervals used by step sounds & ambience.
  final int rootMidi;
  final List<int> scale;
  final List<String> nouns;
}

const List<Biome> kBiomes = [
  Biome(
    id: 0,
    name: 'Dusk Forest',
    skyTop: 0xFF14122B,
    skyBottom: 0xFF2E2557,
    tileTop: 0xFF5FAE90,
    tileSide: 0xFF2F6657,
    sprout: 0xFFC6F5D2,
    root: 0xFF9A6A4D,
    accent: 0xFFFFC857,
    rootMidi: 57,
    scale: [0, 2, 4, 7, 9],
    nouns: ['Orchard', 'Hollow', 'Thicket', 'Glade', 'Grove', 'Clearing'],
  ),
  Biome(
    id: 1,
    name: 'Salt Sea',
    skyTop: 0xFF0D2636,
    skyBottom: 0xFF1F5A70,
    tileTop: 0xFFEBD8C3,
    tileSide: 0xFFB59C86,
    sprout: 0xFFFF9E9E,
    root: 0xFFF2C29A,
    accent: 0xFFFFE08A,
    rootMidi: 55,
    scale: [0, 2, 5, 7, 9],
    nouns: ['Shoal', 'Lagoon', 'Reef', 'Tideway', 'Sandbar', 'Harbour'],
  ),
  Biome(
    id: 2,
    name: 'Clockwork Attic',
    skyTop: 0xFF2A1B14,
    skyBottom: 0xFF553827,
    tileTop: 0xFFD3A667,
    tileSide: 0xFF8E6A3C,
    sprout: 0xFFFFE9A3,
    root: 0xFF7A4E2B,
    accent: 0xFFFFD36B,
    rootMidi: 53,
    scale: [0, 3, 5, 7, 10],
    nouns: ['Loft', 'Gable', 'Trunk Room', 'Rafters', 'Cog Walk', 'Garret'],
  ),
  Biome(
    id: 3,
    name: 'Mirror Hall',
    skyTop: 0xFF1B1D3A,
    skyBottom: 0xFF40457C,
    tileTop: 0xFFC3C9F5,
    tileSide: 0xFF838BCB,
    sprout: 0xFFFFFFFF,
    root: 0xFF93A5EE,
    accent: 0xFFFFC857,
    rootMidi: 60,
    scale: [0, 2, 4, 7, 11],
    nouns: ['Gallery', 'Corridor', 'Atrium', 'Glasswalk', 'Reflection', 'Arcade'],
  ),
  Biome(
    id: 4,
    name: 'Library of Weights',
    skyTop: 0xFF0E2B2B,
    skyBottom: 0xFF21504C,
    tileTop: 0xFFEADFC4,
    tileSide: 0xFFA99C7A,
    sprout: 0xFF74D6BC,
    root: 0xFFB98A42,
    accent: 0xFFFFC857,
    rootMidi: 52,
    scale: [0, 2, 3, 7, 9],
    nouns: ['Stacks', 'Reading Room', 'Archive', 'Aisle', 'Study', 'Index'],
  ),
  Biome(
    id: 5,
    name: 'Void Garden',
    skyTop: 0xFF0A0814,
    skyBottom: 0xFF2C1344,
    tileTop: 0xFF6A45A0,
    tileSide: 0xFF3B2562,
    sprout: 0xFFFF92DC,
    root: 0xFF4FE3E3,
    accent: 0xFFFFC857,
    rootMidi: 50,
    scale: [0, 1, 5, 7, 8],
    nouns: ['Bloom', 'Terrace', 'Hedge Maze', 'Bed', 'Greenhouse', 'Orbit'],
  ),
  Biome(
    id: 6,
    name: 'Dusk Meadow',
    skyTop: 0xFF2B1B3A,
    skyBottom: 0xFF86405F,
    tileTop: 0xFFE7B7A5,
    tileSide: 0xFFA9695F,
    sprout: 0xFFFFD6EA,
    root: 0xFF7C4A5E,
    accent: 0xFFFFD36B,
    rootMidi: 56,
    scale: [0, 2, 4, 7, 9],
    nouns: ['Meadow', 'Pasture', 'Field', 'Hillside', 'Verge', 'Lea'],
  ),
  Biome(
    id: 7,
    name: 'Lantern Market',
    skyTop: 0xFF1A1030,
    skyBottom: 0xFF4F2C5C,
    tileTop: 0xFFE59A72,
    tileSide: 0xFF9C5A3E,
    sprout: 0xFFFFE6A8,
    root: 0xFF6E3B5A,
    accent: 0xFFFFC857,
    rootMidi: 54,
    scale: [0, 3, 5, 8, 10],
    nouns: ['Bazaar', 'Lane', 'Stalls', 'Square', 'Alley', 'Promenade'],
  ),
];

/// World modifiers. Visual/audio quirks are free; `hopDeltaMs` changes tempo;
/// `fogRows` limits how far ahead tells are readable.
class Quirk {
  const Quirk({
    required this.id,
    required this.name,
    required this.blurb,
    this.rarity = 0,
    this.hopDeltaMs = 0,
    this.fogRows = 0,
  });

  final String id;
  final String name;
  final String blurb;

  /// Contribution to the dream's rarity score.
  final int rarity;
  final int hopDeltaMs;

  /// 0 = no fog, otherwise only this many rows ahead are clearly visible.
  final int fogRows;
}

const Quirk kNoQuirk = Quirk(id: 'none', name: 'Still Air', blurb: '');

const List<Quirk> kQuirks = [
  Quirk(
      id: 'drift',
      name: 'Drifting Tiles',
      blurb: 'The stones sway gently, as if breathing.',
      rarity: 1),
  Quirk(
      id: 'fireflies',
      name: 'Fireflies',
      blurb: 'Tiny lights wander. Some are just lights.',
      rarity: 1),
  Quirk(
      id: 'echo',
      name: 'Echoing Steps',
      blurb: 'Every step is answered a heartbeat later.',
      rarity: 1),
  Quirk(
      id: 'heavy',
      name: 'Heavy Sleep',
      blurb: 'Hops are slow and deliberate.',
      rarity: 2,
      hopDeltaMs: 110),
  Quirk(
      id: 'quick',
      name: 'Restless Mind',
      blurb: 'Everything moves a little faster.',
      rarity: 2,
      hopDeltaMs: -70),
  Quirk(
      id: 'fog',
      name: 'Thick Fog',
      blurb: 'You can only trust what is close.',
      rarity: 3,
      fogRows: 4),
];

Quirk quirkById(String id) =>
    kQuirks.firstWhere((q) => q.id == id, orElse: () => kNoQuirk);

const List<String> _adjectives = [
  'Hollow', 'Gentle', 'Amber', 'Sleepy', 'Forgotten', 'Velvet', 'Paper',
  'Silver', 'Drowsy', 'Hidden', 'Faded', 'Tender', 'Lantern-lit', 'Mossy',
  'Distant', 'Borrowed', 'Quiet-Eyed', 'Wandering', 'Lost', 'Honeyed',
  'Moonlit', 'Patient', 'Curious', 'Half-Remembered',
];

/// A poetic name that never hints at the rule.
String generateDreamName(Rng rng, Biome biome) {
  final adj = rng.pick(_adjectives);
  final noun = rng.pick(biome.nouns);
  return switch (rng.nextInt(3)) {
    0 => 'The $adj $noun',
    1 => '$adj $noun',
    _ => 'The $noun of ${rng.pick(_adjectives).replaceAll('-', ' ')} Things',
  };
}
