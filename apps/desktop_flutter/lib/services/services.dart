import '../core/api_client.dart';
import '../models/models.dart';

class AuthService {
  final _api = ApiClient.instance;

  Future<User> login(String email, String password) async {
    final data = await _api.post("/auth/login", body: {
      "email": email,
      "password": password,
    });
    final token = data["token"]?.toString();
    final refresh = data["refresh_token"]?.toString() ?? data["refreshToken"]?.toString();
    if (token == null || token.isEmpty) {
      throw ApiException(401, "登录失败：未返回令牌");
    }
    _api.accessToken = token;
    _api.refreshToken = refresh ?? token;
    await SessionStore.instance.save();
    final userJson = (data["user"] as Map?)?.cast<String, dynamic>();
    if (userJson != null) return User.fromJson(userJson);
    final me = await _api.get("/auth/me");
    return User.fromJson((me as Map).cast<String, dynamic>());
  }

  Future<void> logout() => _api.logout();
}

class WorkspaceService {
  final _api = ApiClient.instance;
  Future<List<Workspace>> list() async {
    final data = await _api.get("/workspaces");
    final list = (data as List?) ?? [];
    return list
        .map((e) => Workspace.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }
}

class ServerService {
  final _api = ApiClient.instance;

  Future<List<Server>> list(String workspaceId) async {
    final data = await _api.get("/workspaces/$workspaceId/servers");
    final list = (data as List?) ?? [];
    return list
        .map((e) => Server.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<void> setExpiry(String workspaceId, String serverId, String? date) async {
    await _api.patch("/workspaces/$workspaceId/servers/$serverId", body: {
      "expiresAt": date,
    });
  }

  Future<List<MetricPoint>> metrics(String workspaceId, String serverId,
      {DateTime? from, DateTime? to}) async {
    final query = <String, String>{
      if (from != null) "from": from.toUtc().toIso8601String(),
      if (to != null) "to": to.toUtc().toIso8601String(),
    };
    final data = await _api.get("/workspaces/$workspaceId/servers/$serverId/metrics", query: query);
    final list = (data as List?) ?? [];
    return list
        .map((e) => MetricPoint.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<Map<String, dynamic>> dashboard(String workspaceId) async {
    final data = await _api.get("/workspaces/$workspaceId/dashboard");
    return (data as Map?)?.cast<String, dynamic>() ?? {};
  }
}


class DashboardService {
  final _api = ApiClient.instance;

  Future<DashboardStats> stats(String workspaceId) async {
    final data = await _api.get("/workspaces/$workspaceId/dashboard");
    return DashboardStats.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<List<ServerComparison>> serverComparison(String workspaceId) async {
    final data = await _api.get("/workspaces/$workspaceId/server-comparison");
    final list = (data as List?) ?? [];
    return list
        .map((e) => ServerComparison.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }
}

class AlertService {
  final _api = ApiClient.instance;

  Future<List<AlertRule>> rules(String workspaceId) async {
    final data = await _api.get("/workspaces/$workspaceId/alerts");
    final list = (data as List?) ?? [];
    return list
        .map((e) => AlertRule.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<List<AlertEvent>> events(String workspaceId) async {
    final data = await _api.get("/workspaces/$workspaceId/alert-events");
    final list = (data as List?) ?? [];
    return list
        .map((e) => AlertEvent.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<void> resolve(String workspaceId, String ruleId, String eventId) async {
    await _api.patch("/workspaces/$workspaceId/alerts/$ruleId/events/$eventId");
  }

  Future<AlertRule> create(String workspaceId, {
    required String name,
    required String metric,
    required String operator,
    required double threshold,
    int durationSec = 0,
    String severity = "warning",
    String targetType = "server",
  }) async {
    final data = await _api.post("/workspaces/$workspaceId/alerts", body: {
      "name": name,
      "targetType": targetType,
      "metric": metric,
      "operator": operator,
      "threshold": threshold,
      "durationSec": durationSec,
      "severity": severity,
    });
    return AlertRule.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<void> setEnabled(String workspaceId, String ruleId, bool enabled) async {
    await _api.patch("/workspaces/$workspaceId/alerts/$ruleId", body: {"isEnabled": enabled});
  }

  Future<void> delete(String workspaceId, String ruleId) async {
    await _api.delete("/workspaces/$workspaceId/alerts/$ruleId");
  }
}

class MonitorService {
  final _api = ApiClient.instance;

  Future<List<MonitorTask>> list(String workspaceId) async {
    final data = await _api.get("/workspaces/$workspaceId/monitors");
    final list = (data as List?) ?? [];
    return list
        .map((e) => MonitorTask.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<MonitorTask> create(String workspaceId,
      {required String name, required String type, required String target,
      int intervalSec = 60, int timeoutMs = 5000}) async {
    final data = await _api.post("/workspaces/$workspaceId/monitors", body: {
      "name": name, "type": type, "target": target,
      "intervalSec": intervalSec, "timeoutMs": timeoutMs,
    });
    return MonitorTask.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<void> setEnabled(String workspaceId, String monitorId, bool enabled) async {
    await _api.patch("/workspaces/$workspaceId/monitors/$monitorId", body: {"isEnabled": enabled});
  }

  Future<void> delete(String workspaceId, String monitorId) async {
    await _api.delete("/workspaces/$workspaceId/monitors/$monitorId");
  }

  Future<List<ProbeResult>> results(String workspaceId, String monitorId) async {
    final data = await _api.get("/workspaces/$workspaceId/monitors/$monitorId/results");
    final list = (data as List?) ?? [];
    return list
        .map((e) => ProbeResult.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }
}

/// Shell AI：生成 / 执行 / 配置（后端转发到目标服务器 agent）
class ShellAIService {
  final _api = ApiClient.instance;

  Future<ShellAIConfig> config(String workspaceId, String serverId) async {
    final data = await _api.get("/workspaces/$workspaceId/servers/$serverId/tools/shell-ai/settings");
    return ShellAIConfig.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<void> saveConfig(
    String workspaceId,
    String serverId, {
    required String provider,
    String? model,
    String? apiKey,
    String? apiUrl,
  }) async {
    await _api.put("/workspaces/$workspaceId/servers/$serverId/tools/shell-ai/settings", body: {
      "provider": provider,
      if (model != null && model.isNotEmpty) "model": model,
      if (apiKey != null && apiKey.isNotEmpty) "api_key": apiKey,
      if (apiUrl != null && apiUrl.isNotEmpty) "api_url": apiUrl,
    });
  }

  Future<ShellAIResult> generate(
    String workspaceId,
    String serverId, {
    required String prompt,
    required String provider,
    String? model,
    String? apiKey,
    String? apiUrl,
  }) async {
    final data = await _api.post(
      "/workspaces/$workspaceId/servers/$serverId/tools/shell-ai/generate",
      body: {
        "prompt": prompt,
        "provider": provider,
        if (model != null && model.isNotEmpty) "model": model,
        if (apiKey != null && apiKey.isNotEmpty) "api_key": apiKey,
        if (apiUrl != null && apiUrl.isNotEmpty) "api_url": apiUrl,
      },
    );
    return ShellAIResult.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<ShellAIExecResult> execute(
    String workspaceId,
    String serverId, {
    required String command,
    int timeout = 30,
  }) async {
    final data = await _api.post(
      "/workspaces/$workspaceId/servers/$serverId/tools/shell-ai/execute",
      body: {"command": command, "timeout": timeout},
    );
    return ShellAIExecResult.fromJson((data as Map).cast<String, dynamic>());
  }
}

/// systemd 服务管理（后端转发到目标服务器 agent）
class SystemdService {
  final _api = ApiClient.instance;

  Future<List<ServiceUnit>> list(String workspaceId, String serverId) async {
    final data = await _api.get("/workspaces/$workspaceId/servers/$serverId/tools/services");
    final list = (data as List?) ?? [];
    return list
        .map((e) => ServiceUnit.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }

  Future<ServiceActionResult> control(
      String workspaceId, String serverId,
      {required String name, required String action}) async {
    final data = await _api.post("/workspaces/$workspaceId/servers/$serverId/tools/services",
        body: {"name": name, "action": action});
    return ServiceActionResult.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<ServiceStatusResult> status(String workspaceId, String serverId, String name) async {
    final data = await _api
        .get("/workspaces/$workspaceId/servers/$serverId/tools/services/${Uri.encodeComponent(name)}");
    return ServiceStatusResult.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<List<LogEntry>> logs(String workspaceId, String serverId,
      {String? unit, int lines = 100}) async {
    final data = await _api.get(
        "/workspaces/$workspaceId/servers/$serverId/tools/logs",
        query: {"lines": "$lines", if (unit != null && unit.isNotEmpty) "unit": unit});
    final list = (data as List?) ?? [];
    return list
        .map((e) => LogEntry.fromJson((e as Map).cast<String, dynamic>()))
        .toList();
  }
}

/// 告警规则扩展：创建 / 更新 / 删除
extension AlertOps on AlertService {
  Future<AlertRule> create(String workspaceId, {
    required String name,
    required String metric,
    required String operator,
    required double threshold,
    int durationSec = 0,
    String severity = "warning",
    String targetType = "server",
  }) async {
    final data = await _api.post("/workspaces/$workspaceId/alerts", body: {
      "name": name,
      "targetType": targetType,
      "metric": metric,
      "operator": operator,
      "threshold": threshold,
      "durationSec": durationSec,
      "severity": severity,
    });
    return AlertRule.fromJson((data as Map).cast<String, dynamic>());
  }

  Future<void> setEnabled(String workspaceId, String ruleId, bool enabled) async {
    await _api.patch("/workspaces/$workspaceId/alerts/$ruleId", body: {"isEnabled": enabled});
  }

  Future<void> delete(String workspaceId, String ruleId) async {
    await _api.delete("/workspaces/$workspaceId/alerts/$ruleId");
  }
}