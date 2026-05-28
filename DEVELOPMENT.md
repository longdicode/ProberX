# ProberX — 服务器监控系统 · 开发文档

> **定位**：面向 SaaS 运营的轻量级服务器 & 网站监控平台，支持多租户、订阅计费、白标部署。
> **技术栈**：Node.js / TypeScript / PostgreSQL / Redis / React

---

## 目录

1. [系统架构总览](#1-系统架构总览)
2. [项目结构](#2-项目结构)
3. [核心组件设计](#3-核心组件设计)
4. [数据模型](#4-数据模型)
5. [API 设计](#5-api-设计)
6. [通信协议](#6-通信协议)
7. [前端架构](#7-前端架构)
8. [运营体系](#8-运营体系)
9. [部署方案](#9-部署方案)
10. [开发路线图](#10-开发路线图)

---

## 1. 系统架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                      用户层 (Browser / App)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────┐ │
│  │ 管理后台  │  │ 状态页面  │  │ API 文档  │  │  移动端 PWA  │ │
│  └─────┬────┘  └─────┬────┘  └─────┬────┘  └──────┬──────┘ │
└────────┼─────────────┼─────────────┼───────────────┼────────┘
         │             │             │               │
         └─────────────┴──────┬──────┴───────────────┘
                              │  HTTPS / WSS
┌─────────────────────────────┼──────────────────────────────┐
│                      网关层 (Nginx / Traefik)                │
└─────────────────────────────┼──────────────────────────────┘
                              │
┌─────────────────────────────┼──────────────────────────────┐
│                    应用层 (ProberX Platform)                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                  Dashboard (控制中心)                   │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │REST API │ │ WS Gate │ │Job Sched │ │Auth Svc  │  │  │
│  │  └────┬────┘ └────┬────┘ └────┬─────┘ └────┬─────┘  │  │
│  └───────┼───────────┼──────────┼────────────┼────────┘  │
│          │           │          │            │            │
│  ┌───────┼───────────┼──────────┼────────────┼────────┐  │
│  │                   数据 & 缓存层                      │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────────────────┐  │  │
│  │  │PostgreSQL│ │ Redis   │ │ InfluxDB/TimescaleDB │  │  │
│  │  │(业务数据) │ │(缓存/Pub)│ │   (时序指标数据)      │  │  │
│  │  └─────────┘ └─────────┘ └──────────────────────┘  │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
                              │
                   WebSocket / gRPC (双向流)
                              │
┌──────────────────────────────────────────────────────────┐
│                    探针层 (ProberX Agent)                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Linux    │  │ Windows  │  │ macOS    │  │ Docker   │ │
│  │ Agent    │  │ Agent    │  │ Agent    │  │ Agent    │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
└──────────────────────────────────────────────────────────┘
```

### 架构决策记录 (ADR)

| 决策 | 选择 | 理由 |
|------|------|------|
| 后端语言 | Node.js + TypeScript | 生态丰富、前后端统一语言、异步 I/O 天然适合高并发连接 |
| 通信协议 | WebSocket（Agent↔Dashboard） | 双向实时、防火墙友好、比 gRPC 更易调试 |
| 主数据库 | PostgreSQL | 成熟可靠、JSONB 支持、丰富生态 |
| 时序数据 | TimescaleDB (PG 扩展) | 避免引入新数据库、自动分区、时序优化 |
| 缓存 & 消息 | Redis | 会话管理、实时 Pub/Sub、速率限制 |
| 前端框架 | Next.js 14 (App Router) | SSR/SSG、API Routes、React Server Components |
| UI 组件库 | shadcn/ui + Tailwind CSS | 可定制、无 vendor lock-in |
| ORM | Drizzle ORM | 类型安全、轻量、PG 原生特性支持好 |
| 任务调度 | BullMQ (Redis-based) | 持久化 Job、重试机制、可视化面板 |

---

## 2. 项目结构

```
ProberX/
├── apps/
│   ├── dashboard/              # 控制中心后端 (Node.js)
│   │   ├── src/
│   │   │   ├── api/            # REST API 路由
│   │   │   │   ├── auth/       # 认证相关
│   │   │   │   ├── servers/    # 服务器管理
│   │   │   │   ├── monitors/   # 监控配置
│   │   │   │   ├── alerts/     # 告警规则
│   │   │   │   ├── tasks/      # 计划任务
│   │   │   │   ├── workspace/  # 工作空间/团队
│   │   │   │   ├── billing/    # 计费
│   │   │   │   └── admin/      # 平台管理
│   │   │   ├── core/           # 核心模块
│   │   │   │   ├── agent-gateway/  # Agent 连接管理
│   │   │   │   ├── alert-engine/   # 告警引擎
│   │   │   │   ├── monitor-scheduler/ # 监控调度
│   │   │   │   ├── task-executor/    # 任务执行器
│   │   │   │   ├── notification/     # 通知分发
│   │   │   │   └── metrics-store/    # 指标存储
│   │   │   ├── db/             # 数据库
│   │   │   │   ├── schema/     # Drizzle Schema
│   │   │   │   └── migrations/ # 迁移文件
│   │   │   ├── services/       # 业务逻辑层
│   │   │   ├── middleware/      # 中间件
│   │   │   ├── utils/          # 工具函数
│   │   │   └── config/         # 配置
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── frontend/               # 前端 Web 应用 (Next.js)
│   │   ├── src/
│   │   │   ├── app/            # Next.js App Router
│   │   │   │   ├── (dashboard)/# 控制台布局
│   │   │   │   ├── (status)/   # 公开状态页
│   │   │   │   └── (auth)/     # 登录/注册
│   │   │   ├── components/     # 组件
│   │   │   │   ├── ui/         # shadcn/ui 组件
│   │   │   │   ├── charts/     # 图表组件
│   │   │   │   ├── monitors/   # 监控面板组件
│   │   │   │   └── layout/     # 布局组件
│   │   │   ├── hooks/          # 自定义 Hooks
│   │   │   ├── lib/            # 工具库
│   │   │   └── styles/         # 样式
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── agent/                  # 探针客户端 (Node.js)
│       ├── src/
│       │   ├── collectors/     # 指标采集器
│       │   │   ├── cpu.ts
│       │   │   ├── memory.ts
│       │   │   ├── disk.ts
│       │   │   ├── network.ts
│       │   │   ├── process.ts
│       │   │   ├── docker.ts
│       │   │   └── gpu.ts
│       │   ├── probes/         # 探测模块
│       │   │   ├── http.ts
│       │   │   ├── tcp.ts
│       │   │   ├── ping.ts
│       │   │   ├── dns.ts
│       │   │   └── ssl.ts
│       │   ├── transport/      # 通信层
│       │   │   ├── websocket.ts
│       │   │   └── grpc.ts
│       │   ├── executor/       # 任务执行
│       │   │   ├── shell.ts
│       │   │   └── webssh.ts
│       │   ├── updater/        # 自更新
│       │   └── index.ts        # 入口
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── shared/                 # 共享类型 & 工具
│   │   ├── src/
│   │   │   ├── types/          # 共享类型定义
│   │   │   ├── constants/      # 常量
│   │   │   ├── validation/     # Zod schema
│   │   │   └── utils/          # 工具函数
│   │   └── package.json
│   │
│   ├── proto/                  # Protobuf 定义
│   │   └── agent.proto
│   │
│   └── ui/                     # 共享 UI 组件库
│       └── package.json
│
├── deploy/
│   ├── docker/                 # Docker 部署
│   │   ├── docker-compose.yml
│   │   ├── dashboard.Dockerfile
│   │   ├── frontend.Dockerfile
│   │   └── agent.Dockerfile
│   └── k8s/                    # Kubernetes 部署
│
├── docs/                       # 文档
│   ├── api/                    # API 文档
│   ├── guides/                 # 用户指南
│   └── ops/                    # 运维手册
│
├── scripts/                    # 构建 & 发布脚本
├── turbo.json                  # Turborepo 配置
├── package.json                # Root package.json
└── pnpm-workspace.yaml
```

---

## 3. 核心组件设计

### 3.1 Dashboard (控制中心)

Dashboard 是 ProberX 的核心，负责 Agent 管理、数据处理、API 服务和业务逻辑。

```
Dashboard 内部模块交互：

┌──────────────────────────────────────────────────┐
│                  HTTP Server (Express/Fastify)     │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ REST API │  │ GraphQL  │  │  WebSocket (UI)  │ │
│  │ Router   │  │ Endpoint │  │  实时推送前端      │ │
│  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │             │                │            │
│       └─────────────┴────────────────┘            │
│                     │                              │
│              ┌──────┴──────┐                       │
│              │  Service    │                       │
│              │  Layer      │                       │
│              └──────┬──────┘                       │
│       ┌─────────────┼──────────────┐              │
│  ┌────┴────┐  ┌─────┴──────┐  ┌───┴──────────┐   │
│  │ Auth    │  │ Workspace  │  │ Subscription │   │
│  │ Service │  │ Service    │  │ Service      │   │
│  └─────────┘  └────────────┘  └──────────────┘   │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│            Agent Gateway (WebSocket Server)        │
│                                                    │
│  ┌──────────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Connection   │  │ Heartbeat│  │ Stream     │  │
│  │ Manager      │  │ Monitor  │  │ Multiplexer│  │
│  └──────────────┘  └──────────┘  └────────────┘  │
│                                                    │
│  - 管理所有 Agent 的 WebSocket 长连接              │
│  - 心跳检测与断线重连                              │
│  - 指标数据流接收与分发                            │
│  - 指令下发 (任务执行、WebSSH 等)                  │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│                 Alert Engine                       │
│                                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Rule     │  │ Condition│  │ Notification     │ │
│  │ Evaluator│  │ Matcher  │  │ Dispatcher       │ │
│  └──────────┘  └──────────┘  └──────────────────┘ │
│                                                    │
│  - 实时评估告警规则                                │
│  - 支持多级告警 (警告/严重/紧急)                   │
│  - 告警静默期与去重                                │
│  - 通知渠道：邮件/短信/Webhook/钉钉/飞书/企微/Telegram│
└──────────────────────────────────────────────────┘
```

### 3.2 Agent (探针客户端)

Agent 是部署在目标服务器上的轻量级守护进程。

**设计原则**：
- 最小资源占用（内存 < 30MB，CPU < 1%）
- 离线缓存（断网时本地缓冲指标，恢复后补传）
- 插件化采集器（可禁用不需要的采集模块）
- 自更新（二进制热替换）

**采集指标**：

| 类别 | 指标 | 采集频率 |
|------|------|---------|
| CPU | 使用率、负载、核心温度 | 2s |
| 内存 | 总量、已用、Swap | 2s |
| 磁盘 | 总量、已用、IOPS、读写速率 | 10s |
| 网络 | 上下行流量、连接数、丢包率 | 2s |
| 进程 | Top N 进程、僵尸进程数 | 30s |
| Docker | 容器列表、资源用量 | 30s |
| GPU | 使用率、显存、温度 | 5s |
| 系统 | 运行时间、用户数、系统版本 | 60s |

**探测类型**：

| 类型 | 说明 |
|------|------|
| HTTP(S) | URL 可达性、响应时间、状态码、Body 匹配 |
| TCP | 端口连通性、延迟 |
| ICMP Ping | 丢包率、平均延迟、抖动 |
| DNS | 解析结果、解析时间 |
| SSL 证书 | 过期时间、证书链验证 |
| gRPC | gRPC 服务健康检查 |

### 3.3 实时通信

```
Dashboard ←────────── WebSocket ──────────→ Agent
    │                                           │
    │  ← 系统指标 (2s 推送)                      │
    │  ← 探测结果 (按配置间隔)                    │
    │  → 任务指令 (即时)                         │
    │  → 配置更新 (即时)                         │
    │  ↔ WebSSH 数据流 (全双工)                  │


Dashboard ←────────── WebSocket ──────────→ Browser (前端 UI)
    │                                           │
    │  → 实时指标推送                            │
    │  → 告警通知                                │
    │  → 状态变更                                │
```

### 3.4 工作空间与多租户

这是 ProberX 区别于开源监控工具的核心运营能力：

```
Platform (平台级)
├── Workspace A (团队 A)          # 免费版
│   ├── 成员: 3 人
│   ├── 服务器: ≤ 10 台
│   ├── 监控任务: ≤ 20 个
│   └── 数据保留: 7 天
│
├── Workspace B (团队 B)          # Pro 版
│   ├── 成员: 10 人
│   ├── 服务器: ≤ 100 台
│   ├── 监控任务: 无限制
│   ├── 数据保留: 90 天
│   └── 高级功能: 公开状态页、API 访问、Webhook
│
└── Workspace C (企业 C)          # Enterprise
    ├── 成员: 无限制
    ├── 服务器: 无限制
    ├── 白标/自定义域名
    ├── SSO / SAML
    ├── SLA 保障
    └── 专属支持
```

**RBAC 角色设计**：

| 角色 | 权限 |
|------|------|
| Owner | 完全控制、删除工作空间、管理计费 |
| Admin | 管理成员、配置监控、管理告警 |
| Editor | 编辑监控配置、确认告警 |
| Viewer | 只读查看仪表盘和状态 |

---

## 4. 数据模型

### 4.1 核心实体关系

```
┌──────────┐       ┌──────────────┐       ┌──────────────┐
│  Tenant  │ 1───N │  Workspace   │ 1───N │  Membership  │
│ (平台租户) │       │  (工作空间)    │       │  (成员关系)    │
└──────────┘       └──────┬───────┘       └──────┬───────┘
                          │                      │
                          │ 1                    │ N
                          │                      │
                   ┌──────┴───────┐       ┌──────┴───────┐
                   │    User      │       │    Role      │
                   │   (用户)      │       │   (角色)      │
                   └──────────────┘       └──────────────┘

┌──────────────┐
│  Workspace   │
└──────┬───────┘
       │ 1
       │
       ├──────────N─────── ┌──────────────┐
       │                   │   Server     │
       │                   │  (被控服务器)  │
       │                   └──────┬───────┘
       │                          │ 1
       │                          ├─────── ┌──────────────────┐
       │                          │        │  MetricSnapshot  │
       │                          │        │  (指标快照)       │
       │                          │        │  → TimescaleDB   │
       │                          │        └──────────────────┘
       │                          │
       │                          ├─────── ┌──────────────┐
       │                          │        │  MonitorTask │
       │                          │        │  (监控任务)    │
       │                          │        └──────┬───────┘
       │                          │               │
       │                          │               ├── ┌──────────────┐
       │                          │               │   │ ProbeResult  │
       │                          │               │   │ (探测结果)   │
       │                          │               │   └──────────────┘
       │                          │               │
       ├──────────N───────        │               ├── ┌──────────────┐
       │                           │               │   │ SSLCheck     │
       ├──────────N───────        │               │   │ (证书检查)    │
       │                           │               │   └──────────────┘
       ├──────────N─────── ┌──────────────┐
       │                   │  AlertRule   │
       │                   │  (告警规则)    │
       │                   └──────┬───────┘
       │                          │
       ├──────────N─────── ┌──────────────┐
       │                   │Notification  │
       │                   │Channel(渠道) │
       │                   └──────────────┘
       │
       ├──────────N─────── ┌──────────────┐
       │                   │ CronJob      │
       │                   │ (计划任务)    │
       │                   └──────────────┘
       │
       └──────────1─────── ┌──────────────┐
                           │ StatusPage   │
                           │ (公开状态页)  │
                           └──────────────┘
```

### 4.2 核心表结构

#### 平台 & 租户

```sql
-- 平台租户（SaaS 模式）
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,  -- URL 标识
  plan        VARCHAR(50) NOT NULL DEFAULT 'free', -- free | pro | enterprise
  status      VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 用户（支持多种登录方式）
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       VARCHAR(255) UNIQUE,
  password_hash VARCHAR(255),               -- bcrypt
  name        VARCHAR(100),
  avatar_url  TEXT,
  oauth_provider VARCHAR(50),              -- github | google | wechat
  oauth_id    VARCHAR(255),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 工作空间（租户下的团队隔离单元）
CREATE TABLE workspaces (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  name        VARCHAR(255) NOT NULL,
  settings    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 成员关系（用户 ↔ 工作空间）
CREATE TABLE memberships (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL DEFAULT 'viewer', -- owner | admin | editor | viewer
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);
```

#### 监控核心

```sql
-- 被控服务器
CREATE TABLE servers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  agent_id      VARCHAR(64) UNIQUE,         -- Agent 唯一标识
  agent_secret  VARCHAR(128) NOT NULL,       -- Agent 认证密钥
  tags          TEXT[] DEFAULT '{}',
  host_info     JSONB DEFAULT '{}',          -- 主机信息快照
  last_seen_at  TIMESTAMPTZ,
  is_online     BOOLEAN DEFAULT FALSE,
  is_hidden     BOOLEAN DEFAULT FALSE,       -- 对访客隐藏
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 指标快照（TimescaleDB 超表）
CREATE TABLE metric_snapshots (
  time         TIMESTAMPTZ NOT NULL,
  server_id    UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  cpu_percent  DECIMAL(5,2),
  mem_total     BIGINT,
  mem_used      BIGINT,
  disk_total    BIGINT,
  disk_used     BIGINT,
  net_in_bytes  BIGINT,
  net_out_bytes BIGINT,
  load_1        DECIMAL(6,2),
  load_5        DECIMAL(6,2),
  load_15       DECIMAL(6,2),
  extra         JSONB DEFAULT '{}'           -- 扩展指标
);
SELECT create_hypertable('metric_snapshots', 'time');
CREATE INDEX idx_metrics_server_time ON metric_snapshots (server_id, time DESC);

-- 监控任务（HTTP/TCP/Ping/DNS/gRPC）
CREATE TABLE monitor_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(20) NOT NULL,        -- http | tcp | ping | dns | grpc | ssl
  target        TEXT NOT NULL,               -- URL / IP:Port / Domain
  interval_sec  INTEGER NOT NULL DEFAULT 60,
  timeout_ms    INTEGER NOT NULL DEFAULT 5000,
  settings      JSONB DEFAULT '{}',          -- 探测参数 (headers, body_match等)
  is_enabled    BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 探测结果（TimescaleDB 超表）
CREATE TABLE probe_results (
  time          TIMESTAMPTZ NOT NULL,
  task_id       UUID NOT NULL REFERENCES monitor_tasks(id) ON DELETE CASCADE,
  is_success    BOOLEAN NOT NULL,
  response_ms   INTEGER,
  status_code   INTEGER,                     -- HTTP 状态码
  error_msg     TEXT,
  detail        JSONB DEFAULT '{}'
);
SELECT create_hypertable('probe_results', 'time');
```

#### 告警 & 通知

```sql
-- 告警规则
CREATE TABLE alert_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  target_type   VARCHAR(20) NOT NULL,        -- server | monitor
  target_id     UUID,                        -- server_id 或 task_id
  metric        VARCHAR(50) NOT NULL,        -- cpu | mem | disk | response_ms | is_success
  operator      VARCHAR(10) NOT NULL,        -- gt | lt | eq | neq
  threshold     DECIMAL(12,2) NOT NULL,
  duration_sec  INTEGER NOT NULL DEFAULT 0,  -- 持续多久后触发
  severity      VARCHAR(20) NOT NULL DEFAULT 'warning', -- warning | critical | emergency
  is_enabled    BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 通知渠道
CREATE TABLE notification_channels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  type          VARCHAR(30) NOT NULL,        -- email | sms | webhook | dingtalk | feishu | wecom | telegram | slack
  config        JSONB NOT NULL,              -- 加密存储的渠道配置
  is_enabled    BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 告警记录
CREATE TABLE alert_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  server_id     UUID REFERENCES servers(id),
  task_id       UUID REFERENCES monitor_tasks(id),
  severity      VARCHAR(20) NOT NULL,
  message       TEXT NOT NULL,
  metric_value  DECIMAL(12,2),
  is_resolved   BOOLEAN DEFAULT FALSE,
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 任务 & 自动化

```sql
-- 计划任务
CREATE TABLE cron_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  cron_expr     VARCHAR(100) NOT NULL,       -- 标准 cron 表达式
  command       TEXT NOT NULL,
  target_servers UUID[] NOT NULL,             -- 目标服务器 ID 列表
  is_enabled    BOOLEAN DEFAULT TRUE,
  last_run_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 任务执行记录
CREATE TABLE cron_executions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
  server_id     UUID NOT NULL REFERENCES servers(id),
  status        VARCHAR(20) NOT NULL,        -- pending | running | success | failed
  output        TEXT,
  started_at    TIMESTAMPTZ,
  finished_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 运营相关

```sql
-- 公开状态页
CREATE TABLE status_pages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,
  custom_domain VARCHAR(255),
  logo_url      TEXT,
  theme         JSONB DEFAULT '{}',
  is_published  BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 计费 - 订阅
CREATE TABLE subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  plan          VARCHAR(50) NOT NULL,
  status        VARCHAR(20) NOT NULL,        -- active | past_due | canceled
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end   TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- API 密钥
CREATE TABLE api_keys (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          VARCHAR(255) NOT NULL,
  key_hash      VARCHAR(128) NOT NULL,
  permissions   TEXT[] DEFAULT '{}',
  last_used_at  TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 5. API 设计

### 5.1 设计规范

- RESTful 风格，JSON 格式
- 版本化：`/api/v1/...`
- 认证：Bearer Token (JWT) 或 API Key
- 分页：cursor-based 分页（`?cursor=xxx&limit=20`）
- 错误码：统一 `{ code: number, message: string, details?: any }`

### 5.2 API 端点概览

```
POST   /api/v1/auth/register            # 注册
POST   /api/v1/auth/login               # 登录
POST   /api/v1/auth/refresh             # 刷新 Token
POST   /api/v1/auth/oauth/:provider     # OAuth 回调

GET    /api/v1/workspaces               # 工作空间列表
POST   /api/v1/workspaces               # 创建工作空间
GET    /api/v1/workspaces/:id           # 工作空间详情
PATCH  /api/v1/workspaces/:id           # 更新工作空间
DELETE /api/v1/workspaces/:id           # 删除工作空间

GET    /api/v1/workspaces/:wid/members  # 成员列表
POST   /api/v1/workspaces/:wid/members  # 邀请成员
PATCH  /api/v1/workspaces/:wid/members/:uid  # 修改角色
DELETE /api/v1/workspaces/:wid/members/:uid  # 移除成员

GET    /api/v1/workspaces/:wid/servers        # 服务器列表
POST   /api/v1/workspaces/:wid/servers        # 添加服务器
GET    /api/v1/workspaces/:wid/servers/:id    # 服务器详情
PATCH  /api/v1/workspaces/:wid/servers/:id    # 更新服务器
DELETE /api/v1/workspaces/:wid/servers/:id    # 删除服务器
GET    /api/v1/workspaces/:wid/servers/:id/metrics  # 历史指标
POST   /api/v1/workspaces/:wid/servers/:id/terminal # 开启 WebSSH

GET    /api/v1/workspaces/:wid/monitors        # 监控列表
POST   /api/v1/workspaces/:wid/monitors        # 创建监控
PATCH  /api/v1/workspaces/:wid/monitors/:id    # 更新监控
DELETE /api/v1/workspaces/:wid/monitors/:id    # 删除监控

GET    /api/v1/workspaces/:wid/alerts          # 告警规则列表
POST   /api/v1/workspaces/:wid/alerts          # 创建告警规则
PATCH  /api/v1/workspaces/:wid/alerts/:id      # 更新告警规则
DELETE /api/v1/workspaces/:wid/alerts/:id      # 删除告警规则

GET    /api/v1/workspaces/:wid/notifications   # 通知渠道列表
POST   /api/v1/workspaces/:wid/notifications   # 添加通知渠道
DELETE /api/v1/workspaces/:wid/notifications/:id

GET    /api/v1/workspaces/:wid/cronjobs        # 计划任务列表
POST   /api/v1/workspaces/:wid/cronjobs        # 创建任务
DELETE /api/v1/workspaces/:wid/cronjobs/:id

GET    /api/v1/workspaces/:wid/status-pages    # 状态页列表
POST   /api/v1/workspaces/:wid/status-pages    # 创建状态页
PATCH  /api/v1/workspaces/:wid/status-pages/:id

POST   /api/v1/workspaces/:wid/api-keys        # 创建 API Key
DELETE /api/v1/workspaces/:wid/api-keys/:id    # 删除 API Key

GET    /api/v1/billing/plans                   # 套餐列表
GET    /api/v1/billing/subscription            # 当前订阅
POST   /api/v1/billing/checkout               # 创建结账

# Agent 内部 API（Agent → Dashboard）
POST   /api/v1/agent/register                  # Agent 注册
POST   /api/v1/agent/heartbeat                 # 心跳
POST   /api/v1/agent/metrics                   # 推送指标

# 公开 API（无需认证）
GET    /api/v1/public/status/:slug             # 公开状态页数据
GET    /api/v1/public/servers/:id/badge        # 状态徽章
```

### 5.3 Agent 注册流程

```
Agent                              Dashboard
  │                                     │
  │  ── POST /agent/register ──→        │
  │     { agent_id, host_info }          │
  │                                     │
  │  ←── { token, config } ────         │
  │                                     │
  │  ══ WebSocket Connect ════════════→ │
  │     Header: Authorization: Bearer    │
  │                                     │
  │  ←── { type: "config", ... } ───   │
  │  ── { type: "metrics", ... } ──→   │
  │  ←── { type: "command", ... } ───  │
  │  ...  (持续双向通信) ...             │
```

---

## 6. 通信协议

### 6.1 WebSocket 消息格式

Agent 与 Dashboard 之间的 WebSocket 通信采用 JSON 帧格式：

```typescript
// 消息信封
interface AgentMessage {
  id: string;           // 消息唯一 ID (UUID v7)
  type: MessageType;    // 消息类型
  payload: unknown;     // 类型相关的负载
  timestamp: number;    // Unix 毫秒时间戳
}

type MessageType =
  // Agent → Dashboard
  | 'metrics:push'        // 系统指标推送
  | 'probe:result'        // 探测结果
  | 'heartbeat'           // 心跳
  | 'agent:info'          // Agent 信息上报
  | 'command:ack'         // 指令确认
  | 'command:result'      // 指令执行结果
  | 'webssh:data'         // WebSSH 数据流
  | 'webssh:resize'       // 终端大小变更
  | 'log:push'            // 日志推送

  // Dashboard → Agent
  | 'config:update'       // 配置更新
  | 'command:exec'        // 执行指令
  | 'command:cancel'      // 取消指令
  | 'webssh:connect'      // WebSSH 连接请求
  | 'webssh:data'         // WebSSH 输入数据
  | 'webssh:close'        // 关闭 WebSSH
  | 'probe:run'           // 立即执行探测
  | 'agent:upgrade'       // 触发 Agent 升级
  | 'agent:restart';      // 重启 Agent
```

### 6.2 心跳与断线重连

```
Agent 侧逻辑：
  1. 每 10s 发送 ping 帧
  2. 30s 内未收到 pong → 判定断线
  3. 断线后本地缓冲指标（最多 5 分钟数据）
  4. 指数退避重连（1s → 2s → 4s → ... → max 60s）
  5. 重连成功后批量补传缓冲数据

Dashboard 侧逻辑：
  1. 60s 未收到任何消息 → 标记 Agent 离线
  2. 触发离线告警（如配置）
  3. Agent 重连后更新状态为在线
```

---

## 7. 前端架构

### 7.1 页面结构

```
/                          # 首页（Landing Page）
/login                     # 登录页
/register                  # 注册页

/:workspace                # 工作空间仪表盘
/:workspace/servers        # 服务器列表
/:workspace/servers/:id    # 服务器详情（指标图表、进程列表等）
/:workspace/monitors        # 监控任务管理
/:workspace/alerts          # 告警规则管理
/:workspace/cronjobs        # 计划任务管理
/:workspace/settings        # 工作空间设置
/:workspace/status-pages    # 状态页管理
/:workspace/billing         # 计费 & 订阅

/status/:slug               # 公开状态页（无需登录）
/api/docs                   # API 文档（Scalar/OpenAPI）
```

### 7.2 组件设计要点

- **实时仪表盘**：使用 WebSocket 订阅指标，图表用 Recharts / Tremor 实现
- **服务器卡片**：网格布局展示所有服务器，颜色编码状态（绿/黄/红）
- **终端模拟器**：xterm.js 实现 WebSSH 终端
- **告警时间线**：按时间排序的告警事件流，支持确认/静默操作
- **公开状态页**：支持自定义域名、Logo、主题色，监控项分组展示

### 7.3 前端技术选型

| 用途 | 选型 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| 样式 | Tailwind CSS + shadcn/ui |
| 图表 | Recharts / Tremor |
| 终端 | xterm.js + @xterm/addon-fit |
| 实时通信 | 自研 useWebSocket Hook + SWR |
| 状态管理 | Zustand (轻量全局状态) + TanStack Query (服务端状态) |
| 表单 | react-hook-form + zod |

---

## 8. 运营体系

### 8.1 订阅套餐设计

| 功能 | Free | Pro | Enterprise |
|------|------|-----|------------|
| 服务器数量 | 10 | 100 | 无限制 |
| 监控任务 | 20 | 500 | 无限制 |
| 数据保留 | 7 天 | 90 天 | 365 天 |
| 告警规则 | 5 | 50 | 无限制 |
| 通知渠道 | 邮件 | 全部 | 全部 |
| 成员数 | 2 | 20 | 无限制 |
| API 访问 | - | ✓ | ✓ |
| 公开状态页 | - | 1 个 | 5 个 |
| WebSSH | - | ✓ | ✓ |
| 自定义域名 | - | - | ✓ |
| SSO/SAML | - | - | ✓ |
| 白标 | - | - | ✓ |
| 技术支持 | 社区 | 邮件 | 专属 |

### 8.2 计费集成

- 首选：Stripe (国际) + 支付宝/微信支付 (中国)
- 实现方式：Stripe Checkout / Payment Links
- Webhook 处理：`stripe webhook` → 更新 subscription 状态 → 同步功能开关

### 8.3 数据安全

- 所有密钥/密码字段 AES-256-GCM 加密存储
- Agent Secret 使用 bcrypt 哈希
- API 速率限制：Redis Token Bucket
- 审计日志：所有管理操作记录
- GDPR：用户数据导出/删除

---

## 9. 部署方案

### 9.1 Docker Compose（推荐中小规模）

```yaml
# docker-compose.yml 核心服务
services:
  postgres:
    image: timescale/timescaledb:latest-pg16
  redis:
    image: redis:7-alpine
  dashboard:
    build: ./apps/dashboard
    ports: ["3000:3000"]
  frontend:
    build: ./apps/frontend
    ports: ["8080:3000"]
```

### 9.2 架构伸缩路径

```
Phase 1: 单机部署 (Docker Compose)
  PostgreSQL + Redis + Dashboard + Frontend 同机

Phase 2: 服务分离
  Dashboard 多实例 (PM2 Cluster / K8s Deployment)
  PostgreSQL 主从复制
  Redis Sentinel

Phase 3: 水平扩展
  Agent Gateway 独立服务（处理 WebSocket 连接）
  Dashboard API 无状态水平扩展
  BullMQ 分离 Worker 进程
  指标写入走 Kafka → TimescaleDB
```

### 9.3 Agent 安装方式

```bash
# 一键安装脚本
curl -fsSL https://get.proberx.io/install.sh | bash -s -- \
  --dashboard wss://dashboard.proberx.io \
  --secret YOUR_AGENT_SECRET

# Docker
docker run -d \
  -e PROBERX_DASHBOARD=wss://dashboard.proberx.io \
  -e PROBERX_SECRET=YOUR_AGENT_SECRET \
  --net=host \
  proberx/agent:latest

# 手动安装 (Windows)
iwr -useb https://get.proberx.io/install.ps1 | iex
```

---

## 10. 开发路线图

### Phase 1 — MVP（核心监控）`预计 6-8 周`

- [ ] 项目脚手架搭建 (Turborepo + pnpm workspace)
- [ ] Dashboard 基础框架 (Express/Fastify + WebSocket)
- [ ] Agent 基础框架 (系统指标采集 + WebSocket 上报)
- [ ] PostgreSQL + TimescaleDB Schema & Migration
- [ ] 用户注册/登录 (Email + OAuth GitHub)
- [ ] 工作空间 CRUD
- [ ] 服务器管理 (Agent 注册、在线状态、指标接收)
- [ ] 基础仪表盘 UI（服务器列表 + 实时指标）
- [ ] Docker Compose 一键部署

### Phase 2 — 监控增强 `预计 4-6 周`

- [ ] HTTP/TCP/Ping/DNS 监控探测
- [ ] SSL 证书检查
- [ ] 告警引擎 & 规则管理
- [ ] 通知渠道 (邮件、Webhook、钉钉、飞书、Telegram)
- [ ] 历史指标图表 (TimescaleDB 查询)
- [ ] 计划任务 (CronJob) 基础实现
- [ ] 服务器详情页（进程、Docker 等）

### Phase 3 — 运营能力 `预计 4-6 周`

- [ ] 多租户完善 (Tenant + Workspace 隔离)
- [ ] RBAC 权限系统
- [ ] 计费系统 (Stripe 集成、套餐管理)
- [ ] 用量统计 & 配额限制
- [ ] 公开状态页 (可发布、自定义域名)
- [ ] API Key 管理 & 开放 API

### Phase 4 — 高级功能 `预计 6-8 周`

- [ ] WebSSH 终端
- [ ] Agent 自更新
- [ ] GPU 监控
- [ ] Docker 容器监控
- [ ] 告警静默 & 升级策略
- [ ] 批量服务器操作
- [ ] GraphQL API (可选)

### Phase 5 — 企业 & 生态 `预计 4-6 周`

- [ ] SSO/SAML 集成
- [ ] 白标 (自定义 Logo、配色、域名)
- [ ] 审计日志
- [ ] 数据导出 (Prometheus 格式、CSV)
- [ ] 移动端 PWA
- [ ] 国际化 (i18n)
- [ ] 插件/扩展系统

---

## 附录 A — 与同类产品对比

| 特性 | ProberX | Nezha | Uptime Kuma | Grafana + Prometheus |
|------|---------|-------|-------------|---------------------|
| 技术栈 | Node.js | Go | Node.js | Go |
| 实时监控 | ✓ | ✓ | ✓ | ✓ |
| 公开状态页 | ✓ | - | ✓ | - |
| 多租户/运营 | ✓ (核心能力) | - | - | - |
| RBAC | ✓ (4 级) | 仅 Admin/Guest | - | ✓ (企业版) |
| WebSSH | ✓ | ✓ | - | - |
| 计费集成 | ✓ | - | - | - |
| 自托管 | ✓ | ✓ | ✓ | ✓ |
| Agent 架构 | WebSocket 长连接 | gRPC | 无需 Agent | Node Exporter |
| 时序数据库 | TimescaleDB | SQLite/MySQL | SQLite | Prometheus TSDB |

## 附录 B — 技术风险 & 缓解

| 风险 | 等级 | 缓解策略 |
|------|------|---------|
| Node.js 单线程 vs 大量 Agent 连接 | 中 | PM2 Cluster + Agent Gateway 独立服务 + K8s 水平扩展 |
| WebSocket 连接数上限 | 中 | 使用 uWebSockets.js 高性能 WS 库；单机可达 100K 连接 |
| 时序数据写入瓶颈 | 中 | TimescaleDB 自动分区 + 批量写入 + Redis 缓冲 |
| Agent 离线数据丢失 | 低 | Agent 本地 SQLite 缓冲 (WAL 模式) + 重连批量补传 |
| 多租户数据隔离 | 高 | RLS (Row Level Security) + 所有查询强制带 workspace_id |

---

> **文档版本**: v1.0  
> **最后更新**: 2026-05-24  
> **作者**: ProberX Team
