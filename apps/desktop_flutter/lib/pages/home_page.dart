import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../models/models.dart';
import '../services/services.dart';
import '../theme/app_theme.dart';
import 'login_page.dart';
import 'server_detail_page.dart';
import 'dashboard_page.dart';
import 'alerts_page.dart';
import 'settings_page.dart';
import 'monitors_page.dart';
import '../widgets/update_dialog.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _workspaceSvc = WorkspaceService();
  final _serverSvc = ServerService();

  List<Workspace> _workspaces = [];
  List<Server> _servers = [];
  String? _selectedWorkspaceId;
  bool _loading = true;
  bool _refreshing = false;
  String? _error;

  int _navIndex = 0;
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadWorkspaces();
    WidgetsBinding.instance.addPostFrameCallback((_) => _autoCheckUpdate());
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _autoCheckUpdate() async {
    await Future.delayed(const Duration(seconds: 5));
    if (!mounted) return;
    await checkAndPromptUpdate(context, silent: true);
  }

  Future<void> _loadWorkspaces() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final ws = await _workspaceSvc.list();
      setState(() {
        _workspaces = ws;
        _loading = false;
        if (ws.isNotEmpty) _selectedWorkspaceId = ws.first.id;
      });
      if (ws.isNotEmpty) await _loadServers();
    } on ApiException catch (e) {
      setState(() {
        _loading = false;
        _error = e.message;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = "加载失败：$e";
      });
    }
  }

  Future<void> _loadServers() async {
    final wid = _selectedWorkspaceId;
    if (wid == null) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _serverSvc.list(wid);
      setState(() {
        _servers = list;
        _loading = false;
        _refreshing = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _loading = false;
        _refreshing = false;
        _error = e.message;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _refreshing = false;
        _error = "加载失败：$e";
      });
    }
  }

  Future<void> _refresh() async {
    setState(() => _refreshing = true);
    await _loadServers();
  }

  Future<void> _logout() async {
    await AuthService().logout();
    if (!mounted) return;
    Navigator.of(context).pushAndRemoveUntil(
      PageRouteBuilder(
        pageBuilder: (_, __, ___) => const LoginPage(),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
        transitionDuration: const Duration(milliseconds: 240),
      ),
      (_) => false,
    );
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final filtered = _servers
        .where(
          (s) =>
              _searchCtrl.text.isEmpty ||
              s.name.toLowerCase().contains(_searchCtrl.text.toLowerCase()) ||
              s.host.toLowerCase().contains(_searchCtrl.text.toLowerCase()),
        )
        .toList();

    return Scaffold(
      body: Row(
        children: [
          // ── 左侧窄导航 ──
          Container(
            width: 64,
            decoration: BoxDecoration(
              color: AppColors.panel,
              border: Border(
                right: BorderSide(color: AppColors.line.withValues(alpha: 0.7)),
              ),
            ),
            child: Column(
              children: [
                const SizedBox(height: 14),
                Container(
                  width: 38,
                  height: 38,
                  decoration: BoxDecoration(
                    gradient: AppColors.brandGradient,
                    borderRadius: BorderRadius.circular(11),
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.cyan.withValues(alpha: 0.3),
                        blurRadius: 14,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.hub_rounded,
                    size: 21,
                    color: Color(0xFF062019),
                  ),
                ),
                const SizedBox(height: 26),
                _railItem(Icons.dns_outlined, "服务器", 0),
                const SizedBox(height: 6),
                _railItem(Icons.monitor_heart_outlined, "监控面板", 1),
                const SizedBox(height: 6),
                _railItem(Icons.radar_rounded, "监控任务", 2),
                const SizedBox(height: 6),
                _railItem(Icons.notifications_none_rounded, "告警", 3),
                const Spacer(),
                _railItem(Icons.tune_rounded, "设置", 4),
                const SizedBox(height: 6),
                _railItem(Icons.logout_rounded, "退出", 4, onTap: _logout),
                const SizedBox(height: 16),
              ],
            ),
          ),
          // ── 主内容区 ──
          Expanded(
            child: Column(
              children: [
                _topBar(),
                const Divider(height: 1),
                Expanded(child: _body(scheme, filtered)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── 顶部栏 ──
  Widget _topBar() {
    const titles = ["服务器", "监控面板", "监控任务", "告警", "设置"];
    final title = titles[_navIndex];
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: AppColors.panel.withValues(alpha: 0.6),
        border: Border(
          bottom: BorderSide(color: AppColors.line.withValues(alpha: 0.6)),
        ),
      ),
      child: Row(
        children: [
          Text(
            title,
            style: const TextStyle(
              fontFamily: 'Bahnschrift',
              fontSize: 21,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.5,
            ),
          ),
          if (_navIndex == 0) ...[
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.cyan.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: AppColors.cyan.withValues(alpha: 0.35),
                ),
              ),
              child: Text(
                "${_servers.length}",
                style: monoStyle(12, color: AppColors.cyan),
              ),
            ),
            const Spacer(),
            // 工作区下拉
            if (_workspaces.isNotEmpty)
              Container(
                padding: const EdgeInsets.only(left: 4),
                decoration: BoxDecoration(
                  color: AppColors.panelHi,
                  borderRadius: BorderRadius.circular(9),
                  border: Border.all(color: AppColors.line),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _selectedWorkspaceId,
                    borderRadius: BorderRadius.circular(10),
                    dropdownColor: AppColors.panelHi,
                    icon: const Icon(
                      Icons.expand_more,
                      size: 18,
                      color: AppColors.textMid,
                    ),
                    style: const TextStyle(
                      color: AppColors.textHi,
                      fontSize: 13.5,
                    ),
                    items: _workspaces
                        .map(
                          (w) => DropdownMenuItem(
                            value: w.id,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(
                                horizontal: 10,
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(
                                    Icons.folder_outlined,
                                    size: 15,
                                    color: AppColors.textMid,
                                  ),
                                  const SizedBox(width: 8),
                                  Text(w.name),
                                ],
                              ),
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: (v) {
                      if (v == null) return;
                      setState(() => _selectedWorkspaceId = v);
                      _loadServers();
                    },
                  ),
                ),
              ),
            const SizedBox(width: 12),
            SizedBox(
              width: 230,
              child: TextField(
                controller: _searchCtrl,
                style: const TextStyle(fontSize: 13.5),
                decoration: InputDecoration(
                  hintText: "搜索服务器…",
                  prefixIcon: const Icon(
                    Icons.search,
                    size: 18,
                    color: AppColors.textLow,
                  ),
                  contentPadding: const EdgeInsets.symmetric(vertical: 10),
                  isDense: true,
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
            const SizedBox(width: 10),
            IconButton(
              tooltip: "刷新",
              onPressed: _refreshing ? null : _refresh,
              style: IconButton.styleFrom(
                backgroundColor: AppColors.panelHi,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(9),
                  side: const BorderSide(color: AppColors.line),
                ),
              ),
              icon: _refreshing
                  ? const SizedBox(
                      width: 17,
                      height: 17,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(
                      Icons.refresh_rounded,
                      size: 19,
                      color: AppColors.textHi,
                    ),
            ),
          ] else ...[
            const Spacer(),
            Text(
              _navIndex == 4 ? "客户端本地设置" : "每 30 秒自动刷新",
              style: const TextStyle(fontSize: 12, color: AppColors.textLow),
            ),
          ],
        ],
      ),
    );
  }

  // ── 主体 ──  // ── 主体 ──
  Widget _body(ColorScheme scheme, List<Server> filtered) {
    final wid = _selectedWorkspaceId;
    if (wid == null) {
      return const Center(
        child: Text(
          "未找到工作区",
          style: TextStyle(color: AppColors.textMid, fontSize: 14),
        ),
      );
    }
    if (_navIndex == 1) {
      return DashboardPage(key: ValueKey("dash-$wid"), workspaceId: wid);
    }
    if (_navIndex == 2) {
      return MonitorsPage(key: ValueKey("monitors-$wid"), workspaceId: wid);
    }
    if (_navIndex == 3) {
      return AlertsPage(key: ValueKey("alerts-$wid"), workspaceId: wid);
    }
    if (_navIndex == 4) {
      return SettingsPage(onLogout: _logout);
    }
    if (_loading) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(
              width: 30,
              height: 30,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
            SizedBox(height: 16),
            Text(
              "正在连接指挥中心…",
              style: TextStyle(color: AppColors.textLow, fontSize: 13),
            ),
          ],
        ),
      );
    }
    if (_error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.cloud_off_rounded,
              size: 42,
              color: AppColors.red.withValues(alpha: 0.8),
            ),
            const SizedBox(height: 14),
            Text(
              _error!,
              style: const TextStyle(color: AppColors.textMid, fontSize: 14),
            ),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _loadWorkspaces,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text("重新连接"),
            ),
          ],
        ),
      );
    }
    if (filtered.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.dns_outlined,
              size: 44,
              color: AppColors.textLow.withValues(alpha: 0.7),
            ),
            const SizedBox(height: 14),
            const Text(
              "暂无服务器",
              style: TextStyle(color: AppColors.textMid, fontSize: 14),
            ),
            if (_searchCtrl.text.isNotEmpty) ...[
              const SizedBox(height: 6),
              const Text(
                "没有匹配的搜索结果",
                style: TextStyle(color: AppColors.textLow, fontSize: 12.5),
              ),
            ],
          ],
        ),
      );
    }
    return LayoutBuilder(
      builder: (ctx, cons) {
        final width = cons.maxWidth;
        final cols = width >= 1400 ? 4 : (width >= 1000 ? 3 : 2);
        return GridView.builder(
          padding: const EdgeInsets.all(20),
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: cols,
            mainAxisSpacing: 16,
            crossAxisSpacing: 16,
            childAspectRatio: 1.9,
          ),
          itemCount: filtered.length,
          itemBuilder: (ctx, i) => _ServerCard(
            server: filtered[i],
            workspaceId: _selectedWorkspaceId!,
            onChanged: _refresh,
            onTap: () {
              Navigator.of(context).push(
                PageRouteBuilder(
                  pageBuilder: (_, __, ___) => ServerDetailPage(
                    workspaceId: _selectedWorkspaceId!,
                    server: filtered[i],
                  ),
                  transitionsBuilder: (_, anim, __, child) => FadeTransition(
                    opacity: anim,
                    child: SlideTransition(
                      position:
                          Tween(
                            begin: const Offset(0.03, 0),
                            end: Offset.zero,
                          ).animate(
                            CurvedAnimation(
                              parent: anim,
                              curve: Curves.easeOutCubic,
                            ),
                          ),
                      child: child,
                    ),
                  ),
                  transitionDuration: const Duration(milliseconds: 240),
                ),
              );
            },
          ),
        );
      },
    );
  }

  // ── 侧边导航项 ──  // ── 侧边导航项 ──
  Widget _railItem(
    IconData icon,
    String label,
    int index, {
    VoidCallback? onTap,
  }) {
    final active = _navIndex == index;
    return Tooltip(
      message: label,
      waitDuration: const Duration(milliseconds: 400),
      child: MouseRegion(
        cursor: SystemMouseCursors.click,
        child: GestureDetector(
          onTap: () {
            if (onTap != null) {
              onTap();
              return;
            }
            setState(() => _navIndex = index);
          },
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: active
                  ? AppColors.cyan.withValues(alpha: 0.12)
                  : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: active
                    ? AppColors.cyan.withValues(alpha: 0.4)
                    : Colors.transparent,
              ),
            ),
            child: Icon(
              icon,
              size: 21,
              color: active ? AppColors.cyan : AppColors.textLow,
            ),
          ),
        ),
      ),
    );
  }
}

/// 服务器卡片
class _ServerCard extends StatefulWidget {
  final Server server;
  final String workspaceId;
  final VoidCallback onChanged;
  final VoidCallback onTap;
  const _ServerCard({
    required this.server,
    required this.workspaceId,
    required this.onChanged,
    required this.onTap,
  });

  @override
  State<_ServerCard> createState() => _ServerCardState();
}

class _ServerCardState extends State<_ServerCard> {
  bool _hover = false;

  String get _osLabel {
    final info = widget.server.hostInfo;
    if (info == null) return widget.server.os ?? "未知系统";
    final platform = info["platform"]?.toString() ?? info["os"]?.toString();
    if (platform != null && platform.isNotEmpty) return platform;
    return widget.server.os ?? "未知系统";
  }

  String get _ipLabel => widget.server.ip ?? widget.server.host;

  String _fmtDate(DateTime d) =>
      "${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}";

  Widget _expiryButton(BuildContext context) {
    final has = widget.server.expiresAt != null;
    return Tooltip(
      message: "设置到期时间",
      child: InkWell(
        borderRadius: BorderRadius.circular(7),
        onTap: () => _setExpiry(context),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: AppColors.panelHi.withValues(alpha: 0.8),
            borderRadius: BorderRadius.circular(7),
            border: Border.all(color: AppColors.line),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.event_outlined, size: 12.5, color: AppColors.textLow),
              const SizedBox(width: 5),
              Text(
                has ? "修改到期" : "设置到期",
                style: const TextStyle(fontSize: 11.5, color: AppColors.textMid),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _setExpiry(BuildContext context) async {
    final s = widget.server;
    DateTime? current;
    final raw = s.expiresAt;
    if (raw != null) current = DateTime.tryParse(raw)?.toLocal();
    var clear = false;
    DateTime? picked;
    final result = await showDialog<bool?>(
      context: context,
      builder: (ctx) {
        return AlertDialog(
          backgroundColor: AppColors.panelHi,
          title: const Text("设置到期时间"),
          content: Text(
            current == null ? "当前未设置到期时间" : "当前到期：${_fmtDate(current!)}",
            style: const TextStyle(color: AppColors.textMid, fontSize: 13.5),
          ),
          actions: [
            if (current != null)
              TextButton(
                onPressed: () {
                  clear = true;
                  Navigator.pop(ctx, true);
                },
                child: const Text("清除到期", style: TextStyle(color: AppColors.red)),
              ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text("取消"),
            ),
            FilledButton.icon(
              icon: const Icon(Icons.event_rounded, size: 17),
              label: const Text("选择日期…"),
              onPressed: () async {
                final now = DateTime.now();
                final first = DateTime(now.year - 1, now.month, now.day);
                final last = DateTime(now.year + 3, now.month, now.day);
                var init = current ?? now;
                if (init.isBefore(first)) init = first;
                if (init.isAfter(last)) init = last;
                final d = await showDatePicker(
                  context: ctx,
                  initialDate: init,
                  firstDate: first,
                  lastDate: last,
                  helpText: "选择到期日期",
                  cancelText: "取消",
                  confirmText: "确定",
                );
                if (d != null) {
                  picked = d;
                  if (ctx.mounted) Navigator.pop(ctx, true);
                }
              },
            ),
          ],
        );
      },
    );
    if (result != true) return;

    final value = clear ? null : _fmtDate(picked ?? current ?? DateTime.now());
    try {
      await ServerService().setExpiry(widget.workspaceId, s.id, value);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          backgroundColor: AppColors.panelHi,
          content: Text(value == null ? "已清除到期时间" : "已保存到期时间：$value"),
          duration: const Duration(seconds: 2),
        ),
      );
      widget.onChanged();
    } on ApiException catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("保存失败：${e.message}")),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.server;
    final online = s.online;
    return MouseRegion(
      onEnter: (_) => setState(() => _hover = true),
      onExit: (_) => setState(() => _hover = false),
      cursor: SystemMouseCursors.click,
      child: GestureDetector(
        onTap: widget.onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 160),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: _hover ? AppColors.panelHi : AppColors.panel,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: _hover
                  ? AppColors.cyan.withValues(alpha: 0.45)
                  : AppColors.line,
            ),
            boxShadow: _hover
                ? [
                    BoxShadow(
                      color: AppColors.cyan.withValues(alpha: 0.08),
                      blurRadius: 20,
                      offset: const Offset(0, 8),
                    ),
                  ]
                : null,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  _StatusDot(online: online),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      s.name,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 15.5,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 9,
                      vertical: 3,
                    ),
                    decoration: BoxDecoration(
                      color: (online ? AppColors.green : AppColors.red)
                          .withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: (online ? AppColors.green : AppColors.red)
                            .withValues(alpha: 0.35),
                      ),
                    ),
                    child: Text(
                      online ? "ONLINE" : "OFFLINE",
                      style: TextStyle(
                        fontSize: 10.5,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 1,
                        color: online ? AppColors.green : AppColors.red,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                s.host,
                overflow: TextOverflow.ellipsis,
                style: monoStyle(12.5, color: AppColors.textMid),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  if (s.expiresAt != null) ...[_ExpiryBadge(expiresAt: s.expiresAt!), const SizedBox(width: 6)],
                  _expiryButton(context),
                ],
              ),
              const Spacer(),
              Row(
                children: [
                  _chip(Icons.memory_rounded, _osLabel),
                  const SizedBox(width: 8),
                  if (s.region != null) ...[
                    _chip(Icons.public_rounded, s.region!),
                    const SizedBox(width: 8),
                  ],
                  _chip(Icons.lan_rounded, _ipLabel),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _chip(IconData icon, String text) {
    return Flexible(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: AppColors.panelHi.withValues(alpha: 0.8),
          borderRadius: BorderRadius.circular(7),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12.5, color: AppColors.textLow),
            const SizedBox(width: 5),
            Flexible(
              child: Text(
                text,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 11.5,
                  color: AppColors.textMid,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 到期时间相关：设置弹窗 / 徽标
class _ExpiryBadge extends StatelessWidget {
  final String expiresAt;
  const _ExpiryBadge({required this.expiresAt});

  @override
  Widget build(BuildContext context) {
    final raw = expiresAt.length >= 10 ? expiresAt.substring(0, 10) : expiresAt;
    final parsed = DateTime.tryParse(raw);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = parsed == null
        ? today
        : DateTime(parsed.year, parsed.month, parsed.day);
    final days = target.difference(today).inDays;
    final Color color = days < 0
        ? AppColors.red
        : days <= 7
            ? AppColors.amber
            : AppColors.textLow;
    final String label = days < 0
        ? "已过期 ${-days} 天"
        : days == 0
            ? "今天到期"
            : "剩余 $days 天";
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.schedule_rounded, size: 12, color: color),
          const SizedBox(width: 4),
          Text(
            "$label · $raw",
            style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// 状态呼吸灯
class _StatusDot extends StatelessWidget {
  final bool online;
  const _StatusDot({required this.online});

  @override
  Widget build(BuildContext context) {
    final color = online ? AppColors.green : AppColors.red;
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.55),
            blurRadius: 7,
            spreadRadius: 1,
          ),
        ],
      ),
    );
  }
}
