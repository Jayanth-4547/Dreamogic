import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'screens/home_screen.dart';
import 'services/audio_service.dart';
import 'services/save_service.dart';
import 'theme/dream_theme.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Set immersive portrait orientation
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Dark navigation bar and status bar
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
      systemNavigationBarColor: DreamColors.nightIndigo,
      systemNavigationBarIconBrightness: Brightness.light,
    ),
  );

  // Initialize offline storage and audio
  await SaveService.instance.init();
  await AudioService.instance.init();

  runApp(const DreamogicApp());
}

class DreamogicApp extends StatelessWidget {
  const DreamogicApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Dreamogic',
      debugShowCheckedModeBanner: false,
      theme: DreamTheme.themeData,
      home: const HomeScreen(),
    );
  }
}
