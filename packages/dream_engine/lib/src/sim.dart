/// The deterministic dream simulation.
///
/// This is the single source of truth for the rules. The Flame game only
/// renders it and feeds it input; the verifier bots drive the very same code,
/// so a dream is guaranteed to behave in play exactly as it was verified.
library;

import 'dart:math' as math;

import 'dream.dart';
import 'model.dart';

enum SimStatus { playing, won, voided }

enum VoidCause { tooManyMistakes, tileCollapse, gateClosed, gateUnwinnable }

enum MistakeCause { rule, once, stillness, tether }

enum SimEventKind {
  hop,
  land,
  wilt,
  collapse,
  blocked,
  goldLit,
  goldSpent,
  doorOpen,
  doorClose,
  exited,
  tetherSnap,
  won,
  voided,
}

class SimEvent {
  const SimEvent(
    this.kind,
    this.atMs, {
    this.pawn = -1,
    this.row = -1,
    this.col = -1,
    this.cause,
    this.voidCause,
  });

  final SimEventKind kind;
  final int atMs;
  final int pawn;
  final int row;
  final int col;
  final MistakeCause? cause;
  final VoidCause? voidCause;

  @override
  String toString() => 'SimEvent($kind @${atMs}ms p$pawn r$row c$col $cause)';
}

class PawnRt {
  PawnRt(this.id, this.row, this.col);

  final int id;
  int row;
  int col;
  int toRow = -1;
  int toCol = -1;
  int hopStartMs = 0;
  int hopEndMs = 0;
  int landedAtMs = 0;
  int nextStillAt = 1 << 40;
  bool exited = false;

  bool get hopping => toRow >= 0;
}

class TileRt {
  int strikes = 0;
  bool voided = false;
  int visits = 0;
  int lastStrikeAtMs = -1;

  bool get wilted => strikes > 0;
}

class GateRt {
  GateRt(this.mode, this.spec);

  final GateMode mode;
  final GateSpec spec;
  bool open = false;
  bool everOpened = false;
  bool dead = false;
  int openUntilMs = 0;
  final List<int> pressedAt = [-1, -1];
  final List<bool> spent = [false, false];

  /// (patience) fill progress 0..1 per gold.
  final List<double> hold = [0, 0];
  final List<int> reserve = [0, 0];
}

class DreamSim {
  DreamSim(this.dream)
      : tiles = [
          for (var r = 0; r < dream.board.rows; r++)
            [for (var c = 0; c < Board.cols; c++) TileRt()]
        ],
        gate = GateRt(dream.gate.mode, dream.gate) {
    pawns = [PawnRt(0, 0, 1), PawnRt(1, 0, 1)];
    gate.reserve[0] = dream.gate.reserveMs;
    gate.reserve[1] = dream.gate.reserveMs;
    for (final p in pawns) {
      tiles[p.row][p.col].visits = 0;
    }
  }

  final Dream dream;
  final List<List<TileRt>> tiles;
  final GateRt gate;
  late final List<PawnRt> pawns;

  int nowMs = 0;
  SimStatus status = SimStatus.playing;
  VoidCause? voidCause;
  int mistakes = 0;
  double _tetherStrainMs = 0;
  int _failAtMs = -1;
  VoidCause? _failCause;
  final List<SimEvent> _events = [];

  Board get board => dream.board;
  bool get playing => status == SimStatus.playing;

  /// Events since the last call (cleared on read).
  List<SimEvent> takeEvents() {
    final out = List<SimEvent>.of(_events);
    _events.clear();
    return out;
  }

  /// 0..1: how close the tether is to snapping.
  double get tetherStrain => dream.modifier.kind == ModifierKind.tether
      ? (_tetherStrainMs / dream.modifier.tetherGraceMs).clamp(0.0, 1.0)
      : 0.0;

  /// 0..1: how far the "hunger" under a standing pawn has grown.
  double stillProgress(int pawnId) {
    if (dream.modifier.kind != ModifierKind.stillness) return 0;
    final p = pawns[pawnId];
    if (p.hopping || p.exited) return 0;
    if (board.at(p.row, p.col).kind != TileKind.path) return 0;
    return ((nowMs - p.landedAtMs) / dream.modifier.stillMs).clamp(0.0, 1.0);
  }

  /// Fraction of the door window remaining (1 just after opening).
  double get doorRemaining => gate.open
      ? ((gate.openUntilMs - nowMs) / dream.gate.windowMs).clamp(0.0, 1.0)
      : 0.0;

  bool get allExited => pawns.every((p) => p.exited);

  /// Whether [id] could legally start a hop to ([row],[col]) right now.
  bool canHop(int id, int row, int col) {
    if (!playing) return false;
    final p = pawns[id];
    if (p.exited || p.hopping) return false;
    if (!board.inBounds(row, col)) return false;
    final dr = row - p.row;
    final dc = col - p.col;
    if ((dr == 0 && dc == 0) || dr.abs() > 1 || dc.abs() > 1) return false;
    if (tiles[row][col].voided) return false;
    if (board.at(row, col).kind == TileKind.door && !gate.open) return false;
    return true;
  }

  bool hop(int id, int row, int col) {
    if (!playing) return false;
    final p = pawns[id];
    if (p.exited || p.hopping) return false;
    if (!board.inBounds(row, col)) return false;
    final dr = row - p.row;
    final dc = col - p.col;
    if ((dr == 0 && dc == 0) || dr.abs() > 1 || dc.abs() > 1) return false;
    if (tiles[row][col].voided) return false;
    if (board.at(row, col).kind == TileKind.door && !gate.open) {
      _emit(SimEventKind.blocked, pawn: id, row: row, col: col);
      return false;
    }
    p.toRow = row;
    p.toCol = col;
    p.hopStartMs = nowMs;
    p.hopEndMs = nowMs + dream.hopMs;
    _emit(SimEventKind.hop, pawn: id, row: row, col: col);
    return true;
  }

  void tick(int dtMs) {
    var remaining = dtMs;
    while (remaining > 0 && playing) {
      final step = math.min(20, remaining);
      remaining -= step;
      nowMs += step;
      _advance(step);
    }
  }

  // ---------------------------------------------------------------- internals

  void _emit(
    SimEventKind kind, {
    int pawn = -1,
    int row = -1,
    int col = -1,
    MistakeCause? cause,
    VoidCause? voidCause,
  }) {
    _events.add(SimEvent(kind, nowMs,
        pawn: pawn, row: row, col: col, cause: cause, voidCause: voidCause));
  }

  void _advance(int step) {
    for (final p in pawns) {
      if (p.hopping && nowMs >= p.hopEndMs) _land(p);
      if (!playing) return;
    }
    _tickGate(step);
    _tickStillness();
    _tickTether(step);
    if (_failAtMs >= 0 && nowMs >= _failAtMs && playing) {
      _void(_failCause ?? VoidCause.gateClosed);
    }
  }

  void _land(PawnRt p) {
    p.row = p.toRow;
    p.col = p.toCol;
    p.toRow = -1;
    p.toCol = -1;
    p.landedAtMs = nowMs;
    p.nextStillAt = nowMs + dream.modifier.stillMs;
    final tile = board.at(p.row, p.col);
    final ts = tiles[p.row][p.col];
    final priorVisits = ts.visits;
    ts.visits++;
    _emit(SimEventKind.land, pawn: p.id, row: p.row, col: p.col);

    switch (tile.kind) {
      case TileKind.start:
        break;
      case TileKind.path:
        final cause = _violation(p.row, p.col, priorVisits);
        if (cause != null) _mistake(p, ts, cause);
      case TileKind.gold:
        _onGoldLand(tile.col == 0 ? 0 : 1);
      case TileKind.door:
        p.exited = true;
        _emit(SimEventKind.exited, pawn: p.id, row: p.row, col: p.col);
        if (allExited) {
          status = SimStatus.won;
          _emit(SimEventKind.won);
        }
    }
  }

  MistakeCause? _violation(int row, int col, int priorVisits) {
    if (!dream.isSafe(row, col)) return MistakeCause.rule;
    if (dream.modifier.kind == ModifierKind.once && priorVisits > 0) {
      return MistakeCause.once;
    }
    return null;
  }

  void _mistake(PawnRt p, TileRt ts, MistakeCause cause) {
    if (ts.lastStrikeAtMs == nowMs) {
      return;
    }
    ts.lastStrikeAtMs = nowMs;
    if (ts.strikes >= 1) {
      ts.voided = true;
      _emit(SimEventKind.collapse, pawn: p.id, row: p.row, col: p.col, cause: cause);
      _void(VoidCause.tileCollapse);
      return;
    }
    ts.strikes = 1;
    mistakes++;
    _emit(SimEventKind.wilt, pawn: p.id, row: p.row, col: p.col, cause: cause);
    if (mistakes > dream.tolerance) _void(VoidCause.tooManyMistakes);
  }

  void _void(VoidCause cause) {
    if (!playing) return;
    status = SimStatus.voided;
    voidCause = cause;
    _emit(SimEventKind.voided, voidCause: cause);
  }

  void _openDoor() {
    gate.open = true;
    gate.everOpened = true;
    gate.openUntilMs = nowMs + dream.gate.windowMs;
    _emit(SimEventKind.doorOpen);
  }

  void _onGoldLand(int i) {
    if (gate.spent[i] || gate.dead) return;
    _emit(SimEventKind.goldLit, col: i == 0 ? 0 : 2);
    switch (gate.mode) {
      case GateMode.doorbell:
        if (!gate.everOpened) _openDoor();
      case GateMode.unison:
        gate.pressedAt[i] = nowMs;
        final other = 1 - i;
        if (!gate.everOpened &&
            !gate.spent[other] &&
            gate.pressedAt[other] >= 0 &&
            nowMs - gate.pressedAt[other] <= dream.gate.unisonGapMs) {
          _openDoor();
        }
      case GateMode.patience:
        break;
    }
  }

  void _checkGateDead() {
    if (gate.everOpened || gate.dead) return;
    final dead = switch (gate.mode) {
      GateMode.doorbell => false,
      GateMode.unison => gate.spent[0] || gate.spent[1],
      GateMode.patience => gate.spent[0] && gate.spent[1],
    };
    if (dead) {
      gate.dead = true;
      _failAtMs = nowMs + 1300;
      _failCause = VoidCause.gateUnwinnable;
    }
  }

  void _tickGate(int step) {
    if (gate.open && nowMs >= gate.openUntilMs) {
      gate.open = false;
      gate.spent[0] = true;
      gate.spent[1] = true;
      _emit(SimEventKind.doorClose);
      if (!allExited) {
        _failAtMs = nowMs + 900;
        _failCause = VoidCause.gateClosed;
      }
    }
    if (gate.everOpened) return;

    if (gate.mode == GateMode.unison) {
      for (var i = 0; i < 2; i++) {
        if (gate.pressedAt[i] >= 0 &&
            !gate.spent[i] &&
            nowMs - gate.pressedAt[i] > dream.gate.unisonGapMs) {
          gate.spent[i] = true;
          _emit(SimEventKind.goldSpent, col: i == 0 ? 0 : 2);
          _checkGateDead();
        }
      }
    } else if (gate.mode == GateMode.patience) {
      for (var i = 0; i < 2; i++) {
        if (gate.spent[i]) continue;
        final goldCol = i == 0 ? 0 : 2;
        final standing = pawns.any((p) =>
            !p.hopping &&
            !p.exited &&
            p.row == board.gateRow &&
            p.col == goldCol);
        if (standing) {
          gate.hold[i] += step / dream.gate.holdMs;
          gate.reserve[i] -= step;
        } else {
          gate.hold[i] = math.max(0, gate.hold[i] - step / (dream.gate.holdMs * 2));
        }
        if (gate.hold[i] >= 1.0) {
          gate.hold[i] = 1.0;
          _openDoor();
          return;
        }
        if (gate.reserve[i] <= 0) {
          gate.spent[i] = true;
          _emit(SimEventKind.goldSpent, col: goldCol);
          _checkGateDead();
        }
      }
    }
  }

  void _tickStillness() {
    if (dream.modifier.kind != ModifierKind.stillness) return;
    final checkedTiles = <int>{};
    for (final p in pawns) {
      if (p.hopping || p.exited) continue;
      if (board.at(p.row, p.col).kind != TileKind.path) continue;
      final tileKey = p.row * Board.cols + p.col;
      if (checkedTiles.contains(tileKey)) continue;
      checkedTiles.add(tileKey);

      if (nowMs >= p.nextStillAt) {
        p.nextStillAt += dream.modifier.stillMs;
        for (final other in pawns) {
          if (other.row == p.row && other.col == p.col) {
            other.nextStillAt = p.nextStillAt;
          }
        }
        _mistake(p, tiles[p.row][p.col], MistakeCause.stillness);
        if (!playing) return;
      }
    }
  }

  void _tickTether(int step) {
    if (dream.modifier.kind != ModifierKind.tether) return;
    if (pawns.any((p) => p.exited)) {
      _tetherStrainMs = 0;
      return;
    }
    final gap = (pawns[0].row - pawns[1].row).abs();
    if (gap > dream.modifier.tetherRows) {
      _tetherStrainMs += step;
    } else {
      _tetherStrainMs = math.max(0, _tetherStrainMs - step * 2);
    }
    if (_tetherStrainMs >= dream.modifier.tetherGraceMs) {
      _tetherStrainMs = 0;
      mistakes++;
      _emit(SimEventKind.tetherSnap, cause: MistakeCause.tether);
      if (mistakes > dream.tolerance) _void(VoidCause.tooManyMistakes);
    }
  }
}
