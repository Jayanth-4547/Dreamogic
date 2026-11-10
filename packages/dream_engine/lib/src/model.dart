/// Core data model of a dream: the rule vocabulary, tiles, board and specs.
library;

/// What kind of surface a tile is.
enum TileKind { start, path, gold, door }

/// Static "which tile is safe" rules (the hidden truth of the path).
enum ClassifierKind { quiet, loud, odd, even, hue, flowUp, flowDown }

/// Behavioural rules layered over the path rule.
enum ModifierKind { none, stillness, once, tether }

/// How the Gold Gate at the end behaves.
enum GateMode { doorbell, unison, patience }

/// The *category* of clue a player can pin as their theory on the Debate
/// stage. Deliberately coarse so it never reveals the answer.
enum Subject { trees, roots, colors, stillness, footprints, togetherness, gold }

/// Difficulty tier; shapes the random choices and the fairness bands.
enum Tier { chill, standard, tricky, nightmare }

extension ClassifierKindX on ClassifierKind {
  Subject get subject => switch (this) {
        ClassifierKind.quiet ||
        ClassifierKind.loud ||
        ClassifierKind.odd ||
        ClassifierKind.even =>
          Subject.trees,
        ClassifierKind.hue => Subject.colors,
        ClassifierKind.flowUp || ClassifierKind.flowDown => Subject.roots,
      };

  bool get invertible => this != ClassifierKind.hue;

  ClassifierKind get inverse => switch (this) {
        ClassifierKind.quiet => ClassifierKind.loud,
        ClassifierKind.loud => ClassifierKind.quiet,
        ClassifierKind.odd => ClassifierKind.even,
        ClassifierKind.even => ClassifierKind.odd,
        ClassifierKind.flowUp => ClassifierKind.flowDown,
        ClassifierKind.flowDown => ClassifierKind.flowUp,
        ClassifierKind.hue => ClassifierKind.hue,
      };
}

extension ModifierKindX on ModifierKind {
  Subject? get subject => switch (this) {
        ModifierKind.none => null,
        ModifierKind.stillness => Subject.stillness,
        ModifierKind.once => Subject.footprints,
        ModifierKind.tether => Subject.togetherness,
      };
}

/// One stepping stone.
class Tile {
  const Tile({
    required this.row,
    required this.col,
    required this.kind,
    this.sprouts = 0,
    this.hue = 0,
    this.root = 0,
    this.decor = 0,
    this.seed = 0,
  });

  final int row;
  final int col;
  final TileKind kind;

  /// Number of tiny trees (0..6).
  final int sprouts;

  /// Position on a 24-step hue wheel.
  final int hue;

  /// Direction the roots lean: 0 up (toward the exit), 1 right, 2 down, 3 left.
  final int root;

  /// Purely decorative variant (pebbles, flowers...). Never rule-relevant.
  final int decor;

  /// Per-tile random seed so renderers can scatter sprouts consistently.
  final int seed;

  @override
  String toString() => 'Tile($row,$col,$kind s=$sprouts h=$hue r=$root)';
}

/// The grid of tiles: row 0 is the start, rows 1..[pathRows] the path and row
/// [gateRow] the Gold Gate (gold, door, gold).
class Board {
  Board(this.grid);

  static const int cols = 3;

  final List<List<Tile>> grid;

  int get rows => grid.length;
  int get gateRow => grid.length - 1;
  int get pathRows => grid.length - 2;

  Tile at(int row, int col) => grid[row][col];
  List<Tile> row(int r) => grid[r];

  bool inBounds(int row, int col) =>
      row >= 0 && row < rows && col >= 0 && col < cols;
}

class GateSpec {
  const GateSpec({
    required this.mode,
    required this.windowMs,
    this.unisonGapMs = 1400,
    this.holdMs = 2000,
    this.reserveMs = 4200,
  });

  final GateMode mode;

  /// How long the door stays open once it opens.
  final int windowMs;

  /// (unison) max gap between the two gold presses.
  final int unisonGapMs;

  /// (patience) how long someone must stand on gold to open the door.
  final int holdMs;

  /// (patience) total standing time a gold can give before it is spent.
  final int reserveMs;
}

class ModifierSpec {
  const ModifierSpec({
    required this.kind,
    this.stillMs = 3200,
    this.tetherRows = 1,
    this.tetherGraceMs = 1800,
  });

  const ModifierSpec.none() : this(kind: ModifierKind.none);

  final ModifierKind kind;
  final int stillMs;
  final int tetherRows;
  final int tetherGraceMs;
}

/// A request for a dream. Anything left null is chosen by the seed.
class DreamSpec {
  const DreamSpec({
    this.classifier,
    this.modifier,
    this.gate,
    this.flip,
    this.pathRows,
    this.tolerance,
    this.biome,
    this.quirk,
    this.tier = Tier.standard,
    this.name,
  });

  final ClassifierKind? classifier;
  final ModifierKind? modifier;
  final GateMode? gate;
  final bool? flip;
  final int? pathRows;
  final int? tolerance;
  final int? biome;
  final String? quirk;
  final Tier tier;
  final String? name;
}
