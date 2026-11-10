/// Deterministic random number generation.
///
/// `dart:math`'s `Random(seed)` is not guaranteed to produce the same stream
/// across Dart versions, which would break shared dream codes and the Daily
/// Dream. This is a self-contained Mulberry32 generator that relies only on
/// 32-bit integer arithmetic, so every device produces identical dreams.
///
/// NOTE: intended for the Dart VM (64-bit ints), i.e. Android / desktop.
library;

const int _m32 = 0xFFFFFFFF;

int _imul(int a, int b) => (a * b) & _m32;

int _fold(int x) {
  var z = (x ^ (x >>> 32)) & _m32;
  z = _imul(z ^ (z >>> 16), 0x85ebca6b);
  z = _imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) & _m32;
}

int _hashLabel(int state, String label) {
  var h = 0x811c9dc5 ^ state;
  for (final unit in label.codeUnits) {
    h = _imul(h ^ unit, 0x01000193);
  }
  return _fold(h);
}

class Rng {
  Rng(int seed) : _state = _fold(seed);

  int _state;

  /// Next unsigned 32-bit integer.
  int nextU32() {
    _state = (_state + 0x6D2B79F5) & _m32;
    var t = _state;
    t = _imul(t ^ (t >>> 15), t | 1);
    t ^= (t + _imul(t ^ (t >>> 7), t | 61)) & _m32;
    return (t ^ (t >>> 14)) & _m32;
  }

  /// Uniform integer in `[0, max)`.
  int nextInt(int max) {
    assert(max > 0);
    return (nextU32() * max) >>> 32;
  }

  /// Uniform integer in `[lo, hi]` (inclusive).
  int range(int lo, int hi) => lo + nextInt(hi - lo + 1);

  double nextDouble() => nextU32() / 4294967296.0;

  bool chance(double p) => nextDouble() < p;

  T pick<T>(List<T> items) => items[nextInt(items.length)];

  /// Weighted pick; weights need not sum to one.
  T pickWeighted<T>(List<T> items, List<double> weights) {
    assert(items.length == weights.length && items.isNotEmpty);
    var total = 0.0;
    for (final w in weights) {
      total += w;
    }
    var roll = nextDouble() * total;
    for (var i = 0; i < items.length; i++) {
      roll -= weights[i];
      if (roll < 0) return items[i];
    }
    return items.last;
  }

  List<T> shuffled<T>(Iterable<T> items) {
    final list = items.toList();
    for (var i = list.length - 1; i > 0; i--) {
      final j = nextInt(i + 1);
      final tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }
    return list;
  }

  /// Derives an independent stream keyed by [label] without consuming this
  /// generator, so adding a new consumer never shifts existing content.
  Rng fork(String label) => Rng(_hashLabel(_state, label));
}

/// Human-friendly seed codes, e.g. `7KQ2-M9XD` (40 bits, Crockford base32).
class SeedCode {
  SeedCode._();

  static const String _alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  static const int maxSeed = (1 << 40) - 1;

  static String encode(int seed) {
    var v = seed & maxSeed;
    final chars = List<String>.filled(8, '0');
    for (var i = 7; i >= 0; i--) {
      chars[i] = _alphabet[v & 31];
      v >>>= 5;
    }
    final s = chars.join();
    return '${s.substring(0, 4)}-${s.substring(4)}';
  }

  /// Parses a code (forgiving: case, dashes, spaces, O→0, I/L→1).
  /// Any other text is hashed into a seed, so players can forge a dream from
  /// a word such as "mom's garden".
  static int decode(String input) {
    final cleaned = input.toUpperCase().replaceAll(RegExp(r'[\s-]'), '');
    final normalized = cleaned
        .replaceAll('O', '0')
        .replaceAll('I', '1')
        .replaceAll('L', '1');
    if (normalized.length == 8 &&
        normalized.split('').every(_alphabet.contains)) {
      var v = 0;
      for (final ch in normalized.split('')) {
        v = (v << 5) | _alphabet.indexOf(ch);
      }
      return v;
    }
    return fromWords(input);
  }

  /// Hashes arbitrary text to a 40-bit seed.
  static int fromWords(String text) {
    final hi = _hashLabel(0x1234abcd, text.trim().toLowerCase());
    final lo = _hashLabel(0x9e3779b9, text.trim().toLowerCase());
    return (((hi & 0xFF) << 32) | lo) & maxSeed;
  }
}
