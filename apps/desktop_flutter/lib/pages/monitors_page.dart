import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../services/services.dart';
import '../theme/app_theme.dart';

/// 监控任务：HTTP / TCP / Ping 探测管理
class MonitorsPage extends StatefulWidget {
  final String workspaceId;
  const MonitorsPage({super.key, required this.workspaceId});

  @override
  State<MonitorsPage> createState() => _MonitorsPageState();
}

class _MonitorsPageState extends State<MonitorsPage> {
  final _svc = MonitorService();
  List<MonitorTask> _monitors = [];
  bool _loading = true;
  String? _error;
  String? _busyId;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _svc.list(widget.workspaceId);
      if (!mounted) return;
      setState(() {
        _monitors = list;
        _loading = false;
      });
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

  Future<void> _create() async {
    final form = await showDialog<_MonitorFormData>(
      context: context,
      builder: (ctx) => const _CreateMonitorDialog(),
    );
    if (form == null || !mounted) return;
    try {
      await _svc.create(widget.workspaceId,
          name: form.name,
          type: form.type,
          target: form.target,
          intervalSec: form.intervalSec,
          timeoutMs: form.timeoutMs);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("监控任务已创建"), duration: Duration(seconds: 2)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("创建失败：$e"), duration: const Duration(seconds: 3)),
      );
    }
  }

  Future<void> _toggle(MonitorTask m, bool enabled) async {
    setState(() => _busyId = m.id);
    try {
      await _svc.setEnabled(widget.workspaceId, m.id, enabled);
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("操作失败：$e"), duration: const Duration(seconds: 3)),
      );
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  Future<void> _delete(MonitorTask m) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("删除监控任务"),
        content: Text("确定删除「${m.name}」吗？",
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
    setState(() => _busyId = m.id);
    try {
      await _svc.delete(widget.workspaceId, m.id);
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("删除失败：$e"), duration: const Duration(seconds: 3)),
      );
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  void _showResults(MonitorTask m) {
    showDialog(
      context: context,
      builder: (ctx) => _MonitorResultsDialog(
        workspaceId: widget.workspaceId,
        monitor: m,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _monitors.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(width: 30, height: 30, child: CircularProgressIndicator(strokeWidth: 2.5)),
            SizedBox(height: 16),
            Text("正在加载监控任务…", style: TextStyle(color: AppColors.textLow, fontSize: 13)),
          ],
        ),
      );
    }
    if (_error != null && _monitors.isEmpty) {
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
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Row(
          children: [
            Text("共 ${_monitors.length} 个监控任务",
                style: const TextStyle(fontSize: 12.5, color: AppColors.textMid)),
            const Spacer(),
            FilledButton.icon(
              onPressed: _create,
              icon: const Icon(Icons.add_rounded, size: 17),
              label: const Text("新建监控"),
            ),
          ],
        ),
        const SizedBox(height: 14),
        if (_monitors.isEmpty)
          Container(
            padding: const EdgeInsets.symmetric(vertical: 48),
            decoration: BoxDecoration(
              color: AppColors.panel,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: AppColors.line),
            ),
            child: const Column(
              children: [
                Icon(Icons.monitor_heart_outlined, size: 40, color: AppColors.textLow),
                SizedBox(height: 12),
                Text("还没有监控任务", style: TextStyle(color: AppColors.textMid, fontSize: 13.5)),
                SizedBox(height: 4),
                Text("新建 HTTP / TCP / Ping 探测来监控站点可用性",
                    style: TextStyle(color: AppColors.textLow, fontSize: 12)),
              ],
            ),
          )
        else
          ..._monitors.map((m) => _monitorCard(m)).toList(),
      ],
    );
  }

  Widget _monitorCard(MonitorTask m) {
    final typeColor = m.type == "http"
        ? AppColors.cyan
        : m.type == "ping"
            ? AppColors.blue
            : m.type == "tcp"
                ? AppColors.amber
                : AppColors.textMid;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: m.isEnabled ? AppColors.line : AppColors.lineSoft),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
            decoration: BoxDecoration(
              color: typeColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: typeColor.withValues(alpha: 0.4)),
            ),
            child: Text(m.type.toUpperCase(),
                style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, color: typeColor)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(m.name,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
                const SizedBox(height: 2),
                Text("${m.target} · 每 ${m.intervalSec}s · 超时 ${m.timeoutMs}ms",
                    overflow: TextOverflow.ellipsis,
                    style: monoStyle(11.5, color: AppColors.textLow)),
              ],
            ),
          ),
          IconButton(
            tooltip: "最近结果",
            onPressed: () => _showResults(m),
            icon: const Icon(Icons.query_stats_rounded, size: 18, color: AppColors.textMid),
            visualDensity: VisualDensity.compact,
          ),
          Switch(
            value: m.isEnabled,
            activeTrackColor: AppColors.cyan.withValues(alpha: 0.6),
            onChanged: _busyId == m.id ? null : (v) => _toggle(m, v),
          ),
          IconButton(
            tooltip: "删除",
            onPressed: _busyId == m.id ? null : () => _delete(m),
            icon: const Icon(Icons.delete_outline_rounded, size: 18, color: AppColors.red),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

class _MonitorFormData {
  final String name;
  final String type;
  final String target;
  final int intervalSec;
  final int timeoutMs;
  _MonitorFormData({
    required this.name,
    required this.type,
    required this.target,
    required this.intervalSec,
    required this.timeoutMs,
  });
}

class _CreateMonitorDialog extends StatefulWidget {
  const _CreateMonitorDialog();

  @override
  State<_CreateMonitorDialog> createState() => _CreateMonitorDialogState();
}

class _CreateMonitorDialogState extends State<_CreateMonitorDialog> {
  final _nameCtrl = TextEditingController();
  final _targetCtrl = TextEditingController();
  String _type = "http";
  int _intervalSec = 60;
  int _timeoutMs = 5000;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _targetCtrl.dispose();
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
      title: const Text("新建监控任务"),
      content: SizedBox(
        width: 420,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextField(
                controller: _nameCtrl,
                decoration: const InputDecoration(labelText: "名称", hintText: "例如：官网可用性"),
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<String>(
                initialValue: _type,
                dropdownColor: AppColors.panelHi,
                style: const TextStyle(color: AppColors.textHi, fontSize: 13.5),
                decoration: const InputDecoration(labelText: "类型"),
                items: const [
                  DropdownMenuItem(value: "http", child: Text("HTTP(S) 探测")),
                  DropdownMenuItem(value: "tcp", child: Text("TCP 端口探测")),
                  DropdownMenuItem(value: "ping", child: Text("Ping 延迟探测")),
                  DropdownMenuItem(value: "dns", child: Text("DNS 解析")),
                ],
                onChanged: (v) => setState(() => _type = v ?? "http"),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _targetCtrl,
                decoration: InputDecoration(
                  labelText: "目标",
                  hintText: _type == "http" ? "https://example.com" : _type == "tcp" ? "host:port" : "域名或 IP",
                ),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      initialValue: _intervalSec,
                      dropdownColor: AppColors.panelHi,
                      style: const TextStyle(color: AppColors.textHi, fontSize: 13.5),
                      decoration: const InputDecoration(labelText: "间隔"),
                      items: [30, 60, 120, 300, 600, 1800]
                          .map((s) => DropdownMenuItem(value: s, child: Text("$s 秒")))
                          .toList(),
                      onChanged: (v) => setState(() => _intervalSec = v ?? 60),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: DropdownButtonFormField<int>(
                      initialValue: _timeoutMs,
                      dropdownColor: AppColors.panelHi,
                      style: const TextStyle(color: AppColors.textHi, fontSize: 13.5),
                      decoration: const InputDecoration(labelText: "超时"),
                      items: [2000, 5000, 10000, 20000, 30000]
                          .map((ms) => DropdownMenuItem(value: ms, child: Text("${ms ~/ 1000} 秒")))
                          .toList(),
                      onChanged: (v) => setState(() => _timeoutMs = v ?? 5000),
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
            final target = _targetCtrl.text.trim();
            if (name.isEmpty || target.isEmpty) return;
            Navigator.pop(context, _MonitorFormData(
              name: name,
              type: _type,
              target: target,
              intervalSec: _intervalSec,
              timeoutMs: _timeoutMs,
            ));
          },
          child: const Text("创建"),
        ),
      ],
    );
  }
}

class _MonitorResultsDialog extends StatefulWidget {
  final String workspaceId;
  final MonitorTask monitor;
  const _MonitorResultsDialog({required this.workspaceId, required this.monitor});

  @override
  State<_MonitorResultsDialog> createState() => _MonitorResultsDialogState();
}

class _MonitorResultsDialogState extends State<_MonitorResultsDialog> {
  List<ProbeResult> _results = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final results = await MonitorService()
          .results(widget.workspaceId, widget.monitor.id);
      if (!mounted) return;
      setState(() {
        _results = results;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = "$e";
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: AppColors.panel,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: const BorderSide(color: AppColors.line),
      ),
      child: SizedBox(
        width: 640,
        height: 480,
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.fromLTRB(18, 14, 12, 14),
              decoration: BoxDecoration(
                border: Border(bottom: BorderSide(color: AppColors.lineSoft)),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text("${widget.monitor.name} · 最近探测",
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14.5, fontWeight: FontWeight.w600)),
                  ),
                  IconButton(
                    tooltip: "刷新",
                    onPressed: _load,
                    icon: const Icon(Icons.refresh_rounded, size: 18, color: AppColors.textMid),
                  ),
                  IconButton(
                    tooltip: "关闭",
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded, size: 18, color: AppColors.textMid),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(
                      child: SizedBox(
                          width: 26, height: 26, child: CircularProgressIndicator(strokeWidth: 2.5)))
                  : _error != null
                      ? Center(
                          child: Text(_error!,
                              style: const TextStyle(color: AppColors.textMid, fontSize: 13)))
                      : _results.isEmpty
                          ? const Center(
                              child: Text("暂无探测结果",
                                  style: TextStyle(color: AppColors.textLow, fontSize: 13)))
                          : ListView.separated(
                              padding: const EdgeInsets.all(14),
                              itemCount: _results.length,
                              separatorBuilder: (_, __) => const Divider(height: 1),
                              itemBuilder: (ctx, i) => _resultRow(_results[i]),
                            ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _resultRow(ProbeResult r) {
    final ok = r.isSuccess;
    final color = ok ? AppColors.green : AppColors.red;
    final t = r.time.toLocal();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(ok ? Icons.check_circle_rounded : Icons.cancel_rounded,
              size: 15, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              r.errorMsg != null && r.errorMsg!.isNotEmpty ? r.errorMsg! : (ok ? "成功" : "失败"),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 12.5, color: ok ? AppColors.textHi : AppColors.textMid),
            ),
          ),
          const SizedBox(width: 10),
          if (r.responseMs != null)
            Text("${r.responseMs}ms",
                style: monoStyle(11.5, color: ok ? AppColors.green : AppColors.textLow)),
          if (r.statusCode != null) ...[
            const SizedBox(width: 8),
            Text("HTTP ${r.statusCode}", style: monoStyle(11.5, color: AppColors.textLow)),
          ],
          const SizedBox(width: 10),
          Text(
            "${t.month}/${t.day} ${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}:${t.second.toString().padLeft(2, '0')}",
            style: monoStyle(10.5, color: AppColors.textLow),
          ),
        ],
      ),
    );
  }
}