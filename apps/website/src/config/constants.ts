function bi(zh: any, en: any) { return { zh, en }; }

export const DEFAULT_SECTIONS: Record<string, { title: string; content: any }> = {
  meta: {
    title: "Site Meta",
    content: bi(
      { siteName: "ProberX", title: "ProberX — AI 驱动的服务器管理平台", desc: "集成 AI Shell 助手、智能告警、14 个运维工具的轻量级自托管服务器管理平台。", lang: "zh-CN" },
      { siteName: "ProberX", title: "ProberX — AI-Driven ServerOps Platform", desc: "Lightweight self-hosted server management with AI Shell, smart alerts, and 14 ops tools.", lang: "en" },
    ),
  },
  nav: {
    title: "Navigation",
    content: bi(
      { logoText: "ProberX", links: [{ label: "功能", href: "#features" }, { label: "工具", href: "#tools" }, { label: "部署", href: "#deploy" }, { label: "文档", href: "/docs" }], ctaText: "GitHub", ctaLink: "https://github.com/longdicode/ProberX" },
      { logoText: "ProberX", links: [{ label: "Features", href: "#features" }, { label: "Tools", href: "#tools" }, { label: "Deploy", href: "#deploy" }, { label: "Docs", href: "/docs" }], ctaText: "GitHub", ctaLink: "https://github.com/longdicode/ProberX" },
    ),
  },
  hero: {
    title: "Hero",
    content: bi(
      { badge: "v2.0 · AI 驱动", line1: "AI 驱动的", line2: "服务器管理平台", subtitle: "集成 AI Shell 助手、智能告警引擎、14 个运维工具。轻量自托管，一行命令部署。", ctaPrimaryText: "免费使用", ctaPrimaryLink: "http://156.238.249.22:3000", ctaSecondaryText: "阅读文档", ctaSecondaryLink: "/docs" },
      { badge: "v2.0 · AI-Driven", line1: "AI-Driven", line2: "ServerOps Platform", subtitle: "AI Shell assistant, smart alerts, 14 ops tools. Lightweight self-hosted, one-command deploy.", ctaPrimaryText: "Live Demo", ctaPrimaryLink: "http://156.238.249.22:3000", ctaSecondaryText: "Documentation", ctaSecondaryLink: "/docs" },
    ),
  },
  features: {
    title: "Features",
    content: bi(
      { label: "核心能力", title: "不止于监控", desc: "将 AI 能力融入日常运维，让服务器管理更智能、更高效。",
        items: [
          { bg: "#eff6ff", color: "#2563eb", icon_svg: '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><polyline points="22 11 12 3 2 11"/>', title: "全维度实时监控", desc: "CPU、内存、磁盘、网络、GPU 全维度指标，60s 轮询 + WebSocket 实时推送，支持历史数据回放。" },
          { bg: "#f0fdf4", color: "#16a34a", icon_svg: '<path d="M12 3a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2h-2V7a4 4 0 0 0-4-4z"/><circle cx="12" cy="14" r="2"/><path d="M14 21h-4"/><path d="M10 3v3"/><path d="M14 3v3"/>', title: "Shell AI 助手", desc: "自然语言描述需求 → AI 生成安全命令 → 一键执行。支持 OpenAI、DeepSeek、Claude 多种模型。" },
          { bg: "#fef3c7", color: "#d97706", icon_svg: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/><circle cx="12" cy="8" r="1"/>', title: "智能告警引擎", desc: "多指标触发 + 持续时长阈值，9 种通知渠道。支持钉钉、飞书、企业微信、Telegram Bot。" },
          { bg: "#f3e8ff", color: "#9333ea", icon_svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>', title: "安全审计中心", desc: "SSH 配置审计、端口扫描、Fail2ban 管理。一键发现安全隐患并给出修复建议。" },
          { bg: "#fce4ec", color: "#e11d48", icon_svg: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9z"/><path d="M14 15l-2 2-2-2"/><path d="M12 17V9"/>', title: "S3 云备份", desc: "支持 AWS S3 / 阿里云 OSS / Cloudflare R2 / MinIO。自动同步、保留策略、一键恢复。" },
          { bg: "#e0f2fe", color: "#0284c7", icon_svg: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/><path d="M8 4.5A8 8 0 0 1 20 12"/>', title: "可视化 Cron 任务", desc: "预设 + 自定义 Cron 表达式编辑器，人类可读预览。Server 多选，启用/禁用一键切换。" },
        ]
      },
      { label: "Core Features", title: "Beyond Monitoring", desc: "Bring AI into daily operations. Smarter, more efficient server management.",
        items: [
          { bg: "#eff6ff", color: "#2563eb", icon_svg: '<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', title: "Full-Stack Monitoring", desc: "CPU, memory, disk, network, GPU metrics. 60s polling + WebSocket push. Historical playback." },
          { bg: "#f0fdf4", color: "#16a34a", icon_svg: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>', title: "Shell AI Assistant", desc: "Natural language → safe shell commands → execute. Supports OpenAI, DeepSeek, Claude." },
          { bg: "#fef3c7", color: "#d97706", icon_svg: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>', title: "Smart Alert Engine", desc: "Multi-metric triggers + duration thresholds. 9 notification channels. DingTalk, Feishu, WeCom, Telegram." },
          { bg: "#f3e8ff", color: "#9333ea", icon_svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', title: "Security Audit", desc: "SSH config audit, port scanning, Fail2ban management. Detect security risks automatically." },
          { bg: "#fce4ec", color: "#e11d48", icon_svg: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>', title: "S3 Cloud Backup", desc: "AWS S3 / Aliyun OSS / Cloudflare R2 / MinIO. Auto-sync, retention policies, one-click restore." },
          { bg: "#e0f2fe", color: "#0284c7", icon_svg: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', title: "Visual Cron Builder", desc: "Preset + custom cron expression editor. Human-readable preview. Multi-server, toggle enable/disable." },
        ]
      },
    ),
  },
  tools: {
    title: "Tools",
    content: bi(
      { label: "运维工具箱", title: "14 个工具，覆盖全链路", desc: "从系统服务到 DNS 管理，从备份恢复到云同步，一站式解决日常运维需求。",
        chips: [{ name: "Systemd 服务管理" }, { name: "SSL 证书签发续期" }, { name: "日志查看器" }, { name: "软件包管理" }, { name: "Nginx 可视化管理" }, { name: "应用商店 & 部署" }, { name: "数据库管理" }, { name: "备份恢复 + 云同步" }, { name: "安全审计中心" }, { name: "Shell AI 助手" }, { name: "DNS 多商管理" }, { name: "Docker 镜像管理" }, { name: "文件管理器" }, { name: "防火墙规则" }]
      },
      { label: "Ops Tools", title: "14 Tools, Full Coverage", desc: "From system services to DNS management, from backup to cloud sync — one platform for all operations.",
        chips: [{ name: "Systemd Services" }, { name: "SSL Certificates" }, { name: "Log Viewer" }, { name: "Package Manager" }, { name: "Nginx Manager" }, { name: "App Store & Deploy" }, { name: "Database Manager" }, { name: "Backup & Cloud Sync" }, { name: "Security Center" }, { name: "Shell AI" }, { name: "DNS Manager" }, { name: "Docker Images" }, { name: "File Manager" }, { name: "Firewall" }]
      },
    ),
  },
  stats: {
    title: "Stats",
    content: bi(
      { items: [{ num: "14+", label: "运维工具" }, { num: "80+", label: "API 端点" }, { num: "5", label: "DNS 服务商" }, { num: "9", label: "通知渠道" }] },
      { items: [{ num: "14+", label: "Ops Tools" }, { num: "80+", label: "API Endpoints" }, { num: "5", label: "DNS Providers" }, { num: "9", label: "Alert Channels" }] },
    ),
  },
  deploy: {
    title: "Deploy",
    content: bi(
      { label: "部署方式", title: "两种方案，同样简单", cards: [
        { badge: "DOCKER", title: "Docker Compose 一键部署", desc: "PostgreSQL + Redis + Dashboard + Frontend 四容器开箱即用，setup.sh 自动配置环境变量。", link: "/docs", arrow: "查看文档" },
        { badge: "AGENT", title: "Agent 一行命令安装", desc: "Go 单二进制文件，CPU < 1%，内存 < 30MB。零依赖，支持 Linux / Windows / macOS。", link: "/docs#install-agent", arrow: "安装指南" },
      ]},
      { label: "Deploy", title: "Two Ways, Simple Setup", cards: [
        { badge: "DOCKER", title: "Docker Compose Deploy", desc: "PostgreSQL + Redis + Dashboard + Frontend. Four containers, fully containerized. setup.sh auto-configures.", link: "/docs", arrow: "View Docs" },
        { badge: "AGENT", title: "One Command Agent Install", desc: "Go single binary, CPU < 1%, MEM < 30MB. Zero dependencies. Linux / Windows / macOS.", link: "/docs#install-agent", arrow: "Install Guide" },
      ]},
    ),
  },
  footer: {
    title: "Footer",
    content: bi(
      { copyright: "© 2026 ProberX. Self-hosted ServerOps, redefined." },
      { copyright: "© 2026 ProberX. Self-hosted ServerOps, redefined." },
    ),
  },
  i18n: {
    title: "i18n",
    content: bi(
      { langSwitch: "English" },
      { langSwitch: "中文" },
    ),
  },
};
