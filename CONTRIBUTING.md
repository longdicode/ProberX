# ProberX — Developer Guide

面向开发者的完整贡献指南，覆盖环境搭建、代码约定、新增功能流程和调试技巧。

---

## 目录

1. [快速上手](#1-快速上手)
2. [项目架构](#2-项目架构)
3. [代码约定](#3-代码约定)
4. [新增功能指南](#4-新增功能指南)
5. [数据库 & 迁移](#5-数据库--迁移)
6. [测试指南](#6-测试指南)
7. [构建 & 部署](#7-构建--部署)
8. [调试技巧](#8-调试技巧)
9. [常见任务速查](#9-常见任务速查)

---

## 1. 快速上手

### 环境要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | 22+ | Dashboard + Frontend 运行时 |
| npm | 10+ | 包管理 |
| Go | 1.22+ | Agent 编译 |
| Docker | 20.x+ | 基础服务 (PG + Redis) |
| PostgreSQL | 16+ | 业务数据 + 时序数据 (TimescaleDB) |
| Redis | 7+ | 缓存 + 消息队列 |

### 5 分钟跑起来

```bash
# 1. 克隆项目
git clone https://github.com/longdicode/ProberX.git
cd proberx

# 2. 启动基础服务 (PostgreSQL + Redis)
docker compose up -d

# 3. 启动 Dashboard (终端 1)
cd apps/dashboard
cp .env.example .env
npm install
npm run dev                    # → http://localhost:3001

# 4. 启动 Frontend (终端 2)
cd apps/frontend
npm install
npm run dev                    # → http://localhost:3000

# 5. 启动 Agent (终端 3, 可选)
cd apps/agent
go build -o agent .
export DASHBOARD_URL=http://localhost:3001
export AGENT_TOKEN=dev-token
./agent                        # → http://localhost:9800
```

**开发模式提示**：

- Dashboard 发送 `Authorization: Bearer bypass` 即可跳过 JWT 验证
- 前端设置 `NEXT_PUBLIC_AUTH_BYPASS=true` 启用开发用户自动登录
- `docker compose down` 停止基础服务，数据卷会被保留

### 环境变量

**Dashboard** (`apps/dashboard/.env`)：

```bash
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://proberx:proberx@localhost:5432/proberx
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-at-least-32-chars-long
JWT_EXPIRES_IN=7d
QUEUE_ENABLED=false            # 开发时可关闭 BullMQ
```

**Frontend** (`apps/frontend/.env.local`)：

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
NEXT_PUBLIC_AUTH_BYPASS=true
```

**Agent**（环境变量或 export）：

```bash
DASHBOARD_URL=http://localhost:3001
AGENT_TOKEN=dev-token
AGENT_PORT=9800
AGENT_HOST=                    # 可选，Agent 对外可达地址
AGENT_ID=                      # 可选，默认 hostname-pid
```

---

## 2. 项目架构

### 整体分层

```
Frontend (Next.js 16)         Dashboard (Fastify v5)         Agent (Go)
   React 19                     REST API + WebSocket           HTTP Server
   Tailwind 4                   Drizzle ORM                    gopsutil
   shadcn/ui                    BullMQ Worker                  metrics/probe/exec/process
   Zustand + TanStack Query     3 个 Poller (60s)
        │                              │                              │
        │ HTTP/WS ────────────────────▶│◀──── HTTP Push ──────────────│
        │                              │
        │                         ┌────┴────┐
        │                         │  Redis  │  (缓存 / 消息队列 / Pub-Sub)
        │                         └────┬────┘
        │                         ┌────┴────────────┐
        │                         │  PostgreSQL      │
        │                         │  (+TimescaleDB)  │
        │                         └─────────────────┘
```

### 请求生命周期（以 "创建监控任务" 为例）

```
1. Browser → POST /api/v1/workspaces/:wid/monitors
   Header: Authorization: Bearer <JWT>

2. Fastify 路由匹配 → monitors.ts

3. preHandler 链:
   app.authenticate      → 验证 JWT, 注入 req.user
   app.guardWorkspace()  → 检查 membership 表, 确认用户属于该 workspace

4. Route handler:
   createMonitorBody.parse(req.body)  → Zod 校验
   service.create(wid, parsed, app.db) → 业务逻辑

5. Service layer:
   db.insert(monitorTasks).values({...}).returning()

6. Response: 201 { id, name, type, target, ... }
```

### 目录职责

```
apps/dashboard/src/
├── config/env.ts            # 环境变量解析 (dotenv + 类型导出)
├── index.ts                 # 入口: Fastify 启动 + 插件注册 + 路由挂载
├── plugins/                 # Fastify 插件 (db, redis, auth, jwt, error-handler)
├── routes/                  # HTTP 路由处理 (仅做参数提取 + 调用 service)
├── services/                # 业务逻辑 (数据校验 + DB 操作 + 外部调用)
├── validators/              # Zod 请求/响应 schema
├── ws/                      # WebSocket 管理 (连接、广播、订阅)
├── db/
│   ├── index.ts             # Drizzle 客户端初始化
│   └── schema/              # 表定义 (14 张表)
├── queues/                  # BullMQ 队列 + Worker 定义
├── middleware/               # Fastify 中间件 (agent-token)
└── utils/errors.ts          # 统一错误类型 (AppError)

apps/frontend/src/
├── app/                     # Next.js App Router 页面
│   ├── (dashboard)/         # 控制台布局 (带 Sidebar)
│   ├── (auth)/              # 登录/注册
│   └── (status)/            # 公开状态页
├── components/              # React 组件
│   ├── ui/                  # shadcn/ui 基础组件
│   ├── charts/              # Recharts 图表
│   └── layout/              # 布局组件 (Sidebar, Header)
├── hooks/                   # use-api.ts (TanStack Query), use-websocket.ts
├── stores/                  # Zustand stores (auth, ui, workspace, locale)
├── lib/                     # api-client.ts, ws-client.ts, validators.ts, locales/

apps/agent/
├── main.go                  # 入口: HTTP Server + 注册 + 心跳 + 指标推送协程
└── internal/
    ├── metrics/metrics.go   # 系统指标采集 (CPU/Mem/Disk/Net/Load)
    ├── probe/probe.go       # 探测执行 (HTTP/TCP/DNS/SSL/Ping/gRPC)
    ├── exec/exec.go         # Shell 命令执行
    └── process/process.go  # 进程列表
```

---

## 3. 代码约定

### 3.1 TypeScript (Dashboard)

**文件命名**：kebab-case，如 `monitor.service.ts`、`status-page.ts`

**路由文件结构** — 每个路由模块遵循固定模式：

```typescript
import type { FastifyPluginAsync } from "fastify";
import { createXxxBody, updateXxxBody } from "../validators/xxx";
import { paginationQuery } from "../validators/common";
import * as service from "../services/xxx.service";

export const xxxRoutes: FastifyPluginAsync = async (app) => {

  // GET    — 列表 (分页)
  app.get("/workspaces/:wid/xxx", {
    preHandler: [app.authenticate, app.guardWorkspace()]
  }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const { limit } = paginationQuery.parse(req.query);
    return reply.send(await service.list(wid, app.db, limit));
  });

  // POST   — 创建
  app.post("/workspaces/:wid/xxx", {
    preHandler: [app.authenticate, app.guardWorkspace()]
  }, async (req, reply) => {
    const { wid } = req.params as { wid: string };
    const parsed = createXxxBody.parse(req.body);
    return reply.code(201).send(await service.create(wid, parsed, app.db));
  });

  // PATCH  — 更新
  app.patch("/workspaces/:wid/xxx/:id", {
    preHandler: [app.authenticate, app.guardWorkspace()]
  }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    const parsed = updateXxxBody.parse(req.body);
    return reply.send(await service.update(wid, id, parsed, app.db));
  });

  // DELETE — 删除
  app.delete("/workspaces/:wid/xxx/:id", {
    preHandler: [app.authenticate, app.guardWorkspace()]
  }, async (req, reply) => {
    const { wid, id } = req.params as { wid: string; id: string };
    await service.remove(wid, id, app.db);
    return reply.code(204).send();
  });
};
```

**Service 函数签名** — 始终接收 `(workspaceId, ...args, db)` 模式：

```typescript
export async function list(workspaceId: string, db: DbClient, limit = 50) { ... }
export async function create(workspaceId: string, input: CreateInput, db: DbClient) { ... }
export async function update(workspaceId: string, id: string, input: UpdateInput, db: DbClient) { ... }
export async function remove(workspaceId: string, id: string, db: DbClient) { ... }
```

**Zod 校验** — create 和 update 用独立的 schema，update 所有字段 `.optional()`：

```typescript
export const createXxxBody = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(["http", "tcp", "ping"]),
  intervalSec: z.number().int().min(10).max(3600).default(60),
}, undefined);

export const updateXxxBody = z.object({
  name: z.string().min(1).max(255).optional(),
  type: z.enum(["http", "tcp", "ping"]).optional(),
  intervalSec: z.number().int().min(10).max(3600).optional(),
}, undefined);

export type CreateInput = z.infer<typeof createXxxBody>;
export type UpdateInput = z.infer<typeof updateXxxBody>;
```

**错误处理** — 使用 `AppError` 工具类：

```typescript
import { AppError } from "../utils/errors";

// 业务逻辑中抛出
throw AppError.notFound("Server", serverId);   // → 404
throw AppError.forbidden("Not a member");       // → 403
throw AppError.badRequest("Invalid target");    // → 400

// error-handler.ts 统一捕获并格式化返回
```

**数据库查询** — 始终带 `workspaceId` 隔离保护：

```typescript
// ✅ 正确：限定 workspaceId
db.select().from(monitorTasks)
  .where(and(eq(m.tasks.workspaceId, wid), eq(m.tasks.id, id)))

// ❌ 错误：没有 workspaceId 隔离
db.select().from(monitorTasks).where(eq(m.tasks.id, id))
```

### 3.2 React (Frontend)

**页面约定**：

```
app/(dashboard)/servers/page.tsx      → /:workspace/servers (需登录)
app/(dashboard)/servers/[id]/page.tsx → /:workspace/servers/:id
app/(auth)/login/page.tsx             → /login (无需登录)
app/(status)/[slug]/page.tsx          → /status/:slug (公开)
```

**数据获取** — TanStack Query hooks 统一在 `hooks/use-api.ts`：

```typescript
// GET queries
export function useServers() {
  const { activeWorkspaceId } = useWorkspaceStore();
  return useQuery({
    queryKey: ["servers", activeWorkspaceId],
    queryFn: () => client.get(`/api/v1/workspaces/${activeWorkspaceId}/servers`),
    enabled: !!activeWorkspaceId,
  });
}

// Mutations
export function useCreateServer() {
  const queryClient = useQueryClient();
  const { activeWorkspaceId } = useWorkspaceStore();
  return useMutation({
    mutationFn: (data: CreateServerInput) =>
      client.post(`/api/v1/workspaces/${activeWorkspaceId}/servers`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["servers"] }),
  });
}
```

**WebSocket** — 使用 `use-websocket.ts` hook：

```typescript
const { subscribe, lastMessage } = useWebSocket();
subscribe("metrics:update");  // 订阅实时指标
subscribe("alert:event");     // 订阅告警通知
```

### 3.3 Go (Agent)

**单一职责**：`main.go` 只做 HTTP 路由 + 协程启动，每个 `internal/` 包只暴露 1-2 个公开函数。

**错误处理**：函数返回 `(Result, error)`，调用方在协程中 log 错误后 continue。

```go
// internal/ 包签名约定
func Collect() (Snapshot, error)       // metrics
func Execute(req Request) Result       // probe (不返回 error，结果体现在 Result.Success)
func Run(req Request) Result           // exec
func List(limit int) ([]Process, error) // process
```

**HTTP 响应统一**：`writeJSON(w, status, v)` 处理序列化：

```go
func writeJSON(w http.ResponseWriter, status int, v any) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(status)
    json.NewEncoder(w).Encode(v)
}
```

---

## 4. 新增功能指南

本节以 **"为监控任务添加标签 (tags) 功能"** 为例，演示从数据库到前端完整流程。

### Step 1：数据库 Schema 变更

`apps/dashboard/src/db/schema/monitor-tasks.ts`：

```typescript
export const monitorTasks = pgTable("monitor_tasks", {
  // ... 现有列 ...
  tags: text("tags").array().default(sql`'{}'`).notNull(),  // 新增
});
```

根据 Drizzle 迁移策略运行 `npm run db:push`（开发）或 `npm run db:generate && npm run db:migrate`（生产）。

### Step 2：Validator 新增字段

`apps/dashboard/src/validators/monitor.ts`：

```typescript
export const createMonitorBody = z.object({
  // ... 现有字段 ...
  tags: z.array(z.string()).max(10).default([]),  // 新增
}, undefined);

export const updateMonitorBody = z.object({
  // ... 现有字段 ...
  tags: z.array(z.string()).max(10).optional(),   // 新增
}, undefined);
```

### Step 3：Service 层处理新字段

`apps/dashboard/src/services/monitor.service.ts`：

```typescript
export async function create(workspaceId: string, input: CreateMonitorInput, db: DbClient) {
  const [monitor] = await db.insert(monitorTasks).values({
    // ... 现有字段 ...
    tags: input.tags,                           // 新增
  }).returning();
  return monitor;
}

export async function update(workspaceId: string, monitorId: string, input: UpdateMonitorInput, db: DbClient) {
  const existing = await getById(workspaceId, monitorId, db);
  const [updated] = await db.update(monitorTasks)
    .set({
      // ... 现有字段 ...
      tags: input.tags ?? existing.tags,         // 新增
    })
    .where(and(eq(monitorTasks.id, monitorId), eq(monitorTasks.workspaceId, workspaceId)))
    .returning();
  return updated;
}
```

### Step 4：Route（无需修改）

Validator + Service 改完后，路由自动生效，因为 handler 只负责透传 `parsed` 给 service。这就是为什么要严格分层。

### Step 5：前端表单

`apps/frontend/src/components/monitors/MonitorForm.tsx` 或相应位置添加 tags 字段，使用 `react-hook-form` + zod resolver。

### Step 6：验证

```bash
# 后端编译检查
cd apps/dashboard && npx tsc --noEmit

# 运行测试
cd apps/dashboard && npm test

# 启动后端手动测试
curl -X POST http://localhost:3001/api/v1/workspaces/<wid>/monitors \
  -H "Authorization: Bearer bypass" \
  -H "Content-Type: application/json" \
  -d '{"name":"test","type":"http","target":"https://example.com","tags":["production","api"]}'
```

---

## 5. 数据库 & 迁移

### Schema 文件组织

```
apps/dashboard/src/db/
├── index.ts              # Drizzle 客户端初始化
├── run-migration.ts      # 迁移执行脚本
└── schema/
    ├── users.ts
    ├── workspaces.ts
    ├── memberships.ts
    ├── servers.ts
    ├── monitor-tasks.ts
    ├── probe-results.ts       # TimescaleDB 超表
    ├── metric-snapshots.ts    # TimescaleDB 超表
    ├── alert-rules.ts
    ├── alert-events.ts
    ├── notification-channels.ts
    ├── cron-jobs.ts
    ├── cron-executions.ts
    ├── status-pages.ts
    └── api-keys.ts
```

### 开发期 Schema 变更

```bash
cd apps/dashboard

# 快速原型阶段：直接推送到 DB（不生成迁移文件）
npm run db:push

# 正式阶段：生成迁移文件 + 执行
npm run db:generate          # 生成 SQL 迁移文件
npm run db:migrate           # 执行迁移
```

### 查询规范

```typescript
import { eq, and, desc, sql } from "drizzle-orm";

// 条件组合
.where(and(eq(t.workspaceId, wid), eq(t.id, id)))

// 排序 + 分页
.orderBy(desc(t.createdAt)).limit(50)

// 获取插入的行
const [row] = await db.insert(t).values({...}).returning();

// 更新后获取更新行
const [updated] = await db.update(t).set({...}).where(...).returning();
```

---

## 6. 测试指南

### Dashboard 测试 (vitest)

```bash
cd apps/dashboard

npm test                # 运行所有测试
npm run test:watch      # watch 模式
```

**测试文件**：`src/**/__tests__/*.test.ts`，一个 test 文件对应一个 validator 模块。

**测试示例** (`validators/__tests__/validators.test.ts`)：

```typescript
import { describe, it, expect } from "vitest";
import { createMonitorBody, updateMonitorBody } from "../monitor";

describe("createMonitorBody", () => {
  it("parses valid monitor", () => {
    const result = createMonitorBody.parse({
      name: "My Monitor",
      type: "http",
      target: "https://example.com",
    });
    expect(result.name).toBe("My Monitor");
    expect(result.intervalSec).toBe(60);  // 默认值
  });

  it("rejects invalid type", () => {
    expect(() =>
      createMonitorBody.parse({
        name: "Test",
        type: "ftp",  // 不在 enum 中
        target: "localhost",
      })
    ).toThrow();
  });
});
```

### Agent 测试 (go test)

```bash
cd apps/agent

go test ./...           # 运行所有包的测试
go test -v ./...        # 详细输出
go test ./internal/metrics/ -run TestCollect  # 运行单个测试
```

**测试示例** (`internal/metrics/metrics_test.go`)：

```go
func TestCollect(t *testing.T) {
    snap, err := Collect()
    if err != nil {
        t.Fatalf("Collect() failed: %v", err)
    }
    if snap.NumCPU == 0 {
        t.Error("NumCPU should be > 0")
    }
    if snap.CollectedAt == 0 {
        t.Error("CollectedAt should be set")
    }
}
```

### 提交前检查

```bash
# Dashboard 类型检查
cd apps/dashboard && npx tsc --noEmit

# Frontend 类型检查 + 构建验证
cd apps/frontend && npx tsc --noEmit && npm run build

# Agent 编译 + 静态分析
cd apps/agent && go build ./... && go vet ./...

# 所有测试
cd apps/dashboard && npm test
cd apps/agent && go test ./...
```

---

## 7. 构建 & 部署

### 开发环境

```bash
docker compose up -d                   # PG + Redis
cd apps/dashboard && npm run dev       # :3001 热重载
cd apps/frontend && npm run dev        # :3000 HMR
cd apps/agent && go run .              # :9800
```

### 生产构建

```bash
# Dashboard
cd apps/dashboard
npm run build                          # tsc 编译到 dist/
npm start                              # node dist/index.js

# Frontend
cd apps/frontend
npm run build                          # Next.js standalone 模式
npm start                              # node server.js

# Agent
cd apps/agent
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
  go build -ldflags="-s -w" -o agent-linux .
```

### Docker 构建

```bash
# 全栈
docker compose -f docker-compose.prod.yml build

# 单独构建
docker compose -f docker-compose.prod.yml build dashboard
docker compose -f docker-compose.prod.yml build frontend
cd apps/agent && docker build -t proberx-agent:latest .
```

### Docker Compose 结构

```
docker-compose.yml          # 开发：仅 PG + Redis，端口暴露到 localhost
docker-compose.prod.yml     # 生产：4 个 service (postgres, redis, dashboard, frontend)
                            #   dashboard builds from apps/dashboard/Dockerfile
                            #   frontend builds from apps/frontend/Dockerfile
                            #   agent 不在此编排中 (运行在被监控服务器上)
```

### CI/CD

`.github/workflows/ci.yml` — 3 个 job 并行运行：

| Job | 步骤 |
|-----|------|
| Dashboard | `npm ci` → `tsc --noEmit` |
| Frontend | `npm ci` → `tsc --noEmit` → `next build` |
| Agent | `go build ./...` → `go vet ./...` |

---

## 8. 调试技巧

### Dashboard

```bash
# 日志级别 (development 默认 debug, production 默认 info)
# 可在 config/env.ts 中调整

# 开发模式跳过 JWT 认证
curl localhost:3001/api/v1/workspaces \
  -H "Authorization: Bearer bypass"

# 查看数据库
docker compose exec postgres psql -U proberx -d proberx
proberx=# \dt                     -- 列出所有表
proberx=# SELECT * FROM servers;  -- 查询服务器
```

### Frontend

```bash
# 启用 React DevTools
# 浏览器安装 React Developer Tools 扩展

# 查看 TanStack Query 状态
# 浏览器安装 React Query Devtools (开发模式自动显示)

# 查看 WebSocket 消息
# 浏览器 DevTools → Network → WS → 选择 ws://localhost:3001/ws
```

### Agent

```bash
# 手动测试 Agent 端点
curl http://localhost:9800/health
curl http://localhost:9800/metrics | jq .
curl -X POST http://localhost:9800/probe \
  -H "Content-Type: application/json" \
  -d '{"type":"tcp","target":"google.com:80"}'

# Agent 日志输出到 stderr
# 关注: register / heartbeat / metrics push 相关日志
```

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| `ECONNREFUSED :5432` | PG 未启动 | `docker compose up -d` |
| `permission denied for table` | Schema 未迁移 | `cd apps/dashboard && npm run db:push` |
| Agent 注册失败 | DASHBOARD_URL 不对或 server 未创建 | 先在 Dashboard 添加 server，获取 agentToken |
| `npm ci` ECONNRESET (Docker) | npm registry 网络不稳定 | Dockerfile 已配置 fetch-retries 5 |
| Next.js build 卡住 | 内存不足 | 增加 Docker 内存限制: `docker build --memory=4g` |

---

## 9. 常见任务速查

### 添加一个新的 API 端点

1. `validators/xxx.ts` — 添加 Zod schema + 导出类型
2. `services/xxx.service.ts` — 添加业务逻辑函数
3. `routes/xxx.ts` — 添加路由 handler
4. `src/index.ts` — 注册路由（如新路由模块）

### 添加一个新的通知渠道

1. `validators/notification.ts` — `type` enum 中添加新渠道名
2. `services/notification-dispatcher.ts` — 添加 `case "new_channel":` 处理逻辑
3. Frontend 表单 — 添加新渠道的配置界面

### 添加一个新的探测类型

1. `apps/dashboard/src/validators/monitor.ts` — `type` enum 中添加
2. `apps/agent/internal/probe/probe.go` — `Execute()` switch 中添加 case + 实现探测函数
3. Frontend 表单 — 探测类型下拉菜单中添加选项

### 添加一个新的 i18n key

1. `apps/frontend/src/lib/locales/en.ts` — 添加英文翻译
2. `apps/frontend/src/lib/locales/zh.ts` — 添加中文翻译

```typescript
// lib/locales/en.ts
export const en = {
  // ... 现有 176 keys ...
  "server.detail.uptime": "Uptime",
};

// lib/locales/zh.ts
export const zh = {
  // ... 现有 176 keys ...
  "server.detail.uptime": "运行时间",
};
```

### 运行一次完整的 CI 检查

```bash
cd apps/dashboard   && npx tsc --noEmit && npm test
cd apps/frontend    && npx tsc --noEmit && npm run build
cd apps/agent       && go build ./... && go vet ./... && go test ./...
```

---

## 参考文档

- [DEVELOPMENT.md](./DEVELOPMENT.md) — 系统架构 + 完整数据模型 + API 设计 + WebSocket 协议
- [DEVELOPMENT_PROGRESS.md](./DEVELOPMENT_PROGRESS.md) — 功能完成度跟踪
- [README.md](./README.md) — 项目简介 + 快速部署
- [Fastify v5 Docs](https://fastify.dev/docs/v5)
- [Drizzle ORM Docs](https://orm.drizzle.team/)
- [Next.js 16 Docs](./apps/frontend/node_modules/next/dist/docs/) (本地)
- [shadcn/ui](https://ui.shadcn.com/)
