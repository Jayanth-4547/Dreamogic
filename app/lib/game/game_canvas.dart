import 'dart:math' as math;
import 'package:dream_engine/dream_engine.dart';
import 'package:flutter/material.dart';
import '../theme/dream_theme.dart';

enum HunchType { safe, danger, question }

class GameCanvas extends StatefulWidget {
  const GameCanvas({
    super.key,
    required this.sim,
    required this.onTapTile,
    this.lucidLensActive = false,
    this.hunchMap = const {},
    this.selectedPawn = 0,
    this.duoMode = false,
  });

  final DreamSim sim;
  final void Function(int pawnId, int row, int col) onTapTile;
  final bool lucidLensActive;
  final Map<String, HunchType> hunchMap;
  final int selectedPawn;
  final bool duoMode;

  @override
  State<GameCanvas> createState() => _GameCanvasState();
}

class _GameCanvasState extends State<GameCanvas> with SingleTickerProviderStateMixin {
  late final AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (context, child) {
        return CustomPaint(
          size: Size.infinite,
          painter: _DreamDioramaPainter(
            sim: widget.sim,
            animTime: _anim.value,
            lucidLens: widget.lucidLensActive,
            hunches: widget.hunchMap,
            selectedPawn: widget.selectedPawn,
            duoMode: widget.duoMode,
          ),
        );
      },
    );
  }
}

class _DreamDioramaPainter extends CustomPainter {
  _DreamDioramaPainter({
    required this.sim,
    required this.animTime,
    required this.lucidLens,
    required this.hunches,
    required this.selectedPawn,
    required this.duoMode,
  });

  final DreamSim sim;
  final double animTime;
  final bool lucidLens;
  final Map<String, HunchType> hunches;
  final int selectedPawn;
  final bool duoMode;

  @override
  void paint(Canvas canvas, Size size) {
    final dream = sim.dream;
    final board = dream.board;
    final biome = dream.biome;

    // 1. Sky & Ambient dusk gradient
    final bgPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [Color(biome.skyTop), Color(biome.skyBottom)],
      ).createShader(Offset.zero & size);
    canvas.drawRect(Offset.zero & size, bgPaint);

    // Subtle drifting firefly dust
    final starPaint = Paint()..color = DreamColors.bone.withAlpha(40);
    for (var i = 0; i < 20; i++) {
      final sx = ((i * 137.5 + animTime * 40.0) % size.width);
      final sy = ((i * 83.2 + math.sin(animTime * 2 * math.pi + i) * 15.0) % size.height);
      final sr = (1.0 + (i % 3) * 0.7);
      canvas.drawCircle(Offset(sx, sy), sr, starPaint);
    }

    // 2. Camera tracking: center vertically on the average row of the pawns
    final avgRow = (sim.pawns[0].row + sim.pawns[1].row) / 2.0;
    const tileW = 96.0;
    const tileH = 46.0;
    const rowStep = 56.0;

    final centerX = size.width / 2.0;
    // Ground origin shifts so active row sits at ~62% from top of screen
    final cameraTargetY = size.height * 0.65 + avgRow * rowStep;

    canvas.save();
    canvas.translate(0, -cameraTargetY + size.height * 0.65);

    // 3. Draw rows from top (far / gate) to bottom (near / start) for correct isometric depth
    for (var r = board.rows - 1; r >= 0; r--) {
      for (var c = 0; c < Board.cols; c++) {
        final tile = board.at(r, c);
        final tileRt = sim.tiles[r][c];
        final center = _tileCenter(r, c, centerX, size.height, rowStep, tileW);

        // Tile shadow
        _drawTileShadow(canvas, center, tileW, tileH);

        // Tile body
        _drawDioramaTile(
          canvas: canvas,
          tile: tile,
          tileRt: tileRt,
          center: center,
          tileW: tileW,
          tileH: tileH,
          biome: biome,
          strength: dream.tellStrength(r),
          lucid: lucidLens,
          gateOpen: sim.gate.open,
          hunch: hunches['$r,$c'],
        );
      }
    }

    // 4. Golden thread between the pair
    _drawTether(canvas, centerX, size.height, rowStep, tileW);

    // 5. Draw Pawns (Mom & Child)
    _drawPawns(canvas, centerX, size.height, rowStep, tileW);

    canvas.restore();
  }

  Offset _tileCenter(int r, int c, double cx, double h, double rStep, double tW) {
    // 3 columns: c = 0 (left), 1 (center), 2 (right)
    final colOffset = (c - 1) * (tW * 1.08);
    final rowY = h * 0.70 - (r * rStep);
    return Offset(cx + colOffset, rowY);
  }

  void _drawTileShadow(Canvas canvas, Offset center, double tw, double th) {
    final shadowPaint = Paint()
      ..color = Colors.black.withAlpha(55)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);
    canvas.drawOval(
      Rect.fromCenter(center: center.translate(0, 16), width: tw * 0.95, height: th * 0.8),
      shadowPaint,
    );
  }

  void _drawDioramaTile({
    required Canvas canvas,
    required Tile tile,
    required TileRt tileRt,
    required Offset center,
    required double tileW,
    required double tileH,
    required Biome biome,
    required double strength,
    required bool lucid,
    required bool gateOpen,
    required HunchType? hunch,
  }) {
    if (tileRt.voided) {
      // Dissolved void tile
      _drawVoidParticles(canvas, center, tileW, tileH);
      return;
    }

    final hw = tileW * 0.5;
    final hh = tileH * 0.5;
    const depth = 14.0;

    // Top surface diamond path
    final topPath = Path()
      ..moveTo(center.dx, center.dy - hh)
      ..lineTo(center.dx + hw, center.dy)
      ..lineTo(center.dx, center.dy + hh)
      ..lineTo(center.dx - hw, center.dy)
      ..close();

    // Side facet (left)
    final leftSide = Path()
      ..moveTo(center.dx - hw, center.dy)
      ..lineTo(center.dx, center.dy + hh)
      ..lineTo(center.dx, center.dy + hh + depth)
      ..lineTo(center.dx - hw, center.dy + depth)
      ..close();

    // Side facet (right)
    final rightSide = Path()
      ..moveTo(center.dx, center.dy + hh)
      ..lineTo(center.dx + hw, center.dy)
      ..lineTo(center.dx + hw, center.dy + depth)
      ..lineTo(center.dx, center.dy + hh + depth)
      ..close();

    // Base colors based on tile kind
    Color topColor;
    Color sideColor;

    switch (tile.kind) {
      case TileKind.start:
        topColor = Color(biome.tileTop);
        sideColor = Color(biome.tileSide);
      case TileKind.path:
        topColor = Color(biome.tileTop);
        sideColor = Color(biome.tileSide);
        // Hue shift tell
        if (tile.hue != 0) {
          final hueTint = HSVColor.fromAHSV(1.0, (tile.hue * 15.0) % 360, 0.35, 0.75).toColor();
          final effStrength = (lucid ? 1.0 : strength).clamp(0.0, 1.0);
          topColor = Color.lerp(topColor, hueTint, effStrength * 0.55)!;
        }
      case TileKind.gold:
        topColor = DreamColors.goldBright;
        sideColor = const Color(0xFFC7922A);
      case TileKind.door:
        topColor = gateOpen ? DreamColors.dreamMint : const Color(0xFF4A426B);
        sideColor = gateOpen ? const Color(0xFF2E6B56) : const Color(0xFF2D274A);
    }

    if (tileRt.wilted) {
      topColor = Color.lerp(topColor, DreamColors.coralWarning.withAlpha(200), 0.65)!;
    }

    final sidePaint1 = Paint()..color = sideColor;
    final sidePaint2 = Paint()..color = Color.lerp(sideColor, Colors.black, 0.25)!;
    canvas.drawPath(leftSide, sidePaint1);
    canvas.drawPath(rightSide, sidePaint2);

    final topPaint = Paint()..color = topColor;
    canvas.drawPath(topPath, topPaint);

    // Bevel edge stroke
    final edgePaint = Paint()
      ..color = Colors.white.withAlpha(35)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.0;
    canvas.drawPath(topPath, edgePaint);

    // Sprouts / tiny trees
    if (tile.kind == TileKind.path && tile.sprouts > 0) {
      _drawSprouts(canvas, center, tile.sprouts, tile.seed, strength, lucid, biome);
    }

    // Roots lean tell
    if (tile.kind == TileKind.path && tile.root != 0) {
      _drawRoots(canvas, center, tile.root, strength, lucid, biome);
    }

    // Gate Door Frame
    if (tile.kind == TileKind.door) {
      _drawGateArch(canvas, center, gateOpen);
    }

    // Gold Gate Shimmer
    if (tile.kind == TileKind.gold) {
      _drawGoldShimmer(canvas, center, tileW, tileH);
    }

    // Hunch Pin
    if (hunch != null) {
      _drawHunchPin(canvas, center, hunch);
    }
  }

  void _drawSprouts(Canvas canvas, Offset center, int count, int seed, double strength, bool lucid, Biome biome) {
    final effStrength = (lucid ? 1.0 : strength).clamp(0.15, 1.0);
    final sproutPaint = Paint()..color = Color(biome.sprout);
    final rng = math.Random(seed);

    final baseSize = 8.0 * effStrength;
    for (var i = 0; i < count; i++) {
      final angle = (i * 2.399) + (seed % 10);
      final dist = (rng.nextDouble() * 16.0 + 4.0) * effStrength;
      final sx = center.dx + math.cos(angle) * dist;
      final sy = center.dy + math.sin(angle) * (dist * 0.45);

      // Draw sprout stem + top leaf
      canvas.drawLine(
        Offset(sx, sy),
        Offset(sx, sy - baseSize),
        Paint()
          ..color = Color(biome.root)
          ..strokeWidth = 1.8 * effStrength,
      );
      canvas.drawCircle(Offset(sx, sy - baseSize), 2.8 * effStrength, sproutPaint);
    }
  }

  void _drawRoots(Canvas canvas, Offset center, int rootDir, double strength, bool lucid, Biome biome) {
    final effStrength = (lucid ? 1.0 : strength).clamp(0.2, 1.0);
    final rootPaint = Paint()
      ..color = Color(biome.root).withAlpha((180 * effStrength).toInt())
      ..strokeWidth = 2.0 * effStrength
      ..style = PaintingStyle.stroke;

    // 0 = up, 1 = right, 2 = down, 3 = left
    final dirVector = switch (rootDir) {
      0 => const Offset(0, -10),
      1 => const Offset(12, 4),
      2 => const Offset(0, 10),
      _ => const Offset(-12, 4),
    };

    final p = Path()
      ..moveTo(center.dx, center.dy)
      ..quadraticBezierTo(
        center.dx + dirVector.dx * 0.5 + 4,
        center.dy + dirVector.dy * 0.5,
        center.dx + dirVector.dx * effStrength,
        center.dy + dirVector.dy * effStrength,
      );
    canvas.drawPath(p, rootPaint);
  }

  void _drawGateArch(Canvas canvas, Offset center, bool open) {
    final archPaint = Paint()
      ..color = open ? DreamColors.goldBright : DreamColors.bone.withAlpha(180)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4.0
      ..strokeCap = StrokeCap.round;

    final p = Path()
      ..moveTo(center.dx - 22, center.dy + 8)
      ..lineTo(center.dx - 22, center.dy - 34)
      ..quadraticBezierTo(center.dx, center.dy - 56, center.dx + 22, center.dy - 34)
      ..lineTo(center.dx + 22, center.dy + 8);
    canvas.drawPath(p, archPaint);

    if (open) {
      // Radiant threshold
      final glowPaint = Paint()
        ..color = DreamColors.goldGlow.withAlpha(120)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 12);
      canvas.drawCircle(Offset(center.dx, center.dy - 20), 22, glowPaint);
    }
  }

  void _drawGoldShimmer(Canvas canvas, Offset center, double tw, double th) {
    final pulse = (math.sin(animTime * 2 * math.pi * 1.5) + 1.0) * 0.5;
    final ringPaint = Paint()
      ..color = DreamColors.goldGlow.withAlpha((80 + pulse * 70).toInt())
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;
    canvas.drawOval(
      Rect.fromCenter(center: center, width: tw * 0.65, height: th * 0.65),
      ringPaint,
    );
  }

  void _drawHunchPin(Canvas canvas, Offset center, HunchType hunch) {
    final pinPos = center.translate(0, -18);
    final color = switch (hunch) {
      HunchType.safe => DreamColors.dreamMint,
      HunchType.danger => DreamColors.coralWarning,
      HunchType.question => DreamColors.goldBright,
    };
    canvas.drawCircle(pinPos, 10, Paint()..color = color);
    canvas.drawCircle(pinPos, 10, Paint()..color = Colors.white..style = PaintingStyle.stroke..strokeWidth = 1.5);

    final symbol = switch (hunch) {
      HunchType.safe => '✓',
      HunchType.danger => '✕',
      HunchType.question => '?',
    };
    final tp = TextPainter(
      text: TextSpan(
        text: symbol,
        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.black87),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, pinPos.translate(-tp.width / 2, -tp.height / 2));
  }

  void _drawVoidParticles(Canvas canvas, Offset center, double tw, double th) {
    final pPaint = Paint()..color = DreamColors.softLilac.withAlpha(70);
    for (var i = 0; i < 6; i++) {
      final a = i * 1.05 + animTime * math.pi;
      final r = 16.0 * (0.5 + 0.5 * math.sin(animTime * math.pi * 2 + i));
      canvas.drawCircle(
        Offset(center.dx + math.cos(a) * r, center.dy + math.sin(a) * (r * 0.5)),
        2.0,
        pPaint,
      );
    }
  }

  void _drawTether(Canvas canvas, double cx, double h, double rStep, double tW) {
    if (sim.dream.modifier.kind != ModifierKind.tether) return;
    if (sim.pawns.any((p) => p.exited)) return;

    final p0 = _pawnRenderPos(0, cx, h, rStep, tW);
    final p1 = _pawnRenderPos(1, cx, h, rStep, tW);

    final strain = sim.tetherStrain;
    final tetherColor = Color.lerp(DreamColors.goldGlow, DreamColors.coralWarning, strain)!;

    final tetherPaint = Paint()
      ..color = tetherColor.withAlpha((200 + strain * 55).toInt())
      ..strokeWidth = (strain > 0.6 ? 3.0 : 2.0)
      ..style = PaintingStyle.stroke;

    final mid = Offset((p0.dx + p1.dx) / 2, (p0.dy + p1.dy) / 2 + 10 * (1 - strain));
    final p = Path()
      ..moveTo(p0.dx, p0.dy)
      ..quadraticBezierTo(mid.dx, mid.dy, p1.dx, p1.dy);
    canvas.drawPath(p, tetherPaint);
  }

  Offset _pawnRenderPos(int pawnId, double cx, double h, double rStep, double tW) {
    final p = sim.pawns[pawnId];
    final from = _tileCenter(p.row, p.col, cx, h, rStep, tW);
    if (!p.hopping) return from.translate(0, -14);

    final to = _tileCenter(p.toRow, p.toCol, cx, h, rStep, tW);
    final totalMs = (p.hopEndMs - p.hopStartMs).clamp(1, 2000);
    final progress = ((sim.nowMs - p.hopStartMs) / totalMs).clamp(0.0, 1.0);

    // Parabolic arc: 4 * t * (1 - t)
    final arcHeight = 36.0 * 4 * progress * (1.0 - progress);
    final currentX = from.dx + (to.dx - from.dx) * progress;
    final currentY = from.dy + (to.dy - from.dy) * progress - 14 - arcHeight;
    return Offset(currentX, currentY);
  }

  void _drawPawns(Canvas canvas, double cx, double h, double rStep, double tW) {
    for (var i = 0; i < 2; i++) {
      final p = sim.pawns[i];
      if (p.exited) continue;

      final pos = _pawnRenderPos(i, cx, h, rStep, tW);
      final isMom = (i == 0);
      final radius = isMom ? 17.0 : 13.5;
      final baseColor = isMom ? DreamColors.momGold : DreamColors.childMint;

      // Selection ring for solo control
      if (!duoMode && selectedPawn == i) {
        final selPaint = Paint()
          ..color = Colors.white.withAlpha(160)
          ..style = PaintingStyle.stroke
          ..strokeWidth = 2.0;
        canvas.drawCircle(pos, radius + 5, selPaint);
      }

      // Pawn drop shadow
      canvas.drawOval(
        Rect.fromCenter(center: pos.translate(0, radius + 2), width: radius * 1.8, height: radius * 0.8),
        Paint()..color = Colors.black38..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
      );

      // Body (soft glowing orb)
      final bodyPaint = Paint()..color = baseColor;
      canvas.drawCircle(pos, radius, bodyPaint);

      // Soft highlight
      canvas.drawCircle(
        pos.translate(-radius * 0.3, -radius * 0.35),
        radius * 0.35,
        Paint()..color = Colors.white.withAlpha(90),
      );

      // Smiling eyes
      final eyePaint = Paint()
        ..color = Colors.black87
        ..strokeWidth = 1.8
        ..strokeCap = StrokeCap.round
        ..style = PaintingStyle.stroke;

      final eyeY = pos.dy - radius * 0.1;
      final eyeSpan = radius * 0.35;
      // Eye arcs (happy curved eyes)
      canvas.drawArc(
        Rect.fromCenter(center: Offset(pos.dx - eyeSpan, eyeY), width: 5, height: 4),
        math.pi * 0.1,
        math.pi * 0.8,
        false,
        eyePaint,
      );
      canvas.drawArc(
        Rect.fromCenter(center: Offset(pos.dx + eyeSpan, eyeY), width: 5, height: 4),
        math.pi * 0.1,
        math.pi * 0.8,
        false,
        eyePaint,
      );

      // Avatar label ('Mom' / 'Child' or 'Echo')
      final label = isMom ? 'Mom' : (duoMode ? 'You' : 'Echo');
      final tp = TextPainter(
        text: TextSpan(
          text: label,
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.bold,
            color: DreamColors.bone.withAlpha(200),
          ),
        ),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, Offset(pos.dx - tp.width / 2, pos.dy - radius - 15));
    }
  }

  @override
  bool shouldRepaint(covariant _DreamDioramaPainter old) => true;
}
