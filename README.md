<p align="center">
  <h1 align="center">ProberX</h1>
  <p align="center">轻量级自托管服务器 & 网站监控平台</p>
  <p align="center">监控 · 运维 · 管理 — 一站式 ServerOps</p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go&logoColor=white" alt="Go">
  <img src="https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/TypeScript-5-blue?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/PostgreSQL-TimescaleDB-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
</p>

---

## 简介

ProberX 是一个面向 SaaS 运营的轻量级服务器管理平台。不止于监控 — 它集成了服务器运维工具箱、可视化 Cron、DNS 管理、云备份、应用商店等 14 个工具，覆盖日常运维全链路。

**核心亮点**：

- **Agent Push/Pull 双模式** — Agent 主动注册 + 心跳；Dashboard 也可以拉取指标和远程执行
- **14 个运维工具箱** — 从 systemd 管理到 DNS 解析，从 Docker 镜像到云备份，开箱即用
- **多租户 + RBAC** — 工作空间隔离，Owner/Admin/Editor/Viewer 四级权限，适合 SaaS 运营
- **All-in-One 自托管** — Docker Compose 一键部署，PostgreSQL + Redis + Dashboard + Frontend 开箱即用
- **Go Agent** — 单二进制文件，CPU < 1%，内存 < 30MB，部署零依赖
- **完整国际化** — 中文 / English，管理后台全覆盖

## 技术栈

| 层级 | 技术 |
|------|------|
| **Agent 探针** | Go 1.22, gopsutil v3, Docker Engine API, AWS SDK v2 |
| **后端 API** | Fastify v5, TypeScript 5, Drizzle ORM |
| **前端** | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| **数据库** | PostgreSQL 16 + TimescaleDB (时序数据) |
| **缓存 & 队列** | Redis 7 + BullMQ |
| **实时通信** | WebSocket (Fastify + React) |
| **图表** | Recharts |
| **部署** | Docker Compose, 多阶段构建, systemd |

## 功能概览

### 服务器监控
- CPU / 内存 / 磁盘 / 网络 / 系统负载 实时采集
- GPU 监控（NVIDIA nvidia-smi 集成）
- 历史指标图表（TimescaleDB 超表，支持回放）
- 进程列表、Docker 容器监控（CPU/内存/端口/状态）

### 网站 & 服务探测
- HTTP(S) — URL 可达性、响应时间、状态码、Body 匹配
- TCP — 端口连通性、延迟
- ICMP Ping — 丢包率、RTT
- DNS — 解析结果、解析时间
- SSL 证书 — 过期时间、链验证

### 告警引擎
- 多指标触发：CPU / 内存 / 磁盘 / 响应时间 / 探测成功率
- 三级严重度：警告 / 严重 / 紧急
- 持续时长阈值（避免抖动误报）
- **9 种通知渠道**：Webhook / Slack / Telegram / Discord / Email / 钉钉 / 飞书 / 企业微信 / Telegram Bot

### 14 个运维工具箱

| 工具 | 功能 |
|------|------|
| **Systemd** | 服务列表、启停重启、状态监控 |
| **SSL** | 证书检查（SAN/过期/指纹）、ACME 自动签发续期 |
| **Logs** | journalctl 日志查看、文件日志浏览 |
| **Packages** | apt/yum/dnf 包列表、可升级包检测、批量升级 |
| **Nginx** | 状态查看、配置浏览、虚拟主机 CRUD |
| **App Store** | 18 个预置应用（CMS/DevOps/AI）、Docker Compose 一键部署 |
| **Databases** | MySQL/PostgreSQL/Redis/MongoDB 安装卸载 |
| **Backups** | 文件/数据库备份、恢复、云存储同步 |
| **Security** | SSH 安全审计、端口扫描、Fail2ban 管理 |
| **Shell AI** | 自然语言 → AI → Shell 命令（支持 OpenAI/DeepSeek/Claude） |
| **DNS** | Cloudflare/DNSPod/GoDaddy/Vercel/DO — 统一 Zone/Record CRUD |
| **Docker Images** | 镜像列表、拉取、删除、详情检查、一键清理 |
| **File Manager** | 文件浏览/读写/上传/下载/新建目录/重命名 |
| **Firewall** | iptables 规则管理（查看/添加/删除） |

### 可视化 Cron 任务管理器
- 可视化表达式构建器（预设 + 字段编辑器）
- 人类可读预览（"每天凌晨 2:00"）+ 未来 5 次执行时间
- Server 多选目标、编辑/删除、启用/禁用切换
- 执行历史记录 + 输出查看

### 云备份 (S3/OSS/R2/MinIO)
- 本地备份 → 一键上传云端
- Auto Upload：备份创建后自动同步
- Sync All：一键全量同步
- 保留策略：按天自动清理云端旧备份
- 连接测试：验证 S3 凭证

### 公开状态页
- 自定义 slug，可发布/隐藏
- 实时服务状态（在线/离线/探测结果）

### 多租户 & 安全
- 工作空间隔离，多团队协作
- RBAC：Owner → Admin → Editor → Viewer
- API Key 管理
- JWT 认证 + 速率限制
- CORS 可配置

### 其他
- **WebSSH 终端**：浏览器内交互式终端（Windows ConPTY + Unix PTY）
- **Telegram Bot**：`/start` `/status` `/servers` `/alerts` `/ack` `/exec` 6 个命令
- **PWA**：可安装为桌面应用，离线缓存
- **Website CMS**：官网内容动态管理（中英文双语）

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│                      用户层 (Browser)                         │
│    管理后台 (Next.js) │ 状态页 │ Telegram Bot │ PWA           │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS / WSS
┌───────────────────────────┼──────────────────────────────────┐
│                         应用层                                │
│  ┌────────────────────────────────────────────────────┐      │
│  │           Dashboard (Fastify v5)                     │      │
│  │  REST API (80+ 端点) │ WebSocket │ BullMQ Worker    │      │
│  │  JWT Auth │ Rate Limit │ CORS │ Multipart           │      │
│  └──────────────────────┬─────────────────────────────┘      │
│                         │                                     │
│  ┌──────────────────────┴─────────────────────────────┐      │
│  │         PostgreSQL 16 (+TimescaleDB)  │  Redis 7    │      │
│  │         15 张表 + 2 超表               │ 队列/缓存   │      │
│  └────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
                            │
              HTTP (Push/Pull 双模式)
                            │
┌──────────────────────────────────────────────────────────────┐
│                      探针层 (Agent)                           │
│  Go 1.22 │ Docker Socket │ AWS SDK v2 │ WebSocket Terminal   │
│  指标采集 · 探测执行 · 命令执行 · 工具代理                     │
│  文件管理 · 防火墙 · 备份 · DNS · Docker Images              │
│  (单二进制, CPU<1%, MEM<30MB)                                │
└──────────────────────────────────────────────────────────────┘
```

## 快速开始

### 前提条件

- [Docker](https://docs.docker.com/engine/install/) 20.x+
- [Docker Compose](https://docs.docker.com/compose/install/) 2.x+

### 一键部署

```bash
git clone https://github.com/your-username/proberx.git
cd proberx
bash setup.sh
```

脚本自动：
1. 检查 Docker 环境
2. 生成随机 `JWT_SECRET` 和 `POSTGRES_PASSWORD`
3. 拉取 PostgreSQL + Redis 基础镜像
4. 构建 Dashboard + Frontend 应用镜像
5. 启动全部服务并验证健康检查

### 手动部署

```bash
git clone https://github.com/your-username/proberx.git
cd proberx
cp .env.example .env
# 编辑 .env — 修改 JWT_SECRET 和 POSTGRES_PASSWORD

docker compose -f docker-compose.prod.yml up -d
curl http://localhost:3001/health
```

启动后访问：
- **管理后台**: http://localhost:3000
- **Dashboard API**: http://localhost:3001/health

### 安装 Agent

```bash
# Linux amd64
wget https://github.com/your-username/proberx/releases/latest/download/agent-linux-amd64 -O /usr/local/bin/proberx-agent
chmod +x /usr/local/bin/proberx-agent

export DASHBOARD_URL=http://your-dashboard:3001
export AGENT_TOKEN=your-agent-token
proberx-agent
```

也可以使用一键安装脚本：

```bash
bash scripts/install-agent.sh http://your-dashboard:3001
```

### Agent 环境变量

| 变量 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `DASHBOARD_URL` | 推荐 | - | Dashboard 地址 |
| `AGENT_TOKEN` | 推荐 | - | Agent 认证 Token |
| `AGENT_ID` | 否 | hostname-pid | Agent 唯一 ID |
| `AGENT_HOST` | 否 | 自动检测 | Agent 对外地址 |
| `AGENT_PORT` | 否 | 9800 | HTTP 服务端口 |

## 项目结构

```
ProberX/
├── apps/
│   ├── dashboard/              # 控制中心后端 (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── routes/         # API 路由（13 模块，80+ 端点）
│   │   │   ├── services/       # 业务逻辑层（23 服务）
│   │   │   ├── validators/     # Zod 请求校验
│   │   │   ├── ws/             # WebSocket（连接管理、广播）
│   │   │   ├── plugins/        # Fastify 插件（DB/Redis/Auth/限流）
│   │   │   ├── queues/         # BullMQ 工作队列
│   │   │   ├── db/schema/     # Drizzle ORM Schema（15 表）
│   │   │   └── middleware/     # 中间件
│   │   └── Dockerfile
│   │
│   ├── frontend/               # Web 前端 (Next.js 16 + React 19)
│   │   ├── src/
│   │   │   ├── app/            # App Router（15 页面）
│   │   │   ├── components/     # 60+ UI 组件
│   │   │   ├── hooks/          # React Query Hooks
│   │   │   ├── stores/         # Zustand 状态管理
│   │   │   └── lib/            # 工具库 + i18n (中/英)
│   │   └── Dockerfile
│   │
│   ├── agent/                  # 探针客户端 (Go)
│   │   ├── internal/
│   │   │   ├── handlers/       # HTTP 处理器（1000+ 行）
│   │   │   ├── tools/          # 10 个运维工具模块
│   │   │   ├── docker/         # Docker Engine API 客户端
│   │   │   ├── metrics/        # 系统指标采集 (gopsutil)
│   │   │   ├── probe/          # 探测执行
│   │   │   ├── exec/           # 命令执行
│   │   │   ├── fileops/        # 文件操作
│   │   │   ├── firewall/       # iptables 管理
│   │   │   ├── terminal/       # WebSSH 终端
│   │   │   └── loops/          # 后台协程（注册/心跳/推送）
│   │   └── main.go
│   │
│   ├── website/                # 官网 CMS (Fastify + SQLite)
│   └── telegram-bot/           # Telegram Bot 独立服务 (grammy)
│
├── scripts/
│   ├── tunnel.sh               # SSH 双向隧道持久化
│   ├── install-agent.sh        # Agent 一键安装
│   └── seed-app-store.js       # 应用商店数据填充
│
├── docker-compose.yml          # 开发环境（PG + Redis）
├── docker-compose.prod.yml     # 生产环境（完整服务栈）
├── setup.sh                    # 一键部署脚本
├── .env.example                # 环境变量模板
├── CONTRIBUTING.md             # 贡献者指南
├── DEVELOPMENT.md              # 架构/数据模型/API/协议文档
└── .github/workflows/          # CI/CD（TS 编译 + Go 构建）
```

## API 概览

所有 API 以 `/api/v1/` 为前缀，JWT Bearer Token 认证。超过 80 个端点。

```
# 认证
POST   /auth/register /login /refresh /oauth

# 工作空间 + 成员
GET|POST   /workspaces
PATCH|DEL  /workspaces/:wid
GET|PATCH  /workspaces/:wid/members
DEL        /workspaces/:wid/members/:uid

# 服务器管理
GET|POST   /workspaces/:wid/servers
PATCH|DEL  /workspaces/:wid/servers/:id
GET        /workspaces/:wid/servers/:id/metrics
POST       /workspaces/:wid/servers/:id/regenerate-token

# 监控 & 探测
CRUD       /workspaces/:wid/monitors
GET        /workspaces/:wid/monitors/:id/probe-results

# 告警 & 通知
CRUD       /workspaces/:wid/alerts
GET        /workspaces/:wid/alert-events
CRUD       /workspaces/:wid/notifications

# Cron 任务
CRUD       /workspaces/:wid/cronjobs
POST       /workspaces/:wid/cronjobs/preview
GET        /workspaces/:wid/cronjobs/:id/executions

# API Key
CRUD       /workspaces/:wid/api-keys

# 状态页 & 公开
CRUD       /workspaces/:wid/status-pages
GET        /public/status/:slug

# 运维工具 (14 个)
GET|POST   /workspaces/:wid/servers/:id/tools/services
GET|POST   /workspaces/:wid/servers/:id/tools/ssl/...
GET        /workspaces/:wid/servers/:id/tools/logs/...
GET|POST   /workspaces/:wid/servers/:id/tools/packages/...
GET|POST   /workspaces/:wid/servers/:id/tools/nginx/...
CRUD       /workspaces/:wid/servers/:id/tools/deploy/...
CRUD       /workspaces/:wid/servers/:id/tools/databases/...
CRUD       /workspaces/:wid/servers/:id/tools/backups/...
CRUD       /workspaces/:wid/servers/:id/tools/backups/cloud/...
GET|POST   /workspaces/:wid/servers/:id/tools/security/...
POST       /workspaces/:wid/servers/:id/tools/shell-ai/...
CRUD       /workspaces/:wid/servers/:id/tools/dns/...
GET|POST   /workspaces/:wid/servers/:id/images/...

# 文件管理
GET        /workspaces/:wid/servers/:id/files/list
POST       /workspaces/:wid/servers/:id/files/upload

# WebSocket
WSS        /ws?token=...&workspaceId=...

# 健康检查
GET        /health
```

## 与同类产品对比

| 特性 | ProberX | Nezha | Uptime Kuma | Grafana |
|------|---------|-------|-------------|---------|
| 技术栈 | Go + TS | Go | Node.js | Go |
| 实时监控 | ✓ | ✓ | ✓ | ✓ |
| 运维工具箱 | **14 个** | 2 个 | 0 | 0 |
| 可视化 Cron | ✓ | - | - | - |
| 云存储备份 | ✓ | - | - | - |
| DNS 管理 | ✓ | - | - | - |
| 公开状态页 | ✓ | - | ✓ | - |
| 多租户 | ✓ (4 级) | - | - | ✓ (企业) |
| PWA | ✓ | - | - | - |
| WebSSH 终端 | ✓ | ✓ | - | - |
| 国际化 | 中/英 | - | - | - |
| 时序数据库 | TimescaleDB | SQLite | SQLite | Prometheus |
| Agent 大小 | ~10MB | ~15MB | N/A | ~20MB |

## 开发

### 环境要求
- Node.js 22+
- Go 1.22+
- PostgreSQL 16+ (推荐 TimescaleDB)
- Redis 7+

### 启动开发环境

```bash
# 1. 基础服务
docker compose up -d

# 2. Dashboard (3001)
cd apps/dashboard
cp .env.example .env
npm install && npm run dev

# 3. Frontend (3000)
cd apps/frontend
npm install && npm run dev

# 4. Agent (9800)
cd apps/agent
go build -o agent .
DASHBOARD_URL=http://localhost:3001 go run .
```

### 运行测试

```bash
cd apps/dashboard && npm test       # vitest
cd apps/frontend && npm test        # vitest (63 tests)
cd apps/agent && go test ./...      # Go tests
cd apps/agent && go vet ./...       # Go lint
```

## 路线图

- [x] Agent 系统指标 + GPU + Docker 容器监控
- [x] HTTP/TCP/Ping/DNS/SSL 探测
- [x] 告警引擎 + 9 种通知渠道
- [x] 可视化 Cron 任务管理器
- [x] 14 个运维工具箱
- [x] 应用商店（18 个一键部署应用）
- [x] 云存储备份（S3/OSS/R2/MinIO + 自动同步）
- [x] DNS 管理（5 服务商统一接口）
- [x] Docker 镜像管理
- [x] 多租户 + 4 级 RBAC
- [x] 公开状态页 + PWA
- [x] WebSSH 终端 (Windows + Unix)
- [x] Telegram Bot 独立服务
- [x] 国际化（中文 / English）
- [x] Website CMS
- [ ] 暗色模式 / 主题切换
- [ ] 文件版本历史 (Git-like)
- [ ] SSO/SAML 集成
- [ ] 白标（自定义域名/Logo/主题色）

## 贡献

欢迎贡献！详见 [CONTRIBUTING.md](./CONTRIBUTING.md)

## License

MIT

---

<p align="center">
  <sub>Built with ❤️</sub>
</p>
