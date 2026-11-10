/// Turns a seed (plus an optional [DreamSpec]) into a verified [Dream].
library;

import 'biomes.dart';
import 'dream.dart';
import 'model.dart';
import 'rng.dart';
import 'verify.dart';
import 'whisper.dart';

class DreamBuilder {
  DreamBuilder._();

  /// How many fresh layouts to try before settling for the best candidate.
  static const int maxTries = 12;

  /// Deterministic: the same seed and spec yield the same dream on every
  /// device. The *rule* is fixed by the seed; only the layout may be re-drawn
  /// while searching for a candidate that passes verification.
  static Dream build(int seed, [DreamSpec spec = const DreamSpec()]) {
    final specRng = Rng(seed).fork('spec');
    final r = _resolve(specRng, spec);

    final styleRng = Rng(seed).fork('style');
    final biome = kBiomes[spec.biome ?? styleRng.nextInt(kBiomes.length)];
    final quirk = spec.quirk != null
        ? quirkById(spec.quirk!)
        : _pickQuirk(styleRng.fork('quirk'));
    final lantern = styleRng.nextInt(24);
    final name = spec.name ?? generateDreamName(styleRng.fork('name'), biome);

    final whisper = WhisperCompiler.compose(
      Rng(seed).fork('whisper'),
      classifier: r.classifier,
      modifier: r.modifier,
      flip: r.flipRow >= 0,
      gate: r.gate,
    );

    final modSpec = _modifierSpec(r.modifier, r.tier);
    final gateSpec = _gateSpec(r.gate, r.tier);
    final hopMs = (320 + quirk.hopDeltaMs).clamp(220, 520);
    final rarity = _rarity(r, quirk);

    Dream? best;
    var bestPenalty = double.infinity;
    for (var i = 0; i < maxTries; i++) {
      final layout = LayoutGenerator.generateValid(
        rng: Rng(seed).fork('layout$i'),
        pathRows: r.rows,
        classifier: r.classifier,
        flipRow: r.flipRow,
        modifier: r.modifier,
        lanternHue: lantern,
        tier: r.tier,
        tries: 12,
      );
      final dream = Dream(
        seed: seed,
        layoutIndex: 0,
        name: name,
        biome: biome,
        quirk: quirk,
        classifier: r.classifier,
        modifier: modSpec,
        flipRow: r.flipRow,
        gate: gateSpec,
        tolerance: r.tolerance,
        hopMs: hopMs,
        lanternHue: lantern,
        board: layout.board,
        safeCols: layout.safe,
        whisper: whisper,
        tier: r.tier,
        rarity: rarity,
      );
      final report = Verifier.verify(dream);
      if (report.passes) return dream.withReport(report);
      if (report.penalty < bestPenalty) {
        bestPenalty = report.penalty;
        best = dream.withReport(report);
      }
    }
    return best!;
  }

  static Quirk _pickQuirk(Rng rng) {
    if (rng.chance(0.55)) return kNoQuirk;
    // Rarer quirks are less likely.
    final weights = [for (final q in kQuirks) 4.0 - q.rarity];
    return rng.pickWeighted(kQuirks, weights);
  }

  static ModifierSpec _modifierSpec(ModifierKind kind, Tier tier) {
    return ModifierSpec(
      kind: kind,
      stillMs: switch (tier) {
        Tier.chill => 3800,
        Tier.standard => 3300,
        Tier.tricky => 2900,
        Tier.nightmare => 2600,
      },
      tetherRows: tier == Tier.chill ? 2 : 1,
      tetherGraceMs: switch (tier) {
        Tier.chill => 2200,
        Tier.standard => 1900,
        Tier.tricky => 1600,
        Tier.nightmare => 1400,
      },
    );
  }

  static GateSpec _gateSpec(GateMode mode, Tier tier) {
    final i = tier.index;
    return switch (mode) {
      GateMode.doorbell =>
        GateSpec(mode: mode, windowMs: const [3000, 2600, 2300, 2000][i]),
      GateMode.unison => GateSpec(
          mode: mode,
          windowMs: const [4200, 3800, 3400, 3000][i],
          unisonGapMs: const [1600, 1400, 1200, 1000][i]),
      GateMode.patience => GateSpec(
          mode: mode,
          windowMs: const [4400, 4000, 3600, 3200][i],
          holdMs: const [1800, 2000, 2200, 2400][i],
          reserveMs: const [4000, 4200, 4600, 5000][i]),
    };
  }

  static int _rarity(_Resolved r, Quirk quirk) {
    var score = 0;
    score += switch (r.classifier) {
      ClassifierKind.quiet || ClassifierKind.loud => 0,
      _ => 1,
    };
    score += switch (r.modifier) {
      ModifierKind.none => 0,
      ModifierKind.stillness => 1,
      _ => 2,
    };
    if (r.flipRow >= 0) score += 2;
    if (r.gate != GateMode.doorbell) score += 1;
    score += quirk.rarity;
    score += r.tier.index ~/ 2;
    if (score <= 2) return 1;
    if (score <= 5) return 2;
    return 3;
  }

  static _Resolved _resolve(Rng rng, DreamSpec spec) {
    final tier = spec.tier;
    final classifier = spec.classifier ?? _pickClassifier(rng, tier);
    final modifier = spec.modifier ?? _pickModifier(rng, tier);
    final gate = spec.gate ?? _pickGate(rng, tier);
    final rows = spec.pathRows ??
        switch (tier) {
          Tier.chill => rng.range(9, 10),
          Tier.standard => rng.range(10, 12),
          Tier.tricky => rng.range(12, 14),
          Tier.nightmare => rng.range(13, 16),
        };
    final flipChance = switch (tier) {
      Tier.chill => 0.0,
      Tier.standard => 0.08,
      Tier.tricky => 0.30,
      Tier.nightmare => 0.50,
    };
    final wantFlip = spec.flip ?? rng.chance(flipChance);
    final flip = wantFlip && classifier.invertible;
    final flipRow = flip ? (rows ~/ 2) + rng.range(-1, 1) : -1;
    final tolerance = spec.tolerance ??
        switch (tier) {
          Tier.chill => 2,
          Tier.standard => 1,
          Tier.tricky => 1,
          Tier.nightmare => 0,
        };
    return _Resolved(classifier, modifier, gate, rows, flipRow, tolerance, tier);
  }

  static ClassifierKind _pickClassifier(Rng rng, Tier tier) {
    final pool = tier == Tier.chill
        ? const [
            ClassifierKind.quiet,
            ClassifierKind.loud,
            ClassifierKind.odd,
            ClassifierKind.even,
            ClassifierKind.flowUp,
          ]
        : ClassifierKind.values;
    return rng.pick(pool);
  }

  static ModifierKind _pickModifier(Rng rng, Tier tier) {
    final weights = switch (tier) {
      Tier.chill => [75.0, 25.0, 0.0, 0.0],
      Tier.standard => [40.0, 25.0, 20.0, 15.0],
      Tier.tricky => [20.0, 28.0, 28.0, 24.0],
      Tier.nightmare => [5.0, 30.0, 35.0, 30.0],
    };
    return rng.pickWeighted(ModifierKind.values, weights);
  }

  static GateMode _pickGate(Rng rng, Tier tier) {
    final weights = switch (tier) {
      Tier.chill => [60.0, 20.0, 20.0],
      _ => [34.0, 33.0, 33.0],
    };
    return rng.pickWeighted(GateMode.values, weights);
  }
}

class _Resolved {
  const _Resolved(this.classifier, this.modifier, this.gate, this.rows,
      this.flipRow, this.tolerance, this.tier);
  final ClassifierKind classifier;
  final ModifierKind modifier;
  final GateMode gate;
  final int rows;
  final int flipRow;
  final int tolerance;
  final Tier tier;
}
