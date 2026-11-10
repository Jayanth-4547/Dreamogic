import 'package:flutter/material.dart';

/// Dreamogic visual tokens and color palette.
/// Paper-diorama at dusk: soft matte tones, generous breathing room.
class DreamColors {
  DreamColors._();

  static const Color nightIndigo = Color(0xFF14122B);
  static const Color twilightDusk = Color(0xFF231D42);
  static const Color surfaceElevated = Color(0xFF2C2454);
  static const Color surfaceCard = Color(0xFF382E6B);

  static const Color dreamMoss = Color(0xFF5FAE90);
  static const Color dreamMint = Color(0xFF7BC8A4);
  static const Color goldBright = Color(0xFFFFC857);
  static const Color goldGlow = Color(0xFFFFE08A);
  static const Color coralWarning = Color(0xFFFF7A7A);
  static const Color softLilac = Color(0xFFC3C9F5);
  static const Color bone = Color(0xFFF6EFE3);
  static const Color textMuted = Color(0xFFA59EC4);
  static const Color voidDark = Color(0xFF0A0814);

  // Pawn colors
  static const Color momGold = Color(0xFFFFC857);
  static const Color childMint = Color(0xFF7BC8A4);
}

class DreamTheme {
  DreamTheme._();

  static ThemeData get themeData {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: DreamColors.nightIndigo,
      primaryColor: DreamColors.goldBright,
      colorScheme: const ColorScheme.dark(
        primary: DreamColors.goldBright,
        secondary: DreamColors.dreamMint,
        surface: DreamColors.surfaceElevated,
        error: DreamColors.coralWarning,
      ),
      fontFamily: 'Nunito',
      textTheme: const TextTheme(
        headlineMedium: TextStyle(
          fontSize: 26,
          fontWeight: FontWeight.bold,
          color: DreamColors.bone,
          letterSpacing: 0.5,
        ),
        headlineSmall: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.bold,
          color: DreamColors.bone,
        ),
        titleLarge: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w600,
          color: DreamColors.bone,
        ),
        bodyLarge: TextStyle(
          fontSize: 16,
          color: DreamColors.bone,
          height: 1.4,
        ),
        bodyMedium: TextStyle(
          fontSize: 14,
          color: DreamColors.textMuted,
          height: 1.4,
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: DreamColors.goldBright,
          foregroundColor: DreamColors.nightIndigo,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }
}
