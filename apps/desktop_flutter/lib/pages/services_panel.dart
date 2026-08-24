import 'package:flutter/material.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../services/services.dart';
import '../theme/app_theme.dart';

/// systemd 服务管理面板（服务器详情页 Tab）
class ServicesPanel extends StatefulWidget {
  final String workspaceId;
  final String serverId;
  const ServicesPanel({super.key, required this.workspaceId, required this.serverId});

  @override
  State<ServicesPanel> createState() => _ServicesPanelState();
}

class _ServicesPanelState extends State<ServicesPanel> {
  final _svc = SystemdService();
  List<ServiceUnit> _units = [];
  bool _loading = true;
  String? _error;
  String _query = "";
  String? _busyAction; // 正在执行的控制操作（服务名:动作）

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
      final units = await _svc.list(widget.workspaceId, widget.serverId);
      if (!mounted) return;
      setState(() {
        _units = units;
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

  List<ServiceUnit> get _filtered {
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return _units;
    return _units
        .where((u) =>
            u.name.toLowerCase().contains(q) || u.description.toLowerCase().contains(q))
        .toList();
  }

  Future<void> _control(ServiceUnit unit, String action) async {
    final labels = {"start": "启动", "stop": "停止", "restart": "重启", "reload": "重载"};
    final confirmed = action == "start"
        ? true
        : await showDialog<bool>(
            context: context,
            builder: (ctx) => AlertDialog(
              title: Text("${labels[action] ?? action} 服务"),
              content: Text("确定要对 ${unit.name} 执行 ${labels[action] ?? action} 操作吗？",
                  style: const TextStyle(fontSize: 13.5)),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("取消")),
                FilledButton(
                  onPressed: () => Navigator.pop(ctx, true),
                  style: FilledButton.styleFrom(
                      backgroundColor: action == "stop" ? AppColors.red : AppColors.cyan),
                  child: const Text("确定"),
                ),
              ],
            ),
          );
    if (confirmed != true || !mounted) return;
    final key = "${unit.name}:$action";
    setState(() => _busyAction = key);
    try {
      final result = await _svc.control(widget.workspaceId, widget.serverId,
          name: unit.name, action: action);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text("${labels[action] ?? action}成功：${result.output.isEmpty ? unit.name : result.output}"),
          duration: const Duration(seconds: 2),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("操作失败：${e.message}"), duration: const Duration(seconds: 3)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("操作失败：$e"), duration: const Duration(seconds: 3)),
      );
    } finally {
      if (mounted) setState(() => _busyAction = null);
    }
  }

  void _showDetail(ServiceUnit unit) {
    showDialog(
      context: context,
      builder: (ctx) => _ServiceDetailDialog(
        workspaceId: widget.workspaceId,
        serverId: widget.serverId,
        unit: unit,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loading && _units.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SizedBox(width: 30, height: 30, child: CircularProgressIndicator(strokeWidth: 2.5)),
            SizedBox(height: 16),
            Text("正在读取 systemd 服务…", style: TextStyle(color: AppColors.textLow, fontSize: 13)),
          ],
        ),
      );
    }
    if (_error != null && _units.isEmpty) {
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
    final filtered = _filtered;
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  style: const TextStyle(fontSize: 13),
                  decoration: InputDecoration(
                    hintText: "搜索服务…（共 ${_units.length} 个）",
                    prefixIcon: const Icon(Icons.search, size: 17, color: AppColors.textLow),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 10),
                  ),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              const SizedBox(width: 10),
              IconButton(
                tooltip: "刷新",
                onPressed: _load,
                style: IconButton.styleFrom(
                  backgroundColor: AppColors.panelHi,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(9),
                    side: const BorderSide(color: AppColors.line),
                  ),
                ),
                icon: const Icon(Icons.refresh_rounded, size: 18, color: AppColors.textHi),
              ),
            ],
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? const Center(
                  child: Text("没有匹配的服务", style: TextStyle(color: AppColors.textLow, fontSize: 13)))
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
                  itemCount: filtered.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (ctx, i) => _unitRow(filtered[i]),
                ),
        ),
      ],
    );
  }

  Widget _unitRow(ServiceUnit u) {
    final statusColor = u.isActive
        ? AppColors.green
        : u.isFailed
            ? AppColors.red
            : AppColors.textLow;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.line),
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: statusColor,
              shape: BoxShape.circle,
              boxShadow: [BoxShadow(color: statusColor.withValues(alpha: 0.5), blurRadius: 5)],
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(u.name,
                    overflow: TextOverflow.ellipsis,
                    style: monoStyle(13, color: AppColors.textHi)),
                if (u.description.isNotEmpty)
                  Text(u.description,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 11.5, color: AppColors.textLow)),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(
            u.isActive ? u.subState.toUpperCase() : u.activeState.toUpperCase(),
            style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 0.8, color: statusColor),
          ),
          const SizedBox(width: 8),
          IconButton(
            tooltip: "详情 / 控制 / 日志",
            onPressed: () => _showDetail(u),
            icon: const Icon(Icons.open_in_new_rounded, size: 16, color: AppColors.textMid),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }
}

/// 服务详情对话框：状态 + 日志 + 控制
class _ServiceDetailDialog extends StatefulWidget {
  final String workspaceId;
  final String serverId;
  final ServiceUnit unit;
  const _ServiceDetailDialog({
    required this.workspaceId,
    required this.serverId,
    required this.unit,
  });

  @override
  State<_ServiceDetailDialog> createState() => _ServiceDetailDialogState();
}

class _ServiceDetailDialogState extends State<_ServiceDetailDialog> {
  final _svc = SystemdService();
  String? _statusText;
  List<LogEntry> _logs = [];
  bool _loading = true;
  String? _error;
  String? _busy;

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
      final status = await _svc.status(widget.workspaceId, widget.serverId, widget.unit.name);
      List<LogEntry> logs = [];
      try {
        logs = await _svc.logs(widget.workspaceId, widget.serverId,
            unit: widget.unit.name, lines: 100);
      } catch (_) {}
      if (!mounted) return;
      setState(() {
        _statusText = status.output;
        _logs = logs;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loading = false;
        _error = "$e";
      });
    }
  }

  Future<void> _control(String action) async {
    final labels = {"start": "启动", "stop": "停止", "restart": "重启", "reload": "重载"};
    final key = action;
    setState(() => _busy = key);
    try {
      await _svc.control(widget.workspaceId, widget.serverId, name: widget.unit.name, action: action);
      await _load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("${labels[action] ?? action} 成功"), duration: const Duration(seconds: 2)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("操作失败：$e"), duration: const Duration(seconds: 3)),
      );
    } finally {
      if (mounted) setState(() => _busy = null);
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
        width: 760,
        height: 560,
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
                    child: Text(widget.unit.name,
                        overflow: TextOverflow.ellipsis,
                        style: monoStyle(15, color: AppColors.textHi, weight: FontWeight.w600)),
                  ),
                  _actionBtn("启动", "start", AppColors.green),
                  const SizedBox(width: 6),
                  _actionBtn("重启", "restart", AppColors.cyan),
                  const SizedBox(width: 6),
                  _actionBtn("停止", "stop", AppColors.red),
                  const SizedBox(width: 6),
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
                      : ListView(
                          padding: const EdgeInsets.all(14),
                          children: [
                            const Text("状态",
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.cyan)),
                            const SizedBox(height: 8),
                            Container(
                              width: double.maxFinite,
                              constraints: const BoxConstraints(maxHeight: 180),
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xFF070B13),
                                borderRadius: BorderRadius.circular(9),
                                border: Border.all(color: AppColors.lineSoft),
                              ),
                              child: SingleChildScrollView(
                                child: SelectableText(_statusText ?? "",
                                    style: monoStyle(11.5, color: AppColors.textMid)),
                              ),
                            ),
                            const SizedBox(height: 14),
                            const Text("最近日志（journalctl 100 行）",
                                style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppColors.cyan)),
                            const SizedBox(height: 8),
                            if (_logs.isEmpty)
                              const Text("暂无日志",
                                  style: TextStyle(fontSize: 12, color: AppColors.textLow))
                            else
                              Container(
                                width: double.maxFinite,
                                constraints: const BoxConstraints(maxHeight: 220),
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF070B13),
                                  borderRadius: BorderRadius.circular(9),
                                  border: Border.all(color: AppColors.lineSoft),
                                ),
                                child: SingleChildScrollView(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: _logs
                                        .map((l) => Padding(
                                              padding: const EdgeInsets.only(bottom: 4),
                                              child: Text(
                                                "${l.timestamp ?? ''} ${l.message}",
                                                style: monoStyle(11, color: AppColors.textLow),
                                              ),
                                            ))
                                        .toList(),
                                  ),
                                ),
                              ),
                          ],
                        ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _actionBtn(String label, String action, Color color) {
    final busy = _busy == action;
    return FilledButton(
      onPressed: busy ? null : () => _control(action),
      style: FilledButton.styleFrom(
        backgroundColor: color,
        foregroundColor: const Color(0xFF062019),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
        textStyle: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
      ),
      child: busy
          ? const SizedBox(width: 13, height: 13, child: CircularProgressIndicator(strokeWidth: 2))
          : Text(label),
    );
  }
}