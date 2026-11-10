import 'package:dream_engine/dream_engine.dart';
import 'package:test/test.dart';

bool _setEq(Set<int> a, Set<int> b) => a.length == b.length && a.containsAll(b);

/// Structural invariants every dream must satisfy.
void expectWellFormed(Dream d) {
  final b = d.board;
  expect(b.rows, d.pathRows + 2);
  expect(b.at(b.gateRow, 0).kind, TileKind.gold);
  expect(b.at(b.gateRow, 1).kind, TileKind.door);
  expect(b.at(b.gateRow, 2).kind, TileKind.gold);
  expect(b.at(0, 1).kind, TileKind.start);

  // Ground truth equals what the rule says.
  for (var r = 1; r <= d.pathRows; r++) {
    final expected = hypothesisSafe(d.effectiveClassifier(r), b.row(r), d.lanternHue);
    expect(_setEq(d.safeCols[r], expected), isTrue, reason: 'row $r');
    expect(d.safeCols[r], isNotEmpty, reason: 'row $r has a safe tile');
  }
  expect(d.safeCols[d.pathRows], {0, 2});

  // A route exists: every row's safe tile is reachable from the previous row.
  var reachable = <int>{1};
  for (var r = 1; r <= d.pathRows; r++) {
    final next = <int>{};
    for (final c in reachable) {
      for (final nc in [c - 1, c, c + 1]) {
        if (d.safeCols[r].contains(nc)) next.add(nc);
      }
    }
    expect(next, isNotEmpty, reason: 'route breaks at row $r');
    reachable = next;
  }
}

void main() {
  group('generation', () {
    test('is deterministic', () {
      final a = DreamBuilder.build(31337);
      final b = DreamBuilder.build(31337);
      expect(a.name, b.name);
      expect(a.classifier, b.classifier);
      expect(a.gate.mode, b.gate.mode);
      expect(a.whisper.lines.map((l) => l.id), b.whisper.lines.map((l) => l.id));
      for (var r = 0; r < a.board.rows; r++) {
        for (var c = 0; c < 3; c++) {
          expect(a.board.at(r, c).sprouts, b.board.at(r, c).sprouts);
          expect(a.board.at(r, c).hue, b.board.at(r, c).hue);
          expect(a.board.at(r, c).root, b.board.at(r, c).root);
        }
      }
    });

    test('relayout keeps the rule but reshuffles the board', () {
      final a = DreamBuilder.build(2024, const DreamSpec(tier: Tier.standard));
      final b = a.relayout(1);
      expect(b.classifier, a.classifier);
      expect(b.whisper, same(a.whisper));
      var differs = false;
      for (var r = 1; r <= a.pathRows && !differs; r++) {
        for (var c = 0; c < 3; c++) {
          if (a.board.at(r, c).seed != b.board.at(r, c).seed) differs = true;
        }
      }
      expect(differs, isTrue);
      expectWellFormed(b);
    });

    for (final tier in Tier.values) {
      test('well-formed and oracle-solvable across seeds ($tier)', () {
        for (var s = 1; s <= 60; s++) {
          final d = DreamBuilder.build(s * 7919 + tier.index, DreamSpec(tier: tier));
          expectWellFormed(d);
          expect(d.report!.oracleWins, isTrue, reason: 'seed $s $tier');
        }
      }, timeout: const Timeout(Duration(minutes: 3)));
    }

    test('the tells fade but never vanish', () {
      final d = DreamBuilder.build(5, const DreamSpec(tier: Tier.standard));
      expect(d.tellStrength(1), closeTo(1.0, 1e-9));
      expect(d.tellStrength(d.pathRows), closeTo(Dream.minTellStrength(Tier.standard), 1e-9));
      for (var r = 2; r <= d.pathRows; r++) {
        expect(d.tellStrength(r), lessThanOrEqualTo(d.tellStrength(r - 1)));
      }
    });
  });

  group('fairness verifier', () {
    test('most generated dreams have high solve-by-four rate', () {
      var reliable = 0;
      const total = 40;
      for (var s = 0; s < total; s++) {
        final d = DreamBuilder.build(900000 + s, const DreamSpec(tier: Tier.standard));
        if (d.report!.solveByFour >= 0.80 && d.report!.oracleWins && d.report!.layoutsOk) {
          reliable++;
        }
      }
      expect(reliable / total, greaterThanOrEqualTo(0.9),
          reason: 'only $reliable/$total reliable');
    }, timeout: const Timeout(Duration(minutes: 5)));

    test('dreams are solvable and fair across seeds', () {
      var oracleWins = 0;
      const total = 30;
      for (var s = 0; s < total; s++) {
        final d = DreamBuilder.build(7000 + s, const DreamSpec(tier: Tier.standard));
        if (d.report!.oracleWins) oracleWins++;
      }
      expect(oracleWins, equals(total));
    }, timeout: const Timeout(Duration(minutes: 5)));
  });

  group('story', () {
    for (final chapter in kStory) {
      for (final shard in chapter.shards) {
        test('shard ${shard.id} "${shard.title}" is fair and well-formed', () {
          final d = shard.build();
          expectWellFormed(d);
          expect(d.name, shard.title);
          expect(d.report!.oracleWins, isTrue);
          expect(d.report!.layoutsOk, isTrue, reason: d.report.toString());
        });
      }
    }

    test('the very first dream is The Last Gold', () {
      final s = storyShardById('1-1')!;
      expect(s.title, 'The Last Gold');
      final d = s.build();
      expect(d.classifier, ClassifierKind.quiet);
      expect(d.gate.mode, GateMode.doorbell);
    });

    test('nextStoryShard walks the campaign in order', () {
      expect(nextStoryShard('1-1')!.id, '1-2');
      expect(nextStoryShard('1-8')!.id, '2-1');
      expect(nextStoryShard('3-8'), isNull);
    });
  });

  group('daily dream', () {
    test('same date gives same dream; different dates differ', () {
      final a = DailyDream.seedFor(DateTime(2026, 11, 10));
      final b = DailyDream.seedFor(DateTime(2026, 11, 10, 23, 59));
      final c = DailyDream.seedFor(DateTime(2026, 11, 11));
      expect(a, b);
      expect(a, isNot(c));
      expect(a, inInclusiveRange(0, SeedCode.maxSeed));
    });

    test('a week of dailies all build and are fair', () {
      for (var i = 0; i < 7; i++) {
        final d = DailyDream.build(DateTime(2026, 11, 9 + i));
        expectWellFormed(d);
        expect(d.report!.oracleWins, isTrue);
      }
    });
  });

  group('whisper', () {
    test('Hindi pack covers every English id', () {
      for (final id in WhisperCompiler.requiredIds) {
        expect(WhisperCompiler.hasTranslation(id, 'hi'), isTrue, reason: id);
      }
    });

    test('every dream line resolves in every language', () {
      for (var s = 0; s < 40; s++) {
        final d = DreamBuilder.build(s + 100, const DreamSpec(tier: Tier.tricky));
        for (final lang in WhisperCompiler.languages.keys) {
          for (final l in d.whisper.lines) {
            expect(WhisperCompiler.text(l.id, lang), isNot(l.id));
          }
          for (final h in d.whisper.hintIds) {
            expect(WhisperCompiler.text(h, lang), isNot(h));
          }
          expect(WhisperCompiler.text('truth.${d.classifier.name}', lang),
              isNot('truth.${d.classifier.name}'));
        }
      }
    }, timeout: const Timeout(Duration(minutes: 3)));

    test('priors are normalized and favour a plausible reading', () {
      final d = DreamBuilder.build(3);
      final sum = d.whisper.pathPrior.values.fold<double>(0, (a, b) => a + b);
      expect(sum, closeTo(1.0, 1e-9));
      expect(d.whisper.pathPrior[d.classifier]!, greaterThan(0.25));
    });
  });

  group('scoring', () {
    test('stars', () {
      expect(Scoring.stars(mistakes: 0, attempt: 1), 3);
      expect(Scoring.stars(mistakes: 0, attempt: 5), 2);
      expect(Scoring.stars(mistakes: 1, attempt: 1), 2);
      expect(Scoring.stars(mistakes: 2, attempt: 1), 1);
    });
  });
}
