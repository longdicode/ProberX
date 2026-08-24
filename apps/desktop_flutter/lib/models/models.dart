// 统一数据模型

/// 兼容后端可能返回字符串数字（如 "0.25"）或真实 num 的字段。
double? _asDouble(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String && v.trim().isNotEmpty) return double.tryParse(v.trim());
  return null;
}

class User {
  final String id;
  final String email;
  final String name;
  final String? avatarUrl;
  User({required this.id, required this.email, required this.name, this.avatarUrl});
  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j["id"]?.toString() ?? "",
        email: j["email"]?.toString() ?? "",
        name: j["name"]?.toString() ?? j["email"]?.toString() ?? "",
        avatarUrl: j["avatarUrl"]?.toString(),
      );
}

class Workspace {
  final String id;
  final String name;
  Workspace({required this.id, required this.name});
  factory Workspace.fromJson(Map<String, dynamic> j) =>
      Workspace(id: j["id"]?.toString() ?? "", name: j["name"]?.toString() ?? "未命名");
}

class Server {
  final String id;
  final String name;
  final String host;
  final String? ip;
  final String? region;
  final String? os;
  final String status;
  final bool online;
  final String? agentToken;
  final String? agentHost;
  final int? agentPort;
  final Map<String, dynamic>? hostInfo;
  final String? expiresAt;

  Server({
    required this.id,
    required this.name,
    required this.host,
    this.ip,
    this.region,
    this.os,
    this.status = "unknown",
    this.online = false,
    this.agentToken,
    this.agentHost,
    this.agentPort,
    this.hostInfo,
    this.expiresAt,
  });

  factory Server.fromJson(Map<String, dynamic> j) {
    final hostInfo = (j["hostInfo"] as Map?)?.cast<String, dynamic>();
    final isOnline = j["isOnline"] == true || j["online"] == true;
    return Server(
      id: j["id"]?.toString() ?? "",
      name: j["name"]?.toString() ?? "未命名",
      host: j["host"]?.toString() ?? hostInfo?["hostname"]?.toString() ?? "",
      ip: j["ip"]?.toString() ?? hostInfo?["agent_host"]?.toString(),
      region: j["region"]?.toString(),
      os: j["os"]?.toString() ?? hostInfo?["os"]?.toString(),
      status: j["status"]?.toString() ?? (isOnline ? "online" : "unknown"),
      online: isOnline,
      agentToken: j["agentToken"]?.toString(),
      agentHost: j["agentHost"]?.toString() ?? hostInfo?["agent_host"]?.toString(),
      agentPort: _asDouble(j["agentPort"])?.toInt() ?? _asDouble(hostInfo?["agent_port"])?.toInt(),
      hostInfo: hostInfo,
      expiresAt: j["expiresAt"]?.toString(),
    );
  }
}

class MetricPoint {
  final DateTime time;
  final double? cpuPercent;
  final double? memUsed;
  final double? memTotal;
  final double? diskUsed;
  final double? diskTotal;
  final double? netInBytes;
  final double? netOutBytes;
  final double? load1;

  MetricPoint({
    required this.time,
    this.cpuPercent,
    this.memUsed,
    this.memTotal,
    this.diskUsed,
    this.diskTotal,
    this.netInBytes,
    this.netOutBytes,
    this.load1,
  });

  factory MetricPoint.fromJson(Map<String, dynamic> j) {
    DateTime? t;
    final rawT = j["time"];
    if (rawT != null) t = DateTime.tryParse(rawT.toString());
    return MetricPoint(
      time: t ?? DateTime.now(),
      cpuPercent: _asDouble(j["cpuPercent"]),
      memUsed: _asDouble(j["memUsed"]),
      memTotal: _asDouble(j["memTotal"]),
      diskUsed: _asDouble(j["diskUsed"]),
      diskTotal: _asDouble(j["diskTotal"]),
      netInBytes: _asDouble(j["netInBytes"]),
      netOutBytes: _asDouble(j["netOutBytes"]),
      load1: _asDouble(j["load1"]),
    );
  }
}

/// 监控面板总览（GET /workspaces/:wid/dashboard）
class DashboardStats {
  final int totalServers;
  final int activeMonitors;
  final int alertsTotal;
  final double avgCpu;
  final List<RecentActivity> recentActivity;
  DashboardStats({
    required this.totalServers,
    required this.activeMonitors,
    required this.alertsTotal,
    required this.avgCpu,
    required this.recentActivity,
  });
  factory DashboardStats.fromJson(Map<String, dynamic> j) => DashboardStats(
        totalServers: (j["totalServers"] as num?)?.toInt() ?? 0,
        activeMonitors: (j["activeMonitors"] as num?)?.toInt() ?? 0,
        alertsTotal: (j["alertsTotal"] as num?)?.toInt() ?? 0,
        avgCpu: _asDouble(j["avgCpu"]) ?? 0,
        recentActivity: ((j["recentActivity"] as List?) ?? [])
            .map((e) => RecentActivity.fromJson((e as Map).cast<String, dynamic>()))
            .toList(),
      );
}

class RecentActivity {
  final String type;
  final String serverName;
  final bool isOnline;
  final DateTime timestamp;
  RecentActivity({
    required this.type,
    required this.serverName,
    required this.isOnline,
    required this.timestamp,
  });
  factory RecentActivity.fromJson(Map<String, dynamic> j) {
    DateTime? t;
    final raw = j["timestamp"];
    if (raw != null) t = DateTime.tryParse(raw.toString());
    return RecentActivity(
      type: j["type"]?.toString() ?? "server",
      serverName: j["serverName"]?.toString() ?? "未知",
      isOnline: j["isOnline"] == true,
      timestamp: t ?? DateTime.now(),
    );
  }
}

/// 服务器实时对比（GET /workspaces/:wid/server-comparison）
class ServerComparison {
  final String name;
  final double cpu;
  final double memory;
  final double disk;
  ServerComparison({required this.name, required this.cpu, required this.memory, required this.disk});
  factory ServerComparison.fromJson(Map<String, dynamic> j) => ServerComparison(
        name: j["name"]?.toString() ?? "未知",
        cpu: _asDouble(j["cpu"]) ?? 0,
        memory: _asDouble(j["memory"]) ?? 0,
        disk: _asDouble(j["disk"]) ?? 0,
      );
}

/// 告警规则（GET /workspaces/:wid/alerts）
class AlertRule {
  final String id;
  final String name;
  final String targetType;
  final String? targetId;
  final String metric;
  final String operator;
  final double threshold;
  final int durationSec;
  final String severity;
  final bool isEnabled;
  final DateTime createdAt;
  AlertRule({
    required this.id,
    required this.name,
    required this.targetType,
    this.targetId,
    required this.metric,
    required this.operator,
    required this.threshold,
    required this.durationSec,
    required this.severity,
    required this.isEnabled,
    required this.createdAt,
  });
  factory AlertRule.fromJson(Map<String, dynamic> j) {
    DateTime? t;
    final raw = j["createdAt"];
    if (raw != null) t = DateTime.tryParse(raw.toString());
    return AlertRule(
      id: j["id"]?.toString() ?? "",
      name: j["name"]?.toString() ?? "未命名规则",
      targetType: j["targetType"]?.toString() ?? "server",
      targetId: j["targetId"]?.toString(),
      metric: j["metric"]?.toString() ?? "",
      operator: j["operator"]?.toString() ?? ">",
      threshold: _asDouble(j["threshold"]) ?? 0,
      durationSec: _asDouble(j["durationSec"])?.toInt() ?? 0,
      severity: j["severity"]?.toString() ?? "warning",
      isEnabled: j["isEnabled"] != false,
      createdAt: t ?? DateTime.now(),
    );
  }
}

/// 告警事件（GET /workspaces/:wid/alert-events）
class AlertEvent {
  final String id;
  final String ruleId;
  final String? serverId;
  final String severity;
  final String message;
  final double? metricValue;
  final bool isResolved;
  final DateTime? resolvedAt;
  final DateTime createdAt;
  final String? ruleName;
  AlertEvent({
    required this.id,
    required this.ruleId,
    this.serverId,
    required this.severity,
    required this.message,
    this.metricValue,
    required this.isResolved,
    this.resolvedAt,
    required this.createdAt,
    this.ruleName,
  });
  factory AlertEvent.fromJson(Map<String, dynamic> j) {
    DateTime? t, ra;
    final raw = j["createdAt"];
    if (raw != null) t = DateTime.tryParse(raw.toString());
    final rawR = j["resolvedAt"];
    if (rawR != null) ra = DateTime.tryParse(rawR.toString());
    return AlertEvent(
      id: j["id"]?.toString() ?? "",
      ruleId: j["ruleId"]?.toString() ?? "",
      serverId: j["serverId"]?.toString(),
      severity: j["severity"]?.toString() ?? "warning",
      message: j["message"]?.toString() ?? "",
      metricValue: _asDouble(j["metricValue"]),
      isResolved: j["isResolved"] == true,
      resolvedAt: ra,
      createdAt: t ?? DateTime.now(),
      ruleName: j["ruleName"]?.toString(),
    );
  }
}

/// 监控任务（GET /workspaces/:wid/monitors）
class MonitorTask {
  final String id;
  final String name;
  final String type;
  final String target;
  final int intervalSec;
  final int timeoutMs;
  final bool isEnabled;
  final DateTime createdAt;
  MonitorTask({
    required this.id,
    required this.name,
    required this.type,
    required this.target,
    required this.intervalSec,
    required this.timeoutMs,
    required this.isEnabled,
    required this.createdAt,
  });
  factory MonitorTask.fromJson(Map<String, dynamic> j) {
    DateTime? t;
    final raw = j["createdAt"];
    if (raw != null) t = DateTime.tryParse(raw.toString());
    return MonitorTask(
      id: j["id"]?.toString() ?? "",
      name: j["name"]?.toString() ?? "未命名",
      type: j["type"]?.toString() ?? "http",
      target: j["target"]?.toString() ?? "",
      intervalSec: _asDouble(j["intervalSec"])?.toInt() ?? 60,
      timeoutMs: _asDouble(j["timeoutMs"])?.toInt() ?? 5000,
      isEnabled: j["isEnabled"] != false,
      createdAt: t ?? DateTime.now(),
    );
  }
}

/// Shell AI 配置（provider / model / api）
class ShellAIConfig {
  final String provider;
  final String model;
  final String apiKey;
  final String apiUrl;
  const ShellAIConfig({
    required this.provider,
    required this.model,
    required this.apiKey,
    required this.apiUrl,
  });
  factory ShellAIConfig.fromJson(Map<String, dynamic> j) => ShellAIConfig(
        provider: j["provider"]?.toString() ?? "proberx",
        model: j["model"]?.toString() ?? "proberx-coder",
        apiKey: j["api_key"]?.toString() ?? "",
        apiUrl: j["api_url"]?.toString() ?? "",
      );
}

/// Shell AI 生成结果
class ShellAIResult {
  final String command;
  final String explanation;
  ShellAIResult({required this.command, required this.explanation});
  factory ShellAIResult.fromJson(Map<String, dynamic> j) => ShellAIResult(
        command: j["command"]?.toString() ?? "",
        explanation: j["explanation"]?.toString() ?? "",
      );
}

/// Shell AI 执行结果
class ShellAIExecResult {
  final String stdout;
  final String stderr;
  final int exitCode;
  ShellAIExecResult({required this.stdout, required this.stderr, required this.exitCode});
  factory ShellAIExecResult.fromJson(Map<String, dynamic> j) => ShellAIExecResult(
        stdout: j["stdout"]?.toString() ?? "",
        stderr: j["stderr"]?.toString() ?? "",
        exitCode: (j["exit_code"] as num?)?.toInt() ?? 0,
      );
}

/// systemd 服务单元（GET /tools/services）
class ServiceUnit {
  final String name;
  final String loadState;
  final String activeState;
  final String subState;
  final String description;
  ServiceUnit({
    required this.name,
    required this.loadState,
    required this.activeState,
    required this.subState,
    required this.description,
  });
  bool get isActive => activeState == "active";
  bool get isFailed => activeState == "failed";
  factory ServiceUnit.fromJson(Map<String, dynamic> j) => ServiceUnit(
        name: j["name"]?.toString() ?? "",
        loadState: j["loadState"]?.toString() ?? "",
        activeState: j["activeState"]?.toString() ?? "",
        subState: j["subState"]?.toString() ?? "",
        description: j["description"]?.toString() ?? "",
      );
}

/// 服务控制结果（POST /tools/services）
class ServiceActionResult {
  final String service;
  final String action;
  final String status;
  final String output;
  ServiceActionResult({
    required this.service,
    required this.action,
    required this.status,
    required this.output,
  });
  factory ServiceActionResult.fromJson(Map<String, dynamic> j) => ServiceActionResult(
        service: j["service"]?.toString() ?? "",
        action: j["action"]?.toString() ?? "",
        status: j["status"]?.toString() ?? "",
        output: j["output"]?.toString() ?? "",
      );
}

/// 服务状态（GET /tools/services/:name）
class ServiceStatusResult {
  final String service;
  final String output;
  ServiceStatusResult({required this.service, required this.output});
  factory ServiceStatusResult.fromJson(Map<String, dynamic> j) => ServiceStatusResult(
        service: j["service"]?.toString() ?? "",
        output: j["output"]?.toString() ?? "",
      );
}

/// 日志条目（GET /tools/logs）
class LogEntry {
  final String? timestamp;
  final String? hostname;
  final String? unit;
  final String message;
  LogEntry({this.timestamp, this.hostname, this.unit, required this.message});
  factory LogEntry.fromJson(Map<String, dynamic> j) => LogEntry(
        timestamp: j["timestamp"]?.toString(),
        hostname: j["hostname"]?.toString(),
        unit: j["unit"]?.toString(),
        message: j["message"]?.toString() ?? "",
      );
}

/// 探测结果（monitors/:id/results 或 probe-results）
class ProbeResult {
  final DateTime time;
  final String taskId;
  final bool isSuccess;
  final int? responseMs;
  final int? statusCode;
  final String? errorMsg;
  final Map<String, dynamic>? detail;
  ProbeResult({
    required this.time,
    required this.taskId,
    required this.isSuccess,
    this.responseMs,
    this.statusCode,
    this.errorMsg,
    this.detail,
  });
  factory ProbeResult.fromJson(Map<String, dynamic> j) {
    DateTime? t;
    final raw = j["time"];
    if (raw != null) t = DateTime.tryParse(raw.toString());
    return ProbeResult(
      time: t ?? DateTime.now(),
      taskId: j["taskId"]?.toString() ?? "",
      isSuccess: j["isSuccess"] == true,
      responseMs: _asDouble(j["responseMs"])?.toInt(),
      statusCode: _asDouble(j["statusCode"])?.toInt(),
      errorMsg: j["errorMsg"]?.toString(),
      detail: (j["detail"] as Map?)?.cast<String, dynamic>(),
    );
  }
}