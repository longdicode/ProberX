import 'dart:io';

import 'package:flutter/material.dart';

import '../services/update_service.dart';
import '../theme/app_theme.dart';

/// \u68c0\u67e5\u66f4\u65b0\u5e76\u63d0\u793a\uff08silent=true \u65f6\u9759\u9ed8\u68c0\u67e5\uff0c\u4ec5\u6709\u65b0\u7248\u672c\u65f6\u5f39\u7a97\uff09
Future<void> checkAndPromptUpdate(
  BuildContext context, {
  bool silent = false,
}) async {
  final svc = UpdateService();
  if (!silent) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const _LoadingDialog(),
    );
  }
  UpdateInfo? info;
  String? error;
  try {
    info = await svc.checkForUpdate();
  } catch (e) {
    error = e.toString();
  }
  if (!silent) {
    if (context.mounted) Navigator.of(context, rootNavigator: true).pop();
  }
  if (!context.mounted) return;
  if (error != null) {
    if (!silent) {
      showDialog(
        context: context,
        builder: (_) => AlertDialog(
          backgroundColor: AppColors.panel,
          title: const Text('\u68c0\u67e5\u66f4\u65b0\u5931\u8d25'),
          content: Text(
            '$error\n\n\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5\u540e\u91cd\u8bd5\u3002',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('\u77e5\u9053\u4e86'),
            ),
          ],
        ),
      );
    }
    return;
  }
  if (info == null) {
    if (!silent) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '\u5df2\u662f\u6700\u65b0\u7248\u672c\uff08v${UpdateService.kAppVersion}\uff09',
          ),
        ),
      );
    }
    return;
  }
  await showConfirmUpdateDialog(context, info);
}

Future<void> showConfirmUpdateDialog(
  BuildContext context,
  UpdateInfo info,
) async {
  final go = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      backgroundColor: AppColors.panel,
      title: Text('\u53d1\u73b0\u65b0\u7248\u672c v${info.version}'),
      content: Text(
        '\u5f53\u524d\u7248\u672c\uff1av${UpdateService.kAppVersion}\n\n'
        '${info.notes.isNotEmpty ? info.notes : '\u63a8\u8350\u5c3d\u5feb\u66f4\u65b0\u3002'}',
        style: const TextStyle(fontSize: 13, height: 1.5),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(ctx).pop(false),
          child: const Text('\u7a0d\u540e'),
        ),
        FilledButton(
          onPressed: () => Navigator.of(ctx).pop(true),
          child: const Text('\u7acb\u5373\u66f4\u65b0'),
        ),
      ],
    ),
  );
  if (go == true && context.mounted) {
    await _downloadAndApply(context, info);
  }
}

Future<void> _downloadAndApply(BuildContext context, UpdateInfo info) async {
  final status = ValueNotifier<String>('\u51c6\u5907\u4e0b\u8f7d...');
  final progress = ValueNotifier<double?>(null);
  final navigator = Navigator.of(context, rootNavigator: true);
  showDialog(
    context: context,
    barrierDismissible: false,
    builder: (_) => _ProgressDialog(status: status, progress: progress),
  );
  try {
    final svc = UpdateService();
    final zip = await svc.download(
      info,
      onProgress: (received, total) {
        final mb = received / 1024 / 1024;
        if (total != null && total > 0) {
          progress.value = received / total;
          status.value =
              '\u4e0b\u8f7d\u4e2d ${mb.toStringAsFixed(1)} MB / ${(total / 1024 / 1024).toStringAsFixed(1)} MB';
        } else {
          progress.value = null;
          status.value = '\u4e0b\u8f7d\u4e2d ${mb.toStringAsFixed(1)} MB';
        }
      },
    );
    status.value = '\u6821\u9a8c\u6587\u4ef6\u5b8c\u6574\u6027...';
    await svc.verifySha256(zip, info.sha256);
    status.value =
        '\u6b63\u5728\u51c6\u5907\u91cd\u542f\u5e76\u5e94\u7528\u66f4\u65b0...';
    await svc.launchUpdater(zip);
    if (context.mounted) navigator.pop();
    exit(0);
  } catch (e) {
    if (context.mounted) navigator.pop();
    if (!context.mounted) return;
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.panel,
        title: const Text('\u66f4\u65b0\u5931\u8d25'),
        content: Text('$e\n\n\u8bf7\u7a0d\u540e\u91cd\u8bd5\u3002'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('\u77e5\u9053\u4e86'),
          ),
        ],
      ),
    );
  }
}

class _LoadingDialog extends StatelessWidget {
  const _LoadingDialog();

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.panel,
      content: Row(
        children: [
          const SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(
              strokeWidth: 2,
              color: AppColors.cyan,
            ),
          ),
          const SizedBox(width: 16),
          Text(
            '\u68c0\u67e5\u66f4\u65b0...',
            style: const TextStyle(fontSize: 13.5, color: AppColors.textMid),
          ),
        ],
      ),
    );
  }
}

class _ProgressDialog extends StatelessWidget {
  final ValueNotifier<String> status;
  final ValueNotifier<double?> progress;
  const _ProgressDialog({required this.status, required this.progress});

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: AppColors.panel,
      content: SizedBox(
        width: 360,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              '\u6b63\u5728\u66f4\u65b0 ProberX',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 16),
            ValueListenableBuilder<double?>(
              valueListenable: progress,
              builder: (_, value, _) => LinearProgressIndicator(
                value: value,
                minHeight: 6,
                borderRadius: BorderRadius.circular(3),
                backgroundColor: AppColors.line,
                color: AppColors.cyan,
              ),
            ),
            const SizedBox(height: 10),
            ValueListenableBuilder<String>(
              valueListenable: status,
              builder: (_, value, _) => Text(
                value,
                style: const TextStyle(fontSize: 12, color: AppColors.textMid),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
