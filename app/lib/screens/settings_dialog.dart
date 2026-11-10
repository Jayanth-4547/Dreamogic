import 'package:flutter/material.dart';
import '../services/audio_service.dart';
import '../services/save_service.dart';
import '../theme/dream_theme.dart';

class SettingsDialog extends StatefulWidget {
  const SettingsDialog({super.key});

  @override
  State<SettingsDialog> createState() => _SettingsDialogState();
}

class _SettingsDialogState extends State<SettingsDialog> {
  late String _lang;
  late bool _motherTongue;
  late bool _slow;
  late bool _sound;
  late bool _haptics;

  @override
  void initState() {
    super.initState();
    _lang = SaveService.instance.language;
    _motherTongue = SaveService.instance.motherTongueMode;
    _slow = SaveService.instance.slowMode;
    _sound = AudioService.instance.soundEnabled;
    _haptics = AudioService.instance.hapticsEnabled;
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: DreamColors.surfaceCard,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
      title: const Text('Settings', style: TextStyle(fontWeight: FontWeight.bold, color: DreamColors.bone)),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Language Selection
            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Language / भाषा', style: TextStyle(color: DreamColors.bone, fontSize: 14)),
              trailing: DropdownButton<String>(
                value: _lang,
                dropdownColor: DreamColors.surfaceElevated,
                style: const TextStyle(color: DreamColors.goldBright, fontWeight: FontWeight.bold),
                underline: const SizedBox(),
                items: const [
                  DropdownMenuItem(value: 'en', child: Text('English')),
                  DropdownMenuItem(value: 'hi', child: Text('हिन्दी')),
                ],
                onChanged: (val) {
                  if (val != null) {
                    setState(() => _lang = val);
                    SaveService.instance.setLanguage(val);
                  }
                },
              ),
            ),
            const Divider(color: Colors.white10),

            // Mother Tongue Mode
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Mother Tongue Mode', style: TextStyle(color: DreamColors.bone, fontSize: 14)),
              subtitle: const Text('Whispers weave phrases in your mother tongue', style: TextStyle(color: DreamColors.textMuted, fontSize: 11)),
              value: _motherTongue,
              activeTrackColor: DreamColors.goldBright,
              onChanged: (val) {
                setState(() => _motherTongue = val);
                SaveService.instance.setMotherTongueMode(val);
              },
            ),
            const Divider(color: Colors.white10),

            // Sound
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Sound Effects & Chimes', style: TextStyle(color: DreamColors.bone, fontSize: 14)),
              value: _sound,
              activeTrackColor: DreamColors.goldBright,
              onChanged: (val) {
                setState(() => _sound = val);
                AudioService.instance.toggleSound();
              },
            ),
            const Divider(color: Colors.white10),

            // Haptics
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Haptic Pulses', style: TextStyle(color: DreamColors.bone, fontSize: 14)),
              value: _haptics,
              activeTrackColor: DreamColors.goldBright,
              onChanged: (val) {
                setState(() => _haptics = val);
                AudioService.instance.toggleHaptics();
              },
            ),
            const Divider(color: Colors.white10),

            // Slow Dream Mode
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Slow Dream Mode', style: TextStyle(color: DreamColors.bone, fontSize: 14)),
              subtitle: const Text('Gentle pacing, extra pause time for elders & kids', style: TextStyle(color: DreamColors.textMuted, fontSize: 11)),
              value: _slow,
              activeTrackColor: DreamColors.dreamMint,
              onChanged: (val) {
                setState(() => _slow = val);
                SaveService.instance.setSlowMode(val);
              },
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Done', style: TextStyle(color: DreamColors.goldBright, fontWeight: FontWeight.bold)),
        ),
      ],
    );
  }
}
