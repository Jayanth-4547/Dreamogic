/// Hand-tuned ("rigged") campaign content, the Daily Dream and scoring.
library;

import 'builder.dart';
import 'dream.dart';
import 'model.dart';
import 'rng.dart';

class StoryShard {
  const StoryShard({
    required this.chapter,
    required this.index,
    required this.title,
    required this.seed,
    required this.spec,
    this.boss = false,
  });

  final int chapter;

  /// 1-based index within the chapter.
  final int index;
  final String title;
  final int seed;
  final DreamSpec spec;
  final bool boss;

  String get id => '$chapter-$index';

  Dream build() => DreamBuilder.build(seed, spec);
}

class StoryChapter {
  const StoryChapter({
    required this.number,
    required this.title,
    required this.whisperer,
    required this.intro,
    required this.outro,
    required this.shards,
  });

  final int number;
  final String title;
  final String whisperer;
  final String intro;
  final String outro;
  final List<StoryShard> shards;
}

typedef _K = ClassifierKind;
typedef _M = ModifierKind;
typedef _G = GateMode;

StoryShard _s(
  int ch,
  int i,
  String title,
  int seed,
  _K k,
  _M m,
  _G g, {
  Tier tier = Tier.standard,
  int rows = 11,
  bool flip = false,
  int? tolerance,
  int biome = 0,
  bool boss = false,
}) =>
    StoryShard(
      chapter: ch,
      index: i,
      title: title,
      seed: seed,
      boss: boss,
      spec: DreamSpec(
        classifier: k,
        modifier: m,
        gate: g,
        flip: flip,
        pathRows: rows,
        tier: tier,
        biome: biome,
        tolerance: tolerance,
        quirk: 'none',
        name: title,
      ),
    );

/// The story shipped in this build: three chapters of eight shards.
final List<StoryChapter> kStory = [
  StoryChapter(
    number: 1,
    title: 'Forest of Roots',
    whisperer: 'The Lantern Keeper',
    intro: 'A figure with a lantern waves from the edge of the forest.\n'
        '\u201CYou shouldn\u2019t be here\u2026 no, wait, you should. '
        'I came to tell you something. It was important. It is\u2026 gone.\u201D',
    outro: 'The lantern flickers.\n'
        '\u201CIt was about the gold. Or the trees. I remembered it a moment ago.\u201D\n'
        'He smiles, and fades like breath on glass.',
    shards: [
      _s(1, 1, 'The Last Gold', 1101, _K.quiet, _M.none, _G.doorbell,
          tier: Tier.chill, rows: 10, tolerance: 2),
      _s(1, 2, 'The Crowded Hour', 1102, _K.loud, _M.none, _G.doorbell,
          tier: Tier.chill, rows: 10, tolerance: 2),
      _s(1, 3, 'Odd Company', 1103, _K.odd, _M.none, _G.unison,
          tier: Tier.chill, rows: 10, tolerance: 2),
      _s(1, 4, 'Where Roots Remember', 1104, _K.flowUp, _M.stillness, _G.doorbell,
          tier: Tier.chill, rows: 10, tolerance: 2),
      _s(1, 5, 'The Fair Sleep', 1105, _K.even, _M.none, _G.patience,
          tier: Tier.chill, rows: 11, tolerance: 2),
      _s(1, 6, 'The Mossy Ledger', 1106, _K.quiet, _M.once, _G.unison,
          tier: Tier.chill, rows: 10, tolerance: 2),
      _s(1, 7, 'A Slow Walk Home', 1107, _K.loud, _M.tether, _G.patience,
          tier: Tier.chill, rows: 11, tolerance: 2),
      _s(1, 8, 'The Hush', 1108, _K.odd, _M.stillness, _G.patience,
          tier: Tier.standard, rows: 12, boss: true),
    ],
  ),
  StoryChapter(
    number: 2,
    title: 'Salt Sea',
    whisperer: 'The Shell Listener',
    intro: 'Salt air. A woman holds a shell to her ear.\n'
        '\u201CThe sea told me what to say. Then it took it back.\u201D',
    outro: 'She hums a tune you almost know.\n\u201CWill you remember it for me?\u201D',
    shards: [
      _s(2, 1, 'The Glass Shore', 2101, _K.hue, _M.none, _G.doorbell, biome: 1),
      _s(2, 2, 'The Patient Tide', 2102, _K.flowDown, _M.stillness, _G.unison,
          biome: 1),
      _s(2, 3, 'Salt and Memory', 2103, _K.even, _M.once, _G.doorbell, biome: 1),
      _s(2, 4, 'Low Tide, High Moon', 2104, _K.quiet, _M.none, _G.patience,
          biome: 1, flip: true, rows: 12),
      _s(2, 5, 'Two Lanterns, One Shore', 2105, _K.hue, _M.tether, _G.unison,
          biome: 1),
      _s(2, 6, 'The Drowned Orchard', 2106, _K.loud, _M.stillness, _G.doorbell,
          biome: 1, flip: true, rows: 12),
      _s(2, 7, 'Pearl Count', 2107, _K.odd, _M.once, _G.patience, biome: 1),
      _s(2, 8, 'The Undertow', 2108, _K.hue, _M.once, _G.unison,
          biome: 1, tier: Tier.tricky, rows: 12, boss: true),
    ],
  ),
  StoryChapter(
    number: 3,
    title: 'Clockwork Attic',
    whisperer: 'The Winder',
    intro: 'A child winds an enormous key in the air.\n'
        '\u201CI\u2019m supposed to warn you about the hour. Which hour? '
        '\u2026All of them.\u201D',
    outro: 'Every clock in the attic stops at once.\n'
        'In the silence you realise the warnings all sounded like your own voice.',
    shards: [
      _s(3, 1, 'Gears Asleep', 3101, _K.flowUp, _M.once, _G.unison,
          biome: 2, tier: Tier.tricky, rows: 12),
      _s(3, 2, 'The Winding Stair', 3102, _K.even, _M.tether, _G.patience,
          biome: 2, tier: Tier.tricky, rows: 12),
      _s(3, 3, 'Dust Has Opinions', 3103, _K.quiet, _M.stillness, _G.unison,
          biome: 2, tier: Tier.tricky, rows: 12, flip: true),
      _s(3, 4, 'A Clock That Remembers', 3104, _K.flowDown, _M.once, _G.doorbell,
          biome: 2, tier: Tier.tricky, rows: 13, flip: true),
      _s(3, 5, 'The Mainspring', 3105, _K.hue, _M.stillness, _G.patience,
          biome: 2, tier: Tier.tricky, rows: 12),
      _s(3, 6, 'Quiet Cogs', 3106, _K.odd, _M.tether, _G.unison,
          biome: 2, tier: Tier.tricky, rows: 13, flip: true),
      _s(3, 7, 'The Last Hour', 3107, _K.loud, _M.once, _G.patience,
          biome: 2, tier: Tier.tricky, rows: 13, flip: true),
      _s(3, 8, 'The Winder', 3108, _K.quiet, _M.once, _G.unison,
          biome: 2, tier: Tier.nightmare, rows: 14, flip: true, boss: true),
    ],
  ),
];

StoryShard? storyShardById(String id) {
  for (final c in kStory) {
    for (final s in c.shards) {
      if (s.id == id) return s;
    }
  }
  return null;
}

/// The next shard after [id] in campaign order, or null at the end.
StoryShard? nextStoryShard(String id) {
  final flat = [for (final c in kStory) ...c.shards];
  final i = flat.indexWhere((s) => s.id == id);
  if (i < 0 || i + 1 >= flat.length) return null;
  return flat[i + 1];
}

/// One shared dream per calendar day, identical for everyone.
class DailyDream {
  DailyDream._();

  static final DateTime _epoch = DateTime.utc(2026, 1, 1);

  static int dayNumber(DateTime date) =>
      DateTime.utc(date.year, date.month, date.day).difference(_epoch).inDays;

  static int seedFor(DateTime date) {
    final day = dayNumber(date);
    return Rng(0xD2EA11 + day * 7919).nextU32() & 0xFFFFFFFF |
        ((day & 0xFF) << 32);
  }

  /// Gentle on Mondays, steeper toward the weekend.
  static Tier tierFor(DateTime date) => switch (date.weekday) {
        DateTime.monday => Tier.chill,
        DateTime.tuesday || DateTime.wednesday || DateTime.thursday => Tier.standard,
        _ => Tier.tricky,
      };

  static Dream build(DateTime date) =>
      DreamBuilder.build(seedFor(date), DreamSpec(tier: tierFor(date)));
}

class Scoring {
  Scoring._();

  /// 1 = cleared, 2 = at most one mistake, 3 = flawless and within 3 attempts.
  static int stars({required int mistakes, required int attempt}) {
    if (mistakes == 0 && attempt <= 3) return 3;
    if (mistakes <= 1) return 2;
    return 1;
  }

  /// Moonlight earned (soft currency, shared with the Chorus meter).
  static int moonlight({
    required int stars,
    required int rarity,
    required int theoryHits,
    required bool firstClear,
  }) {
    final base = 10 + 5 * stars + 3 * (rarity - 1) + 4 * theoryHits;
    return firstClear ? base + 10 : (base / 2).round();
  }
}
