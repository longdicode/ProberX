import 'package:flutter/material.dart';

/// ProberX 设计系统 —— 暗色指挥中心（Dark Command Center）
/// 基底：近黑蓝 · 主色：电青/信号蓝 · 点缀：琥珀告警、翠绿在线
class AppColors {
  AppColors._();

  static const ink = Color(0xFF070B13); // 页面底
  static const panel = Color(0xFF0D1420); // 面板
  static const panelHi = Color(0xFF141E2E); // 悬浮/输入
  static const line = Color(0xFF1C2A3D); // 描边
  static const lineSoft = Color(0xFF15202F);

  static const cyan = Color(0xFF2DD4BF); // 电青（主）
  static const blue = Color(0xFF3B82F6); // 信号蓝
  static const green = Color(0xFF34D399); // 在线
  static const amber = Color(0xFFFBBF24); // 告警
  static const red = Color(0xFFFB7185); // 离线/错误
  static const textHi = Color(0xFFE8EEF7);
  static const textMid = Color(0xFF93A3B8);
  static const textLow = Color(0xFF5A6B82);

  /// 主渐变：电青 → 蓝
  static const LinearGradient brandGradient = LinearGradient(
    colors: [cyan, blue],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}

class AppTheme {
  AppTheme._();

  static ThemeData get dark {
    final base = ColorScheme.dark(
      primary: AppColors.cyan,
      onPrimary: const Color(0xFF062019),
      secondary: AppColors.blue,
      onSecondary: Colors.white,
      surface: AppColors.panel,
      onSurface: AppColors.textHi,
      error: AppColors.red,
      onError: const Color(0xFF2B0A10),
      outline: AppColors.line,
      outlineVariant: AppColors.lineSoft,
      surfaceContainerHighest: AppColors.panelHi,
    );

    final textTheme = ThemeData.dark().textTheme.apply(
          fontFamily: 'Segoe UI',
          bodyColor: AppColors.textHi,
          displayColor: AppColors.textHi,
        );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: base,
      scaffoldBackgroundColor: AppColors.ink,
      splashFactory: InkSparkle.splashFactory,
      fontFamily: 'Segoe UI',
      textTheme: textTheme.copyWith(
        displaySmall: textTheme.displaySmall?.copyWith(
          fontFamily: 'Bahnschrift',
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
        headlineSmall: textTheme.headlineSmall?.copyWith(
          fontFamily: 'Bahnschrift',
          fontWeight: FontWeight.w600,
          letterSpacing: 0.3,
        ),
        titleLarge: textTheme.titleLarge?.copyWith(
          fontFamily: 'Bahnschrift',
          fontWeight: FontWeight.w600,
        ),
        titleMedium: textTheme.titleMedium?.copyWith(
          fontWeight: FontWeight.w600,
        ),
        labelLarge: textTheme.labelLarge?.copyWith(
          fontWeight: FontWeight.w600,
          letterSpacing: 0.3,
        ),
        bodySmall: textTheme.bodySmall?.copyWith(color: AppColors.textMid),
      ),
      cardTheme: CardThemeData(
        color: AppColors.panel,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: AppColors.line, width: 1),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.panelHi,
        hintStyle: const TextStyle(color: AppColors.textLow, fontSize: 14),
        labelStyle: const TextStyle(color: AppColors.textMid, fontSize: 13),
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: AppColors.cyan, width: 1.4),
        ),
      ),
      dividerTheme: const DividerThemeData(color: AppColors.lineSoft, thickness: 1),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.cyan,
          foregroundColor: const Color(0xFF062019),
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 13),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 0.5),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: AppColors.panelHi,
        contentTextStyle: const TextStyle(color: AppColors.textHi),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
          side: const BorderSide(color: AppColors.line),
        ),
      ),
      tooltipTheme: TooltipThemeData(
        decoration: BoxDecoration(
          color: AppColors.panelHi,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: AppColors.line),
        ),
        textStyle: const TextStyle(color: AppColors.textHi, fontSize: 12),
      ),
    );
  }
}

/// 等宽数字样式（Cascadia Code 本机自带，无网络依赖）
TextStyle monoStyle(double size, {Color? color, FontWeight weight = FontWeight.w500}) {
  return TextStyle(
    fontFamily: 'Cascadia Code',
    fontSize: size,
    color: color,
    fontWeight: weight,
    fontFeatures: const [FontFeature.tabularFigures()],
  );
}
