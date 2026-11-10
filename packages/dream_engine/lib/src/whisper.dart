/// The Whisper: the Whisperer's cryptic (always true, never complete) warning.
///
/// Principle: *rules are compiled, poems are written.* Every template carries
/// the readings a player may plausibly take from it, so the verifier can model
/// a player who follows the wrong reading.
library;

import 'model.dart';
import 'rng.dart';
import 'packs_en.dart';
import 'packs_hi.dart';

/// How a player may act at the Gold Gate.
enum GateAction { tap, together, stand }

extension GateModeX on GateMode {
  /// The one action that works for this mode.
  GateAction get action => switch (this) {
        GateMode.doorbell => GateAction.tap,
        GateMode.unison => GateAction.together,
        GateMode.patience => GateAction.stand,
      };

  Subject get subject => Subject.gold;
}

enum WhisperRole { path, modifier, flip, gate }

class WhisperLine {
  const WhisperLine(this.id, this.role);
  final String id;
  final WhisperRole role;
}

class Whisper {
  const Whisper({
    required this.lines,
    required this.pathPrior,
    required this.gatePrior,
    required this.hintIds,
  });

  /// Lines in the order the Whisperer speaks them.
  final List<WhisperLine> lines;

  /// What a typical player believes after hearing the whisper.
  final Map<ClassifierKind, double> pathPrior;
  final Map<GateAction, double> gatePrior;

  /// Template ids for the "Second Whisper" hint, in speaking order.
  final List<String> hintIds;
}

class _PathT {
  const _PathT(this.id, this.truth, this.prior);
  final String id;
  final ClassifierKind truth;
  final Map<ClassifierKind, double> prior;
}

class _GateT {
  const _GateT(this.id, this.truth, this.prior);
  final String id;
  final GateMode truth;
  final Map<GateAction, double> prior;
}

typedef _C = ClassifierKind;
typedef _A = GateAction;

const List<_PathT> _pathTemplates = [
  _PathT('q1', _C.quiet, {_C.quiet: .38, _C.loud: .22, _C.flowUp: .12, _C.hue: .10, _C.odd: .10, _C.even: .04}),
  _PathT('q2', _C.quiet, {_C.quiet: .42, _C.odd: .24, _C.loud: .14, _C.hue: .08, _C.flowUp: .06}),
  _PathT('q3', _C.quiet, {_C.quiet: .40, _C.hue: .18, _C.loud: .16, _C.even: .12, _C.flowUp: .08}),
  _PathT('l1', _C.loud, {_C.loud: .42, _C.quiet: .28, _C.flowUp: .10, _C.odd: .08, _C.hue: .08}),
  _PathT('l2', _C.loud, {_C.loud: .45, _C.quiet: .20, _C.even: .12, _C.flowDown: .10, _C.odd: .08}),
  _PathT('l3', _C.loud, {_C.loud: .50, _C.quiet: .22, _C.even: .10, _C.hue: .10}),
  _PathT('o1', _C.odd, {_C.odd: .38, _C.quiet: .28, _C.even: .20, _C.loud: .08, _C.hue: .04}),
  _PathT('o2', _C.odd, {_C.odd: .42, _C.even: .22, _C.quiet: .16, _C.loud: .12, _C.flowUp: .04}),
  _PathT('o3', _C.odd, {_C.odd: .36, _C.flowUp: .16, _C.even: .18, _C.quiet: .14, _C.hue: .10}),
  _PathT('e1', _C.even, {_C.even: .36, _C.odd: .24, _C.quiet: .18, _C.loud: .12, _C.flowDown: .06}),
  _PathT('e2', _C.even, {_C.even: .42, _C.odd: .24, _C.quiet: .12, _C.hue: .12, _C.loud: .06}),
  _PathT('e3', _C.even, {_C.even: .46, _C.odd: .24, _C.quiet: .14, _C.loud: .10}),
  _PathT('h1', _C.hue, {_C.hue: .48, _C.quiet: .14, _C.flowUp: .14, _C.loud: .10, _C.odd: .08}),
  _PathT('h2', _C.hue, {_C.hue: .40, _C.quiet: .20, _C.odd: .16, _C.loud: .14, _C.even: .04}),
  _PathT('h3', _C.hue, {_C.hue: .36, _C.flowUp: .26, _C.quiet: .18, _C.odd: .12}),
  _PathT('f1', _C.flowUp, {_C.flowUp: .42, _C.quiet: .18, _C.hue: .14, _C.flowDown: .20, _C.loud: .04}),
  _PathT('f2', _C.flowUp, {_C.flowUp: .34, _C.flowDown: .26, _C.quiet: .16, _C.hue: .14, _C.odd: .06}),
  _PathT('f3', _C.flowUp, {_C.flowUp: .48, _C.hue: .16, _C.quiet: .14, _C.flowDown: .12}),
  _PathT('d1', _C.flowDown, {_C.flowDown: .40, _C.flowUp: .30, _C.quiet: .14, _C.loud: .10}),
  _PathT('d2', _C.flowDown, {_C.flowDown: .42, _C.flowUp: .28, _C.loud: .14, _C.hue: .08}),
  _PathT('d3', _C.flowDown, {_C.flowDown: .46, _C.flowUp: .20, _C.loud: .12, _C.even: .12}),
];

const List<_GateT> _gateTemplates = [
  _GateT('bell1', GateMode.doorbell, {_A.tap: .46, _A.together: .30, _A.stand: .14}),
  _GateT('bell2', GateMode.doorbell, {_A.tap: .44, _A.together: .30, _A.stand: .20}),
  _GateT('bell3', GateMode.doorbell, {_A.tap: .40, _A.together: .30, _A.stand: .26}),
  _GateT('uni1', GateMode.unison, {_A.together: .55, _A.tap: .25, _A.stand: .12}),
  _GateT('uni2', GateMode.unison, {_A.together: .48, _A.tap: .30, _A.stand: .14}),
  _GateT('uni3', GateMode.unison, {_A.together: .52, _A.tap: .26, _A.stand: .14}),
  _GateT('pat1', GateMode.patience, {_A.stand: .45, _A.tap: .28, _A.together: .20}),
  _GateT('pat2', GateMode.patience, {_A.stand: .46, _A.together: .24, _A.tap: .22}),
  _GateT('pat3', GateMode.patience, {_A.stand: .42, _A.tap: .28, _A.together: .22}),
];

Map<K, double> _normalized<K>(Map<K, double> raw, Iterable<K> universe) {
  final out = <K, double>{for (final k in universe) k: raw[k] ?? 0.02};
  final total = out.values.fold<double>(0, (a, b) => a + b);
  return {for (final e in out.entries) e.key: e.value / total};
}

/// Builds whispers and resolves their text in any supported language.
class WhisperCompiler {
  WhisperCompiler._();

  static Whisper compose(
    Rng rng, {
    required ClassifierKind classifier,
    required ModifierKind modifier,
    required bool flip,
    required GateMode gate,
  }) {
    final pathT = rng.pick(
        _pathTemplates.where((t) => t.truth == classifier).toList());
    final gateT =
        rng.pick(_gateTemplates.where((t) => t.truth == gate).toList());

    final lines = <WhisperLine>[WhisperLine('path.${pathT.id}', WhisperRole.path)];
    final hints = <String>['hint.${classifier.name}'];

    if (modifier != ModifierKind.none) {
      final prefix = switch (modifier) {
        ModifierKind.stillness => 'still',
        ModifierKind.once => 'once',
        _ => 'tether',
      };
      lines.add(WhisperLine('mod.$prefix${rng.range(1, 3)}', WhisperRole.modifier));
      hints.add('hint.${modifier.name}');
    }
    if (flip) {
      lines.add(WhisperLine('flip.${rng.range(1, 3)}', WhisperRole.flip));
      hints.add('hint.flip');
    }
    lines.add(WhisperLine('gate.${gateT.id}', WhisperRole.gate));
    hints.add('hint.${gate.name}');

    return Whisper(
      lines: lines,
      pathPrior: _normalized(pathT.prior, ClassifierKind.values),
      gatePrior: _normalized(gateT.prior, GateAction.values),
      hintIds: hints,
    );
  }

  /// Languages shipped in this build: code → native display name.
  static const Map<String, String> languages = {
    'en': 'English',
    'hi': 'हिन्दी',
  };

  /// Text for a template id; falls back to English when a translation is
  /// missing, so a partially translated pack never shows a blank.
  static String text(String id, [String lang = 'en']) {
    final pack = _packs[lang];
    return pack?[id] ?? kPackEn[id] ?? id;
  }

  static bool hasTranslation(String id, String lang) =>
      _packs[lang]?.containsKey(id) ?? false;

  static const Map<String, Map<String, String>> _packs = {
    'en': kPackEn,
    'hi': kPackHi,
  };

  /// All ids that every complete pack must provide (used by tests).
  static List<String> get requiredIds => kPackEn.keys.toList();
}
