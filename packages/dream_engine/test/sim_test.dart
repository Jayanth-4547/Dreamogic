import 'package:dream_engine/dream_engine.dart';
import 'package:test/test.dart';

/// Helpers to drive pawns through a built dream.
extension on DreamSim {
  void settle([int extra = 60]) => tick(dream.hopMs + extra);

  /// Hops both pawns to the same tile and waits for landing.
  void both(int row, int col) {
    hop(0, row, col);
    hop(1, row, col);
    settle();
  }
}

Dream _dream(DreamSpec spec, [int seed = 99]) => DreamBuilder.build(seed, spec);

int _safeCol(Dream d, int row) => d.safeCols[row].first;
int _unsafeCol(Dream d, int row) =>
    [0, 1, 2].firstWhere((c) => !d.isSafe(row, c));

/// Walks both pawns along the true route to the end of the path.
void _walkPath(DreamSim s, {bool distinct = false}) {
  final d = s.dream;
  for (var r = 1; r <= d.pathRows; r++) {
    if (r == d.pathRows) {
      s.hop(0, r, 0);
      s.hop(1, r, 2);
      s.settle();
      s.tick(120);
    } else if (distinct) {
      final cols = d.safeCols[r].toList();
      // match pawns to tiles reachable from their current columns
      final a = s.pawns[0], b = s.pawns[1];
      final opts = [
        [cols[0], cols[1]],
        [cols[1], cols[0]]
      ];
      final pick = opts.firstWhere(
          (o) => (o[0] - a.col).abs() <= 1 && (o[1] - b.col).abs() <= 1);
      s.hop(0, r, pick[0]);
      s.hop(1, r, pick[1]);
      s.settle();
      s.tick(120);
    } else {
      s.both(r, _safeCol(d, r));
      s.tick(120);
    }
  }
}

void main() {
  group('movement', () {
    test('only adjacent tiles, one hop at a time', () {
      final s = DreamSim(_dream(const DreamSpec(tier: Tier.chill)));
      expect(s.hop(0, 3, 1), isFalse, reason: 'too far');
      expect(s.hop(0, 0, 1), isFalse, reason: 'same tile');
      expect(s.hop(0, 1, _safeCol(s.dream, 1)), isTrue);
      expect(s.hop(0, 0, 0), isFalse, reason: 'mid-hop');
      s.settle();
      expect(s.pawns[0].row, 1);
    });

    test('closed door blocks and emits an event', () {
      final d = _dream(const DreamSpec(tier: Tier.chill, gate: GateMode.doorbell));
      final s = DreamSim(d);
      _walkPath(s);
      expect(s.hop(0, d.gateRow, 1), isFalse);
      expect(s.takeEvents().any((e) => e.kind == SimEventKind.blocked), isTrue);
    });
  });

  group('rule violations', () {
    test('first mistake wilts and is forgiven; second collapses', () {
      final d = _dream(const DreamSpec(
        classifier: ClassifierKind.quiet,
        modifier: ModifierKind.none,
        tier: Tier.standard,
        tolerance: 1,
      ));
      final s = DreamSim(d);
      s.both(1, _unsafeCol(d, 1));
      expect(s.status, SimStatus.playing);
      expect(s.mistakes, 1);
      expect(s.tiles[1][_unsafeCol(d, 1)].wilted, isTrue);

      // Step off to safe start tile, then step back onto the wilted tile
      s.both(0, 1);
      s.both(1, _unsafeCol(d, 1));
      expect(s.status, SimStatus.voided);
      expect(s.voidCause, VoidCause.tileCollapse);
    });

    test('a single pawn on a bad tile only wilts it', () {
      final d = _dream(const DreamSpec(
        classifier: ClassifierKind.quiet,
        modifier: ModifierKind.none,
        tier: Tier.standard,
        tolerance: 1,
      ));
      final s = DreamSim(d);
      s.hop(0, 1, _unsafeCol(d, 1));
      s.settle();
      expect(s.mistakes, 1);
      expect(s.playing, isTrue);
      expect(s.tiles[1][_unsafeCol(d, 1)].wilted, isTrue);
      expect(s.takeEvents().where((e) => e.kind == SimEventKind.wilt), hasLength(1));
    });

    test('exceeding tolerance voids the dream', () {
      final d = _dream(const DreamSpec(
        classifier: ClassifierKind.loud,
        modifier: ModifierKind.none,
        tier: Tier.nightmare,
        tolerance: 0,
      ));
      final s = DreamSim(d);
      s.hop(0, 1, _unsafeCol(d, 1));
      s.settle();
      expect(s.status, SimStatus.voided);
      expect(s.voidCause, VoidCause.tooManyMistakes);
    });

    test('safe route never produces a mistake', () {
      final d = _dream(const DreamSpec(
          classifier: ClassifierKind.odd,
          modifier: ModifierKind.none,
          tier: Tier.standard));
      final s = DreamSim(d);
      _walkPath(s);
      expect(s.mistakes, 0);
      expect(s.playing, isTrue);
    });
  });

  group('modifiers', () {
    test('stillness: lingering on the path wilts, then collapses', () {
      final d = _dream(const DreamSpec(
        classifier: ClassifierKind.quiet,
        modifier: ModifierKind.stillness,
        tier: Tier.standard,
        tolerance: 1,
      ));
      final s = DreamSim(d);
      s.both(1, _safeCol(d, 1));
      s.tick(d.modifier.stillMs - 400);
      expect(s.mistakes, 0, reason: 'not yet');
      expect(s.stillProgress(0), greaterThan(0.8));
      s.tick(900);
      expect(s.mistakes, greaterThanOrEqualTo(1));
      final ev = s.takeEvents();
      expect(ev.any((e) => e.cause == MistakeCause.stillness), isTrue);
    });

    test('stillness is not punished on the start row', () {
      final d = _dream(const DreamSpec(
          modifier: ModifierKind.stillness, tier: Tier.standard));
      final s = DreamSim(d);
      s.tick(30000);
      expect(s.mistakes, 0);
    });

    test('once: revisiting a safe tile counts as a mistake', () {
      final d = _dream(const DreamSpec(
        classifier: ClassifierKind.quiet,
        modifier: ModifierKind.once,
        tier: Tier.standard,
        tolerance: 1,
      ));
      final s = DreamSim(d);
      final c0 = d.safeCols[1].toList();
      s.hop(0, 1, c0[0]);
      s.hop(1, 1, c0[1]);
      s.settle();
      expect(s.mistakes, 0, reason: 'two distinct safe tiles');
      s.hop(0, 0, 1); // back to start (not a path tile)
      s.settle();
      s.hop(0, 1, c0[1]); // partner already stood there
      s.settle();
      expect(s.takeEvents().any((e) => e.cause == MistakeCause.once), isTrue);
    });

    test('once: the intended distinct routes win the path', () {
      final d = _dream(const DreamSpec(
          classifier: ClassifierKind.odd,
          modifier: ModifierKind.once,
          tier: Tier.standard));
      final s = DreamSim(d);
      _walkPath(s, distinct: true);
      expect(s.mistakes, 0);
      expect(s.playing, isTrue);
    });

    test('tether: straying more than the allowed rows snaps it', () {
      final d = _dream(const DreamSpec(
        classifier: ClassifierKind.quiet,
        modifier: ModifierKind.tether,
        tier: Tier.standard,
        tolerance: 1,
      ));
      final s = DreamSim(d);
      s.hop(0, 1, _safeCol(d, 1));
      s.settle();
      s.hop(0, 2, _safeCol(d, 2));
      s.settle();
      s.tick(d.modifier.tetherGraceMs + 400);
      final ev = s.takeEvents();
      expect(ev.any((e) => e.kind == SimEventKind.tetherSnap), isTrue);
      expect(s.mistakes, 1);
    });
  });

  group('gold gate', () {
    DreamSim atGate(GateMode mode) {
      final d = _dream(DreamSpec(
        classifier: ClassifierKind.quiet,
        modifier: ModifierKind.none,
        gate: mode,
        tier: Tier.standard,
      ));
      final s = DreamSim(d);
      _walkPath(s);
      return s;
    }

    test('doorbell: touch and go wins; waiting loses', () {
      final s = atGate(GateMode.doorbell);
      final g = s.dream.gateRow;
      s.hop(0, g, 0);
      s.settle();
      expect(s.gate.open, isTrue);
      s.hop(0, g, 1);
      s.hop(1, g, 1);
      s.settle();
      expect(s.status, SimStatus.won);

      final t = atGate(GateMode.doorbell);
      t.hop(0, g, 0);
      t.settle();
      t.tick(t.dream.gate.windowMs + 200);
      expect(t.gate.open, isFalse);
      t.tick(1200);
      expect(t.status, SimStatus.voided);
      expect(t.voidCause, VoidCause.gateClosed);
    });

    test('unison: two presses together win; a lone press is wasted', () {
      final s = atGate(GateMode.unison);
      final g = s.dream.gateRow;
      s.hop(0, g, 0);
      s.hop(1, g, 2);
      s.settle();
      expect(s.gate.open, isTrue);
      s.hop(0, g, 1);
      s.hop(1, g, 1);
      s.settle();
      expect(s.status, SimStatus.won);

      final t = atGate(GateMode.unison);
      t.hop(0, g, 0);
      t.settle();
      expect(t.gate.open, isFalse);
      t.tick(t.dream.gate.unisonGapMs + 300);
      expect(t.gate.spent[0], isTrue);
      t.tick(1600);
      expect(t.status, SimStatus.voided);
      expect(t.voidCause, VoidCause.gateUnwinnable);
    });

    test('patience: standing long enough opens the door', () {
      final s = atGate(GateMode.patience);
      final g = s.dream.gateRow;
      s.hop(0, g, 0);
      s.hop(1, g, 2);
      s.settle();
      expect(s.gate.open, isFalse);
      s.tick(s.dream.gate.holdMs + 200);
      expect(s.gate.open, isTrue);
      s.hop(0, g, 1);
      s.hop(1, g, 1);
      s.settle();
      expect(s.status, SimStatus.won);
    });

    test('patience: a quick tap does nothing', () {
      final s = atGate(GateMode.patience);
      final g = s.dream.gateRow;
      s.hop(0, g, 0);
      s.settle(200);
      s.hop(0, g - 1, 0);
      s.settle();
      s.tick(3000);
      expect(s.gate.open, isFalse);
    });

    test('door window closes and the dream voids if someone is left', () {
      final s = atGate(GateMode.doorbell);
      final g = s.dream.gateRow;
      s.hop(0, g, 0);
      s.settle();
      s.hop(0, g, 1); // only one escapes
      s.settle();
      expect(s.pawns[0].exited, isTrue);
      s.tick(s.dream.gate.windowMs + 1500);
      expect(s.status, SimStatus.voided);
    });
  });
}
