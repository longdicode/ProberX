import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiConfig {
  static const String defaultBaseUrl = "https://agent.yqone.cn/api/v1";
  static String baseUrl = defaultBaseUrl;
  static const String defaultWsUrl = "wss://agent.yqone.cn/ws";
  static String wsUrl = defaultWsUrl;
}

class ApiException implements Exception {
  final int? status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => message;
}

/// 轻量 API 客户端：携带 Bearer token，401 时自动用 refresh_token 换新。
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  String? accessToken;
  String? refreshToken;

  Future<http.Response> _send(String method, String path,
      {Map<String, String>? query, Object? body, bool withAuth = true}) async {
    final base = ApiConfig.baseUrl.replaceAll(RegExp(r"/+$"), "");
    final uri = Uri.parse("$base$path").replace(queryParameters: query);
    final headers = <String, String>{"Content-Type": "application/json"};
    if (withAuth && accessToken != null && accessToken!.isNotEmpty) {
      headers["Authorization"] = "Bearer $accessToken";
    }
    final encoded = body != null ? jsonEncode(body) : null;
    final req = http.Request(method, uri)..headers.addAll(headers);
    if (encoded != null) req.body = encoded;

    var resp = await http.Client().send(req).then(http.Response.fromStream);

    if (resp.statusCode == 401 && withAuth && path != "/auth/refresh") {
      if (await _refresh()) {
        headers["Authorization"] = "Bearer $accessToken";
        final retry = http.Request(method, uri)..headers.addAll(headers);
        if (encoded != null) retry.body = encoded;
        resp = await http.Client().send(retry).then(http.Response.fromStream);
      }
    }
    return resp;
  }

  Future<dynamic> get(String path, {Map<String, String>? query}) async {
    final resp = await _send("GET", path, query: query);
    return _decode(resp);
  }

  Future<dynamic> post(String path, {Object? body, Map<String, String>? query}) async {
    final resp = await _send("POST", path, query: query, body: body);
    return _decode(resp);
  }

  Future<dynamic> patch(String path, {Object? body, Map<String, String>? query}) async {
    final resp = await _send("PATCH", path, query: query, body: body);
    return _decode(resp);
  }

  Future<dynamic> put(String path, {Object? body, Map<String, String>? query}) async {
    final resp = await _send("PUT", path, query: query, body: body);
    return _decode(resp);
  }

  Future<dynamic> delete(String path, {Map<String, String>? query}) async {
    final resp = await _send("DELETE", path, query: query);
    return _decode(resp);
  }

  dynamic _decode(http.Response resp) {
    dynamic data;
    try {
      data = resp.body.isEmpty ? null : jsonDecode(resp.body);
    } catch (_) {
      data = resp.body;
    }
    if (resp.statusCode >= 400) {
      final msg = (data is Map && data["message"] != null)
          ? data["message"].toString()
          : (data is Map && data["error"] != null)
              ? data["error"].toString()
              : "请求失败 (HTTP ${resp.statusCode})";
      throw ApiException(resp.statusCode, msg);
    }
    return data;
  }

  Future<bool> _refresh() async {
    final rt = refreshToken;
    if (rt == null || rt.isEmpty) return false;
    try {
      final base = ApiConfig.baseUrl.replaceAll(RegExp(r"/+$"), "");
      final resp = await http
          .post(Uri.parse("$base/auth/refresh"),
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer $rt",
              })
          .timeout(const Duration(seconds: 15));
      if (resp.statusCode == 200) {
        final data = jsonDecode(resp.body);
        final newToken = data["token"]?.toString();
        if (newToken == null || newToken.isEmpty) return false;
        accessToken = newToken;
        await SessionStore.instance.save();
        return true;
      }
    } catch (_) {}
    return false;
  }

  Future<void> logout() async {
    accessToken = null;
    refreshToken = null;
    await SessionStore.instance.clear();
  }
}

/// 会话持久化（token / 用户信息 / API 地址）
class SessionStore {
  SessionStore._();
  static final SessionStore instance = SessionStore._();

  dynamic prefs;

  Future<void> init() async {
    final sp = await SharedPreferencesAsync();
    prefs = sp;
    ApiConfig.baseUrl = await sp.getString("api_base_url") ?? ApiConfig.defaultBaseUrl;
    ApiConfig.wsUrl = await sp.getString("api_ws_url") ?? ApiConfig.defaultWsUrl;
    ApiClient.instance.accessToken = await sp.getString("access_token");
    ApiClient.instance.refreshToken = await sp.getString("refresh_token");
  }

  Future<void> save() async {
    if (prefs == null) return;
    await prefs.setString("access_token", ApiClient.instance.accessToken ?? "");
    await prefs.setString("refresh_token", ApiClient.instance.refreshToken ?? "");
  }

  Future<void> saveApiUrl(String url) async {
    ApiConfig.baseUrl = url.replaceAll(RegExp(r"/+$"), "");
    if (prefs != null) await prefs.setString("api_base_url", ApiConfig.baseUrl);
  }

  Future<void> clear() async {
    if (prefs == null) return;
    await prefs.remove("access_token");
    await prefs.remove("refresh_token");
  }
}

