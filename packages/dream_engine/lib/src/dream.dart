/// A fully resolved dream plus its layout generator.
library;

import 'dart:math' as math;

import 'biomes.dart';
import 'model.dart';
import 'rng.dart';
import 'verify.dart';
import 'whisper.dart';

/// Safe columns of one row according to hypothesis [k] (also used as the
/// ground truth for the real rule).
Set<int> hypothesisSafe(ClassifierKind k, List<Tile> row, int lanternHue) {
  final out = <int>{};
  switch (k) {
    case ClassifierKind.quiet:
      final m = row.map((t) => t.sprouts).reduce(math.min);
      for (final t in row) {
        if (t.sprouts == m) out.add(t.col);
      }
    case ClassifierKind.loud:
      final m = row.map((t) => t.sprouts).reduce(math.max);
      for (final t in row) {
        if (t.sprouts == m) out.add(t.col);
      }
    case ClassifierKind.odd:
      for (final t in row) {
        if (t.sprouts.isOdd) out.add(t.col);
      }
    case ClassifierKind.even:
      for (final t in row) {
        if (t.sprouts.isEven) out.add(t.col);
      }
    case ClassifierKind.hue:
      for (final t in row) {
        if (t.hue == lanternHue) out.add(t.col);
      }
    case ClassifierKind.flowUp:
      for (final t in row) {
        if (t.root == 0) out.add(t.col);
      }
    case ClassifierKind.flowDown:
      for (final t in row) {
        if (t.root == 2) out.add(t.col);
      }
  }
  return out;
}

class Dream {
  Dream({
    required this.seed,
    required this.layoutIndex,
    required this.name,
    required this.biome,
    required this.quirk,
    required this.classifier,
    required this.modifier,
    required this.flipRow,
    required this.gate,
    required this.tolerance,
    required this.hopMs,
    required this.lanternHue,
    required this.board,
    required this.safeCols,
    required this.whisper,
    required this.tier,
    required this.rarity,
    this.report,
  });

  final int seed;

  /// Which re-rolled layout of this dream's rule this is (0 = first run).
  final int layoutIndex;
  final String name;
  final Biome biome;
  final Quirk quirk;
  final ClassifierKind classifier;
  final ModifierSpec modifier;

  /// First row governed by the inverted rule, or -1 when the rule never turns.
  final int flipRow;
  final GateSpec gate;

  /// Mistakes forgiven before the dream collapses.
  final int tolerance;
  final int hopMs;
  final int lanternHue;
  final Board board;

  /// Safe columns per row (index = row). Row 0 and the gate row are all safe.
  final List<Set<int>> safeCols;
  final Whisper whisper;
  final Tier tier;

  /// 1..3 stars.
  final int rarity;
  final InsightReport? report;

  String get code => SeedCode.encode(seed);
  int get pathRows => board.pathRows;
  int get gateRow => board.gateRow;
  bool get hasFlip => flipRow >= 0;

  ClassifierKind effectiveClassifier(int row) =>
      hasFlip && row >= flipRow ? classifier.inverse : classifier;

  bool isSafe(int row, int col) => safeCols[row].contains(col);

  /// Visual salience of the tells at [row]: 1 at the entrance, fading toward
  /// [minTellStrength] at the end of the path.
  double tellStrength(int row) {
    final t = pathRows <= 1 ? 0.0 : ((row - 1) / (pathRows - 1)).clamp(0.0, 1.0);
    final eased = math.pow(t, 0.8).toDouble();
    return 1.0 - (1.0 - minTellStrength(tier)) * eased;
  }

  /// The categories of clue involved (for the Debate stage scoring).
  Set<Subject> get subjects => {
        classifier.subject,
        if (modifier.kind.subject != null) modifier.kind.subject!,
        Subject.gold,
      };

  Dream withReport(InsightReport r) => Dream(
        seed: seed,
        layoutIndex: layoutIndex,
        name: name,
        biome: biome,
        quirk: quirk,
        classifier: classifier,
        modifier: modifier,
        flipRow: flipRow,
        gate: gate,
        tolerance: tolerance,
        hopMs: hopMs,
        lanternHue: lanternHue,
        board: board,
        safeCols: safeCols,
        whisper: whisper,
        tier: tier,
        rarity: rarity,
        report: r,
      );

  /// Same rule, freshly shuffled layout (what happens on every retry).
  Dream relayout(int index) {
    final rng = Rng(seed).fork('retry$index');
    final built = LayoutGenerator.generateValid(
      rng: rng,
      pathRows: pathRows,
      classifier: classifier,
      flipRow: flipRow,
      modifier: modifier.kind,
      lanternHue: lanternHue,
      tier: tier,
      tries: 24,
    );
    return Dream(
      seed: seed,
      layoutIndex: index,
      name: name,
      biome: biome,
      quirk: quirk,
      classifier: classifier,
      modifier: modifier,
      flipRow: flipRow,
      gate: gate,
      tolerance: tolerance,
      hopMs: hopMs,
      lanternHue: lanternHue,
      board: built.board,
      safeCols: built.safe,
      whisper: whisper,
      tier: tier,
      rarity: rarity,
      report: report,
    );
  }

  static double minTellStrength(Tier t) => switch (t) {
        Tier.chill => 0.40,
        Tier.standard => 0.28,
        Tier.tricky => 0.20,
        Tier.nightmare => 0.14,
      };
}

class BuiltLayout {
  const BuiltLayout(this.board, this.safe);
  final Board board;
  final List<Set<int>> safe;
}

class LayoutGenerator {
  LayoutGenerator._();

  static int _lerpInt(double a, double b, double t) => (a + (b - a) * t).round();

  /// Generates layouts until one passes the red-herring checks (every wrong
  /// reading must be punished early and often), falling back to the best.
  static BuiltLayout generateValid({
    required Rng rng,
    required int pathRows,
    required ClassifierKind classifier,
    required int flipRow,
    required ModifierKind modifier,
    required int lanternHue,
    required Tier tier,
    int tries = 24,
  }) {
    BuiltLayout? best;
    var bestScore = -1.0;
    for (var i = 0; i < tries; i++) {
      final cand = generate(
        rng: rng.fork('l$i'),
        pathRows: pathRows,
        classifier: classifier,
        flipRow: flipRow,
        modifier: modifier,
        lanternHue: lanternHue,
        tier: tier,
      );
      final q = layoutQuality(cand, classifier, flipRow, lanternHue);
      if (q.ok) return cand;
      if (q.score > bestScore) {
        bestScore = q.score;
        best = cand;
      }
    }
    return best!;
  }

  static BuiltLayout generate({
    required Rng rng,
    required int pathRows,
    required ClassifierKind classifier,
    required int flipRow,
    required ModifierKind modifier,
    required int lanternHue,
    required Tier tier,
  }) {
    final n = pathRows;
    final intended = List<Set<int>>.generate(n + 2, (_) => <int>{0, 1, 2});

    // 1) Route / safe sets.
    if (modifier == ModifierKind.once) {
      for (var r = 1; r <= n - 1; r++) {
        intended[r] = {0, 1, 2}..remove(rng.nextInt(3));
      }
    } else {
      final route = List<int>.filled(n + 1, 1);
      route[n - 1] = 1;
      for (var r = n - 2; r >= 1; r--) {
        final prev = route[r + 1];
        final options = <int>[
          for (var c = prev - 1; c <= prev + 1; c++)
            if (c >= 0 && c <= 2) c
        ];
        // Prefer changing column so the route weaves.
        final weights = [for (final c in options) c == prev ? 1.0 : 1.7];
        route[r] = rng.pickWeighted(options, weights);
      }
      for (var r = 1; r <= n - 1; r++) {
        intended[r] = {route[r]};
      }
    }
    intended[n] = {0, 2};
    intended[0] = {rng.nextInt(3)};

    // 2) Tile attributes row by row.
    final grid = <List<Tile>>[];
    for (var r = 0; r <= n; r++) {
      final t = r == 0 ? 0.0 : (n <= 1 ? 0.0 : (r - 1) / (n - 1)).clamp(0.0, 1.0);
      final k = (flipRow >= 0 && r >= flipRow) ? classifier.inverse : classifier;
      grid.add(_fillRow(
        rng: rng.fork('row$r'),
        row: r,
        kind: k,
        safe: intended[r],
        t: t,
        lanternHue: lanternHue,
        tileKind: r == 0 ? TileKind.start : TileKind.path,
      ));
    }
    // Gate row: gold, door, gold.
    grid.add([
      Tile(row: n + 1, col: 0, kind: TileKind.gold, seed: rng.nextU32()),
      Tile(row: n + 1, col: 1, kind: TileKind.door, seed: rng.nextU32()),
      Tile(row: n + 1, col: 2, kind: TileKind.gold, seed: rng.nextU32()),
    ]);

    // 3) Ground truth = what the rule actually says about the final tiles.
    final safe = <Set<int>>[];
    for (var r = 0; r <= n; r++) {
      final k = (flipRow >= 0 && r >= flipRow) ? classifier.inverse : classifier;
      safe.add(r == 0 ? {0, 1, 2} : hypothesisSafe(k, grid[r], lanternHue));
    }
    safe.add({0, 1, 2});
    return BuiltLayout(Board(grid), safe);
  }

  static List<Tile> _fillRow({
    required Rng rng,
    required int row,
    required ClassifierKind kind,
    required Set<int> safe,
    required double t,
    required int lanternHue,
    required TileKind tileKind,
  }) {
    final maxCount = _lerpInt(5, 3, t).clamp(2, 6);
    final gap = math.max(1, _lerpInt(3, 1, t));
    final sprouts = List<int>.filled(3, 0);
    final hues = List<int>.generate(3, (_) => rng.nextInt(24));
    final roots = List<int>.generate(3, (_) => rng.nextInt(4));

    // Rule-irrelevant dimensions are random noise (these are the red herrings).
    for (var c = 0; c < 3; c++) {
      sprouts[c] = rng.range(0, maxCount);
    }

    switch (kind) {
      case ClassifierKind.quiet:
        final lo = t > 0.55 ? 0 : rng.range(0, 1);
        for (var c = 0; c < 3; c++) {
          sprouts[c] = safe.contains(c)
              ? lo
              : rng.range(lo + 1, math.min(6, lo + gap + (t < 0.3 ? 1 : 0)));
        }
      case ClassifierKind.loud:
        final hi = rng.range(math.max(2, maxCount - 1), maxCount);
        for (var c = 0; c < 3; c++) {
          sprouts[c] =
              safe.contains(c) ? hi : rng.range(math.max(0, hi - gap), hi - 1);
        }
      case ClassifierKind.odd:
        final odds = [for (var v = 1; v <= maxCount; v += 2) v];
        final evens = [for (var v = 0; v <= maxCount; v += 2) v];
        for (var c = 0; c < 3; c++) {
          sprouts[c] = safe.contains(c) ? rng.pick(odds) : rng.pick(evens);
        }
      case ClassifierKind.even:
        final odds = [for (var v = 1; v <= maxCount; v += 2) v];
        final evens = [for (var v = 0; v <= maxCount; v += 2) v];
        for (var c = 0; c < 3; c++) {
          sprouts[c] = safe.contains(c) ? rng.pick(evens) : rng.pick(odds);
        }
      case ClassifierKind.hue:
        final minOff = _lerpInt(7, 2, t);
        for (var c = 0; c < 3; c++) {
          if (safe.contains(c)) {
            hues[c] = lanternHue;
          } else {
            final off = rng.range(minOff, 12) * (rng.chance(0.5) ? 1 : -1);
            hues[c] = (lanternHue + off + 24) % 24;
          }
        }
      case ClassifierKind.flowUp:
        for (var c = 0; c < 3; c++) {
          roots[c] = safe.contains(c) ? 0 : rng.pick(const [1, 2, 3]);
        }
      case ClassifierKind.flowDown:
        for (var c = 0; c < 3; c++) {
          roots[c] = safe.contains(c) ? 2 : rng.pick(const [0, 1, 3]);
        }
    }

    return [
      for (var c = 0; c < 3; c++)
        Tile(
          row: row,
          col: c,
          kind: tileKind,
          sprouts: sprouts[c],
          hue: hues[c],
          root: roots[c],
          decor: rng.nextInt(8),
          seed: rng.nextU32(),
        )
    ];
  }

  /// Red-herring quality: every rival reading must disagree with the truth
  /// often enough, and early enough, to be falsified by play.
  static ({bool ok, double score}) layoutQuality(
    BuiltLayout layout,
    ClassifierKind truth,
    int flipRow,
    int lanternHue,
  ) {
    final n = layout.board.pathRows;
    final early = math.min(4, n);
    var ok = true;
    var score = 0.0;
    for (final h in ClassifierKind.values) {
      if (h == truth) continue;
      var diff = 0;
      var diffEarly = 0;
      for (var r = 1; r <= n; r++) {
        final s = hypothesisSafe(h, layout.board.row(r), lanternHue);
        if (!_setEq(s, layout.safe[r])) {
          diff++;
          if (r <= early) diffEarly++;
        }
      }
      final needTotal = math.max(3, (n * 0.35).round());
      if (diff < needTotal || diffEarly < 2) ok = false;
      score += math.min(diff, needTotal) / needTotal + math.min(diffEarly, 2) / 2;
    }
    return (ok: ok, score: score);
  }

  static bool _setEq(Set<int> a, Set<int> b) =>
      a.length == b.length && a.containsAll(b);
}
