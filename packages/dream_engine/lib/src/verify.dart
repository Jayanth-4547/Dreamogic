/// The fairness verifier.
///
/// Every dream must pass before any player sees it:
///  1. an omniscient oracle can win it (on every re-rolled layout),
///  2. rival readings of the whisper are punished early and often,
///  3. *simulated players* (who follow the whisper's most likely reading, pause
///     to think, and learn from mistakes) land inside the tier's difficulty
///     band: usually wrong on the first try, but reliably right by the fourth.
library;

import 'dart:math' as math;

import 'dream.dart';
import 'model.dart';
import 'rng.dart';
import 'sim.dart';
import 'whisper.dart';

class InsightReport {
  const InsightReport({
    required this.trials,
    required this.firstTryWinRate,
    required this.meanAttempts,
    required this.solveByFour,
    required this.oracleWins,
    required this.layoutsOk,
    required this.inBand,
  });

  final int trials;
  final double firstTryWinRate;
  final double meanAttempts;
  final double solveByFour;
  final bool oracleWins;
  final bool layoutsOk;
  final bool inBand;

  bool get passes => oracleWins && layoutsOk && inBand;

  /// Distance from the ideal band centre; lower is better (for fallbacks).
  double get penalty {
    var p = 0.0;
    if (!oracleWins) p += 100;
    if (!layoutsOk) p += 5;
    p += firstTryWinRate;
    p += (1 - solveByFour) * 3;
    return p;
  }

  @override
  String toString() =>
      'InsightReport(first=${firstTryWinRate.toStringAsFixed(2)} '
      'mean=${meanAttempts.toStringAsFixed(2)} by4=${solveByFour.toStringAsFixed(2)} '
      'oracle=$oracleWins layouts=$layoutsOk band=$inBand)';
}

class _Band {
  const _Band(this.firstTryMax, this.byFourMin, this.meanMax);
  final double firstTryMax;
  final double byFourMin;
  final double meanMax;
}

const Map<Tier, _Band> _bands = {
  Tier.chill: _Band(0.75, 0.80, 3.5),
  Tier.standard: _Band(0.60, 0.75, 4.2),
  Tier.tricky: _Band(0.45, 0.70, 5.0),
  Tier.nightmare: _Band(0.35, 0.60, 5.8),
};

class Verifier {
  Verifier._();

  static const int maxAttempts = 7;

  static InsightReport verify(Dream dream, {int trials = 14}) {
    final layouts = <Dream>[
      dream,
      for (var i = 1; i < maxAttempts; i++) dream.relayout(i),
    ];

    // 1) Oracle must win every layout.
    var oracleWins = true;
    for (final d in layouts) {
      final bot = PairBot(d, Rng(d.seed).fork('oracle'), omniscient: true);
      final sim = DreamSim(d);
      if (!bot.play(sim)) {
        oracleWins = false;
        break;
      }
    }

    // 2) Rival readings must be punished in the first layout.
    final layoutsOk = LayoutGenerator.layoutQuality(
      BuiltLayout(dream.board, dream.safeCols),
      dream.classifier,
      dream.flipRow,
      dream.lanternHue,
    ).ok;

    // 3) Simulated players.
    var first = 0;
    var by4 = 0;
    var total = 0.0;
    for (var t = 0; t < trials; t++) {
      final bot = PairBot(dream, Rng(dream.seed).fork('bot$t'));
      var solvedAt = maxAttempts + 1;
      for (var a = 1; a <= maxAttempts; a++) {
        final sim = DreamSim(layouts[a - 1]);
        if (bot.play(sim)) {
          solvedAt = a;
          break;
        }
      }
      if (solvedAt == 1) first++;
      if (solvedAt <= 4) by4++;
      total += solvedAt;
    }

    final firstRate = first / trials;
    final by4Rate = by4 / trials;
    final mean = total / trials;
    final band = _bands[dream.tier]!;
    final inBand = firstRate <= band.firstTryMax &&
        by4Rate >= band.byFourMin &&
        mean <= band.meanMax;

    return InsightReport(
      trials: trials,
      firstTryWinRate: firstRate,
      meanAttempts: mean,
      solveByFour: by4Rate,
      oracleWins: oracleWins,
      layoutsOk: layoutsOk,
      inBand: inBand,
    );
  }
}

/// A simulated pair of dreamers. With [omniscient] it plays perfectly (the
/// oracle); otherwise it models a thoughtful human: it believes the whisper's
/// most likely readings, eliminates readings that observation contradicts,
/// learns about hidden behaviours from the mistakes they cause, and keeps what
/// it learned across attempts (the rule stays; the layout is reshuffled).
class PairBot {
  PairBot(this.dream, this.rng, {this.omniscient = false}) {
    final truth = dream.classifier;
    if (omniscient) {
      _early = {truth: 1.0};
      _late = {truth.inverse: 1.0};
      knowsOnce = knowsStill = knowsTether = true;
      _gateW = {dream.gate.mode.action: 1.0};
    } else {
      _early = Map.of(dream.whisper.pathPrior);
      _gateW = Map.of(dream.whisper.gatePrior);
    }
    _flipAware = omniscient ||
        dream.whisper.lines.any((l) => l.role == WhisperRole.flip);
    if (!omniscient) {
      if (dream.whisper.lines.any((l) => l.id.startsWith('mod.still'))) {
        knowsStill = rng.chance(0.85);
      }
      if (dream.whisper.lines.any((l) => l.id.startsWith('mod.once'))) {
        knowsOnce = rng.chance(0.85);
      }
      if (dream.whisper.lines.any((l) => l.id.startsWith('mod.tether'))) {
        knowsTether = rng.chance(0.85);
      }
    }
  }

  final Dream dream;
  final Rng rng;
  final bool omniscient;

  late Map<ClassifierKind, double> _early;
  Map<ClassifierKind, double>? _late;
  late Map<GateAction, double> _gateW;
  late final bool _flipAware;
  bool knowsOnce = false;
  bool knowsStill = false;
  bool knowsTether = false;
  bool _lateActive = false;

  Map<ClassifierKind, double> _makeLate() {
    final out = <ClassifierKind, double>{};
    for (final k in ClassifierKind.values) {
      out[k] = 0.03 + (_early[k.inverse] ?? 0) * 1.0 + (_early[k] ?? 0) * 0.15;
    }
    return out;
  }

  Map<ClassifierKind, double> _weightsForRow(int r) {
    if (dream.hasFlip && r >= dream.flipRow) {
      if (omniscient || _lateActive) return _late ??= _makeLate();
    }
    return _early;
  }

  double _vote(Map<ClassifierKind, double> w, List<Tile> rowTiles, int col) {
    var num = 0.0;
    var den = 0.0;
    for (final e in w.entries) {
      if (e.value <= 0) continue;
      den += e.value;
      if (hypothesisSafe(e.key, rowTiles, dream.lanternHue).contains(col)) {
        num += e.value;
      }
    }
    return den == 0 ? 0.5 : num / den;
  }

  int _choose(int r, int fromCol, {int? exclude}) {
    final rowTiles = dream.board.row(r);
    final w = _weightsForRow(r);
    var bestCol = fromCol;
    var best = -1.0;
    for (var c = fromCol - 1; c <= fromCol + 1; c++) {
      if (c < 0 || c >= Board.cols) continue;
      if (exclude != null && c == exclude) continue;
      final v = _vote(w, rowTiles, c) + rng.nextDouble() * 0.001;
      if (v > best) {
        best = v;
        bestCol = c;
      }
    }
    return best < 0 ? (exclude ?? fromCol) : bestCol;
  }

  /// Plays one attempt on [sim]; returns true if the pair escaped.
  bool play(DreamSim sim) {
    final n = dream.pathRows;
    _lateActive = _flipAware && rng.chance(0.7);
    var r = 1;
    while (r <= n && sim.playing) {
      if (r == n) {
        _finalApproach(sim, r);
        r++;
      } else if (!knowsTether &&
          !omniscient &&
          dream.modifier.kind == ModifierKind.tether &&
          r <= n - 3 &&
          rng.chance(0.22)) {
        _scout(sim, r);
        r += 2;
      } else {
        _pairMove(sim, r);
        r++;
      }
    }
    if (!sim.playing) return false;
    return _gate(sim);
  }

  void _pairMove(DreamSim sim, int r) {
    final a = sim.pawns[0];
    final b = sim.pawns[1];
    final distinct = dream.modifier.kind == ModifierKind.once &&
        (knowsOnce || omniscient);
    final w = _weightsForRow(r);
    final rowTiles = dream.board.row(r);

    var bestA = a.col;
    var bestB = b.col;
    var bestScore = -99999.0;

    for (var ca = a.col - 1; ca <= a.col + 1; ca++) {
      if (ca < 0 || ca >= Board.cols) continue;
      for (var cb = b.col - 1; cb <= b.col + 1; cb++) {
        if (cb < 0 || cb >= Board.cols) continue;
        if (distinct && ca == cb) continue;

        double score;
        if (omniscient) {
          final safeA = dream.isSafe(r, ca);
          final safeB = dream.isSafe(r, cb);
          if (safeA && safeB) {
            score = 100.0 - (ca - cb).abs() * 0.1;
          } else if (safeA || safeB) {
            score = 10.0;
          } else {
            score = 0.0;
          }
        } else {
          final va = _vote(w, rowTiles, ca);
          final vb = _vote(w, rowTiles, cb);
          score = va + vb + rng.nextDouble() * 0.01;
          if (!distinct && ca == cb) score += 0.05;
        }

        if (score > bestScore) {
          bestScore = score;
          bestA = ca;
          bestB = cb;
        }
      }
    }

    sim.hop(0, r, bestA);
    sim.hop(1, r, bestB);
    _wait(sim, dream.hopMs + 40);
    final think = omniscient
        ? 0
        : (rng.chance(0.14) ? (knowsStill ? 200 : 3600) : 0);
    _wait(sim, 300 + think);
  }

  void _scout(DreamSim sim, int r) {
    final a = sim.pawns[0];
    final b = sim.pawns[1];
    sim.hop(0, r, _choose(r, a.col));
    _wait(sim, dream.hopMs + 40);
    if (!sim.playing) return;
    sim.hop(0, r + 1, _choose(r + 1, a.col));
    _wait(sim, dream.hopMs + 40);
    _wait(sim, 2300);
    if (!sim.playing) return;
    sim.hop(1, r, _choose(r, b.col));
    _wait(sim, dream.hopMs + 40);
    if (!sim.playing) return;
    sim.hop(1, r + 1, _choose(r + 1, b.col));
    _wait(sim, dream.hopMs + 340);
  }

  void _finalApproach(DreamSim sim, int r) {
    final a = sim.pawns[0];
    final b = sim.pawns[1];
    // We want one pawn at 0 and one pawn at 2 (the two safe columns before gate).
    // Test both pairings: (a->0, b->2) vs (a->2, b->0)
    final opt1Valid = (0 - a.col).abs() <= 1 && (2 - b.col).abs() <= 1;
    final opt2Valid = (2 - a.col).abs() <= 1 && (0 - b.col).abs() <= 1;

    int targetA, targetB;
    if (opt1Valid && (!opt2Valid || a.col <= b.col)) {
      targetA = 0;
      targetB = 2;
    } else if (opt2Valid) {
      targetA = 2;
      targetB = 0;
    } else {
      targetA = (0 - a.col).abs() <= 1 ? 0 : 2;
      targetB = (2 - b.col).abs() <= 1 ? 2 : 0;
    }

    sim.hop(a.id, r, targetA);
    sim.hop(b.id, r, targetB);
    _wait(sim, dream.hopMs + 40);
    _wait(sim, 300);
  }

  bool _gate(DreamSim sim) {
    if (!sim.playing) return false;
    final g = dream.board.gateRow;
    final n = dream.pathRows;
    final loIsA = sim.pawns[0].col <= sim.pawns[1].col;
    final lo = loIsA ? sim.pawns[0] : sim.pawns[1];
    final hi = loIsA ? sim.pawns[1] : sim.pawns[0];

    final action = _pickAction();
    int goldFor(PawnRt p, int pref) =>
        (pref - p.col).abs() <= 1 ? pref : (p.col == 2 ? 2 : 0);

    var opened = false;
    switch (action) {
      case GateAction.tap:
        sim.hop(lo.id, g, goldFor(lo, 0));
        _wait(sim, dream.hopMs + 40);
        opened = sim.gate.open;
        if (opened && lo.row == g) {
          sim.hop(hi.id, g, 1);
          sim.hop(lo.id, g, 1);
          _wait(sim, dream.hopMs + 60);
        } else {
          _wait(sim, 700);
          if (sim.gate.open) {
            sim.hop(hi.id, g, 1);
            sim.hop(lo.id, g, 1);
            _wait(sim, dream.hopMs + 60);
          }
        }
      case GateAction.together:
        sim.hop(lo.id, g, goldFor(lo, 0));
        sim.hop(hi.id, g, goldFor(hi, 2));
        _wait(sim, dream.hopMs + 40);
        if (!sim.gate.open) _wait(sim, 700);
        if (sim.gate.open) {
          sim.hop(lo.id, g, 1);
          sim.hop(hi.id, g, 1);
          _wait(sim, dream.hopMs + 60);
        }
      case GateAction.stand:
        sim.hop(lo.id, g, goldFor(lo, 0));
        sim.hop(hi.id, g, goldFor(hi, 2));
        _wait(sim, dream.hopMs + 40);
        var waited = 0;
        while (sim.playing && !sim.gate.open && waited < 7000) {
          _wait(sim, 50);
          waited += 50;
        }
        if (sim.gate.open) {
          final maxDelay = math.max(0, dream.gate.windowMs - dream.hopMs - 400);
          final d = omniscient ? 0 : rng.range(0, math.min(1000, maxDelay));
          if (d > 0) _wait(sim, d);
          sim.hop(lo.id, g, 1);
          sim.hop(hi.id, g, 1);
          _wait(sim, dream.hopMs + 60);
        }
    }
    // Let the outcome settle.
    var settle = 0;
    while (sim.playing && settle < 2500) {
      _wait(sim, 100);
      settle += 100;
    }
    final won = sim.status == SimStatus.won;
    if (!won && !omniscient) {
      _gateW[action] = 0;
      if (_gateW.values.every((v) => v <= 0)) {
        _gateW = {for (final a in GateAction.values) a: 1.0};
      }
    }
    // n is only used to keep the analyzer honest about unused locals.
    assert(n >= 1);
    return won;
  }

  GateAction _pickAction() {
    var best = GateAction.tap;
    var bestV = -1.0;
    for (final e in _gateW.entries) {
      final v = e.value + rng.nextDouble() * 0.001;
      if (e.value > 0 && v > bestV) {
        bestV = v;
        best = e.key;
      }
    }
    return best;
  }

  void _wait(DreamSim sim, int ms) {
    var remaining = ms;
    while (remaining > 0 && sim.playing) {
      final step = math.min(100, remaining);
      sim.tick(step);
      remaining -= step;
      _observe(sim.takeEvents());
    }
    if (!sim.playing) _observe(sim.takeEvents());
  }

  void _observe(List<SimEvent> events) {
    if (events.isEmpty) return;
    final pending = <int, ({int row, int col, MistakeCause? cause})>{};
    final done = <({int row, int col, MistakeCause? cause})>[];
    for (final e in events) {
      switch (e.kind) {
        case SimEventKind.land:
          final prev = pending.remove(e.pawn);
          if (prev != null) done.add(prev);
          pending[e.pawn] = (row: e.row, col: e.col, cause: null);
        case SimEventKind.wilt:
        case SimEventKind.collapse:
          final cur = pending[e.pawn];
          if (cur != null) {
            pending[e.pawn] = (row: cur.row, col: cur.col, cause: e.cause);
          }
          if (e.cause == MistakeCause.once) knowsOnce = true;
          if (e.cause == MistakeCause.stillness) knowsStill = true;
        case SimEventKind.tetherSnap:
          knowsTether = true;
        default:
          break;
      }
    }
    done.addAll(pending.values);
    for (final o in done) {
      _learn(o.row, o.col, o.cause != MistakeCause.rule, o.cause);
    }
  }

  void _learn(int row, int col, bool observedSafe, MistakeCause? cause) {
    if (omniscient) return;
    if (row < 1 || row > dream.pathRows) return;
    final inLate = dream.hasFlip && row >= dream.flipRow;
    final map = inLate ? (_late ??= _makeLate()) : _early;
    if (inLate && !observedSafe) _lateActive = true;
    final rowTiles = dream.board.row(row);
    for (final k in ClassifierKind.values) {
      if ((map[k] ?? 0) <= 0) continue;
      final predicted =
          hypothesisSafe(k, rowTiles, dream.lanternHue).contains(col);
      if (predicted != observedSafe) map[k] = 0;
    }
    if (map.values.every((v) => v <= 0)) {
      // Everything contradicted: start over with a flat belief.
      for (final k in ClassifierKind.values) {
        map[k] = 1.0;
      }
    }
  }
}
