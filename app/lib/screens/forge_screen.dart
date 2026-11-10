import 'package:dream_engine/dream_engine.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../game/game_screen.dart';
import '../services/save_service.dart';
import '../theme/dream_theme.dart';

class ForgeScreen extends StatefulWidget {
  const ForgeScreen({super.key});

  @override
  State<ForgeScreen> createState() => _ForgeScreenState();
}

class _ForgeScreenState extends State<ForgeScreen> {
  final TextEditingController _controller = TextEditingController(text: "mom's garden");
  Dream? _forgedDream;
  bool _isAnchored = false;

  @override
  void initState() {
    super.initState();
    _forge();
  }

  void _forge() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;

    final seed = SeedCode.decode(text);
    final dream = DreamBuilder.build(seed);

    setState(() {
      _forgedDream = dream;
      _isAnchored = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final dream = _forgedDream;

    return Scaffold(
      backgroundColor: DreamColors.nightIndigo,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Dream Forge', style: TextStyle(color: DreamColors.bone, fontWeight: FontWeight.bold)),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, color: DreamColors.bone),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Whisper any word, memory, or seed code to weave a new dream:',
              style: TextStyle(fontSize: 14, color: DreamColors.textMuted),
            ),
            const SizedBox(height: 12),

            // Input field
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _controller,
                    style: const TextStyle(color: DreamColors.bone, fontSize: 16),
                    decoration: InputDecoration(
                      hintText: "e.g. mom's garden, twilight sea...",
                      hintStyle: const TextStyle(color: DreamColors.textMuted),
                      filled: true,
                      fillColor: DreamColors.surfaceElevated,
                      border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(16),
                        borderSide: BorderSide.none,
                      ),
                      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    ),
                    onSubmitted: (_) => _forge(),
                  ),
                ),
                const SizedBox(width: 10),
                ElevatedButton(
                  onPressed: _forge,
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  ),
                  child: const Text('Forge'),
                ),
              ],
            ),
            const SizedBox(height: 24),

            if (dream != null) ...[
              // The Dream Card
              Container(
                padding: const EdgeInsets.all(22),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(dream.biome.skyTop).withAlpha(220),
                      Color(dream.biome.skyBottom).withAlpha(240),
                    ],
                  ),
                  borderRadius: BorderRadius.circular(24),
                  border: Border.all(color: DreamColors.goldBright.withAlpha(90), width: 1.5),
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
                        Text(
                          'DREAM SHARD',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            letterSpacing: 1.5,
                            color: DreamColors.bone.withAlpha(160),
                          ),
                        ),
                        Row(
                          children: [
                            for (var i = 0; i < 3; i++)
                              Icon(
                                i < dream.rarity ? Icons.star_rounded : Icons.star_outline_rounded,
                                size: 18,
                                color: DreamColors.goldBright,
                              ),
                          ],
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      dream.name,
                      style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: DreamColors.bone),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Biome: ${dream.biome.name}',
                      style: const TextStyle(fontSize: 14, color: DreamColors.dreamMint),
                    ),
                    if (dream.quirk.id != 'none') ...[
                      const SizedBox(height: 6),
                      Text(
                        '✨ Quirk: ${dream.quirk.name} — ${dream.quirk.blurb}',
                        style: const TextStyle(fontSize: 12, color: DreamColors.goldGlow, fontStyle: FontStyle.italic),
                      ),
                    ],
                    const SizedBox(height: 16),

                    // Seed Code Pill
                    GestureDetector(
                      onTap: () {
                        Clipboard.setData(ClipboardData(text: dream.code));
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Dream code ${dream.code} copied!')),
                        );
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          color: Colors.black38,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: Colors.white24),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.share_rounded, size: 14, color: DreamColors.goldBright),
                            const SizedBox(width: 6),
                            Text(
                              dream.code,
                              style: const TextStyle(fontSize: 13, fontFamily: 'monospace', color: DreamColors.bone),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),

                    // Actions
                    Row(
                      children: [
                        Expanded(
                          child: ElevatedButton.icon(
                            icon: const Icon(Icons.play_arrow_rounded, color: DreamColors.nightIndigo),
                            label: const Text('Enter Dream'),
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (_) => GameScreen(initialDream: dream),
                                ),
                              );
                            },
                          ),
                        ),
                        const SizedBox(width: 10),
                        OutlinedButton(
                          onPressed: _isAnchored
                              ? null
                              : () async {
                                  final messenger = ScaffoldMessenger.of(context);
                                  await SaveService.instance.anchorDream(dream.code, dream.name, dream.rarity);
                                  if (!mounted) return;
                                  setState(() => _isAnchored = true);
                                  messenger.showSnackBar(
                                    const SnackBar(content: Text('Dream anchored to your Library! ⚓')),
                                  );
                                },
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(color: DreamColors.bone),
                            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          ),
                          child: Text(
                            _isAnchored ? 'Anchored' : 'Anchor',
                            style: const TextStyle(color: DreamColors.bone, fontWeight: FontWeight.bold),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 28),
            // Anchored Library List
            const Text(
              'Your Anchored Dreams',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: DreamColors.bone),
            ),
            const SizedBox(height: 10),
            _buildAnchoredList(),
          ],
        ),
      ),
    );
  }

  Widget _buildAnchoredList() {
    final list = SaveService.instance.getAnchoredDreams();
    if (list.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: DreamColors.surfaceElevated.withAlpha(90),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Center(
          child: Text(
            'No anchored dreams yet.\nForge and anchor your favorites!',
            textAlign: TextAlign.center,
            style: TextStyle(color: DreamColors.textMuted, fontSize: 13),
          ),
        ),
      );
    }

    return Column(
      children: [
        for (final d in list)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              decoration: BoxDecoration(
                color: DreamColors.surfaceElevated,
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(d.name, style: const TextStyle(fontWeight: FontWeight.bold, color: DreamColors.bone)),
                        Text(d.code, style: const TextStyle(fontSize: 12, color: DreamColors.goldGlow, fontFamily: 'monospace')),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.play_circle_fill_rounded, color: DreamColors.goldBright, size: 28),
                    onPressed: () {
                      final built = DreamBuilder.build(SeedCode.decode(d.code));
                      Navigator.push(
                        context,
                        MaterialPageRoute(builder: (_) => GameScreen(initialDream: built)),
                      );
                    },
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}
