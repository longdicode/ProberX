import 'dart:async';

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/services.dart';
import '../theme/app_theme.dart';
import 'shell_ai_page.dart';
import 'services_panel.dart';

class ServerDetailPage extends StatefulWidget {
  final String workspaceId;
  final Server server;
  const ServerDetailPage({
    super.key,
    required this.workspaceId,
    required this.server,
  });

  @override
  State<ServerDetailPage> createState() => _ServerDetailPageState();
}

class _ServerDetailPageState extends State<ServerDetailPage> {
  final _svc = ServerService();
  List<MetricPoint> _points = [];
  bool _loading = true;
  String? _error;
  Timer? _timer;
  int _tab = 0;
  Duration _range = const Duration(hours: 1);

  @override
  void initState() {
    super.initState();
    _load();
    _timer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _load(silent: true),
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (!silent) setState(() => _loading = true);
    try {
      final from = DateTime.now().subtract(_range);
      final pts = await _svc.metrics(
        widget.workspaceId,
        widget.server.id,
        from: from,
      );
      if (!mounted) return;
      setState(() {
        _points = pts.reversed.toList();
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

  void _setRange(Duration d) {
    if (_range == d) return;
    setState(() => _range = d);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          _header(),
          const Divider(height: 1),
          _tabBar(),
          const Divider(height: 1),
          Expanded(
            child: _tab == 0
                ? _buildTelemetry()
                : ServicesPanel(
                    workspaceId: widget.workspaceId,
                    serverId: widget.server.id,
                  ),
          ),
        ],
      ),
    );
  }

  Widget _tabBar() {
    return Container(
      height: 42,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(color: AppColors.panel.withValues(alpha: 0.6)),
      child: Row(
        children: [
          _tabBtn("遥测图表", 0),
          const SizedBox(width: 6),
          _tabBtn("系统服务", 1),
        ],
      ),
    );
  }

  Widget _tabBtn(String label, int index) {
    final active = _tab == index;
    return GestureDetector(
      onTap: () => setState(() => _tab = index),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        margin: const EdgeInsets.symmetric(vertical: 7),
        padding: const EdgeInsets.symmetric(horizontal: 16),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active
              ? AppColors.cyan.withValues(alpha: 0.12)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: active
                ? AppColors.cyan.withValues(alpha: 0.5)
                : Colors.transparent,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 12.5,
            fontWeight: FontWeight.w600,
            color: active ? AppColors.cyan : AppColors.textMid,
          ),
        ),
      ),
    );
  }

  Widget _buildTelemetry() {
    return _loading
        ? const Center(
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
                  "读取遥测数据…",
                  style: TextStyle(color: AppColors.textLow, fontSize: 13),
                ),
              ],
            ),
          )
        : _error != null
        ? Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  Icons.cloud_off_rounded,
                  size: 40,
                  color: AppColors.red.withValues(alpha: 0.8),
                ),
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(
                    color: AppColors.textMid,
                    fontSize: 13.5,
                  ),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh_rounded, size: 17),
                  label: const Text("重试"),
                ),
              ],
            ),
          )
        : _points.isEmpty
        ? const Center(
            child: Text(
              "暂无监控数据",
              style: TextStyle(color: AppColors.textMid, fontSize: 14),
            ),
          )
        : ListView(
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 24),
            children: [
              _kpiRow(),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _chartCard(
                      "CPU 使用率",
                      _cpuSpots,
                      AppColors.cyan,
                      "%",
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _chartCard("内存使用", _memSpots, AppColors.blue, "GB"),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _chartCard(
                      "磁盘使用率",
                      _diskSpots,
                      AppColors.amber,
                      "%",
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _chartCard(
                      "系统负载 1min",
                      _loadSpots,
                      AppColors.blue,
                      "load",
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                    child: _chartCard(
                      "网络流入速率",
                      _netSpots,
                      AppColors.amber,
                      "KB/s",
                    ),
                  ),
                ],
              ),
            ],
          );
  }

  // ── 头部 ──
  Widget _header() {
    final s = widget.server;
    final online = s.online;
    final statusColor = online ? AppColors.green : AppColors.red;
    return Container(
      height: 68,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: AppColors.panel.withValues(alpha: 0.6),
        border: Border(
          bottom: BorderSide(color: AppColors.line.withValues(alpha: 0.6)),
        ),
      ),
      child: Row(
        children: [
          IconButton(
            tooltip: "返回",
            onPressed: () => Navigator.of(context).pop(),
            style: IconButton.styleFrom(
              backgroundColor: AppColors.panelHi,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(9),
                side: const BorderSide(color: AppColors.line),
              ),
            ),
            icon: const Icon(Icons.arrow_back_rounded, size: 18),
          ),
          const SizedBox(width: 14),
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              gradient: AppColors.brandGradient,
              borderRadius: BorderRadius.circular(11),
            ),
            child: const Icon(
              Icons.dns_rounded,
              size: 21,
              color: Color(0xFF062019),
            ),
          ),
          const SizedBox(width: 14),
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Text(
                    s.name,
                    style: const TextStyle(
                      fontFamily: 'Bahnschrift',
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(
                        color: statusColor.withValues(alpha: 0.35),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            color: statusColor,
                            shape: BoxShape.circle,
                            boxShadow: [
                              BoxShadow(
                                color: statusColor.withValues(alpha: 0.6),
                                blurRadius: 5,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 5),
                        Text(
                          online ? "在线" : "离线",
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: statusColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 2),
              Text(s.host, style: monoStyle(12, color: AppColors.textMid)),
            ],
          ),
          const Spacer(),
          // 时间范围
          Container(
            padding: const EdgeInsets.all(3),
            decoration: BoxDecoration(
              color: AppColors.panelHi,
              borderRadius: BorderRadius.circular(9),
              border: Border.all(color: AppColors.line),
            ),
            child: Row(
              children: [
                _rangeBtn(const Duration(hours: 1), "1H"),
                _rangeBtn(const Duration(hours: 6), "6H"),
                _rangeBtn(const Duration(hours: 24), "24H"),
              ],
            ),
          ),
          const SizedBox(width: 10),
          IconButton(
            tooltip: "Shell AI 助手",
            onPressed: () {
              Navigator.of(context).push(
                PageRouteBuilder(
                  pageBuilder: (_, __, ___) => ShellAIPage(
                    workspaceId: widget.workspaceId,
                    server: widget.server,
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
            style: IconButton.styleFrom(
              backgroundColor: AppColors.panelHi,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(9),
                side: const BorderSide(color: AppColors.line),
              ),
            ),
            icon: const Icon(
              Icons.auto_awesome_rounded,
              size: 18,
              color: AppColors.textHi,
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
            icon: const Icon(Icons.refresh_rounded, size: 18),
          ),
        ],
      ),
    );
  }

  Widget _rangeBtn(Duration d, String label) {
    final active = _range == d;
    return GestureDetector(
      onTap: () => _setRange(d),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 6),
        decoration: BoxDecoration(
          color: active ? AppColors.cyan : Colors.transparent,
          borderRadius: BorderRadius.circular(7),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 11.5,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
            color: active ? const Color(0xFF062019) : AppColors.textMid,
          ),
        ),
      ),
    );
  }

  // ── KPI 行 ──
  Widget _kpiRow() {
    final last = _points.last;
    final cpu = last.cpuPercent ?? 0;
    final memTotal = last.memTotal ?? 0;
    final memUsed = last.memUsed ?? 0;
    final memPct = memTotal > 0 ? memUsed / memTotal * 100 : 0.0;
    final diskTotal = last.diskTotal ?? 0;
    final diskUsed = last.diskUsed ?? 0;
    final diskPct = diskTotal > 0 ? diskUsed / diskTotal * 100 : 0.0;

    return Row(
      children: [
        _kpi(Icons.speed_rounded, "CPU 负载", cpu, "%", AppColors.cyan),
        const SizedBox(width: 14),
        _kpi(Icons.memory_rounded, "内存占用", memPct, "%", AppColors.blue),
        const SizedBox(width: 14),
        _kpi(Icons.sd_storage, "磁盘占用", diskPct, "%", AppColors.amber),
        const SizedBox(width: 14),
        _kpi(
          Icons.monitor_heart_outlined,
          "运行状态",
          widget.server.online ? 100 : 0,
          widget.server.online ? "在线" : "离线",
          AppColors.green,
        ),
      ],
    );
  }

  Widget _kpi(
    IconData icon,
    String label,
    double value,
    String unit,
    Color color,
  ) {
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
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(11),
                border: Border.all(color: color.withValues(alpha: 0.3)),
              ),
              child: Icon(icon, size: 21, color: color),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.textMid,
                      letterSpacing: 0.5,
                    ),
                  ),
                  const SizedBox(height: 5),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        value.toStringAsFixed(1),
                        style: monoStyle(
                          26,
                          color: color,
                          weight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        unit,
                        style: const TextStyle(
                          fontSize: 12.5,
                          color: AppColors.textLow,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            // 迷你进度环
            SizedBox(
              width: 34,
              height: 34,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CircularProgressIndicator(
                    value: (value / 100).clamp(0.0, 1.0),
                    strokeWidth: 3.5,
                    strokeCap: StrokeCap.round,
                    color: color,
                    backgroundColor: AppColors.panelHi,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ── 图表 ──
  List<FlSpot> get _cpuSpots => _points
      .where((p) => p.cpuPercent != null)
      .map(
        (p) => FlSpot(p.time.millisecondsSinceEpoch.toDouble(), p.cpuPercent!),
      )
      .toList();

  List<FlSpot> get _memSpots => _points
      .where((p) => p.memUsed != null && p.memTotal != null)
      .map(
        (p) => FlSpot(
          p.time.millisecondsSinceEpoch.toDouble(),
          p.memUsed! / (1024 * 1024 * 1024),
        ),
      )
      .toList();

  List<FlSpot> get _netSpots {
    final out = <FlSpot>[];
    for (var i = 1; i < _points.length; i++) {
      final prev = _points[i - 1];
      final cur = _points[i];
      if (prev.netInBytes == null || cur.netInBytes == null) continue;
      final dt = cur.time.difference(prev.time).inSeconds;
      if (dt <= 0) continue;
      final rate = (cur.netInBytes! - prev.netInBytes!) / dt / 1024;
      out.add(
        FlSpot(
          cur.time.millisecondsSinceEpoch.toDouble(),
          rate.clamp(0, 1e9).toDouble(),
        ),
      );
    }
    return out;
  }

  List<FlSpot> get _diskSpots => _points
      .where(
        (p) =>
            p.diskUsed != null && p.diskTotal != null && (p.diskTotal ?? 0) > 0,
      )
      .map(
        (p) => FlSpot(
          p.time.millisecondsSinceEpoch.toDouble(),
          (p.diskUsed! / p.diskTotal!) * 100,
        ),
      )
      .toList();

  List<FlSpot> get _loadSpots => _points
      .where((p) => p.load1 != null)
      .map((p) => FlSpot(p.time.millisecondsSinceEpoch.toDouble(), p.load1!))
      .toList();

  Widget _chartCard(
    String title,
    List<FlSpot> spots,
    Color color,
    String unit,
  ) {
    return Container(
      height: 260,
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
              Container(
                width: 8,
                height: 8,
                decoration: BoxDecoration(
                  color: color,
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: color.withValues(alpha: 0.5),
                      blurRadius: 6,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Text(
                title,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 13.5,
                  letterSpacing: 0.4,
                ),
              ),
              const Spacer(),
              Text(
                unit,
                style: const TextStyle(
                  fontSize: 11.5,
                  color: AppColors.textLow,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Expanded(
            child: spots.length < 2
                ? const Center(
                    child: Text(
                      "数据不足",
                      style: TextStyle(
                        color: AppColors.textLow,
                        fontSize: 12.5,
                      ),
                    ),
                  )
                : LineChart(
                    LineChartData(
                      minX: spots.first.x,
                      maxX: spots.last.x,
                      minY: 0,
                      maxY: _maxY(spots),
                      gridData: FlGridData(
                        show: true,
                        drawVerticalLine: false,
                        horizontalInterval: _maxY(spots) / 4,
                        getDrawingHorizontalLine: (v) => FlLine(
                          color: AppColors.lineSoft.withValues(alpha: 0.9),
                          strokeWidth: 1,
                        ),
                      ),
                      titlesData: FlTitlesData(
                        leftTitles: AxisTitles(
                          axisNameWidget: Text(
                            unit,
                            style: const TextStyle(
                              fontSize: 10,
                              color: AppColors.textLow,
                            ),
                          ),
                          axisNameSize: 16,
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 42,
                            getTitlesWidget: (v, meta) => Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: Text(
                                v.toInt().toString(),
                                style: monoStyle(10, color: AppColors.textLow),
                              ),
                            ),
                          ),
                        ),
                        bottomTitles: AxisTitles(
                          sideTitles: SideTitles(
                            showTitles: true,
                            reservedSize: 26,
                            interval: (spots.last.x - spots.first.x) / 4,
                            getTitlesWidget: (v, meta) {
                              final t = DateTime.fromMillisecondsSinceEpoch(
                                v.toInt(),
                              );
                              return Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: Text(
                                  "${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}",
                                  style: monoStyle(
                                    10,
                                    color: AppColors.textLow,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                        topTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                        rightTitles: const AxisTitles(
                          sideTitles: SideTitles(showTitles: false),
                        ),
                      ),
                      borderData: FlBorderData(show: false),
                      lineTouchData: LineTouchData(
                        touchTooltipData: LineTouchTooltipData(
                          getTooltipColor: (_) => AppColors.panelHi,
                          getTooltipItems: (touched) => touched.map((t) {
                            final v = t.y;
                            return LineTooltipItem(
                              "${v.toStringAsFixed(1)} $unit",
                              const TextStyle(
                                color: AppColors.textHi,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                      lineBarsData: [
                        LineChartBarData(
                          spots: spots,
                          isCurved: true,
                          curveSmoothness: 0.25,
                          color: color,
                          barWidth: 2.2,
                          dotData: const FlDotData(show: false),
                          belowBarData: BarAreaData(
                            show: true,
                            gradient: LinearGradient(
                              begin: Alignment.topCenter,
                              end: Alignment.bottomCenter,
                              colors: [
                                color.withValues(alpha: 0.28),
                                color.withValues(alpha: 0.02),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  double _maxY(List<FlSpot> spots) {
    var m = 1.0;
    for (final s in spots) {
      if (s.y > m) m = s.y;
    }
    return m * 1.15;
  }
}
