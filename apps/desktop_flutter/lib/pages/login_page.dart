import 'dart:math' as math;
import 'dart:ui';
import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../services/services.dart';
import '../theme/app_theme.dart';
import 'home_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController(text: "");
  final _password = TextEditingController();
  bool _loading = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final email = _email.text.trim();
    final password = _password.text;
    if (email.isEmpty || password.isEmpty) {
      setState(() => _error = "请输入邮箱和密码");
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await AuthService().login(email, password);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        PageRouteBuilder(
          pageBuilder: (_, __, ___) => const HomePage(),
          transitionsBuilder: (_, anim, __, child) =>
              FadeTransition(opacity: anim, child: child),
          transitionDuration: const Duration(milliseconds: 260),
        ),
      );
    } on ApiException catch (e) {
      setState(() => _error = _friendlyError(e));
    } catch (e) {
      setState(() => _error = "无法连接服务器：$e");
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _friendlyError(ApiException e) {
    final m = e.message;
    if (e.status == 500) return "服务器暂时不可用（HTTP 500），请稍后重试";
    return m;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // 背景：光晕 + 网格纹理
          const Positioned.fill(child: _Backdrop()),
          // 中央玻璃卡片
          Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(20),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(34, 36, 34, 28),
                      decoration: BoxDecoration(
                        color: AppColors.panel.withValues(alpha: 0.72),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.line.withValues(alpha: 0.8)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(alpha: 0.45),
                            blurRadius: 40,
                            offset: const Offset(0, 18),
                          ),
                        ],
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const _Brand(),
                          const SizedBox(height: 30),
                          _field(
                            controller: _email,
                            hint: "邮箱",
                            icon: Icons.alternate_email,
                            keyboardType: TextInputType.emailAddress,
                            onSubmitted: (_) => _login(),
                          ),
                          const SizedBox(height: 14),
                          _field(
                            controller: _password,
                            hint: "密码",
                            icon: Icons.key_rounded,
                            obscure: _obscure,
                            suffix: IconButton(
                              icon: Icon(
                                _obscure ? Icons.visibility_off : Icons.visibility,
                                size: 19,
                                color: AppColors.textLow,
                              ),
                              onPressed: () => setState(() => _obscure = !_obscure),
                            ),
                            onSubmitted: (_) => _login(),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 14),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                              decoration: BoxDecoration(
                                color: AppColors.red.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: AppColors.red.withValues(alpha: 0.3)),
                              ),
                              child: Row(
                                children: [
                                  const Icon(Icons.error_outline, size: 16, color: AppColors.red),
                                  const SizedBox(width: 8),
                                  Expanded(
                                    child: Text(_error!,
                                        style: const TextStyle(color: AppColors.red, fontSize: 12.5)),
                                  ),
                                ],
                              ),
                            ),
                          ],
                          const SizedBox(height: 24),
                          _loginButton(),
                          const SizedBox(height: 16),
                          Center(
                            child: TextButton.icon(
                              onPressed: _showSettings,
                              icon: const Icon(Icons.tune, size: 16, color: AppColors.textMid),
                              label: const Text("API 服务器设置",
                                  style: TextStyle(color: AppColors.textMid, fontSize: 12.5)),
                            ),
                          ),
                          const SizedBox(height: 6),
                          const Center(
                            child: Text("ProberX Desktop v1.0.0",
                                style: TextStyle(color: AppColors.textLow, fontSize: 11)),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _field({
    required TextEditingController controller,
    required String hint,
    required IconData icon,
    bool obscure = false,
    Widget? suffix,
    TextInputType? keyboardType,
    ValueChanged<String>? onSubmitted,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscure,
      keyboardType: keyboardType,
      onSubmitted: onSubmitted,
      style: const TextStyle(fontSize: 14.5),
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: Icon(icon, size: 19, color: AppColors.textLow),
        suffixIcon: suffix,
      ),
    );
  }

  Widget _loginButton() {
    return SizedBox(
      height: 46,
      child: DecoratedBox(
        decoration: BoxDecoration(
          gradient: AppColors.brandGradient,
          borderRadius: BorderRadius.circular(10),
          boxShadow: [
            BoxShadow(
              color: AppColors.cyan.withValues(alpha: 0.25),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(10),
            onTap: _loading ? null : _login,
            child: Center(
              child: _loading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Color(0xFF062019)),
                    )
                  : const Text(
                      "登 录",
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 6,
                        color: Color(0xFF062019),
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }

  void _showSettings() {
    final controller = TextEditingController(text: ApiConfig.baseUrl);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("API 服务器地址"),
        content: SizedBox(
          width: 380,
          child: TextField(
            controller: controller,
            decoration: const InputDecoration(hintText: "https://agent.yqone.cn/api/v1"),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("取消")),
          FilledButton(
            onPressed: () async {
              final url = controller.text.trim();
              if (url.isNotEmpty) await SessionStore.instance.saveApiUrl(url);
              if (ctx.mounted) Navigator.pop(ctx);
            },
            child: const Text("保存"),
          ),
        ],
      ),
    );
  }
}

/// 品牌标识
class _Brand extends StatelessWidget {
  const _Brand();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 52,
          height: 52,
          decoration: BoxDecoration(
            gradient: AppColors.brandGradient,
            borderRadius: BorderRadius.circular(14),
            boxShadow: [
              BoxShadow(
                color: AppColors.cyan.withValues(alpha: 0.35),
                blurRadius: 22,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: const Icon(Icons.hub_rounded, color: Color(0xFF062019), size: 30),
        ),
        const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("ProberX",
                style: TextStyle(
                  fontFamily: 'Bahnschrift',
                  fontSize: 26,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 1,
                  color: AppColors.textHi,
                )),
            Text("服务器监控 · 运维中台",
                style: TextStyle(fontSize: 12, color: AppColors.textMid, letterSpacing: 2)),
          ],
        ),
      ],
    );
  }
}

/// 背景：radial 光晕 + 工程网格
class _Backdrop extends StatelessWidget {
  const _Backdrop();

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _BackdropPainter(),
      child: const SizedBox.expand(),
    );
  }
}

class _BackdropPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    // 基底
    canvas.drawRect(Offset.zero & size, Paint()..color = AppColors.ink);

    // 光晕 1：左上电青
    final glow1 = Paint()
      ..shader = RadialGradient(
        colors: [
          AppColors.cyan.withValues(alpha: 0.16),
          AppColors.cyan.withValues(alpha: 0),
        ],
      ).createShader(Rect.fromCircle(center: Offset(size.width * 0.16, size.height * 0.12), radius: size.width * 0.42));
    canvas.drawRect(Offset.zero & size, glow1);

    // 光晕 2：右下蓝
    final glow2 = Paint()
      ..shader = RadialGradient(
        colors: [
          AppColors.blue.withValues(alpha: 0.14),
          AppColors.blue.withValues(alpha: 0),
        ],
      ).createShader(Rect.fromCircle(center: Offset(size.width * 0.86, size.height * 0.9), radius: size.width * 0.5));
    canvas.drawRect(Offset.zero & size, glow2);

    // 工程网格
    final gridPaint = Paint()
      ..color = AppColors.line.withValues(alpha: 0.16)
      ..strokeWidth = 1;
    const step = 44.0;
    for (double x = 0; x < size.width; x += step) {
      canvas.drawLine(Offset(x, 0), Offset(x, size.height), gridPaint);
    }
    for (double y = 0; y < size.height; y += step) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y), gridPaint);
    }

    // 微弱噪点（工业质感）
    final rnd = math.Random(42);
    final dot = Paint()..color = Colors.white.withValues(alpha: 0.035);
    for (int i = 0; i < 160; i++) {
      final dx = rnd.nextDouble() * size.width;
      final dy = rnd.nextDouble() * size.height;
      canvas.drawCircle(Offset(dx, dy), 0.7, dot);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}

