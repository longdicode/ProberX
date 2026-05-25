<p align="center">
  <h1 align="center">ProberX</h1>
  <p align="center">轻量级自托管服务器 & 网站监控平台</p>
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

ProberX 是一个面向 SaaS 运营的轻量级服务器 & 网站监控平台。支持实时指标采集、多类型探测、告警引擎、计划任务、公开状态页。采用多租户架构，适合团队协作或对外提供监控服务。

**核心亮点**：

- **Agent 推送模式** — 无需公网可达，Agent 主动上报指标和心跳，适用于 NAT/防火墙后的服务器
- **多租户 + RBAC** — 工作空间隔离，Owner/Admin/Editor/Viewer 四级权限，适合 SaaS 运营
- **All-in-One 自托管** — Docker Compose 一键部署，PostgreSQL + Redis + Dashboard + Frontend 开箱即用
- **Go Agent** — 6.6MB 单二进制文件，CPU < 1%，内存 < 30MB，部署零依赖

## 技术栈

| 层级 | 技术 |
|------|------|
| **Agent 探针** | Go 1.22, gopsutil v3 |
| **后端 API** | Fastify v5, TypeScript 5, Drizzle ORM |
| **前端** | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| **数据库** | PostgreSQL + TimescaleDB (时序数据) |
| **缓存 & 队列** | Redis 7 + BullMQ |
| **实时通信** | WebSocket (Fastify WebSocket) |
| **图表** | Recharts |
| **部署** | Docker Compose, 多阶段构建 |

## 功能概览

### 服务器监控
- CPU / 内存 / 磁盘 / 网络 / 系统负载实时采集
- Agent 每 60s 推送指标，每 30s 心跳
- 历史指标图表（TimescaleDB 超表）
- 进程列表、Shell 命令远程执行

### 网站 & 服务探测
- HTTP(S) — URL 可达性、响应时间、状态码、Body 匹配
- TCP — 端口连通性、延迟
- ICMP Ping — 丢包率、RTT、抖动
- DNS — 解析结果、解析时间
- SSL 证书 — 过期时间、证书链验证

### 告警引擎
- CPU / 内存 / 磁盘 / 响应时间 / 探测成功率 多指标触发
- 三级告警：警告 / 严重 / 紧急
- 持续时长阈值（避免抖动误报）
- 通知渠道：邮件、Webhook、钉钉、飞书、企业微信、Telegram

### 计划任务 (CronJob)
- 标准 Cron 表达式，批量服务器执行
- 执行历史记录 & 输出查看

### 公开状态页
- 自定义 slug，可发布/隐藏
- 实时服务状态展示
- 支持自定义域名、Logo、主题色（计划中）

### 多租户 & 权限
- 工作空间隔离，一个账号可加入多个团队
- RBAC：Owner → Admin → Editor → Viewer
- API Key 管理 & 开放 API

## 架构

```
┌──────────────────────────────────────────────────────────────┐
│                      用户层 (Browser)                         │
│    管理后台 (Next.js) │ 状态页面 │ API 文档                    │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS / WSS
┌───────────────────────────┼──────────────────────────────────┐
│                         应用层                                │
│  ┌────────────────────────────────────────────────────┐      │
│  │              Dashboard (Fastify)                     │      │
│  │  REST API │ WebSocket │ BullMQ Worker │ Auth (JWT)  │      │
│  └──────────────────────┬─────────────────────────────┘      │
│                         │                                     │
│  ┌──────────────────────┴─────────────────────────────┐      │
│  │         PostgreSQL (+TimescaleDB)  │  Redis         │      │
│  │         业务数据 + 时序指标          │  缓存 / 队列   │      │
│  └────────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────┘
                            │
                    HTTP (Push Mode)
                            │
┌──────────────────────────────────────────────────────────────┐
│                      探针层 (Agent)                           │
│     Linux Agent │ Windows Agent │ macOS Agent │ Docker Agent  │
│     (Go 单二进制, 6.6MB, CPU<1%, MEM<30MB)                   │
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

脚本会自动：
1. 检查 Docker 环境
2. 生成随机 `JWT_SECRET` 和 `POSTGRES_PASSWORD` 写入 `.env`
3. 拉取 PostgreSQL + Redis 基础镜像
4. 构建 Dashboard + Frontend 应用镜像
5. 启动所有服务
6. 验证 Dashboard 健康检查

### 手动部署

```bash
# 1. 克隆并配置环境变量
git clone https://github.com/your-username/proberx.git
cd proberx
cp .env.example .env
# 编辑 .env，修改 JWT_SECRET 和 POSTGRES_PASSWORD

# 2. 构建并启动
docker compose -f docker-compose.prod.yml up -d

# 3. 验证
curl http://localhost:3001/health
```

启动后访问：
- **管理后台**: http://localhost:3000
- **Dashboard API**: http://localhost:3001/health

### 安装 Agent

在被监控的服务器上下载并运行 Agent：

```bash
# 下载对应平台的 Agent 二进制
# Linux amd64
wget https://github.com/your-username/proberx/releases/latest/download/agent-linux-amd64 -O /usr/local/bin/proberx-agent
chmod +x /usr/local/bin/proberx-agent

# 启动 Agent
export DASHBOARD_URL=http://your-dashboard:3001
export AGENT_TOKEN=your-agent-token
proberx-agent
```

或者使用 Docker：

```bash
docker run -d \
  -e DASHBOARD_URL=http://your-dashboard:3001 \
  -e AGENT_TOKEN=your-agent-token \
  --net=host \
  proberx-agent:latest
```

Agent 启动后会自动注册到 Dashboard，无需额外配置。

### Agent 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DASHBOARD_URL` | 推荐 | Dashboard 地址，如 `http://192.168.1.100:3001` |
| `AGENT_TOKEN` | 推荐 | Agent 认证 Token（在 Dashboard 服务器管理页面生成） |
| `AGENT_ID` | 否 | Agent 唯一 ID（默认自动生成：hostname-pid） |
| `AGENT_HOST` | 否 | Agent 对外可达地址（默认从注册请求 IP 自动推断） |
| `AGENT_PORT` | 否 | HTTP 服务端口（默认 9800） |

## 项目结构

```
ProberX/
├── apps/
│   ├── dashboard/              # 控制中心后端 (Fastify + TypeScript)
│   │   ├── src/
│   │   │   ├── routes/         # API 路由（13 个模块，52+ 端点）
│   │   │   ├── services/       # 业务逻辑层（23 个服务）
│   │   │   ├── validators/     # Zod 请求校验
│   │   │   ├── ws/             # WebSocket 管理（连接、广播、认证）
│   │   │   ├── plugins/        # Fastify 插件（DB, Redis, Auth, JWT）
│   │   │   ├── db/schema/     # Drizzle ORM Schema（14 张表）
│   │   │   └── middleware/     # 中间件
│   │   ├── Dockerfile
│   │   └── package.json
│   │
│   ├── frontend/               # Web 前端 (Next.js 16 + React 19)
│   │   ├── src/
│   │   │   ├── app/            # App Router 页面（12 个路由）
│   │   │   ├── components/     # UI 组件 + shadcn/ui
│   │   │   ├── hooks/          # 自定义 Hooks (use-api, use-websocket)
│   │   │   ├── stores/         # Zustand 状态管理（4 个 store）
│   │   │   └── lib/            # 工具库 + i18n (中/英)
│   │   ├── Dockerfile
│   │   ├── next.config.ts
│   │   └── package.json
│   │
│   └── agent/                  # 探针客户端 (Go)
│       ├── internal/
│       │   ├── metrics/        # 系统指标采集 (gopsutil)
│       │   ├── probe/          # 探测执行 (HTTP/TCP/Ping/DNS/SSL)
│       │   ├── exec/           # 命令执行
│       │   └── process/        # 进程列表
│       ├── main.go             # 入口，HTTP Server + 后台协程
│       ├── Dockerfile
│       └── go.mod
│
├── docker-compose.yml          # 开发环境（仅 PG + Redis）
├── docker-compose.prod.yml     # 生产环境（完整服务栈）
├── setup.sh                    # 一键部署脚本
├── .env.example                # 环境变量模板
├── DEVELOPMENT.md              # 详细开发文档（架构/数据模型/API/协议）
├── DEVELOPMENT_PROGRESS.md     # 开发进度跟踪
└── .github/workflows/ci.yml    # CI/CD (TypeScript 编译 + Go 构建)
```

## API 概览

所有 API 以 `/api/v1/` 为前缀，JWT Bearer Token 认证。

```
# 认证
POST   /api/v1/auth/register              # 注册
POST   /api/v1/auth/login                 # 登录
POST   /api/v1/auth/refresh               # 刷新 Token
POST   /api/v1/auth/oauth                 # GitHub OAuth

# 工作空间
GET    /api/v1/workspaces                 # 工作空间列表
POST   /api/v1/workspaces                 # 创建工作空间
GET    /api/v1/workspaces/:wid            # 工作空间详情
PATCH  /api/v1/workspaces/:wid            # 更新工作空间
DELETE /api/v1/workspaces/:wid            # 删除

# 服务器
GET    /api/v1/workspaces/:wid/servers              # 服务器列表
POST   /api/v1/workspaces/:wid/servers              # 添加服务器
GET    /api/v1/workspaces/:wid/servers/:id          # 服务器详情
PATCH  /api/v1/workspaces/:wid/servers/:id          # 更新
DELETE /api/v1/workspaces/:wid/servers/:id          # 删除
GET    /api/v1/workspaces/:wid/servers/:id/metrics  # 历史指标

# 监控探测
GET    /api/v1/workspaces/:wid/monitors             # 监控列表
POST   /api/v1/workspaces/:wid/monitors             # 创建监控
PATCH  /api/v1/workspaces/:wid/monitors/:id         # 更新
DELETE /api/v1/workspaces/:wid/monitors/:id         # 删除

# 告警
GET    /api/v1/workspaces/:wid/alerts               # 告警规则
POST   /api/v1/workspaces/:wid/alerts               # 创建告警
GET    /api/v1/workspaces/:wid/alert-events         # 告警事件

# 通知
GET    /api/v1/workspaces/:wid/notifications        # 通知渠道
POST   /api/v1/workspaces/:wid/notifications        # 添加渠道

# 计划任务
GET    /api/v1/workspaces/:wid/cronjobs             # 任务列表
POST   /api/v1/workspaces/:wid/cronjobs             # 创建任务

# 状态页
GET    /api/v1/workspaces/:wid/status-pages         # 状态页列表
POST   /api/v1/workspaces/:wid/status-pages         # 创建

# 公开（无需认证）
GET    /api/v1/public/status/:slug                  # 状态页数据

# Agent 内部
POST   /api/v1/agent/register                       # Agent 注册
POST   /api/v1/agent/heartbeat                      # 心跳
POST   /api/v1/agent/metrics                        # 推送指标
```

## 与同类产品对比

| 特性 | ProberX | Nezha | Uptime Kuma | Grafana + Prometheus |
|------|---------|-------|-------------|---------------------|
| 技术栈 | Go + Node.js | Go | Node.js | Go |
| 实时监控 | ✓ | ✓ | ✓ | ✓ |
| 公开状态页 | ✓ | - | ✓ | - |
| 多租户 | ✓ (核心能力) | - | - | - |
| RBAC | 4 级 | 2 级 | - | ✓ (企业版) |
| 计划任务 | ✓ | - | - | - |
| Agent 推送模式 | ✓ | ✓ (gRPC) | 无需 Agent | Node Exporter |
| 时序数据库 | TimescaleDB | SQLite/MySQL | SQLite | Prometheus TSDB |
| 告警引擎 | ✓ (多级) | ✓ | ✓ | ✓ (Grafana Alerting) |
| 自托管 | ✓ | ✓ | ✓ | ✓ |
| Agent 二进制大小 | 6.6MB | ~15MB | N/A | ~20MB |

## 开发

### 环境要求

- Node.js 22+
- Go 1.22+
- PostgreSQL 16+ (推荐 TimescaleDB)
- Redis 7+

### 启动开发环境

```bash
# 1. 启动基础服务
docker compose up -d

# 2. 启动 Dashboard (端口 3001)
cd apps/dashboard
cp .env.example .env      # 编辑 .env 配置数据库连接
npm install
npm run dev

# 3. 启动 Frontend (端口 3000)
cd apps/frontend
npm install
npm run dev

# 4. 构建并启动 Agent (端口 9800)
cd apps/agent
go build -o agent .
export DASHBOARD_URL=http://localhost:3001
export AGENT_PORT=9800
./agent
```

### 运行测试

```bash
# Dashboard 单元测试
cd apps/dashboard && npm test

# Agent 单元测试
cd apps/agent && go test ./...
```

## 路线图

- [x] Agent 系统指标采集（CPU/内存/磁盘/网络/负载）
- [x] Agent 注册 + 心跳 + 指标推送
- [x] HTTP/TCP/Ping/DNS/SSL 探测
- [x] 告警引擎 + 多通知渠道
- [x] 计划任务 (CronJob)
- [x] 多租户 + RBAC 权限
- [x] 公开状态页
- [x] API Key + 开放 API
- [x] Docker Compose 生产部署
- [x] WebSocket 实时推送
- [x] 国际化（中文 / English）
- [ ] GPU 监控
- [ ] Docker 容器监控
- [ ] WebSSH 终端
- [ ] SSO/SAML 集成
- [ ] 白标（自定义域名、Logo、主题）
- [ ] 移动端 PWA
- [ ] Agent 自更新

## License

MIT

---

<p align="center">
  <sub>Made with ❤️ by the ProberX Team</sub>
</p>
