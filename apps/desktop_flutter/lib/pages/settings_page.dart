import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../theme/app_theme.dart';
import '../services/update_service.dart';
import '../widgets/update_dialog.dart';

/// 设置：API 地址 / 关于
class SettingsPage extends StatefulWidget {
  final VoidCallback onLogout;
  const SettingsPage({super.key, required this.onLogout});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  late final TextEditingController _apiCtrl;
  bool _saving = false;
  bool _checking = false;

  @override
  void initState() {
    super.initState();
    _apiCtrl = TextEditingController(text: ApiConfig.baseUrl);
  }

  @override
  void dispose() {
    _apiCtrl.dispose();
    super.dispose();
  }

  Future<void> _saveApi() async {
    final url = _apiCtrl.text.trim();
    if (url.isEmpty) return;
    setState(() => _saving = true);
    await SessionStore.instance.saveApiUrl(url);
    setState(() => _saving = false);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text("API 地址已保存，下次启动生效"),
        duration: Duration(seconds: 2),
      ),
    );
  }

  Future<void> _checkUpdate() async {
    setState(() => _checking = true);
    await checkAndPromptUpdate(context);
    if (mounted) setState(() => _checking = false);
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        _card(
          icon: Icons.dns_rounded,
          title: "API 服务器",
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                "后端 API 基地址（重启后生效）",
                style: TextStyle(fontSize: 12.5, color: AppColors.textMid),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _apiCtrl,
                      decoration: const InputDecoration(
                        hintText: "https://agent.yqone.cn/api/v1",
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  FilledButton(
                    onPressed: _saving ? null : _saveApi,
                    child: Text(_saving ? "保存中…" : "保存"),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                "当前：${ApiConfig.baseUrl}",
                style: monoStyle(11.5, color: AppColors.textLow),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const SizedBox(height: 16),
        _card(
          icon: Icons.system_update_alt_rounded,
          title: "更新",
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                "当前版本 v${UpdateService.kAppVersion}，点击检查服务器上的新版本。",
                style: const TextStyle(
                  fontSize: 12.5,
                  color: AppColors.textMid,
                ),
              ),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: _checking ? null : _checkUpdate,
                icon: _checking
                    ? const SizedBox(
                        width: 14,
                        height: 14,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.cyan,
                        ),
                      )
                    : const Icon(Icons.system_update_alt_rounded, size: 17),
                label: Text(_checking ? "检查中..." : "检查更新"),
              ),
            ],
          ),
        ),
        _card(
          icon: Icons.info_outline_rounded,
          title: "关于",
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _infoRow("产品", "ProberX 桌面客户端"),
              _infoRow("版本", "v${UpdateService.kAppVersion} (native)"),
              _infoRow("框架", "Flutter Windows"),
              _infoRow("工作区", "服务器监控 · 告警 · 运维中台"),
            ],
          ),
        ),
        const SizedBox(height: 16),
        _card(
          icon: Icons.logout_rounded,
          title: "会话",
          child: Row(
            children: [
              Expanded(
                child: Text(
                  "退出登录将清除本地令牌，重新输入账号密码后继续使用。",
                  style: TextStyle(fontSize: 12.5, color: AppColors.textMid),
                ),
              ),
              OutlinedButton.icon(
                onPressed: widget.onLogout,
                icon: const Icon(Icons.logout_rounded, size: 17),
                label: const Text("退出登录"),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.red,
                  side: BorderSide(color: AppColors.red.withValues(alpha: 0.5)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _card({
    required IconData icon,
    required String title,
    required Widget child,
  }) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: AppColors.cyan),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.4,
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }

  Widget _infoRow(String k, String v) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          SizedBox(
            width: 90,
            child: Text(
              k,
              style: const TextStyle(fontSize: 12.5, color: AppColors.textLow),
            ),
          ),
          Text(
            v,
            style: const TextStyle(fontSize: 12.5, color: AppColors.textMid),
          ),
        ],
      ),
    );
  }
}
