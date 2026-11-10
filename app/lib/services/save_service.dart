import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

class ShardRecord {
  ShardRecord({
    required this.shardId,
    required this.stars,
    required this.attempts,
    required this.clearedAtMs,
  });

  final String shardId;
  final int stars;
  final int attempts;
  final int clearedAtMs;

  Map<String, dynamic> toJson() => {
        'id': shardId,
        'stars': stars,
        'attempts': attempts,
        'time': clearedAtMs,
      };

  factory ShardRecord.fromJson(Map<String, dynamic> j) => ShardRecord(
        shardId: j['id'] as String,
        stars: j['stars'] as int,
        attempts: j['attempts'] as int,
        clearedAtMs: j['time'] as int,
      );
}

class AnchoredDream {
  AnchoredDream({
    required this.code,
    required this.name,
    required this.rarity,
    required this.createdAtMs,
  });

  final String code;
  final String name;
  final int rarity;
  final int createdAtMs;

  Map<String, dynamic> toJson() => {
        'code': code,
        'name': name,
        'rarity': rarity,
        'time': createdAtMs,
      };

  factory AnchoredDream.fromJson(Map<String, dynamic> j) => AnchoredDream(
        code: j['code'] as String,
        name: j['name'] as String,
        rarity: j['rarity'] as int,
        createdAtMs: j['time'] as int,
      );
}

class SaveService {
  SaveService._();

  static final SaveService instance = SaveService._();

  SharedPreferences? _prefs;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
  }

  // --- Moonlight Currency ---
  int get moonlight => _prefs?.getInt('moonlight') ?? 30;

  Future<void> addMoonlight(int delta) async {
    final cur = moonlight;
    await _prefs?.setInt('moonlight', cur + delta);
  }

  // --- Story Shards Progress ---
  Map<String, ShardRecord> getCompletedShards() {
    final raw = _prefs?.getString('completed_shards');
    if (raw == null) return {};
    final map = jsonDecode(raw) as Map<String, dynamic>;
    return map.map((k, v) => MapEntry(k, ShardRecord.fromJson(v as Map<String, dynamic>)));
  }

  Future<void> recordShardClear(String shardId, int stars, int attempts) async {
    final cur = getCompletedShards();
    final existing = cur[shardId];
    if (existing == null || stars > existing.stars) {
      cur[shardId] = ShardRecord(
        shardId: shardId,
        stars: stars,
        attempts: attempts,
        clearedAtMs: DateTime.now().millisecondsSinceEpoch,
      );
      final raw = jsonEncode(cur.map((k, v) => MapEntry(k, v.toJson())));
      await _prefs?.setString('completed_shards', raw);
    }
  }

  // --- Journal Truths ---
  Set<String> getJournalTruths() {
    final list = _prefs?.getStringList('journal_truths') ?? [];
    return list.toSet();
  }

  Future<void> recordTruth(String truthKey) async {
    final cur = getJournalTruths();
    if (cur.add(truthKey)) {
      await _prefs?.setStringList('journal_truths', cur.toList());
    }
  }

  // --- Daily Dream Streaks ---
  int get dailyStreak => _prefs?.getInt('daily_streak') ?? 0;
  int get lastDailyDay => _prefs?.getInt('last_daily_day') ?? -1;

  Future<void> recordDailySolve(int dayNumber) async {
    final last = lastDailyDay;
    var streak = dailyStreak;
    if (last == dayNumber - 1) {
      streak += 1;
    } else if (last != dayNumber) {
      streak = 1;
    }
    await _prefs?.setInt('daily_streak', streak);
    await _prefs?.setInt('last_daily_day', dayNumber);
  }

  // --- Forged Dreams Library ---
  List<AnchoredDream> getAnchoredDreams() {
    final raw = _prefs?.getString('anchored_dreams');
    if (raw == null) return [];
    final list = jsonDecode(raw) as List<dynamic>;
    return list.map((e) => AnchoredDream.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<void> anchorDream(String code, String name, int rarity) async {
    final cur = getAnchoredDreams();
    if (!cur.any((d) => d.code == code)) {
      cur.insert(
        0,
        AnchoredDream(
          code: code,
          name: name,
          rarity: rarity,
          createdAtMs: DateTime.now().millisecondsSinceEpoch,
        ),
      );
      final raw = jsonEncode(cur.map((d) => d.toJson()).toList());
      await _prefs?.setString('anchored_dreams', raw);
    }
  }

  // --- Settings ---
  String get language => _prefs?.getString('language') ?? 'en';
  Future<void> setLanguage(String lang) async =>
      await _prefs?.setString('language', lang);

  bool get motherTongueMode => _prefs?.getBool('mother_tongue_mode') ?? true;
  Future<void> setMotherTongueMode(bool enabled) async =>
      await _prefs?.setBool('mother_tongue_mode', enabled);

  bool get slowMode => _prefs?.getBool('slow_mode') ?? false;
  Future<void> setSlowMode(bool enabled) async =>
      await _prefs?.setBool('slow_mode', enabled);
}
