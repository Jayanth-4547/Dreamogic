import 'dart:async';
import 'package:dream_engine/dream_engine.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import '../services/audio_service.dart';
import '../services/save_service.dart';
import '../theme/dream_theme.dart';
import 'game_canvas.dart';

class GameScreen extends StatefulWidget {
  const GameScreen({
    super.key,
    required this.initialDream,
    this.shardId,
    this.dailyDate,
  });

  final Dream initialDream;
  final String? shardId;
  final DateTime? dailyDate;

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> with SingleTickerProviderStateMixin {
  late Dream _currentDream;
  late DreamSim _sim;
  late final Ticker _ticker;
  Duration _lastElapsed = Duration.zero;

  int _attempt = 1;
  final int _selectedPawn = 0;
  bool _duoMode = false;
  bool _hunchMode = false;
  bool _lucidLens = false;
  Timer? _lucidTimer;

  final Map<String, HunchType> _hunches = {};
  int _hintIndex = 0;
  bool _showSecondWhisper = false;

  @override
  void initState() {
    super.initState();
    _currentDream = widget.initialDream;
    _sim = DreamSim(_currentDream);

    _ticker = createTicker(_onTick)..start();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _lucidTimer?.cancel();
    super.dispose();
  }

  void _onTick(Duration elapsed) {
    if (_lastElapsed == Duration.zero) {
      _lastElapsed = elapsed;
      return;
    }
    final dtMs = (elapsed - _lastElapsed).inMilliseconds;
    _lastElapsed = elapsed;

    if (dtMs > 0 && _sim.playing) {
      _sim.tick(dtMs);
      _handleEvents(_sim.takeEvents());
      setState(() {});
    }
  }

  void _handleEvents(List<SimEvent> events) {
    for (final e in events) {
      switch (e.kind) {
        case SimEventKind.hop:
          AudioService.instance.playStep();
        case SimEventKind.wilt:
          AudioService.instance.playWilt();
        case SimEventKind.collapse:
          AudioService.instance.playCollapse();
        case SimEventKind.goldLit:
          AudioService.instance.playBell();
        case SimEventKind.doorOpen:
          AudioService.instance.playDoorOpen();
        case SimEventKind.won:
          AudioService.instance.playWin();
          _onGameWon();
        case SimEventKind.voided:
          AudioService.instance.playCollapse();
          _onGameVoided(e.voidCause);
        default:
          break;
      }
    }
  }

  void _onGameWon() {
    final stars = Scoring.stars(mistakes: _sim.mistakes, attempt: _attempt);
    final earned = Scoring.moonlight(
      stars: stars,
      rarity: _currentDream.rarity,
      theoryHits: 1,
      firstClear: true,
    );

    SaveService.instance.addMoonlight(earned);
    SaveService.instance.recordTruth('truth.${_currentDream.classifier.name}');
    SaveService.instance.recordTruth('truth.${_currentDream.gate.mode.name}');

    if (widget.shardId != null) {
      SaveService.instance.recordShardClear(widget.shardId!, stars, _attempt);
    }
    if (widget.dailyDate != null) {
      SaveService.instance.recordDailySolve(DailyDream.dayNumber(widget.dailyDate!));
    }

    _showWinDialog(stars, earned);
  }

  void _onGameVoided(VoidCause? cause) {
    // 800ms soft pause to absorb the collapse, then instant reshuffle
    Future.delayed(const Duration(milliseconds: 800), () {
      if (!mounted) return;
      setState(() {
        _attempt++;
        _currentDream = _currentDream.relayout(_attempt);
        _sim = DreamSim(_currentDream);
        _hunches.clear();
      });
    });
  }

  void _onTapTile(int pawnId, int r, int c) {
    if (!_sim.playing) return;

    if (_hunchMode) {
      final key = '$r,$c';
      final cur = _hunches[key];
      setState(() {
        if (cur == null) {
          _hunches[key] = HunchType.safe;
        } else if (cur == HunchType.safe) {
          _hunches[key] = HunchType.danger;
        } else if (cur == HunchType.danger) {
          _hunches[key] = HunchType.question;
        } else {
          _hunches.remove(key);
        }
      });
      return;
    }

    final p = _sim.pawns[pawnId];
    if (_sim.canHop(pawnId, r, c)) {
      _sim.hop(pawnId, r, c);

      // In Solo mode, if other pawn can also hop safely, coordinate with Echo!
      if (!_duoMode) {
        final otherId = 1 - pawnId;
        final other = _sim.pawns[otherId];
        // Echo follows along if on same row
        if (other.row == p.row) {
          if (_sim.canHop(otherId, r, c)) {
            _sim.hop(otherId, r, c);
          } else {
            // Find reachable safe tile
            for (var oc = other.col - 1; oc <= other.col + 1; oc++) {
              if (_sim.canHop(otherId, r, oc)) {
                _sim.hop(otherId, r, oc);
                break;
              }
            }
          }
        }
      }
    }
  }

  void _activateLucidLens() {
    if (_lucidLens) return;
    setState(() => _lucidLens = true);
    AudioService.instance.playBell();
    _lucidTimer?.cancel();
    _lucidTimer = Timer(const Duration(seconds: 4), () {
      if (mounted) setState(() => _lucidLens = false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final lang = SaveService.instance.language;
    final whisperText = _currentDream.whisper.lines
        .map((l) => WhisperCompiler.text(l.id, lang))
        .join(' ');

    return Scaffold(
      backgroundColor: DreamColors.nightIndigo,
      body: SafeArea(
        child: Stack(
          children: [
            // 1. The Interactive Diorama Canvas
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTapUp: (details) {
                  _handleCanvasTap(details.localPosition, context);
                },
                child: GameCanvas(
                  sim: _sim,
                  onTapTile: (pawn, r, c) => _onTapTile(pawn, r, c),
                  lucidLensActive: _lucidLens,
                  hunchMap: _hunches,
                  selectedPawn: _selectedPawn,
                  duoMode: _duoMode,
                ),
              ),
            ),

            // 2. Top Header HUD
            Positioned(
              top: 12,
              left: 16,
              right: 16,
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back_ios_new_rounded, color: DreamColors.bone),
                    onPressed: () => Navigator.pop(context),
                  ),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _currentDream.name,
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                            color: DreamColors.bone,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        Text(
                          'Attempt $_attempt · ${_currentDream.biome.name}',
                          style: const TextStyle(
                            fontSize: 12,
                            color: DreamColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  // Lucid Lens Button
                  GestureDetector(
                    onTap: _activateLucidLens,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: _lucidLens ? DreamColors.goldBright : DreamColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: DreamColors.goldBright.withAlpha(120)),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.auto_awesome,
                            size: 16,
                            color: _lucidLens ? DreamColors.nightIndigo : DreamColors.goldBright,
                          ),
                          const SizedBox(width: 4),
                          Text(
                            'Lens',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.bold,
                              color: _lucidLens ? DreamColors.nightIndigo : DreamColors.bone,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // 3. The Whisper Card (Floating at upper center)
            Positioned(
              top: 72,
              left: 20,
              right: 20,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: BoxDecoration(
                  color: DreamColors.surfaceCard.withAlpha(220),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: DreamColors.softLilac.withAlpha(40)),
                  boxShadow: const [
                    BoxShadow(color: Colors.black26, blurRadius: 8, offset: Offset(0, 4)),
                  ],
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.hearing_rounded, size: 20, color: DreamColors.goldBright),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            whisperText,
                            style: const TextStyle(
                              fontSize: 14,
                              fontStyle: FontStyle.italic,
                              color: DreamColors.bone,
                              height: 1.35,
                            ),
                          ),
                          if (_showSecondWhisper) ...[
                            const SizedBox(height: 6),
                            Text(
                              '💡 ${WhisperCompiler.text(_currentDream.whisper.hintIds[_hintIndex % _currentDream.whisper.hintIds.length], lang)}',
                              style: const TextStyle(
                                fontSize: 13,
                                color: DreamColors.goldGlow,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // 4. Bottom Controls
            Positioned(
              bottom: 16,
              left: 16,
              right: 16,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  // Solo / Duo Toggle
                  GestureDetector(
                    onTap: () {
                      setState(() {
                        _duoMode = !_duoMode;
                      });
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(_duoMode ? 'Duo Mode: Screen split for two players!' : 'Solo Mode: You & Echo'),
                          duration: const Duration(seconds: 1),
                        ),
                      );
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: _duoMode ? DreamColors.dreamMint : DreamColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            _duoMode ? Icons.people_alt_rounded : Icons.person_rounded,
                            size: 18,
                            color: _duoMode ? DreamColors.nightIndigo : DreamColors.bone,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            _duoMode ? 'Duo' : 'Solo',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                              color: _duoMode ? DreamColors.nightIndigo : DreamColors.bone,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Hunch Board Pin Toggle
                  GestureDetector(
                    onTap: () {
                      setState(() => _hunchMode = !_hunchMode);
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                      decoration: BoxDecoration(
                        color: _hunchMode ? DreamColors.goldBright : DreamColors.surfaceElevated,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(
                        children: [
                          Icon(
                            Icons.push_pin_rounded,
                            size: 18,
                            color: _hunchMode ? DreamColors.nightIndigo : DreamColors.bone,
                          ),
                          const SizedBox(width: 6),
                          Text(
                            'Hunch',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 13,
                              color: _hunchMode ? DreamColors.nightIndigo : DreamColors.bone,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Second Whisper Hint (unlocked after retries)
                  if (_attempt >= 2)
                    GestureDetector(
                      onTap: () {
                        setState(() {
                          _showSecondWhisper = true;
                          _hintIndex++;
                        });
                      },
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                        decoration: BoxDecoration(
                          color: DreamColors.surfaceElevated,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: DreamColors.goldBright.withAlpha(90)),
                        ),
                        child: const Row(
                          children: [
                            Icon(Icons.lightbulb_outline_rounded, size: 18, color: DreamColors.goldBright),
                            SizedBox(width: 6),
                            Text(
                              'Hint',
                              style: TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 13,
                                color: DreamColors.bone,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _handleCanvasTap(Offset tapPos, BuildContext context) {
    final size = MediaQuery.of(context).size;
    final avgRow = (_sim.pawns[0].row + _sim.pawns[1].row) / 2.0;
    const tileW = 96.0;
    const rowStep = 56.0;
    final centerX = size.width / 2.0;

    // In Duo mode: left half of screen controls Mom (pawn 0), right half controls Child (pawn 1)
    int targetPawn = _selectedPawn;
    if (_duoMode) {
      targetPawn = (tapPos.dx < size.width * 0.5) ? 0 : 1;
    }

    final activePawn = _sim.pawns[targetPawn];

    // Find closest tile among adjacent options
    int bestR = -1;
    int bestC = -1;
    double bestDist = 80.0;

    for (var dr = -1; dr <= 1; dr++) {
      for (var dc = -1; dc <= 1; dc++) {
        final nr = activePawn.row + dr;
        final nc = activePawn.col + dc;
        if (!_sim.board.inBounds(nr, nc)) continue;

        final colOffset = (nc - 1) * (tileW * 1.08);
        final rowY = size.height * 0.70 - (nr * rowStep);
        final screenY = rowY - (size.height * 0.65 + avgRow * rowStep) + size.height * 0.65;
        final screenX = centerX + colOffset;

        final d = (Offset(screenX, screenY) - tapPos).distance;
        if (d < bestDist) {
          bestDist = d;
          bestR = nr;
          bestC = nc;
        }
      }
    }

    if (bestR >= 0 && bestC >= 0) {
      _onTapTile(targetPawn, bestR, bestC);
    }
  }

  void _showWinDialog(int stars, int earned) {
    final lang = SaveService.instance.language;
    final truth = WhisperCompiler.text('truth.${_currentDream.classifier.name}', lang);
    final gateTruth = WhisperCompiler.text('truth.${_currentDream.gate.mode.name}', lang);

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => AlertDialog(
        backgroundColor: DreamColors.surfaceCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Center(
          child: Column(
            children: [
              const Text('✦ DREAM SOLVED ✦', style: TextStyle(fontSize: 14, color: DreamColors.goldBright, letterSpacing: 1.5, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(_currentDream.name, style: const TextStyle(fontSize: 22, color: DreamColors.bone, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < 3; i++)
                    Icon(
                      i < stars ? Icons.star_rounded : Icons.star_outline_rounded,
                      color: DreamColors.goldBright,
                      size: 32,
                    ),
                ],
              ),
            ],
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: DreamColors.nightIndigo.withAlpha(180),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('📖 The Truth Remembered:', style: TextStyle(fontSize: 12, color: DreamColors.textMuted)),
                  const SizedBox(height: 4),
                  Text('“$truth”', style: const TextStyle(fontSize: 14, color: DreamColors.bone, fontStyle: FontStyle.italic)),
                  const SizedBox(height: 4),
                  Text('“$gateTruth”', style: const TextStyle(fontSize: 14, color: DreamColors.goldGlow, fontStyle: FontStyle.italic)),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Center(
              child: Text(
                '+$earned Moonlight ✨',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: DreamColors.goldBright),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              Navigator.pop(context);
            },
            child: const Text('Back to Dreams', style: TextStyle(color: DreamColors.bone)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(ctx);
              // Next shard if in story mode
              if (widget.shardId != null) {
                final next = nextStoryShard(widget.shardId!);
                if (next != null) {
                  Navigator.pushReplacement(
                    context,
                    MaterialPageRoute(
                      builder: (_) => GameScreen(
                        initialDream: next.build(),
                        shardId: next.id,
                      ),
                    ),
                  );
                  return;
                }
              }
              Navigator.pop(context);
            },
            child: const Text('Continue'),
          ),
        ],
      ),
    );
  }
}
