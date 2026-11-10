import 'package:dream_engine/dream_engine.dart';
import 'package:flutter/material.dart';
import '../game/game_screen.dart';
import '../services/save_service.dart';
import '../theme/dream_theme.dart';
import 'forge_screen.dart';
import 'journal_screen.dart';
import 'settings_dialog.dart';
import 'story_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final todayTier = DailyDream.tierFor(now);
    final streak = SaveService.instance.dailyStreak;
    final moonlight = SaveService.instance.moonlight;
    final completedCount = SaveService.instance.getCompletedShards().length;

    return Scaffold(
      backgroundColor: DreamColors.nightIndigo,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top Bar
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Text(
                            'DREAMOGIC',
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 2.0,
                              color: DreamColors.bone,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: DreamColors.goldBright.withAlpha(40),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Text(
                              'OFFLINE',
                              style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: DreamColors.goldBright),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      const Text(
                        'Dream logic, for two.',
                        style: TextStyle(
                          fontSize: 13,
                          fontStyle: FontStyle.italic,
                          color: DreamColors.textMuted,
                        ),
                      ),
                    ],
                  ),
                  Row(
                    children: [
                      // Moonlight Pill
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: DreamColors.surfaceElevated,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: DreamColors.goldBright.withAlpha(90)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.nightlight_round, size: 14, color: DreamColors.goldBright),
                            const SizedBox(width: 4),
                            Text(
                              '$moonlight',
                              style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: DreamColors.goldBright,
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      // Settings Icon
                      IconButton(
                        icon: const Icon(Icons.settings_outlined, color: DreamColors.bone),
                        onPressed: () async {
                          await showDialog(
                            context: context,
                            builder: (_) => const SettingsDialog(),
                          );
                          setState(() {});
                        },
                      ),
                    ],
                  ),
                ],
              ),
              const SizedBox(height: 24),

              // Hero: Daily Dream Card
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0xFF2E2259),
                      Color(0xFF1B163B),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: DreamColors.goldBright.withAlpha(80), width: 1.5),
                  boxShadow: const [
                    BoxShadow(color: Colors.black45, blurRadius: 16, offset: Offset(0, 6)),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: DreamColors.goldBright.withAlpha(35),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            children: [
                              const Icon(Icons.calendar_today_rounded, size: 12, color: DreamColors.goldBright),
                              const SizedBox(width: 6),
                              Text(
                                "DAILY DREAM · Day #${DailyDream.dayNumber(now)}",
                                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: DreamColors.goldBright),
                              ),
                            ],
                          ),
                        ),
                        if (streak > 0)
                          Row(
                            children: [
                              const Icon(Icons.local_fire_department_rounded, size: 16, color: Colors.amber),
                              const SizedBox(width: 4),
                              Text('$streak Day Streak', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.amber)),
                            ],
                          ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      'The Global Dream',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: DreamColors.bone),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Tier: ${todayTier.name.toUpperCase()} · Identical for all dreamers today',
                      style: const TextStyle(fontSize: 13, color: DreamColors.dreamMint),
                    ),
                    const SizedBox(height: 18),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.play_arrow_rounded, color: DreamColors.nightIndigo),
                      label: const Text("Enter Today's Dream"),
                      style: ElevatedButton.styleFrom(
                        minimumSize: const Size.fromHeight(48),
                      ),
                      onPressed: () async {
                        final dailyDream = DailyDream.build(now);
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => GameScreen(
                              initialDream: dailyDream,
                              dailyDate: now,
                            ),
                          ),
                        );
                        setState(() {});
                      },
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Game Modes Grid
              const Text(
                'Explore the Dream',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: DreamColors.bone),
              ),
              const SizedBox(height: 12),

              // Mode 1: The Lullaby (Story Mode)
              _buildModeCard(
                title: 'The Lullaby (Story)',
                subtitle: '$completedCount / 24 Shards Cleared · 3 Chapters',
                icon: Icons.auto_stories_rounded,
                accentColor: DreamColors.dreamMint,
                onTap: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const StoryScreen()),
                  );
                  setState(() {});
                },
              ),
              const SizedBox(height: 12),

              // Mode 2: Dream Forge
              _buildModeCard(
                title: 'Dream Forge',
                subtitle: 'Weave custom dreams from words & memories',
                icon: Icons.hardware_rounded,
                accentColor: DreamColors.goldBright,
                onTap: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const ForgeScreen()),
                  );
                  setState(() {});
                },
              ),
              const SizedBox(height: 12),

              // Mode 3: Journal of Truths
              _buildModeCard(
                title: 'Journal of Truths',
                subtitle: '${SaveService.instance.getJournalTruths().length} truths recorded',
                icon: Icons.menu_book_rounded,
                accentColor: DreamColors.softLilac,
                onTap: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const JournalScreen()),
                  );
                },
              ),
              const SizedBox(height: 24),

              // Quick Duo Tip Card
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: DreamColors.surfaceElevated.withAlpha(90),
                  borderRadius: BorderRadius.circular(16),
                ),
                child: const Row(
                  children: [
                    Icon(Icons.favorite_rounded, size: 20, color: DreamColors.coralWarning),
                    SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Play together: hand one side of the phone to your mom or friend and debate the warning!',
                        style: TextStyle(fontSize: 12, color: DreamColors.textMuted, height: 1.35),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildModeCard({
    required String title,
    required String subtitle,
    required IconData icon,
    required Color accentColor,
    required VoidCallback onTap,
  }) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
          decoration: BoxDecoration(
            color: DreamColors.surfaceElevated,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(color: Colors.white10),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: accentColor.withAlpha(35),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: accentColor, size: 24),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: DreamColors.bone)),
                    const SizedBox(height: 4),
                    Text(subtitle, style: const TextStyle(fontSize: 12, color: DreamColors.textMuted)),
                  ],
                ),
              ),
              const Icon(Icons.arrow_forward_ios_rounded, size: 14, color: DreamColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}
