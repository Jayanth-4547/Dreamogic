import 'package:dream_engine/dream_engine.dart';
import 'package:flutter/material.dart';
import '../services/save_service.dart';
import '../theme/dream_theme.dart';

class JournalScreen extends StatelessWidget {
  const JournalScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final unlocked = SaveService.instance.getJournalTruths();
    final lang = SaveService.instance.language;

    final allTruthKeys = [
      'truth.quiet',
      'truth.loud',
      'truth.odd',
      'truth.even',
      'truth.hue',
      'truth.flowUp',
      'truth.flowDown',
      'truth.stillness',
      'truth.once',
      'truth.tether',
      'truth.flip',
      'truth.doorbell',
      'truth.unison',
      'truth.patience',
    ];

    return Scaffold(
      backgroundColor: DreamColors.nightIndigo,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Journal of Truths', style: TextStyle(color: DreamColors.bone, fontWeight: FontWeight.bold)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: DreamColors.bone),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            child: Text(
              'Uncovered ${unlocked.length} of ${allTruthKeys.length} dream truths.\n'
              'These insights persist forever across your dreams.',
              style: const TextStyle(fontSize: 14, color: DreamColors.textMuted, height: 1.4),
            ),
          ),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              itemCount: allTruthKeys.length,
              itemBuilder: (context, index) {
                final key = allTruthKeys[index];
                final isKnown = unlocked.contains(key);
                final text = WhisperCompiler.text(key, lang);

                return Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      color: isKnown ? DreamColors.surfaceCard : DreamColors.surfaceElevated.withAlpha(80),
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: isKnown ? DreamColors.goldBright.withAlpha(100) : Colors.white10,
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          isKnown ? Icons.auto_stories_rounded : Icons.lock_outline_rounded,
                          color: isKnown ? DreamColors.goldBright : DreamColors.textMuted,
                          size: 22,
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                isKnown ? text : 'A forgotten dream truth...',
                                style: TextStyle(
                                  fontSize: 15,
                                  fontStyle: isKnown ? FontStyle.normal : FontStyle.italic,
                                  fontWeight: isKnown ? FontWeight.bold : FontWeight.normal,
                                  color: isKnown ? DreamColors.bone : DreamColors.textMuted,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                isKnown ? 'Permanently recorded in memory' : 'Solve dreams to uncover this insight',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isKnown ? DreamColors.dreamMint : DreamColors.textMuted.withAlpha(140),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
