import 'package:dream_engine/dream_engine.dart';
import 'package:flutter/material.dart';
import '../game/game_screen.dart';
import '../services/save_service.dart';
import '../theme/dream_theme.dart';

class StoryScreen extends StatefulWidget {
  const StoryScreen({super.key});

  @override
  State<StoryScreen> createState() => _StoryScreenState();
}

class _StoryScreenState extends State<StoryScreen> {
  int _selectedChapter = 0;

  @override
  Widget build(BuildContext context) {
    final completed = SaveService.instance.getCompletedShards();
    final chapter = kStory[_selectedChapter];

    return Scaffold(
      backgroundColor: DreamColors.nightIndigo,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('The Lullaby (Story)', style: TextStyle(color: DreamColors.bone, fontWeight: FontWeight.bold)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: DreamColors.bone),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Chapter Tabs
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Row(
              children: [
                for (var i = 0; i < kStory.length; i++)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: ChoiceChip(
                      label: Text('Ch. ${kStory[i].number}: ${kStory[i].title}'),
                      selected: _selectedChapter == i,
                      onSelected: (val) {
                        if (val) setState(() => _selectedChapter = i);
                      },
                      selectedColor: DreamColors.goldBright,
                      backgroundColor: DreamColors.surfaceElevated,
                      labelStyle: TextStyle(
                        color: _selectedChapter == i ? DreamColors.nightIndigo : DreamColors.bone,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Whisperer Intro Card
          Padding(
            padding: const EdgeInsets.all(16),
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: DreamColors.surfaceCard,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: DreamColors.softLilac.withAlpha(40)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Icon(Icons.person_pin_circle_rounded, color: DreamColors.goldBright, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        chapter.whisperer,
                        style: const TextStyle(fontWeight: FontWeight.bold, color: DreamColors.goldBright, fontSize: 15),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Text(
                    chapter.intro,
                    style: const TextStyle(fontStyle: FontStyle.italic, color: DreamColors.bone, fontSize: 13, height: 1.4),
                  ),
                ],
              ),
            ),
          ),

          // Shards Grid
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Text(
              'Shards (${chapter.shards.length})',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: DreamColors.bone),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              itemCount: chapter.shards.length,
              itemBuilder: (context, index) {
                final shard = chapter.shards[index];
                final rec = completed[shard.id];
                final isUnlocked = index == 0 || completed[chapter.shards[index - 1].id] != null;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Material(
                    color: Colors.transparent,
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: isUnlocked
                          ? () async {
                              await Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => GameScreen(
                                    initialDream: shard.build(),
                                    shardId: shard.id,
                                  ),
                                ),
                              );
                              setState(() {});
                            }
                          : null,
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                        decoration: BoxDecoration(
                          color: isUnlocked ? DreamColors.surfaceElevated : DreamColors.surfaceElevated.withAlpha(90),
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(
                            color: shard.boss ? DreamColors.goldBright.withAlpha(160) : Colors.transparent,
                            width: shard.boss ? 1.5 : 1.0,
                          ),
                        ),
                        child: Row(
                          children: [
                            Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: isUnlocked ? DreamColors.goldBright.withAlpha(40) : Colors.black26,
                                shape: BoxShape.circle,
                              ),
                              child: Center(
                                child: Text(
                                  '${shard.index}',
                                  style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color: isUnlocked ? DreamColors.goldBright : DreamColors.textMuted,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    children: [
                                      Text(
                                        shard.title,
                                        style: TextStyle(
                                          fontWeight: FontWeight.bold,
                                          fontSize: 15,
                                          color: isUnlocked ? DreamColors.bone : DreamColors.textMuted,
                                        ),
                                      ),
                                      if (shard.boss) ...[
                                        const SizedBox(width: 6),
                                        const Icon(Icons.shield_moon_rounded, size: 16, color: DreamColors.goldBright),
                                      ],
                                    ],
                                  ),
                                  Text(
                                    shard.boss ? 'Boss Shard · ${shard.spec.tier.name.toUpperCase()}' : shard.spec.tier.name,
                                    style: const TextStyle(fontSize: 12, color: DreamColors.textMuted),
                                  ),
                                ],
                              ),
                            ),
                            if (rec != null)
                              Row(
                                children: [
                                  for (var s = 0; s < 3; s++)
                                    Icon(
                                      s < rec.stars ? Icons.star_rounded : Icons.star_outline_rounded,
                                      size: 20,
                                      color: DreamColors.goldBright,
                                    ),
                                ],
                              )
                            else if (!isUnlocked)
                              const Icon(Icons.lock_rounded, size: 18, color: DreamColors.textMuted)
                            else
                              const Icon(Icons.play_arrow_rounded, color: DreamColors.goldBright),
                          ],
                        ),
                      ),
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
