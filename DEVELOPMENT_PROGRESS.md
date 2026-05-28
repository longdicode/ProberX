# ProberX — 开发进度文档

> 最后更新: 2026-05-28 (Session: 部署功能深化 — 流式进度 + 资源限制 + 端口检测 + 自定义 YAML)

---

## 一、基础设施

- [x] Docker Compose (PostgreSQL 16 + TimescaleDB + Redis 7)
- [x] 后端 `.env` 配置 (PORT, DATABASE_URL, REDIS_URL, JWT_SECRET)
- [x] 前端 `.env.local` 配置 (API_URL, WS_URL, AUTH_BYPASS)
- [x] Drizzle 初始化迁移 (14 张表 + 2 个 TimescaleDB 超表)
- [x] CI/CD 流水线 ✅ (2026-05-25) — GitHub Actions: dashboard (tsc) + frontend (tsc+build) + agent (go build+vet)
- [x] 生产环境部署配置 ✅ (2026-05-25) — 3 Dockerfiles + docker-compose.prod.yml + setup.sh 一键部署脚本
- [x] 测试基础设施 ✅ (2026-05-25) — Dashboard: vitest 14 tests / Agent: go test 5 tests / Frontend: vitest 63 tests 全部通过 ✅ (2026-05-26)
- [x] 生产部署验证 ✅ (2026-05-26) — Dashboard/Frontend Docker 镜像构建通过，Agent Dockerfile 改为单阶段(预编译二进制)
- [x] setup.sh 增强 ✅ (2026-05-26) — 自动生成 JWT_SECRET/POSTGRES_PASSWORD、端口检测、彩色输出、--with-agent/--skip-build 参数
- [x] 项目文档 ✅ (2026-05-26) — README.md (项目主页) + CONTRIBUTING.md (开发者指南) + DEVELOPMENT.md (架构文档)

---

## 二、后端 (apps/dashboard) — Fastify v5 + Drizzle ORM

### 2.1 数据库 Schema (14/14 张表 ✅)

- [x] `users` — 用户表 (email, password_hash, oauth_provider/oauth_id)
- [x] `workspaces` — 工作空间表 (name, plan, settings)
- [x] `memberships` — 成员关系表 (workspace_id, user_id, role)
- [x] `servers` — 服务器表 (agent_id, agent_secret, tags, host_info, is_online)
- [x] `monitor_tasks` — 监控任务表 (type, target, interval_sec, timeout_ms)
- [x] `probe_results` — 探测结果表 (TimescaleDB 超表)
- [x] `metric_snapshots` — 指标快照表 (TimescaleDB 超表)
- [x] `alert_rules` — 告警规则表 (metric, operator, threshold, severity)
- [x] `alert_events` — 告警事件表 (rule_id, server_id, is_resolved)
- [x] `cron_jobs` — 定时任务表 (cron_expr, command, target_servers)
- [x] `cron_executions` — 定时执行记录表
- [x] `notification_channels` — 通知渠道表 (type, config)
- [x] `status_pages` — 状态页表 (slug, custom_domain, theme)
- [x] `api_keys` — API 密钥表 (key_hash, permissions)

### 2.2 插件 & 中间件 (5/5 ✅)

- [x] `plugins/db.ts` — Drizzle 数据库客户端注入
- [x] `plugins/auth.ts` — JWT 认证 + `authenticate` + `guardWorkspace` 钩子
- [x] `plugins/redis.ts` — Redis 连接 (ioredis)
- [x] `plugins/error-handler.ts` — 统一错误格式化 (AppError / ZodError / PG 23505)
- [x] `middleware/agent-token.ts` — Agent Bearer Token 验证

### 2.3 校验器 (12/12 文件, 24 个 Schema ✅)

- [x] `validators/auth.ts` — loginBody, registerBody, oauthBody
- [x] `validators/workspace.ts` — createWorkspaceBody, updateWorkspaceBody
- [x] `validators/server.ts` — createServerBody, updateServerBody
- [x] `validators/monitor.ts` — createMonitorBody, updateMonitorBody
- [x] `validators/alert.ts` — createAlertBody, updateAlertBody
- [x] `validators/cronjob.ts` — createCronJobBody, updateCronJobBody
- [x] `validators/notification.ts` — createChannelBody, updateChannelBody
- [x] `validators/status-page.ts` — createStatusPageBody, updateStatusPageBody
- [x] `validators/agent.ts` — agentRegisterBody, agentHeartbeatBody, agentMetricsBody
- [x] `validators/common.ts` — uuidParam, widParam, paginationQuery, metricsQuery
- [x] `validators/api-key.ts` — createApiKeyBody, updateApiKeyBody
- [x] `validators/membership.ts` — updateMemberBody ✅ (2026-05-24)

### 2.4 服务层 (20/20 文件, 75+ 个函数 ✅)

- [x] `services/auth.service.ts` — register, login, oauthLogin
- [x] `services/workspace.service.ts` — list, create, getById, update, remove, getDashboardStats
- [x] `services/server.service.ts` — list, create, getById, update, remove, regenerateToken
- [x] `services/monitor.service.ts` — list, create, getById, update, remove
- [x] `services/alert.service.ts` — list, create, getById, update, remove
- [x] `services/notification.service.ts` — list, create, update, remove
- [x] `services/cronjob.service.ts` — list, create, update, remove
- [x] `services/status-page.service.ts` — list, create, getBySlug, update, remove
- [x] `services/agent.service.ts` — register, heartbeat, ingestMetrics
- [x] `services/metrics.service.ts` — getServerMetrics
- [x] `services/metrics-poller.ts` — 每 60s 轮询 Agent /metrics, 写入 metric_snapshots
- [x] `services/probe-poller.ts` — 每 60s 执行监控探测, 调用 Agent /probe, 写入 probe_results
- [x] `services/probe.service.ts` — 探测结果查询 (listByMonitor, listByServer, listRecent)
- [x] `services/alert-event.service.ts` — 告警事件查询 (listByRule, listByWorkspace) + resolve
- [x] `services/api-key.service.ts` — CRUD (list, create, update, remove) + bcrypt key hashing
- [x] `services/cron-execution.service.ts` — 执行记录查询 (listByJob, listByWorkspace)
- [x] `services/membership.service.ts` — list, updateRole, remove ✅ (2026-05-24)
- [x] `services/cron-poller.ts` — cron 调度执行引擎 (cron-parser + Agent /exec + 结果写入) ✅ (2026-05-24)
- [x] `services/alert-evaluator.ts` — 告警规则评估 (探针/指标 vs 阈值 → 创建告警事件 + 广播 + 通知) ✅ (2026-05-24)
- [x] `services/fileops.service.ts` — 文件操作代理 (Agent 文件浏览/读写/上传/下载/删除/新建目录/重命名) ✅ (2026-05-26)
- [x] `services/notification-dispatcher.ts` — 通知分发器 (webhook 已实现, email/slack stub) ✅ (2026-05-24)
- [x] `services/firewall-proxy.ts` — 防火墙规则代理 (Agent /firewall/rules 转发) ✅ (2026-05-27)
- [x] `services/tools.service.ts` — 应用部署代理 (11 个函数: templates/list/deploy/remove/logs/start/stop/restart/update/progress/checkPorts) ✅ (2026-05-28)

### 2.5 路由 (12/12 文件, 56 个端点 ✅)

- [x] `routes/auth.ts` — POST /auth/register, /auth/login, /auth/refresh, /auth/oauth
- [x] `routes/workspaces.ts` — CRUD: GET/POST /workspaces, GET/PATCH/DELETE /workspaces/:wid
- [x] `routes/servers.ts` — CRUD + metrics + regenerate-token + pull-metrics + run-probe + 文件管理 (15 个端点)
- [x] `routes/monitors.ts` — CRUD: GET/POST, PATCH/DELETE /:id
- [x] `routes/alerts.ts` — CRUD: GET/POST, PATCH/DELETE /:id
- [x] `routes/notifications.ts` — CRUD: GET/POST, PATCH/DELETE /:id
- [x] `routes/cronjobs.ts` — CRUD + 执行记录查询 (GET/POST/PATCH/DELETE + 2 执行端点)
- [x] `routes/status-pages.ts` — CRUD: GET/POST, PATCH/DELETE /:id
- [x] `routes/api-keys.ts` — CRUD: GET/POST, PATCH/DELETE /workspaces/:wid/api-keys
- [x] `routes/memberships.ts` — GET/PATCH/DELETE /workspaces/:wid/members[/:id] ✅ (2026-05-24)
- [x] `routes/agent.ts` — POST /agent/register (agent 启动注册)
- [x] `routes/public.ts` — GET /public/status/:slug (含 servers + monitors + probe 状态)
- [x] `routes/firewall.ts` — 防火墙规则代理 (GET/POST/DELETE /servers/:sid/firewall/rules) ✅ (2026-05-27)
- [x] `GET /health` — 健康检查

### 2.6 WebSocket (5/5 文件 ✅)

- [x] `ws/index.ts` — WebSocket 插件注册 (/ws) — 前端客户端连接
- [x] `ws/authenticator.ts` — JWT Token 认证 (query string: token + workspaceId)
- [x] `ws/connection-manager.ts` — 工作空间订阅管理 (broadcastToWorkspace)
- [x] `ws/handler.ts` — 消息路由 (ping/pong + subscribe/unsubscribe + 频道白名单验证) ✅ (2026-05-24)
- [x] `ws/connection-manager.ts` — 新增 per-user 订阅追踪 (subscribe/unsubscribe/getSubscriptions) ✅ (2026-05-24)
- [x] `ws/broadcaster.ts` — 实时数据广播 (metrics:update, probe:result, alert:event, server:status)

### 2.7 待完善 (后端)

- [x] `probe_results` 读写 API ✅ (2026-05-24)
- [x] `alert_events` 读写 API ✅ (2026-05-24)
- [x] `api_keys` 无 API — Schema 已定义但未接入路由 ✅ (2026-05-24) — CRUD 完整
- [x] `cron_executions` 无 API — ✅ (2026-05-24) — 按任务/工作空间查询执行记录
- [x] WebSocket 消息处理完整实现 — ping/pong + subscribe/unsubscribe + 订阅过滤广播 ✅ (2026-05-24)
- [x] WebSocket 广播层 (broadcaster) 完成 — pollers 集成实时推送 ✅
- [x] `updateCronJobBody` 未使用 (路由缺 PATCH) ✅ (2026-05-24)
- [x] `updateChannelBody` 未使用 (路由缺 PATCH) ✅ (2026-05-24)
- [x] `paginationQuery` ✅ (2026-05-24) — 6 个列表端点支持 ?limit=&cursor= 分页
- [x] `generateApiKey` 工具函数 — 已用于 api-key.service.ts ✅
- [x] ~~OAuth 字段已存在但无 OAuth 登录流程~~ (2026-05-24)
- [x] 通知渠道调度 + 前端管理 ✅ (2026-05-25) — webhook + Slack + Email (SMTP/nodemailer), 设置页 CRUD + 启用/禁用 toggle
- [x] BullMQ / 消息队列 ✅ (2026-05-25) — notification-dispatch + cron-execution 队列, 3次重试, exponential backoff, 同步模式向后兼容
- [x] Agent routes 适配 pull 模式 ✅ (2026-05-24) — 移除 push heartbeat/metrics, 简化 register, 新增 pull-metrics/run-probe

---

## 二.B Agent (apps/agent) — Go 语言

> **架构**: Agent 是纯 HTTP 服务器，面板后端主动拉指标、发探针命令。
> **通信**: Agent ← HTTP (面板后端) → WebSocket → 前端面板

### 2.B.1 项目搭建 ✅

- [x] `go.mod` — Go module 初始化 (Go 1.22 + gopsutil/v3)
- [x] `main.go` — HTTP 服务入口、路由注册、中间件 (Token 认证, 日志)
- [x] Agent 配置 (AGENT_PORT=9800, AGENT_TOKEN 可选)
- [x] 一键应用部署 ✅ (2026-05-28) — 8 个 Docker Compose 模板 (Nginx Proxy Manager, WordPress, Gitea, Portainer, Uptime Kuma, Plausible, NocoDB, Changedetection)

### 2.B.2 API 端点 ✅

- [x] `GET /health` — 健康检查 (status, version, time)
- [x] `GET /metrics` — 系统指标 (cpu/mem/disk/net/load + num_cpu + go_version)
- [x] `POST /probe` — 执行一次探测 (http/tcp/dns/ssl/ping + 超时控制)
- [x] `POST /exec` — 执行命令 (sh -c + 超时控制)
- [x] `GET /files/list`, `GET /files/read`, `GET /files/download` — 文件浏览/读取/下载 ✅ (2026-05-26)
- [x] `POST /files/upload`, `POST /files/mkdir`, `POST /files/rename`, `DELETE /files/delete` — 文件上传/新建目录/重命名/删除 ✅ (2026-05-26)
- [x] `GET /firewall/rules` — iptables 规则列表 ✅ (2026-05-27)
- [x] `POST /firewall/rules` — 添加 iptables 规则 ✅ (2026-05-27)
- [x] `DELETE /firewall/rules` — 删除 iptables 规则 ✅ (2026-05-27)
- [x] `GET /tools/deploy/templates` — 获取应用模板列表 ✅ (2026-05-28)
- [x] `GET /tools/deploy/list` — 获取已部署应用列表 ✅ (2026-05-28)
- [x] `POST /tools/deploy/deploy` — 一键部署应用 ✅ (2026-05-28)
- [x] `POST /tools/deploy/remove` — 删除已部署应用 ✅ (2026-05-28)
- [x] `GET /tools/deploy/logs` — 获取应用容器日志 ✅ (2026-05-28)
- [x] `POST /tools/deploy/start` — 启动已部署应用 ✅ (2026-05-28)
- [x] `POST /tools/deploy/stop` — 停止已部署应用 ✅ (2026-05-28)
- [x] `POST /tools/deploy/restart` — 重启已部署应用 ✅ (2026-05-28)
- [x] `POST /tools/deploy/update` — 更新应用镜像 ✅ (2026-05-28)
- [x] `GET /tools/deploy/progress` — 部署进度轮询 (deploy.log 尾部) ✅ (2026-05-28)
- [x] `POST /tools/deploy/check-ports` — 端口占用检测 (ss -tlnp) ✅ (2026-05-28)

### 2.B.3 内部模块

- [x] `internal/metrics/` — gopsutil 指标采集 (cpu/mem/disk/net/load)
- [x] `internal/probe/` — 探针执行 (HTTP GET / TCP dial / DNS lookup / SSL cert / ICMP ping)
- [x] `internal/exec/` — 命令执行 (30s 超时, exit code)
- [x] `internal/fileops/` — 文件操作 (List/Read/Delete/Mkdir/上传/下载 + 路径安全校验) ✅ (2026-05-26)
- [x] `internal/firewall/` — iptables 规则管理 (List/Add/Delete + 安全校验) ✅ (2026-05-27)
- [x] `internal/tools/deploy.go` — 应用部署 (11 个函数: ListTemplates/DeployApp/GetDeployments/RemoveDeployment/GetDeploymentLogs/StartDeployment/StopDeployment/RestartDeployment/UpdateDeployment/ReadDeployLog/CheckPorts) ✅ (2026-05-28)

### 2.B.4 后端集成 ✅ (2026-05-24)

- [x] `validators/server.ts` — 新增 agentHost, agentPort 字段
- [x] `services/server.service.ts` — create/update 存储 agent 连接信息到 host_info
- [x] `services/metrics-poller.ts` — 每 60s 轮询所有 Agent 的 /metrics, 写入 metric_snapshots
- [x] `services/probe-poller.ts` — 每 60s 轮询已启用监控任务, 调用 Agent POST /probe, 写入 probe_results
- [x] `services/probe.service.ts` — 探测结果查询 (按任务/按工作空间)
- [x] `services/alert-event.service.ts` — 告警事件查询 (按规则/按工作空间) + 解决(resolve)
- [x] `src/index.ts` — 启动时自动开启 metrics poller

### 2.B.5 待完善 (Agent + 集成)

- [x] 后端 Agent routes 适配 pull 模式 ✅ (2026-05-24)
- [x] Agent 主动调用 POST /agent/register (启动时报告 agentId + hostInfo) ✅ (2026-05-24)
- [x] Probe 结果写入 probe_results 表 ✅ — 后端 poller 负责写入 + WS 广播
- [x] Agent Token 认证 ✅ — withAuth 中间件 + AGENT_TOKEN 环境变量
- [x] Cron 执行引擎 ✅ (2026-05-24) — cron-poller 每 60s 解析 cron 表达式, 向 Agent 发送 /exec, 写入 cron_executions
- [x] Exec 结果处理 ✅ — cron execution 记录 status/output/finishedAt
- [x] gRPC 探针支持 ✅ (2026-05-25) — HTTP/2 preface + SETTINGS frame 验证, 无外部依赖
- [x] Windows 兼容测试 — WebSSH 终端 ConPTY 实现 (字符级交互输入, cmd.exe) ✅ (2026-05-26)

---

## 三、前端 (apps/frontend) — Next.js 16.2.6

### 3.1 页面 (12 个页面文件)

| 页面 | 路径 | 状态 |
|------|------|------|
| 登录 | `/login` | [x] 完成 (表单 + zod 校验 + API 调用) |
| 注册 | `/register` | [x] 完成 (表单 + 密码确认 + API 调用) |
| 仪表盘 | `/` (Overview) | [x] ✅ 接入真实 API (useDashboard + 自动创建工作空间) |
| 服务器列表 | `/servers` | [x] ✅ 接入真实 API (useServers + 搜索 + 加载/空/错误状态) |
| 服务器详情 | `/servers/[id]` | [x] ✅ 接入真实 API (概览卡片 + 指标图表 + 文件管理器) |
| 监控任务 | `/monitors` | [x] ✅ 接入真实 API (列表 + 创建 + 删除确认 + 探测结果展开) |
| 告警规则 | `/alerts` | [x] ✅ 接入真实 API (列表 + 创建 + 删除确认 + 告警事件) |
| 定时任务 | `/tasks` | [x] ✅ 接入真实 API (列表 + 创建 + 删除确认 + 执行历史) |
| 工作空间设置 | `/settings` | [x] ✅ 接入真实 API (工作空间名称编辑) |
| 公开状态页 | `/[slug]` | [x] ✅ 动态渲染 (服务状态 + 探针结果) |
| 防火墙 | `/firewall` | [x] ✅ 服务器选择 + iptables 规则管理 (2026-05-27) |
| 应用部署 | `/tools/deploy` | [x] ✅ 应用商店 + 一键部署 + 生命周期 + 流式进度 + 资源限制 + 端口检测 + 自定义 YAML (2026-05-28) |
| 首页 (landing) | `/` | [x] Dashboard Overview 已接入真实数据 |

### 3.2 组件 (27 个)

- [x] **ui/ 组件 (16 个)**: Avatar, Badge, Button, Card, Dialog, DropdownMenu, Input, Label, Popover, ScrollArea, Select, Separator, Sheet, Skeleton, Tabs, Tooltip — 全部完成 ✅
- [x] **layout/ 组件 (5 个)**: Sidebar, Header, WorkspaceSwitcher, CommandPalette, LocaleSwitcher — 全部完成 ✅
- [x] **servers/ 组件 (3 个)**: ServerStatusBadge, MetricChart, FileManager — 全部完成 ✅
- [x] **shared/ 组件 (4 个)**: EmptyState, LoadingSkeleton, ConfirmDialog, ErrorBoundary — 全部完成 ✅
- [x] **alerts/ 组件** — 页面内联完成 (AlertRuleCard + 创建表单 + 事件列表)
- [x] **monitors/ 组件** — 页面内联完成 (MonitorCard + 创建表单 + 探测结果)

### 3.3 状态管理 (4 个 Store ✅)

- [x] `auth-store.ts` — 用户认证、JWT Token、AUTH_BYPASS 开发模式
- [x] `ui-store.ts` — 侧边栏、命令面板状态
- [x] `workspace-store.ts` — 当前工作空间、工作空间列表
- [x] `locale-store.ts` — 中英文切换 (175 个翻译 key, 持久化 localStorage)

### 3.4 工具库 (6 个文件 ✅)

- [x] `api-client.ts` — Fetch API 封装 (JWT 注入, 401 重定向, ApiError)
- [x] `ws-client.ts` — WebSocket 客户端 (指数退避重连, 心跳, 类型路由)
- [x] `auth.ts` — Token 存储/读取工具
- [x] `constants.ts` — API 地址、套餐限制、监控类型、通知类型
- [x] `utils.ts` — cn, formatBytes, formatPercent, formatDuration 等
- [x] `validators.ts` — 6 个 Zod Schema (login, register, server, monitor, alert, cronjob)

### 3.5 国际化 (2 个文件 ✅)

- [x] `locales/en.ts` — 英文 175 key
- [x] `locales/zh.ts` — 简体中文 175 key

### 3.6 Provider (3 个 ✅)

- [x] `theme-provider.tsx` — 深色/浅色主题
- [x] `query-provider.tsx` — TanStack Query (staleTime 30s)
- [x] `auth-provider.tsx` — 认证初始化 + 路由守卫

### 3.7 待完善 (前端)

- [x] **Dashboard 页面接入 API** — Dashboard/服务器列表/监控/告警/服务器详情 已接入, Recent Alerts 卡片 ✅ (2026-05-25)
- [x] **表单接入 react-hook-form** — login/register 已使用 react-hook-form + zodResolver ✅ (2026-05-24)
- [x] **服务端组件** ✅ (2026-05-25) — Landing Page + Status Page + Status Layout 转为 RSC, 7 个 Dashboard 路由添加 loading.tsx Suspense 边界
- [x] **Landing Page** — 产品首页 (Hero + 功能展示 + CTA)，Dashboard 移至 /overview ✅ (2026-05-24)
- [x] **alerts/ 组件** — 页面内联完成 (AlertRuleCard + 创建表单 + 事件列表 + 删除确认) ✅ (2026-05-25)
- [x] **monitors/ 组件** — 页面内联完成 (MonitorCard + 创建表单 + 探测结果 + 删除确认) ✅ (2026-05-25)
- [x] **WebSocket 实时数据** — Dashboard Overview + Server 详情页接入 WS 实时推送 (metrics:update, server:status) + 前后端 subscribe/unsubscribe 通信 ✅ (2026-05-24)
- [x] **Tasks 页执行历史** — 定时任务卡片可展开, 显示 cron_executions 记录 + 删除确认 ✅ (2026-05-25)
- [x] **Alerts 页 metric/operator 修复** — operator 对齐 (gt/gte/lt/lte/eq/neq), targetType 动态 metric 选项 ✅ (2026-05-25)
- [x] **Server 详情页** — 指标图表真实数据渲染, 进程列表真实数据 (点击刷新获取), WebSSH 终端 ✅ (2026-05-26) — 编辑/删除操作 + WebSSH 终端 (Windows ConPTY + Unix PTY, 字符级交互输入)
- [x] **设置页** — 工作空间名称、API Key 管理、成员列表、通知渠道管理 (CRUD + 启用/禁用 toggle) ✅ (2026-05-25)
- [x] **公开状态页** — 动态渲染, 实时获取服务器/监控状态 + 探针结果 ✅ (2026-05-24)
- [x] **错误边界** — ErrorBoundary 组件已创建并包裹 Dashboard Layout ✅ (2026-05-24)
- [x] **前端单元测试** — 63 tests, 7 文件 (utils/validators/auth/api-client/terminal-ws/locale-store/auth-store) ✅ (2026-05-26)
- [x] **文件管理器** ✅ (2026-05-26) — Agent 端 fileops 包 (6 端点) + Dashboard 代理路由 + 前端 FileManager 组件 (文件浏览/预览/上传/下载/删除/新建目录)
- [x] **Docker 容器监控** ✅ (2026-05-26) — Agent 端 docker 包 (Unix socket + Docker Engine API) + Dashboard 代理服务 + 前端 ContainerList 组件 (容器列表/CPU/内存/端口/状态筛选/刷新)
- [x] **GPU 监控** ✅ (2026-05-26) — Agent 端 gpu 包 (nvidia-smi) + metrics.Snapshot 扩展 5 GPU 字段 + Dashboard schema/validator/poller/ws 全链路 + 前端 GPU 卡片/图表 + Drizzle 迁移

---

## 四、端到端验证

- [x] `docker-compose up -d` — PostgreSQL + Redis 正常运行
- [x] `npm run dev` (backend) — TypeScript 零错误编译, 监听 :3001
- [x] `npm run dev` (frontend) — 监听 :3000
- [x] POST /api/v1/auth/register — 201 注册成功
- [x] POST /api/v1/auth/login — 200 返回 JWT Token
- [x] GET/POST /api/v1/workspaces — 200 工作空间 CRUD
- [x] GET/POST /api/v1/workspaces/:wid/servers — 200 服务器 CRUD
- [x] GET /api/v1/workspaces/:wid/dashboard — 200 仪表盘统计 ✅ (2026-05-24)
- [x] 后端 Dev Bypass 认证 (Bearer bypass → 自动创建 dev 用户) ✅ (2026-05-24)
- [x] Go Agent 指标采集端到端测试 ✅ (2026-05-25) — Agent 注册 + metrics 推送到 metric_snapshots + API 查询验证通过
- [x] Go Agent 探针执行端到端测试 ✅ (2026-05-25) — /probe + /exec + /processes 端点可用
- [x] 监控任务、告警、通知、定时任务端点 ✅ (2026-05-25) — HTTP Monitor 创建 + Alert Rule (threshold number fix) + Webhook/Email Channel + CronJob 全部 CRUD 通过
- [x] WebSocket (后端→前端) ✅ — 已实现 ping/pong + subscribe/unsubscribe + 过滤广播
- [ ] 前端 AUTH_BYPASS 关闭后登录流程未完整测试 (需浏览器交互)

---

## 五、总体进度

| 模块 | 完成度 | 说明 |
|------|--------|------|
| 基础设施 | 100% | Docker + 环境变量 + CI/CD + 生产部署配置全部就绪 |
| 后端 — Schema | 100% | 14 张表 + 2 超表 |
| 后端 — 插件/中间件 | 100% | 5 个全部完成 |
| 后端 — 校验器 | 100% | 12 文件 24 Schema |
| 后端 — 服务层 | 100% | 18 文件 72+ 函数 |
| 后端 — 路由 | 100% | 13 文件 61 端点 (含防火墙代理) |
| 后端 — WebSocket | 100% | 完整实现 — ping/pong + subscribe/unsubscribe + 过滤广播 + 实时推送 |
| 前端 — 认证页 | 100% | 登录/注册 + GitHub OAuth |
| 前端 — Dashboard 页 | 99% | 全部页面真实 API + RSC 迁移 (Landing/Status ssr) + 7 个 loading.tsx Suspense 边界 |
| 前端 — 组件库 | 92% | UI/Layout 组件齐全 + ErrorBoundary + ConfirmDialog 全部页面集成 |
| 前端 — 状态管理 | 100% | 4 Store 完整 |
| 前端 — 工具库 | 100% | API 客户端、WebSocket、i18n 齐全 |
| 前端 — 国际化 | 100% | 中英 ~200 key |
| 前端 — 测试 | 100% | 63 tests, 7 文件 ✅ (2026-05-26) |
| Go Agent | 100% | 15 endpoint + 7 内部模块 + WebSSH + 防火墙 + 应用部署 + 远程部署 (82.156.14.93) |
| 后端 — 探测/告警 | 100% | probe_results + alert_events 读写 API + poller 集成 + Email 通知(SMTP) |
| 后端 — 消息队列 | 100% | BullMQ — notification-dispatch (3次重试) + cron-execution, QUEUE_ENABLED 开关 |
| **总体** | **~100%** | 远程 Agent 部署 + SSH 双向隧道 + 防火墙端到端验证完成 (2026-05-28) |

---

## 六、下一步优先级建议

1. ~~**P0** — 前端 Dashboard 接入真实 API~~ ✅ (2026-05-24)
2. ~~**P0** — Go Agent 重构~~ ✅ 完成 (2026-05-24)
3. ~~**P0** — `probe_results` + `alert_events` 读写 API~~ ✅ (2026-05-24)
4. ~~**P1** — WebSocket 消息处理完整实现~~ ✅ (2026-05-24) — subscribe/unsubscribe + 过滤广播完成
5. ~~**P0** — Cron 执行引擎~~ ✅ (2026-05-24) — cron-poller 每 60s 解析表达式 + 调用 Agent /exec
6. ~~**P0** — Cron 执行引擎~~ ✅ (2026-05-24)
7. ~~**P0** — 告警评估 + 通知分发~~ ✅ (2026-05-25) — alert-evaluator + notification-dispatcher
8. ~~**P0** — 后端重启验证 poller 端到端 (Agent → metric_snapshots/probe_results + cron_executions + WS 实时推送)~~ ✅ (2026-05-25) — agentId 自动生成 + Agent 注册成功 + metrics poller 拉取正常
9. ~~**P1** — 后端 Agent routes 适配 pull 模式~~ ✅ (2026-05-24)
10. ~~**P1** — 前端 alerts/ monitors/ 业务组件~~ ✅ (2026-05-24)
11. ~~**P1** — Server 详情页真实数据渲染~~ ✅ (2026-05-24)
12. ~~**P2** — 设置页功能~~ ✅ (2026-05-24)
13. ~~**P2** — 公开状态页动态渲染~~ ✅ (2026-05-24)
14. ~~**P2** — Landing Page~~ ✅ (2026-05-24)
15. ~~**P3** — OAuth 登录流程~~ ✅ (2026-05-24)
16. ~~**P3** — BullMQ 消息队列引入~~ ✅ (2026-05-25)
17. ~~**P0** — 防火墙功能~~ ✅ (2026-05-27): Agent internal/firewall + Dashboard proxy + Frontend /firewall 页面
18. ~~**P0** — 远程 Agent 部署~~ ✅ (2026-05-28): Agent 部署至 82.156.14.93 (腾讯云) + systemd 服务 + SSH 双向隧道
19. ~~**P3** — RSC / Server Components~~ ✅ (2026-05-25) — Landing + Status 页 SSR, 7 个 loading.tsx

### 部署 & 运维笔记
- **远程服务器**: 82.156.14.93 (Ubuntu 22, 腾讯云)
- **Agent systemd 服务**: `/etc/systemd/system/proberx-agent.service`
  - `AGENT_ID=agent-d9e4c957` | `AGENT_PORT=9800` | `DASHBOARD_URL=http://127.0.0.1:3001`
- **SSH 隧道** (本地 Windows → 远程):
  - 反向隧道: `ssh -R 3001:localhost:3001` (Agent 注册/心跳/指标回 Dashboard)
  - 正向隧道: `ssh -L 19800:127.0.0.1:9800` (Dashboard 代理请求至 Agent)
  - 隧道断开后需手动重建
- **防火墙 iptables 解析 Bug 修复** (2026-05-28): 策略正则 + 表头正则适配 `-v` 标志输出格式
