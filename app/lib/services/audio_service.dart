import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';

/// Lightweight, offline audio manager for Dreamogic.
/// Plays synthesized sound effects and triggers subtle haptics.
class AudioService {
  AudioService._();

  static final AudioService instance = AudioService._();

  final AudioPlayer _player = AudioPlayer();
  bool soundEnabled = true;
  bool hapticsEnabled = true;

  int _stepNoteIndex = 0;

  Future<void> init() async {
    await _player.setReleaseMode(ReleaseMode.stop);
  }

  void toggleSound() {
    soundEnabled = !soundEnabled;
  }

  void toggleHaptics() {
    hapticsEnabled = !hapticsEnabled;
  }

  /// Step sound: cycles up and down the pentatonic scale.
  Future<void> playStep() async {
    if (hapticsEnabled) {
      HapticFeedback.selectionClick();
    }
    if (!soundEnabled) return;

    final note = _stepNoteIndex % 5;
    _stepNoteIndex++;
    try {
      await _player.play(AssetSource('audio/step_$note.wav'), volume: 0.55);
    } catch (_) {}
  }

  Future<void> playWilt() async {
    if (hapticsEnabled) {
      HapticFeedback.mediumImpact();
    }
    if (!soundEnabled) return;
    try {
      await _player.play(AssetSource('audio/wilt.wav'), volume: 0.65);
    } catch (_) {}
  }

  Future<void> playCollapse() async {
    if (hapticsEnabled) {
      HapticFeedback.heavyImpact();
    }
    if (!soundEnabled) return;
    try {
      await _player.play(AssetSource('audio/collapse.wav'), volume: 0.75);
    } catch (_) {}
  }

  Future<void> playBell() async {
    if (hapticsEnabled) {
      HapticFeedback.lightImpact();
    }
    if (!soundEnabled) return;
    try {
      await _player.play(AssetSource('audio/bell.wav'), volume: 0.70);
    } catch (_) {}
  }

  Future<void> playDoorOpen() async {
    if (hapticsEnabled) {
      HapticFeedback.mediumImpact();
    }
    if (!soundEnabled) return;
    try {
      await _player.play(AssetSource('audio/door.wav'), volume: 0.75);
    } catch (_) {}
  }

  Future<void> playWin() async {
    if (hapticsEnabled) {
      HapticFeedback.mediumImpact();
    }
    if (!soundEnabled) return;
    try {
      await _player.play(AssetSource('audio/win.wav'), volume: 0.85);
    } catch (_) {}
  }

  void dispose() {
    _player.dispose();
  }
}
