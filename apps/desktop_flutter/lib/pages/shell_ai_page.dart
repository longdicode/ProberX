import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../core/api_client.dart';
import '../models/models.dart';
import '../services/services.dart';
import '../theme/app_theme.dart';

/// Shell AI 助手：中文描述 → 生成/执行 shell 命令
class ShellAIPage extends StatefulWidget {
  final String workspaceId;
  final Server server;
  const ShellAIPage({super.key, required this.workspaceId, required this.server});

  @override
  State<ShellAIPage> createState() => _ShellAIPageState();
}

class _ChatItem {
  final String kind; // user | ai | exec
  final String? prompt;
  final String? command;
  final String? explanation;
  final ShellAIExecResult? result;
  _ChatItem.user(this.prompt)
      : kind = "user",
        command = null,
        explanation = null,
        result = null;
  _ChatItem.ai(this.command, this.explanation)
      : kind = "ai",
        prompt = null,
        result = null;
  _ChatItem.exec(this.result)
      : kind = "exec",
        prompt = null,
        command = null,
        explanation = null;
}

class _ShellAIPageState extends State<ShellAIPage> {
  final _svc = ShellAIService();
  final _inputCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();
  final List<_ChatItem> _items = [];
  ShellAIConfig? _config;
  bool _generating = false;
  bool _executing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  @override
  void dispose() {
    _inputCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadConfig() async {
    try {
      final cfg = await _svc.config(widget.workspaceId, widget.server.id);
      if (!mounted) return;
      setState(() => _config = cfg);
    } catch (_) {
      // agent 上无配置时使用默认 proberx / proberx-coder
      if (!mounted) return;
      setState(() => _config = ShellAIConfig(
            provider: "proberx",
            model: "proberx-coder",
            apiKey: "",
            apiUrl: "",
          ));
    }
  }

  Future<void> _generate() async {
    final prompt = _inputCtrl.text.trim();
    if (prompt.isEmpty || _generating) return;
    final cfg = _config ?? const ShellAIConfig(
        provider: "proberx", model: "proberx-coder", apiKey: "", apiUrl: "");
    setState(() {
      _items.add(_ChatItem.user(prompt));
      _generating = true;
      _error = null;
    });
    _inputCtrl.clear();
    _scrollToBottom();
    try {
      final result = await _svc.generate(
        widget.workspaceId,
        widget.server.id,
        prompt: prompt,
        provider: cfg.provider,
        model: cfg.model,
        apiKey: cfg.apiKey.isEmpty ? null : cfg.apiKey,
        apiUrl: cfg.apiUrl.isEmpty ? null : cfg.apiUrl,
      );
      if (!mounted) return;
      setState(() => _items.add(_ChatItem.ai(result.command, result.explanation)));
    } on ApiException catch (e) {
      setState(() => _error = "生成失败：${e.message}");
    } catch (e) {
      setState(() => _error = "生成失败：$e");
    } finally {
      if (mounted) setState(() => _generating = false);
      _scrollToBottom();
    }
  }

  Future<void> _execute(String command) async {
    if (_executing) return;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("确认执行"),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text("将在目标服务器上执行以下命令：",
                style: TextStyle(fontSize: 13, color: AppColors.textMid)),
            const SizedBox(height: 10),
            Container(
              width: double.maxFinite,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.panelHi,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.line),
              ),
              child: SelectableText(command, style: monoStyle(12.5)),
            ),
            const SizedBox(height: 10),
            Text("命令将在远程服务器上真实运行，请确认命令安全。",
                style: TextStyle(fontSize: 12, color: AppColors.amber)),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("取消")),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: FilledButton.styleFrom(backgroundColor: AppColors.red),
            child: const Text("执行"),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      _items.add(_ChatItem.exec(null));
      _executing = true;
    });
    _scrollToBottom();
    try {
      final result = await _svc.execute(widget.workspaceId, widget.server.id, command: command);
      if (!mounted) return;
      setState(() => _items[_items.length - 1] = _ChatItem.exec(result));
    } catch (e) {
      if (!mounted) return;
      setState(() => _items[_items.length - 1] = _ChatItem.exec(ShellAIExecResult(
            stdout: "", stderr: "$e", exitCode: -1)));
    } finally {
      if (mounted) setState(() => _executing = false);
      _scrollToBottom();
    }
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 260),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _copy(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("已复制到剪贴板"), duration: Duration(seconds: 2)),
    );
  }

  Future<void> _showSettings() async {
    final cfg = _config ?? const ShellAIConfig(
        provider: "proberx", model: "proberx-coder", apiKey: "", apiUrl: "");
    final modelCtrl = TextEditingController(text: cfg.model);
    final apiUrlCtrl = TextEditingController(text: cfg.apiUrl);
    final apiKeyCtrl = TextEditingController(text: cfg.apiKey.isEmpty || cfg.apiKey.contains("*") ? "" : cfg.apiKey);
    String provider = cfg.provider;
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) => AlertDialog(
          title: const Text("Shell AI 设置"),
          content: SizedBox(
            width: 420,
            child: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("服务商", style: TextStyle(fontSize: 12.5, color: AppColors.textMid)),
                  const SizedBox(height: 6),
                  DropdownButtonFormField<String>(
                    initialValue: provider,
                    dropdownColor: AppColors.panelHi,
                    style: const TextStyle(color: AppColors.textHi, fontSize: 13.5),
                    items: const [
                      DropdownMenuItem(value: "proberx", child: Text("ProberX（本机 Ollama）")),
                      DropdownMenuItem(value: "custom", child: Text("自定义 OpenAI 兼容")),
                      DropdownMenuItem(value: "deepseek", child: Text("DeepSeek")),
                      DropdownMenuItem(value: "claude", child: Text("Claude")),
                    ],
                    onChanged: (v) {
                      if (v != null) setDlg(() => provider = v);
                    },
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: modelCtrl,
                    decoration: const InputDecoration(labelText: "模型", hintText: "proberx-coder"),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: apiUrlCtrl,
                    decoration: const InputDecoration(
                        labelText: "API 地址", hintText: "http://127.0.0.1:11434/v1"),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: apiKeyCtrl,
                    obscureText: true,
                    decoration: const InputDecoration(
                        labelText: "API Key（ProberX 本地模型可留空）", hintText: "sk-..."),
                  ),
                ],
              ),
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("取消")),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text("保存"),
            ),
          ],
        ),
      ),
    );
    if (saved != true || !mounted) return;
    try {
      await _svc.saveConfig(
        widget.workspaceId,
        widget.server.id,
        provider: provider,
        model: modelCtrl.text.trim(),
        apiKey: apiKeyCtrl.text.trim(),
        apiUrl: apiUrlCtrl.text.trim(),
      );
      setState(() => _config = ShellAIConfig(
            provider: provider,
            model: modelCtrl.text.trim().isEmpty ? "proberx-coder" : modelCtrl.text.trim(),
            apiKey: apiKeyCtrl.text.trim(),
            apiUrl: apiUrlCtrl.text.trim(),
          ));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text("配置已保存到目标服务器"), duration: Duration(seconds: 2)),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text("保存失败：$e"), duration: Duration(seconds: 3)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          _header(),
          const Divider(height: 1),
          Expanded(
            child: _items.isEmpty && _error == null
                ? _welcome()
                : ListView.builder(
                    controller: _scrollCtrl,
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
                    itemCount: _items.length + (_generating ? 1 : 0) + (_error != null ? 1 : 0),
                    itemBuilder: (ctx, i) {
                      if (_generating && i == _items.length) return _loadingCard();
                      if (_error != null && i == _items.length + (_generating ? 1 : 0)) {
                        return _errorCard();
                      }
                      return _itemCard(_items[i]);
                    },
                  ),
          ),
          _inputBar(),
        ],
      ),
    );
  }

  Widget _header() {
    return Container(
      height: 64,
      padding: const EdgeInsets.symmetric(horizontal: 14),
      decoration: BoxDecoration(
        color: AppColors.panel.withValues(alpha: 0.6),
        border: Border(bottom: BorderSide(color: AppColors.line.withValues(alpha: 0.6))),
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
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              gradient: AppColors.brandGradient,
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.auto_awesome_rounded, size: 19, color: Color(0xFF062019)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Shell AI 助手",
                    style: TextStyle(fontFamily: 'Bahnschrift', fontSize: 17, fontWeight: FontWeight.w600)),
                Text("${widget.server.name} · ${_config?.provider ?? "proberx"} / ${_config?.model ?? "proberx-coder"}",
                    style: monoStyle(11, color: AppColors.textLow)),
              ],
            ),
          ),
          IconButton(
            tooltip: "AI 设置",
            onPressed: _showSettings,
            style: IconButton.styleFrom(
              backgroundColor: AppColors.panelHi,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(9),
                side: const BorderSide(color: AppColors.line),
              ),
            ),
            icon: const Icon(Icons.tune_rounded, size: 18, color: AppColors.textHi),
          ),
        ],
      ),
    );
  }

  Widget _welcome() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 64,
            height: 64,
            decoration: BoxDecoration(
              gradient: AppColors.brandGradient,
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(color: AppColors.cyan.withValues(alpha: 0.3), blurRadius: 24, offset: const Offset(0, 8)),
              ],
            ),
            child: const Icon(Icons.terminal_rounded, size: 30, color: Color(0xFF062019)),
          ),
          const SizedBox(height: 18),
          const Text("Shell AI 助手",
              style: TextStyle(fontFamily: 'Bahnschrift', fontSize: 21, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text("用中文描述需求，AI 生成安全的 shell 命令，可直接在 ${widget.server.name} 上执行",
              style: const TextStyle(fontSize: 13, color: AppColors.textMid)),
          const SizedBox(height: 22),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            alignment: WrapAlignment.center,
            children: const [
              _suggestion("查看磁盘空间占用"),
              _suggestion("查一下 80 端口谁在监听"),
              _suggestion("看 Nginx 服务状态"),
              _suggestion("清理 3 天前的临时文件"),
            ],
          ),
        ],
      ),
    );
  }

  Widget _itemCard(_ChatItem item) {
    switch (item.kind) {
      case "user":
        return Align(
          alignment: Alignment.centerRight,
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            constraints: const BoxConstraints(maxWidth: 620),
            decoration: BoxDecoration(
              color: AppColors.cyan.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.cyan.withValues(alpha: 0.3)),
            ),
            child: Text(item.prompt ?? "", style: const TextStyle(fontSize: 13.5)),
          ),
        );
      case "ai":
        return _commandCard(item);
      case "exec":
        return _execCard(item.result);
      default:
        return const SizedBox.shrink();
    }
  }

  Widget _commandCard(_ChatItem item) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.line),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.terminal_rounded, size: 15, color: AppColors.cyan),
              const SizedBox(width: 7),
              const Text("生成命令", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600)),
              const Spacer(),
              IconButton(
                tooltip: "复制",
                onPressed: () => _copy(item.command ?? ""),
                icon: const Icon(Icons.copy_rounded, size: 16, color: AppColors.textMid),
                visualDensity: VisualDensity.compact,
              ),
              IconButton(
                tooltip: "执行",
                onPressed: () => _execute(item.command ?? ""),
                icon: const Icon(Icons.play_arrow_rounded, size: 18, color: AppColors.green),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          Container(
            width: double.maxFinite,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFF070B13),
              borderRadius: BorderRadius.circular(9),
              border: Border.all(color: AppColors.lineSoft),
            ),
            child: SelectableText(item.command ?? "", style: monoStyle(13, color: AppColors.cyan)),
          ),
          if (item.explanation != null && item.explanation!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Text(item.explanation!,
                style: const TextStyle(fontSize: 12.5, color: AppColors.textMid, height: 1.5)),
          ],
        ],
      ),
    );
  }

  Widget _execCard(ShellAIExecResult? r) {
    if (r == null) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 12),
        child: Row(
          children: [
            SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 10),
            Text("正在远程执行…", style: TextStyle(fontSize: 13, color: AppColors.textLow)),
          ],
        ),
      );
    }
    final ok = r.exitCode == 0;
    final color = ok ? AppColors.green : AppColors.red;
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.panel,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withValues(alpha: 0.45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(ok ? Icons.check_circle_rounded : Icons.error_rounded, size: 15, color: color),
              const SizedBox(width: 7),
              Text(ok ? "执行成功" : "执行失败", style: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w600, color: color)),
              const Spacer(),
              Text("exit ${r.exitCode}", style: monoStyle(11.5, color: AppColors.textLow)),
            ],
          ),
          if (r.stdout.isNotEmpty) ...[
            const SizedBox(height: 10),
            _outputBlock("STDOUT", r.stdout, AppColors.textHi),
          ],
          if (r.stderr.isNotEmpty) ...[
            const SizedBox(height: 8),
            _outputBlock("STDERR", r.stderr, AppColors.red),
          ],
        ],
      ),
    );
  }

  Widget _outputBlock(String label, String text, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700, letterSpacing: 1, color: color)),
        const SizedBox(height: 5),
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
            child: SelectableText(text, style: monoStyle(12, color: color)),
          ),
        ),
      ],
    );
  }

  Widget _loadingCard() {
    return const Padding(
      padding: EdgeInsets.only(bottom: 12),
      child: Row(
        children: [
          SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
          SizedBox(width: 10),
          Text("AI 正在生成命令…", style: TextStyle(fontSize: 13, color: AppColors.textLow)),
        ],
      ),
    );
  }

  Widget _errorCard() {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.red.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.red.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          Icon(Icons.error_outline_rounded, size: 16, color: AppColors.red),
          const SizedBox(width: 8),
          Expanded(
            child: Text(_error!, style: const TextStyle(fontSize: 12.5, color: AppColors.textMid)),
          ),
        ],
      ),
    );
  }

  Widget _inputBar() {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 14),
      decoration: BoxDecoration(
        color: AppColors.panel,
        border: Border(top: BorderSide(color: AppColors.line.withValues(alpha: 0.7))),
      ),
      child: Row(
        children: [
          Expanded(
            child: TextField(
              controller: _inputCtrl,
              minLines: 1,
              maxLines: 4,
              onSubmitted: (_) => _generate(),
              decoration: InputDecoration(
                hintText: "描述你要做的事，例如：看看磁盘还剩多少空间",
                suffixIcon: IconButton(
                  tooltip: "清空",
                  onPressed: () => _inputCtrl.clear(),
                  icon: const Icon(Icons.close_rounded, size: 17, color: AppColors.textLow),
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          FilledButton.icon(
            onPressed: _generating ? null : _generate,
            icon: _generating
                ? const SizedBox(width: 15, height: 15, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.auto_awesome_rounded, size: 17),
            label: Text(_generating ? "生成中" : "生成命令"),
          ),
        ],
      ),
    );
  }
}

class _suggestion extends StatelessWidget {
  final String text;
  const _suggestion(this.text);

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
      decoration: BoxDecoration(
        color: AppColors.panelHi,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.line),
      ),
      child: Text(text, style: const TextStyle(fontSize: 12, color: AppColors.textMid)),
    );
  }
}