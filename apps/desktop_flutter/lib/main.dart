import 'package:flutter/material.dart';
import 'package:window_manager/window_manager.dart';
import 'core/api_client.dart';
import 'pages/home_page.dart';
import 'pages/login_page.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await windowManager.ensureInitialized();
  const options = WindowOptions(
    size: Size(1440, 900),
    minimumSize: Size(1080, 680),
    center: true,
    title: 'ProberX 桌面客户端',
    titleBarStyle: TitleBarStyle.normal,
  );
  windowManager.waitUntilReadyToShow(options, () async {
    await windowManager.show();
    await windowManager.focus();
  });
  await SessionStore.instance.init();
  runApp(const ProberXApp());
}

class ProberXApp extends StatelessWidget {
  const ProberXApp({super.key});

  @override
  Widget build(BuildContext context) {
    final hasToken = ApiClient.instance.accessToken != null &&
        ApiClient.instance.accessToken!.isNotEmpty;
    return MaterialApp(
      title: 'ProberX',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.dark,
      home: hasToken ? const HomePage() : const LoginPage(),
    );
  }
}
