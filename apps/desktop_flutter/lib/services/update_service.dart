import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;

class UpdateInfo {
  final String version;
  final String url;
  final String sha256;
  final String notes;

  UpdateInfo({
    required this.version,
    required this.url,
    required this.sha256,
    required this.notes,
  });

  factory UpdateInfo.fromJson(Map<String, dynamic> json) => UpdateInfo(
    version: json['version']?.toString() ?? '',
    url: json['url']?.toString() ?? '',
    sha256: json['sha256']?.toString() ?? '',
    notes: json['notes']?.toString() ?? '',
  );
}

class UpdateException implements Exception {
  final String message;
  UpdateException(this.message);
  @override
  String toString() => message;
}

class UpdateService {
  static const String kAppVersion = '1.0.2';
  static const String kUpdateBaseUrl = 'https://agent.yqone.cn/downloads';

  Future<UpdateInfo?> checkForUpdate() async {
    final uri = Uri.parse('$kUpdateBaseUrl/version.json');
    final resp = await http.get(uri).timeout(const Duration(seconds: 15));
    if (resp.statusCode != 200) return null;
    final json = jsonDecode(utf8.decode(resp.bodyBytes));
    if (json is! Map<String, dynamic>) return null;
    final info = UpdateInfo.fromJson(json);
    if (info.version.isEmpty || info.url.isEmpty) return null;
    if (compareVersions(info.version, kAppVersion) <= 0) return null;
    return info;
  }

  static int compareVersions(String a, String b) {
    final pa = a.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    final pb = b.split('.').map((e) => int.tryParse(e) ?? 0).toList();
    final len = pa.length > pb.length ? pa.length : pb.length;
    for (var i = 0; i < len; i++) {
      final x = i < pa.length ? pa[i] : 0;
      final y = i < pb.length ? pb[i] : 0;
      if (x != y) return x - y;
    }
    return 0;
  }

  Future<File> download(
    UpdateInfo info, {
    required void Function(int received, int? total) onProgress,
  }) async {
    final local =
        Platform.environment['LOCALAPPDATA'] ?? Directory.systemTemp.path;
    final dir = Directory(
      '$local${Platform.pathSeparator}ProberX${Platform.pathSeparator}updates',
    );
    await dir.create(recursive: true);
    final target = File(
      '${dir.path}${Platform.pathSeparator}proberx-update.zip',
    );
    final resp = await http.Client().send(
      http.Request('GET', Uri.parse(info.url)),
    );
    if (resp.statusCode != 200) {
      throw UpdateException('Download failed: HTTP ${resp.statusCode}');
    }
    final total = resp.contentLength;
    final sink = target.openWrite();
    var received = 0;
    try {
      await for (final chunk in resp.stream) {
        sink.add(chunk);
        received += chunk.length;
        onProgress(received, total);
      }
    } finally {
      await sink.close();
    }
    return target;
  }

  Future<String> sha256(File file) async {
    final r = await Process.run('certutil', ['-hashfile', file.path, 'SHA256']);
    if (r.exitCode != 0) throw UpdateException('certutil failed');
    final lines = (r.stdout as String)
        .split('\n')
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    if (lines.length < 3) throw UpdateException('certutil parse failed');
    return lines[2].replaceAll(':', '').replaceAll(' ', '').toLowerCase();
  }

  Future<void> verifySha256(File file, String expected) async {
    final actual = await sha256(file);
    if (actual != expected.trim().toLowerCase()) {
      throw UpdateException('SHA256 mismatch');
    }
  }

  Future<void> launchUpdater(File zip) async {
    final exePath = Platform.resolvedExecutable;
    final appDir = File(exePath).parent.path;
    final base = zip.parent.path;
    final zipPath = zip.path;
    final batPath = '$base${Platform.pathSeparator}updater.bat';
    final vbsPath = '$base${Platform.pathSeparator}updater.vbs';
    final batContent = [
      '@echo off',
      'setlocal EnableDelayedExpansion',
      'set "PATH=C:\\Windows\\System32;C:\\Windows;%PATH%"',
      'set "APP_DIR=$appDir"',
      'set "ZIP=$zipPath"',
      'set "EXE=$exePath"',
      'ping -n 5 127.0.0.1 >nul',
      'set /a tries=0',
      ':retry',
      'tar -xf "%ZIP%" -C "%APP_DIR%" >nul 2>&1',
      'if errorlevel 1 (',
      '  set /a tries+=1',
      '  if !tries! GEQ 20 goto fail',
      '  ping -n 3 127.0.0.1 >nul',
      '  goto retry',
      ')',
      'del /f /q "%ZIP%" >nul 2>&1',
      'cd /d "%APP_DIR%"',
      'start "" "%EXE%"',
      'exit /b 0',
      ':fail',
      'start "ProberX Update" cmd /k "echo ProberX update failed: could not replace files. & echo. & pause"',
      'exit /b 1',
    ].join('\r\n');
    await File(batPath).writeAsString(batContent);
    final vbsContent =
        'Set s = CreateObject("WScript.Shell")\r\n'
        's.Run """$batPath""", 0, False\r\n';
    await File(vbsPath).writeAsString(vbsContent);
    await Process.run('wscript.exe', [vbsPath]);
  }
}
