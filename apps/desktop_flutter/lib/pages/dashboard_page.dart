import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../services/services.dart';
import '../theme/app_theme.dart';

/// 监控面板：总览 KPI + 服务器资源对比 + 最近活动
class DashboardPage extends StatefulWidget {
  final String workspaceId;
  const DashboardPage({super.key, required this.workspaceId});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  final _svc = DashboardService();
  DashboardStats? _stats;
  List<ServerComparison> _comparison = [];
  bool _loading = true;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => _load(silent: true));
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final stats = await _svc.stats(widget.workspaceId);
      List<ServerComparison> cmp = [];
      try {
        cmp = await _svc.serverComparison(widget.workspaceId);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _stats = stats;
        _comparison = cmp;
        _loading = false;
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = "$e";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _stats == null) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(width: 30, height: 30, child: CircularProgressIndicator(strokeWidth: 2.5)),
            SizedBox(height: 16),
            Text("正在汇总指挥数据…", style: TextStyle(color: AppColors.textLow, fontSize: 13)),
          ],
        ),
      );
    }
    if (_error != null && _stats == null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_rounded, size: 42, color: AppColors.red.withValues(alpha: 0.8)),
            const SizedBox(height: 14),
            Text(_error!, style: const TextStyle(color: AppColors.textMid, fontSize: 14)),
            const SizedBox(height: 18),
            FilledButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: const Text("重试"),
            ),
          ],
        ),
      );
    }
    final s = _stats!;
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            _kpiCard(Icons.dns_outlined, "服务器总数", s.totalServers.toString(), AppColors.cyan),
            const SizedBox(width: 14),
            _kpiCard(Icons.monitor_heart_outlined, "活跃监控任务", s.activeMonitors.toString(), AppColors.blue),
            const SizedBox(width: 14),
            _kpiCard(Icons.notifications_active_rounded, "告警规则", s.alertsTotal.toString(), AppColors.amber),
            const SizedBox(width: 14),
            _kpiCard(Icons.speed_rounded, "平均 CPU", "${s.avgCpu.toStringAsFixed(1)}%", AppColors.green),
          ],
        ),
        const SizedBox(height: 18),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 3,
              child: _sectionCard(
                title: "服务器资源对比",
                icon: Icons.equalizer_rounded,
                child: _comparison.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 36),
                        child: Center(
                          child: Text("暂无在线服务器数据", style: TextStyle(color: AppColors.textLow, fontSize: 13)),
                        ),
                      )
                    : Column(
                        children: _comparison.map((c) => _compareRow(c)).toList(),
                      ),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              flex: 2,
              child: _sectionCard(
                title: "最近活动",
                icon: Icons.bolt_rounded,
                child: s.recentActivity.isEmpty
                    ? const Padding(
                        padding: EdgeInsets.symmetric(vertical: 36),
                        child: Center(
                          child: Text("暂无活动记录", style: TextStyle(color: AppColors.textLow, fontSize: 13)),
                        ),
                      )
                    : Column(
                        children: s.recentActivity
                            .map((a) => _activityRow(a))
                            .toList(),
                      ),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _kpiCard(IconData icon, String label, String value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: AppColors.panel,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.line),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(icon, color: color, size: 21),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: const TextStyle(fontSize: 12.5, color: AppColors.textMid)),
                  const SizedBox(height: 4),
                  Text(value,
                      style: TextStyle(
                        fontFamily: 'Bahnschrift',
                        fontSize: 24,
                        fontWeight: FontWeight.w600,
                        color: AppColors.textHi,
                      )),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _sectionCard({required String title, required IconData icon, required Widget child}) {
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
              Text(title,
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w600, letterSpacing: 0.4)),
            ],
          ),
          const SizedBox(height: 16),
          child,
        ],
      ),
    );
  }

  Widget _compareRow(ServerComparison c) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(c.name,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(width: 8),
              _miniPct(c.cpu, AppColors.cyan),
              const SizedBox(width: 6),
              _miniPct(c.memory, AppColors.blue),
              const SizedBox(width: 6),
              _miniPct(c.disk, AppColors.amber),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: _bar(c.cpu, AppColors.cyan),
              ),
              const SizedBox(width: 6),
              Expanded(child: _bar(c.memory, AppColors.blue)),
              const SizedBox(width: 6),
              Expanded(child: _bar(c.disk, AppColors.amber)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _miniPct(double v, Color color) {
    return SizedBox(
      width: 44,
      child: Text(
        "${v.toStringAsFixed(0)}%",
        textAlign: TextAlign.right,
        style: monoStyle(11, color: color),
      ),
    );
  }

  Widget _bar(double v, Color color) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(4),
      child: SizedBox(
        height: 5,
        child: Stack(
          children: [
            Container(color: AppColors.lineSoft),
            FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: (v.clamp(0, 100)) / 100,
              child: Container(color: color),
            ),
          ],
        ),
      ),
    );
  }

  Widget _activityRow(RecentActivity a) {
    final online = a.isOnline;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: online ? AppColors.green : AppColors.red,
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: (online ? AppColors.green : AppColors.red).withValues(alpha: 0.5),
                  blurRadius: 6,
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(a.serverName,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
          Text(
            _fmtTime(a.timestamp),
            style: monoStyle(11, color: AppColors.textLow),
          ),
        ],
      ),
    );
  }

  String _fmtTime(DateTime t) {
    final local = t.toLocal();
    final now = DateTime.now();
    final diff = now.difference(local);
    if (diff.inMinutes < 1) return "刚刚";
    if (diff.inMinutes < 60) return "${diff.inMinutes} 分钟前";
    if (diff.inHours < 24) return "${diff.inHours} 小时前";
    return "${local.month}/${local.day} ${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}";
  }
}