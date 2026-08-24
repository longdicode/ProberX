import 'dart:async';
import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../services/services.dart';
import '../theme/app_theme.dart';

/// 告警中心：未处理事件 + 告警规则
class AlertsPage extends StatefulWidget {
  final String workspaceId;
  const AlertsPage({super.key, required this.workspaceId});

  @override
  State<AlertsPage> createState() => _AlertsPageState();
}

class _AlertsPageState extends State<AlertsPage> {
  final _svc = AlertService();
  List<AlertEvent> _events = [];
  List<AlertRule> _rules = [];
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
      final events = await _svc.events(widget.workspaceId);
      List<AlertRule> rules = [];
      try {
        rules = await _svc.rules(widget.workspaceId);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _events = events;
        _rules = rules;
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

  Future<void> _resolve(AlertEvent e) async {
    try {
      await _svc.resolve(widget.workspaceId, e.ruleId, e.id);
      await _load(silent: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("已标记为已处理"), duration: Duration(seconds: 2)),
      );
    } catch (err) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("操作失败：$err"), duration: Duration(seconds: 3)),
      );
    }
  }

  Future<void> _createRule() async {
    final form = await showDialog<_RuleFormData>(
      context: context,
      builder: (ctx) => const _CreateRuleDialog(),
    );
    if (form == null || !mounted) return;
    try {
      await _svc.create(widget.workspaceId,
          name: form.name,
          metric: form.metric,
          operator: form.operator,
          threshold: form.threshold,
          durationSec: form.durationSec,
          severity: form.severity);
      await _load(silent: true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("规则已创建"), duration: Duration(seconds: 2)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("创建失败：$e"), duration: const Duration(seconds: 3)),
      );
    }
  }

  Future<void> _toggleRule(AlertRule r, bool enabled) async {
    try {
      await _svc.setEnabled(widget.workspaceId, r.id, enabled);
      await _load(silent: true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("操作失败：$e"), duration: const Duration(seconds: 3)),
      );
    }
  }

  Future<void> _deleteRule(AlertRule r) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("删除规则"),
        content: Text("确定删除「${r.name}」吗？",
            style: const TextStyle(fontSize: 13.5)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("取消")),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.red),
            child: const Text("删除"),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await _svc.delete(widget.workspaceId, r.id);
      await _load(silent: true);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("删除失败：$e"), duration: const Duration(seconds: 3)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _events.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(width: 30, height: 30, child: CircularProgressIndicator(strokeWidth: 2.5)),
            SizedBox(height: 16),
            Text("正在同步告警数据…", style: TextStyle(color: AppColors.textLow, fontSize: 13)),
          ],
        ),
      );
    }
    if (_error != null && _events.isEmpty) {
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

    final open = _events.where((e) => !e.isResolved).toList();
    final closed = _events.where((e) => e.isResolved).toList();

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            _statChip(Icons.warning_amber_rounded, "未处理 ${open.length}", AppColors.red),
            const SizedBox(width: 10),
            _statChip(Icons.check_circle_outline_rounded, "已处理 ${closed.length}", AppColors.green),
            const SizedBox(width: 10),
            _statChip(Icons.rule_rounded, "规则 ${_rules.length}", AppColors.cyan),
            const Spacer(),
            FilledButton.icon(
              onPressed: _createRule,
              icon: const Icon(Icons.add_rounded, size: 17),
              label: const Text("新建规则"),
            ),
          ],
        ),
        const SizedBox(height: 18),
        _section(
          title: "告警事件",
          icon: Icons.notifications_active_rounded,
          child: _events.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(
                    child: Text("暂无告警事件，一切正常", style: TextStyle(color: AppColors.textLow, fontSize: 13)),
                  ),
                )
              : Column(children: _events.map((e) => _eventCard(e)).toList()),
        ),
        const SizedBox(height: 18),
        _section(
          title: "告警规则",
          icon: Icons.rule_rounded,
          child: _rules.isEmpty
              ? const Padding(
                  padding: EdgeInsets.symmetric(vertical: 40),
                  child: Center(
                    child: Text("尚未配置告警规则", style: TextStyle(color: AppColors.textLow, fontSize: 13)),
                  ),
                )
              : Column(children: _rules.map((r) => _ruleRow(r)).toList()),
        ),
      ],
    );
  }

  Widget _statChip(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.09),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 7),
          Text(label,
              style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }

  Widget _section({required String title, required IconData icon, required Widget child}) {
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
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, letterSpacing: 0.4)),
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }

  Widget _eventCard(AlertEvent e) {
    final sev = e.severity.toLowerCase();
    final color = sev == "critical" || sev == "emergency"
        ? AppColors.red
        : sev == "warning"
            ? AppColors.amber
            : AppColors.blue;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.panelHi.withValues(alpha: 0.55),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: e.isResolved ? AppColors.line : color.withValues(alpha: 0.4)),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: e.isResolved ? AppColors.textLow : color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(e.ruleName ?? "未知规则",
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                    ),
                    const SizedBox(width: 8),
                    if (!e.isResolved)
                      Text(_severityLabel(e.severity),
                          style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: color, letterSpacing: 0.8)),
                  ],
                ),
                const SizedBox(height: 3),
                Text(e.message,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 12.5, color: AppColors.textMid)),
                const SizedBox(height: 3),
                Text(_fmtTime(e.createdAt),
                    style: monoStyle(10.5, color: AppColors.textLow)),
              ],
            ),
          ),
          if (!e.isResolved)
            TextButton.icon(
              onPressed: () => _resolve(e),
              icon: const Icon(Icons.done_rounded, size: 16),
              label: const Text("处理"),
              style: TextButton.styleFrom(foregroundColor: AppColors.green),
            ),
        ],
      ),
    );
  }

  Widget _ruleRow(AlertRule r) {
    final color = r.isEnabled ? AppColors.green : AppColors.textLow;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(Icons.circle, size: 7, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(r.name,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.panelHi,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: AppColors.line),
            ),
            child: Text(
              "${_metricLabel(r.metric)} ${r.operator} ${r.threshold.toStringAsFixed(r.threshold == r.threshold.roundToDouble() ? 0 : 1)}",
              style: monoStyle(11.5, color: AppColors.textMid),
            ),
          ),
          const SizedBox(width: 8),
          Switch(
            value: r.isEnabled,
            activeTrackColor: AppColors.cyan.withValues(alpha: 0.6),
            onChanged: (v) => _toggleRule(r, v),
          ),
          IconButton(
            tooltip: "删除规则",
            onPressed: () => _deleteRule(r),
            icon: const Icon(Icons.delete_outline_rounded, size: 17, color: AppColors.red),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }

  String _severityLabel(String sev) {
    switch (sev.toLowerCase()) {
      case "critical":
      case "emergency":
        return "CRITICAL";
      case "warning":
        return "WARNING";
      default:
        return sev.toUpperCase();
    }
  }

  String _metricLabel(String m) {
    switch (m) {
      case "cpu":
        return "CPU";
      case "memory":
        return "内存";
      case "disk":
        return "磁盘";
      case "network":
        return "网络";
      case "ping":
        return "PING";
      default:
        return m.toUpperCase();
    }
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

class _RuleFormData {
  final String name;
  final String metric;
  final String operator;
  final double threshold;
  final int durationSec;
  final String severity;
  _RuleFormData({
    required this.name,
    required this.metric,
    required this.operator,
    required this.threshold,
    required this.durationSec,
    required this.severity,
  });
}

class _CreateRuleDialog extends StatefulWidget {
  const _CreateRuleDialog();

  @override
  State<_CreateRuleDialog> createState() => _CreateRuleDialogState();
}

class _CreateRuleDialogState extends State<_CreateRuleDialog> {
  final _nameCtrl = TextEditingController();
  final _thresholdCtrl = TextEditingController(text: "80");
  String _metric = "cpu";
  String _operator = "gt";
  String _severity = "warning";
  int _durationSec = 0;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _thresholdCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.panel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.line),
      ),
      title: const Text("新建告警规则"),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(labelText: "名称", hintText: "例如：CPU 超标警报"),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _metric,
                      dropdownColor: AppColors.panelHi,
                      style: const TextStyle(color: AppColors.textHi, fontSize: 13.5),
                      decoration: const InputDecoration(labelText: "指标"),
                      items: const [
                        DropdownMenuItem(value: "cpu", child: Text("CPU 使用率")),
                        DropdownMenuItem(value: "memory", child: Text("内存使用率")),
                        DropdownMenuItem(value: "disk", child: Text("磁盘使用率")),
                        DropdownMenuItem(value: "network", child: Text("网络流量")),
                        DropdownMenuItem(value: "ping", child: Text("Ping 延迟")),
                      ],
                      onChanged: (v) => setState(() => _metric = v ?? "cpu"),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _operator,
                      dropdownColor: AppColors.panelHi,
                      style: const TextStyle(color: AppColors.textHi, fontSize: 13.5),
                      decoration: const InputDecoration(labelText: "运算符"),
                      items: const [
                        DropdownMenuItem(value: "gt", child: Text("> 大于")),
                        DropdownMenuItem(value: "gte", child: Text("≥ 大于等于")),
                        DropdownMenuItem(value: "lt", child: Text("< 小于")),
                        DropdownMenuItem(value: "lte", child: Text("≤ 小于等于")),
                        DropdownMenuItem(value: "eq", child: Text("= 等于")),
                        DropdownMenuItem(value: "neq", child: Text("≠ 不等于")),
                      ],
                      onChanged: (v) => setState(() => _operator = v ?? "gt"),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _thresholdCtrl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: "阈值"),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _severity,
                      dropdownColor: AppColors.panelHi,
                      style: const TextStyle(color: AppColors.textHi, fontSize: 13.5),
                      decoration: const InputDecoration(labelText: "严重度"),
                      items: const [
                        DropdownMenuItem(value: "warning", child: Text("警告")),
                        DropdownMenuItem(value: "critical", child: Text("严重")),
                        DropdownMenuItem(value: "emergency", child: Text("紧急")),
                      ],
                      onChanged: (v) => setState(() => _severity = v ?? "warning"),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      initialValue: _durationSec,
                      dropdownColor: AppColors.panelHi,
                      style: const TextStyle(color: AppColors.textHi, fontSize: 13.5),
                      decoration: const InputDecoration(labelText: "持续时间"),
                      items: [0, 60, 120, 300, 600, 1800]
                          .map((s) => DropdownMenuItem(
                              value: s, child: Text(s == 0 ? "立即" : "$s 秒")))
                          .toList(),
                      onChanged: (v) => setState(() => _durationSec = v ?? 0),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text("取消")),
        FilledButton(
          onPressed: () {
            final name = _nameCtrl.text.trim();
            final threshold = double.tryParse(_thresholdCtrl.text.trim());
            if (name.isEmpty || threshold == null) return;
            Navigator.pop(context, _RuleFormData(
              name: name,
              metric: _metric,
              operator: _operator,
              threshold: threshold,
              durationSec: _durationSec,
              severity: _severity,
            ));
          },
          child: const Text("创建"),
        ),
      ],
    );
  }
}
