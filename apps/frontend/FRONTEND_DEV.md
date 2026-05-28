# ProberX Frontend — 前端开发文档

> **版本**: v0.1.0 (framework)  
> **最后更新**: 2026-05-24  
> **定位**: ProberX 管理控制台 + 公开状态页前端，基于 Next.js 16 App Router

---

## 目录

1. [技术栈与版本](#1-技术栈与版本)
2. [项目结构](#2-项目结构)
3. [架构概览](#3-架构概览)
4. [快速开始](#4-快速开始)
5. [视觉标识与主题](#5-视觉标识与主题)
6. [核心基础设施](#6-核心基础设施)
7. [状态管理](#7-状态管理)
8. [Providers 层](#8-providers-层)
9. [路由与页面](#9-路由与页面)
10. [布局组件](#10-布局组件)
11. [表单与校验](#11-表单与校验)
12. [实时通信 (WebSocket)](#12-实时通信-websocket)
13. [API 集成](#13-api-集成)
14. [UI 组件](#14-ui-组件)
15. [公共组件](#15-公共组件)
16. [构建与部署](#16-构建与部署)
17. [扩展指南](#17-扩展指南)
18. [与后端对接清单](#18-与后端对接清单)

---

## 1. 技术栈与版本

| 技术 | 版本 | 用途 |
|------|------|------|
| Next.js | 16.2.6 (Turbopack) | React 框架, App Router |
| React | 19.2.4 | UI 库 |
| TypeScript | ^5 | 类型安全 |
| Tailwind CSS | ^4 (OKLCH) | 原子化 CSS |
| @base-ui/react | ^1.5.0 | 无样式基础 UI 组件 (shadcn 新版依赖) |
| shadcn/ui | ^4.8.0 | UI 组件库 |
| Zustand | ^5.0.13 | 客户端状态管理 |
| @tanstack/react-query | ^5.100.14 | 服务端状态 (REST API) |
| react-hook-form | ^7.76.1 | 表单管理 |
| zod | ^4.4.3 | Schema 校验 |
| Recharts | ^3.8.1 | 指标图表 |
| lucide-react | ^1.16.0 | 图标库 |
| next-themes | ^0.4.6 | 暗色/亮色主题切换 |
| sonner | ^2.0.7 | Toast 通知 |
| date-fns | ^4.3.0 | 日期格式化 |

### 关键差异：Next.js 16 + @base-ui/react

本项目的技术栈与传统的 Next.js 14 + Radix UI 有明显差异，开发时需特别注意：

**@base-ui/react 替代 Radix UI**

shadcn/ui v4 的底层从 Radix UI 切换到了 `@base-ui/react`。这意味着：
- **没有 `asChild` 属性** — 不再能通过 `asChild` 将组件渲染为子元素
- `DropdownMenuTrigger`、`Button` 等组件的 Props 接口不同
- 组合组件时，要么将样式直接应用到触发器上（去掉中间层），要么使用 `buttonVariants()` 生成样式类名配合原始 `<Link>` / `<a>` 使用

```tsx
// 错误 — @base-ui/react 不支持 asChild
<DropdownMenuTrigger asChild>
  <Button>...</Button>
</DropdownMenuTrigger>

// 正确 — 移除中间层，将样式放到 Trigger 上
<DropdownMenuTrigger className="hover:bg-muted rounded-lg flex items-center gap-2 px-3 py-2">
  ...
</DropdownMenuTrigger>

// 错误 — Button 也不支持 asChild
<Button asChild variant="outline"><Link href="/foo">Go</Link></Button>

// 正确 — 直接使用 Link + buttonVariants()
<Link href="/foo" className={buttonVariants({ variant: "outline" })}>Go</Link>
```

**Turbopack**

Next.js 16 默认使用 Turbopack 进行开发和构建，速度大幅提升。

---

## 2. 项目结构

```
apps/frontend/
├── next.config.ts
├── package.json
├── tsconfig.json
├── AGENTS.md                          # Next.js 16 注意事项
├── CLAUDE.md
├── FRONTEND_DEV.md                    # 本文档
└── src/
    ├── app/                           # Next.js App Router (路由文件)
    │   ├── globals.css                # 全局样式 + 主题变量 + 自定义动画
    │   ├── layout.tsx                 # 根布局 (Providers 层)
    │   ├── page.tsx                   # 首页 (占位，待替换为 Landing)
    │   ├── favicon.ico
    │   ├── (auth)/                    # 路由组 — 认证页
    │   │   ├── layout.tsx             # 居中卡片布局
    │   │   ├── login/page.tsx         # 登录页
    │   │   └── register/page.tsx      # 注册页
    │   ├── (dashboard)/               # 路由组 — 控制台
    │   │   ├── layout.tsx             # Sidebar + Header + 内容区
    │   │   ├── page.tsx               # Overview 仪表盘
    │   │   ├── servers/
    │   │   │   ├── page.tsx           # 服务器列表
    │   │   │   └── [id]/page.tsx      # 服务器详情
    │   │   ├── monitors/page.tsx      # 监控任务
    │   │   ├── alerts/page.tsx        # 告警规则
    │   │   ├── tasks/page.tsx         # 计划任务
    │   │   └── settings/page.tsx      # 工作空间设置
    │   └── (status)/                  # 路由组 — 公开状态页
    │       ├── layout.tsx             # 公开页布局
    │       └── [slug]/page.tsx        # 状态页内容
    ├── components/
    │   ├── ui/                        # shadcn/ui 组件 (16个)
    │   │   ├── avatar.tsx
    │   │   ├── badge.tsx
    │   │   ├── button.tsx
    │   │   ├── card.tsx
    │   │   ├── dialog.tsx
    │   │   ├── dropdown-menu.tsx
    │   │   ├── input.tsx
    │   │   ├── label.tsx
    │   │   ├── popover.tsx
    │   │   ├── scroll-area.tsx
    │   │   ├── select.tsx
    │   │   ├── separator.tsx
    │   │   ├── sheet.tsx
    │   │   ├── skeleton.tsx
    │   │   ├── tabs.tsx
    │   │   └── tooltip.tsx
    │   ├── layout/                    # 布局组件
    │   │   ├── sidebar.tsx            # 侧边导航栏
    │   │   ├── header.tsx             # 顶栏 (搜索、主题、用户菜单)
    │   │   ├── workspace-switcher.tsx # 工作空间切换器
    │   │   └── command-palette.tsx    # ⌘K 命令面板
    │   ├── servers/                   # 服务器相关组件
    │   │   ├── server-status-badge.tsx # 状态徽章 (在线/离线/警告)
    │   │   └── metric-chart.tsx       # 实时指标折线图 (Recharts)
    │   └── shared/                    # 通用组件
    │       ├── empty-state.tsx        # 空状态插画 + CTA
    │       ├── loading-skeleton.tsx   # 骨架屏 (Page/Table/Card)
    │       └── confirm-dialog.tsx     # 确认弹窗
    ├── hooks/
    │   └── use-websocket.ts          # WebSocket 连接 Hook
    ├── lib/                           # 工具库 & 基础设施
    │   ├── api-client.ts             # HTTP 客户端 (JWT 注入、自动刷新)
    │   ├── ws-client.ts              # WebSocket 客户端 (单例、重连)
    │   ├── auth.ts                   # Token 管理 (localStorage)
    │   ├── constants.ts              # 环境变量、套餐限制、常量枚举
    │   ├── utils.ts                  # cn() + 格式化函数
    │   └── validators.ts             # Zod Schema + 类型导出
    ├── stores/                        # Zustand 状态管理
    │   ├── auth-store.ts             # 用户认证状态
    │   ├── ui-store.ts               # UI 状态 (侧栏、命令面板)
    │   └── workspace-store.ts        # 工作空间状态
    └── providers/                     # React Context Providers
        ├── theme-provider.tsx        # next-themes 包装
        ├── query-provider.tsx        # TanStack Query 配置
        └── auth-provider.tsx         # 认证守卫 + 路由重定向
```

**总文件数: 55** (组件 20 + UI 16 + 页面 13 + 库 6)

---

## 3. 架构概览

### 3.1 Route Group 设计

Next.js App Router 使用 Route Group `(folderName)` 实现同一 URL 层级下的不同布局：

```
URL                    Route Group      Layout
────────────────────────────────────────────────
/login                 (auth)           居中卡片，无侧栏
/register              (auth)           居中卡片，无侧栏
/                      (dashboard)      Sidebar + Header + 内容区
/servers               (dashboard)      Sidebar + Header + 内容区
/servers/[id]          (dashboard)      Sidebar + Header + 内容区
/monitors              (dashboard)      Sidebar + Header + 内容区
/alerts                (dashboard)      Sidebar + Header + 内容区
/tasks                 (dashboard)      Sidebar + Header + 内容区
/settings              (dashboard)      Sidebar + Header + 内容区
/[slug]                (status)         公开状态页布局
```

### 3.2 数据流

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                           │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ Zustand  │  │ TanStack     │  │ WebSocket         │ │
│  │ Stores   │  │ Query        │  │ (ws-client.ts)    │ │
│  │          │  │ (REST API)   │  │                   │ │
│  │ auth     │  │              │  │ 实时指标推送       │ │
│  │ ui       │  │ CRUD 操作    │  │ 告警通知          │ │
│  │ workspace│  │              │  │ 状态变更          │ │
│  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘ │
│       │               │                   │             │
└───────┼───────────────┼───────────────────┼─────────────┘
        │               │                   │
        │         ┌─────┴─────┐      ┌──────┴──────┐
        │         │ REST API  │      │ WebSocket   │
        │         │ /api/v1/* │      │ /ws         │
        │         └─────┬─────┘      └──────┬──────┘
        │               │                   │
        │         ┌─────┴───────────────────┴──────┐
        │         │        Dashboard Backend        │
        │         └────────────────────────────────┘
```

**三种数据流**:
1. **UI 状态** (Zustand): 侧栏开关、命令面板、当前工作空间 — 不经过网络
2. **服务端状态** (TanStack Query + REST API): 服务器列表、监控配置、设置 — 发起 HTTP 请求
3. **实时数据** (WebSocket): 指标推送、告警通知 — 长连接推送

### 3.3 认证流程

```
1. 页面加载 → AuthProvider.useEffect → initialize()
2. initialize() 从 localStorage 读取 token + user
3. 已登录: isAuthenticated = true, 允许访问
4. 未登录: 重定向到 /login (公开页面除外)
5. 登录成功 → setTokens() 写入 localStorage → 设置 auth-store
6. API 请求 → api-client.ts 自动从 localStorage 获取 token → 注入 Authorization header
7. 401 响应 → clearTokens() → 重定向 /login
```

**公开路径** (无需认证): `/login`, `/register`, `/status`

---

## 4. 快速开始

```bash
# 安装依赖
cd apps/frontend
npm install

# 开发环境启动 (默认 http://localhost:3000)
npm run dev

# 生产构建
npm run build

# 启动生产服务器
npm run start

# ESLint 检查
npm run lint
```

### 环境变量

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1   # 后端 REST API 地址
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws          # 后端 WebSocket 地址
```

---

## 5. 视觉标识与主题

### 5.1 ProberX 品牌色

基于 OKLCH 色彩空间，以 Indigo/Violet 为主色调：

| Token | Light | Dark | 用途 |
|-------|------|------|------|
| `--primary` | `oklch(0.45 0.18 265)` | `oklch(0.62 0.19 265)` | 主色调，按钮、链接 |
| `--ring` | `oklch(0.45 0.18 265)` | `oklch(0.62 0.19 265)` | Focus 环 |
| `--success` | `oklch(0.55 0.18 150)` | `oklch(0.55 0.16 150)` | 在线/正常状态 |
| `--warning` | `oklch(0.7 0.16 85)` | `oklch(0.66 0.14 85)` | 警告状态 |
| `--destructive` | `oklch(0.58 0.24 22)` | `oklch(0.62 0.2 22)` | 错误/删除 |
| `--background` | `oklch(1 0 0)` | `oklch(0.13 0.015 265)` | 页面背景 |

### 5.2 自定义动画

定义于 `globals.css`:

```css
/* 探针信号脉冲 — 在线服务器状态灯 */
@keyframes probe-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(0.92); }
}

/* 探针扫描 — 卡片 hover 效果 */
@keyframes probe-scan {
  0% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
  100% { transform: translateY(0); }
}
```

使用方式: `class="animate-probe-pulse"` / `class="animate-probe-scan"`

### 5.3 玻璃态 (Glassmorphism)

```css
.glass {
  background: hsl(0 0% 100% / 0.05);
  backdrop-filter: blur(16px);
  border: 1px solid hsl(0 0% 100% / 0.08);
}
```

Header 使用此效果: `className="sticky top-0 z-30 h-14 glass border-b border-border/40"`

### 5.4 主题模式

使用 `next-themes`:
- 默认: `dark`
- 支持: `light` / `system`
- 实现: `class` 策略 (`.dark` class 切换)
- 位置: `providers/theme-provider.tsx`
- 切换: Header 中 Sun/Moon 按钮

---

## 6. 核心基础设施

### 6.1 api-client.ts — HTTP 客户端

路径: `src/lib/api-client.ts`

```typescript
import { api } from "@/lib/api-client";

// GET 请求
const servers = await api.get<Server[]>("/servers", {
  params: { status: "online", limit: 20 }
});

// POST 请求
const newServer = await api.post<Server>("/servers", { name, tags });

// PATCH 请求
await api.patch(`/servers/${id}`, { name: "Updated" });

// DELETE 请求
await api.delete(`/servers/${id}`);
```

特性:
- 自动从 localStorage 获取 JWT 注入 `Authorization: Bearer <token>`
- 401 响应自动清除 token 并重定向到 `/login`
- 统一错误类 `ApiError` (status + code + message + details)
- URL 参数自动编码

### 6.2 ws-client.ts — WebSocket 客户端

路径: `src/lib/ws-client.ts`

```typescript
import { wsClient } from "@/lib/ws-client";

// 订阅特定消息类型 (返回取消订阅函数)
const unsub = wsClient.on("metrics:push", (msg) => {
  console.log(msg.payload); // { server_id, cpu_percent, mem_used, ... }
});

// 发送消息
wsClient.send("command:exec", { serverId: "xxx", command: "uptime" });

// 连接状态
console.log(wsClient.state); // "connecting" | "connected" | "disconnected" | "reconnecting"
```

特性:
- 单例模式，全局唯一连接
- 指数退避重连 (1s → 2s → 4s → ... → max 60s)
- 10s 心跳 Ping 保活
- 按消息类型路由到 handler (Map<string, Set<handler>>)
- 自动在认证后连接，登出后断开

### 6.3 auth.ts — Token 管理

路径: `src/lib/auth.ts`

```typescript
import { getToken, setTokens, clearTokens, getStoredUser, isAuthenticated } from "@/lib/auth";

// 存储 (登录成功后调用)
setTokens(accessToken, refreshToken);  // → localStorage: proberx_token, proberx_refresh_token

// 读取
const token = getToken();
const user = getStoredUser();          // → localStorage: proberx_user

// 清除
clearTokens();                          // 移除全部

// 判断
if (isAuthenticated()) { ... }
```

**localStorage Key 表**:

| Key | 内容 |
|-----|------|
| `proberx_token` | JWT Access Token |
| `proberx_refresh_token` | JWT Refresh Token |
| `proberx_user` | JSON { id, email, name, avatarUrl } |

### 6.4 constants.ts — 常量

路径: `src/lib/constants.ts`

| 常量 | 类型 | 说明 |
|------|------|------|
| `API_BASE_URL` | string | REST API 基址 (env: `NEXT_PUBLIC_API_URL`) |
| `WS_BASE_URL` | string | WebSocket 地址 (env: `NEXT_PUBLIC_WS_URL`) |
| `PLAN_LIMITS` | object | free/pro/enterprise 套餐限制 |
| `MONITOR_TYPES` | array | HTTP/TCP/Ping/DNS/SSL/gRPC |
| `SEVERITY_COLORS` | object | warning/critical/emergency 颜色 |
| `NOTIFICATION_TYPES` | array | Email/Webhook/DingTalk/Feishu 等 |
| `POLLING_INTERVALS` | object | metrics=2s, serverList=5s, monitorList=10s |

### 6.5 utils.ts — 工具函数

路径: `src/lib/utils.ts`

| 函数 | 用途 |
|------|------|
| `cn(...inputs)` | 合并 className (来自 shadcn) |
| `formatBytes(n)` | 字节 → "1.5 GB" |
| `formatPercent(n)` | 0.753 → "75.3%" |
| `formatDuration(ms)` | 3600000 → "1h 0m" |
| `formatUptime(seconds)` | 86400 → "1d 0h" |
| `formatRelativeTime(date)` | 时间戳 → "2 minutes ago" |

### 6.6 validators.ts — Zod Schema

路径: `src/lib/validators.ts`

定义了 6 个 Schema + 类型:

- `loginSchema` → `LoginInput` (email + password)
- `registerSchema` → `RegisterInput` (name + email + password + confirmPassword)
- `serverSchema` → `ServerInput` (name + tags + isHidden)
- `monitorSchema` → `MonitorInput` (name + type + target + intervalSec + timeoutMs)
- `alertRuleSchema` → `AlertRuleInput` (targetType + metric + operator + threshold + severity)
- `cronJobSchema` → `CronJobInput` (name + cronExpr + command + targetServers)

---

## 7. 状态管理

### 7.1 auth-store.ts

```typescript
interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  initialize: () => void;  // 从 localStorage 恢复会话
}
```

使用: `const { user, login, logout } = useAuthStore();`

### 7.2 ui-store.ts

```typescript
interface UiState {
  sidebarOpen: boolean;           // 侧栏是否显示
  sidebarCollapsed: boolean;      // 侧栏是否折叠为图标模式
  commandPaletteOpen: boolean;    // ⌘K 面板是否打开
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
}
```

使用: `const { toggleSidebar, toggleCommandPalette } = useUiStore();`

### 7.3 workspace-store.ts

```typescript
interface WorkspaceState {
  current: Workspace | null;      // 当前选中
  list: Workspace[];              // 所有工作空间
  setCurrent: (ws: Workspace) => void;
  setList: (list: Workspace[]) => void;
  clear: () => void;
}
```

---

## 8. Providers 层

在 `app/layout.tsx` 中按嵌套顺序包裹:

```
ThemeProvider → QueryProvider → TooltipProvider → AuthProvider → {children} + Toaster
```

### theme-provider.tsx

- 库: `next-themes`
- 属性: `attribute="class"`, `defaultTheme="dark"`, `enableSystem`
- 覆盖: 整个 `<html>` 标签

### query-provider.tsx

- 库: `@tanstack/react-query`
- 默认配置: `staleTime: 30s`, `retry: 1`, `refetchOnWindowFocus: false`

### auth-provider.tsx

- 认证守卫: 在 `useEffect` 中调用 `initialize()` 检查登录状态
- 重定向: 未登录用户访问非公开路径 → 跳转 `/login`
- Loading: 显示 ProberX 品牌旋转加载指示器

---

## 9. 路由与页面

### 9.1 (auth) 路由组

**layout**: 全屏居中卡片布局 `min-h-screen flex items-center justify-center bg-background`

| 路由 | 文件 | 功能 |
|------|------|------|
| `/login` | `login/page.tsx` | 邮箱 + 密码登录表单, GitHub OAuth 按钮 (disabled) |
| `/register` | `register/page.tsx` | 注册表单: name, email, password, confirm password |

### 9.2 (dashboard) 路由组

**layout**: `Sidebar + CommandPalette + Header + main`。主区域 `margin-left` 响应侧栏状态 (`ml-60` / `ml-16` / `ml-0`)。

| 路由 | 文件 | 状态 |
|------|------|------|
| `/` | `page.tsx` | **Overview** — 4 个统计卡片 (Total Servers/Active Monitors/Alerts Today/Avg CPU) + Recent Activity + Quick Actions |
| `/servers` | `servers/page.tsx` | **服务器列表** — 搜索框 + 响应式卡片网格 (3 列) + EmptyState |
| `/servers/[id]` | `servers/[id]/page.tsx` | **服务器详情** — 4 个资源卡片 (CPU/Mem/Disk/Net) + Tabs: Metrics(含 3 个 MetricChart) / Processes / Terminal |
| `/monitors` | `monitors/page.tsx` | **监控任务** — EmptyState |
| `/alerts` | `alerts/page.tsx` | **告警规则** — EmptyState |
| `/tasks` | `tasks/page.tsx` | **计划任务** — EmptyState |
| `/settings` | `settings/page.tsx` | **设置** — General (workspace name) + API Keys + Members |

所有页面均标记 `"use client"` — 当前框架全部使用客户端渲染，等待后端 API 接入后再根据需求改为 RSC。

### 9.3 (status) 路由组

**layout**: 简洁品牌 Header + 最大宽度 3xl 内容区

| 路由 | 文件 | 功能 |
|------|------|------|
| `/[slug]` | `[slug]/page.tsx` | 公开状态页 — "All systems operational" + Monitored Services 卡片 + 底部 slug 标识 |

### 9.4 首页 (占位)

`app/page.tsx` 当前仍为 Next.js 默认模板内容 (Deploy Now / Documentation)。此页面将替换为 ProberX 产品 Landing Page。

---

## 10. 布局组件

### 10.1 Sidebar

路径: `components/layout/sidebar.tsx`

- **定位**: `fixed left-0 top-0 z-40` 全高侧栏
- **宽度**: `w-60` (展开) / `w-16` (折叠)
- **控制**: `ui-store.sidebarOpen` (显示/隐藏), `ui-store.sidebarCollapsed` (展开/折叠)
- **导航项 6 个**: Overview, Servers, Monitors, Alerts, Tasks, Settings
- **活跃状态**: 匹配 `pathname.startsWith(href)` + `bg-sidebar-accent` + `font-medium`
- **折叠模式**: 只显示图标 + `title` 属性提示, 隐藏 WorkspaceSwitcher 和 footer
- **底部**: "System operational" 状态 + 绿色脉冲指示灯 (animate-ping)
- **顶部**: Radio 图标 + "ProberX" 品牌名 + 折叠按钮

### 10.2 Header

路径: `components/layout/header.tsx`

- **定位**: `sticky top-0 z-30 h-14` + 玻璃态效果 (glass)
- **左侧**: Sidebar 恢复按钮 (sidebarOpen=false 时显示) + ⌘K 搜索触发按钮
- **右侧**: 主题切换 (Sun/Moon) + 用户下拉菜单
- **用户菜单**: Avatar (姓名首字母) → DropdownMenu (用户名+邮箱 + Profile + Sign Out)
- **mounted 守卫**: 主题按钮在客户端挂载后才渲染，防止 SSR 闪烁

### 10.3 WorkspaceSwitcher

路径: `components/layout/workspace-switcher.tsx`

- 显示在侧栏展开时，折叠时隐藏
- Dropdown 列表工作空间，当前选中有绿色圆点标识
- "Create workspace" 入口 (primary 色)

### 10.4 CommandPalette

路径: `components/layout/command-palette.tsx`

- **快捷键**: `Ctrl+K` / `⌘K` 开关, `Escape` 关闭
- **遮罩层**: `bg-background/60 backdrop-blur-sm`, 点击关闭
- **面板**: 搜索框 + 6 个快速导航按钮 (Overview → Settings)
- **实现**: 全局 `keydown` 事件监听

---

## 11. 表单与校验

认证页面使用 `react-hook-form` + `@hookform/resolvers` + `zod`:

```tsx
// login/page.tsx 示例模式
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@/lib/validators";

const form = useForm<LoginInput>({
  resolver: zodResolver(loginSchema),
  defaultValues: { email: "", password: "" },
});

const onSubmit = async (data: LoginInput) => {
  try {
    await login(data.email, data.password);
    router.push("/");
  } catch {
    toast.error("Login failed. Please check your credentials.");
  }
};
```

关键模式:
- Zod Schema 定义在 `lib/validators.ts`
- 表单状态通过 `form.formState.errors` 驱动错误显示
- API 错误通过 `sonner` toast 显示

---

## 12. 实时通信 (WebSocket)

### 12.1 useWebSocket Hook

路径: `hooks/use-websocket.ts`

```typescript
const { subscribe, send, state } = useWebSocket();

// 订阅指标推送
useEffect(() => {
  const unsub = subscribe("metrics:push", (payload) => {
    // payload: { server_id, cpu_percent, mem_used, ... }
    updateChart(payload);
  });
  return unsub;
}, []);

// 发送指令
send("command:exec", { serverId, command: "restart-nginx" });
```

**生命周期**: 认证后自动 `connect()`, 登出后自动 `disconnect()`

### 12.2 消息协议

与后端 Dashboard 通信采用 JSON 帧:

```typescript
interface AgentMessage {
  id: string;           // UUID v7
  type: string;         // 消息类型 (见 DEVELOPMENT.md §6)
  payload: unknown;     // 类型相关载荷
  timestamp: number;    // Unix 毫秒
}
```

常用消息类型 (Agent → Frontend 推送):

| type | 说明 |
|------|------|
| `metrics:push` | 系统指标 (CPU/Mem/Disk/Net) |
| `probe:result` | 探测结果 |
| `heartbeat` | 心跳响应 |
| `alert:triggered` | 告警触发通知 |
| `agent:info` | Agent 信息上报 |
| `server:status` | 服务器上下线变更 |

### 12.3 消息流

```
Agent ──WebSocket──→ Dashboard ──WebSocket──→ Frontend Browser
                                               │
                                               ├─ wsClient.dispatch()
                                               ├─ handlers.get("metrics:push") → 更新图表
                                               └─ handlers.get("alert:triggered") → 弹出 Toast
```

---

## 13. API 集成

### 13.1 请求示例

```typescript
// 获取服务器列表
const servers = await api.get<Server[]>("/servers", {
  params: { workspace_id: current.id }
});

// 创建监控任务
const monitor = await api.post<Monitor>("/monitors", {
  name: "Homepage check",
  type: "http",
  target: "https://example.com",
  interval_sec: 60,
  timeout_ms: 5000,
});

// 更新告警规则
await api.patch(`/alerts/${ruleId}`, { is_enabled: false });

// 删除计划任务
await api.delete(`/cronjobs/${jobId}`);
```

### 13.2 对接后端状态

| 状态 | 说明 |
|------|------|
| **已完成** | 前端框架全部可用，构建通过 |
| **待对接** | 所有 API 调用均为类型就绪的 mock，后端启动后直接替换 `API_BASE_URL` 即可调用 |
| **待实现** | TanStack Query 的 `useQuery` / `useMutation` 尚未在页面中实际引入 (当前用本地 state) |

---

## 14. UI 组件

所有 UI 组件在 `components/ui/` 下，为 shadcn/ui v4 基于 `@base-ui/react` 的封装。

| 组件 | 文件 | 导出 |
|------|------|------|
| Avatar | `avatar.tsx` | Avatar, AvatarImage, AvatarFallback |
| Badge | `badge.tsx` | Badge + badgeVariants |
| Button | `button.tsx` | Button + buttonVariants |
| Card | `card.tsx` | Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription |
| Dialog | `dialog.tsx` | Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter |
| DropdownMenu | `dropdown-menu.tsx` | 15 个组件 (Root, Trigger, Content, Item, Label, Separator, Sub*, Radio*, Checkbox*, Shortcut) |
| Input | `input.tsx` | Input |
| Label | `label.tsx` | Label |
| Popover | `popover.tsx` | Popover, PopoverTrigger, PopoverContent |
| ScrollArea | `scroll-area.tsx` | ScrollArea, ScrollAreaViewport, ScrollAreaScrollbar, etc. |
| Select | `select.tsx` | Select, SelectTrigger, SelectContent, SelectItem, SelectValue |
| Separator | `separator.tsx` | Separator |
| Sheet | `sheet.tsx` | Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter |
| Skeleton | `skeleton.tsx` | Skeleton |
| Tabs | `tabs.tsx` | Tabs, TabsList, TabsTrigger, TabsContent |
| Tooltip | `tooltip.tsx` | TooltipProvider, Tooltip, TooltipTrigger, TooltipContent |

### Button Variants

```typescript
// 6 种 variants
buttonVariants({ variant: "default" })     // 主色调实心
buttonVariants({ variant: "outline" })     // 描边
buttonVariants({ variant: "secondary" })   // 次要灰
buttonVariants({ variant: "ghost" })       // 透明
buttonVariants({ variant: "destructive" }) // 红色
buttonVariants({ variant: "link" })        // 链接样式

// 8 种 sizes
buttonVariants({ size: "default" })        // h-8, px-2.5
buttonVariants({ size: "xs" })             // h-6
buttonVariants({ size: "sm" })             // h-7
buttonVariants({ size: "lg" })             // h-9
buttonVariants({ size: "icon" })           // size-8
buttonVariants({ size: "icon-xs" })        // size-6
buttonVariants({ size: "icon-sm" })        // size-7
buttonVariants({ size: "icon-lg" })        // size-9
```

---

## 15. 公共组件

### 15.1 EmptyState

路径: `components/shared/empty-state.tsx`

```tsx
<EmptyState
  icon={Server}
  title="No servers connected"
  description="Deploy the ProberX agent on your servers to start monitoring."
  action={{ label: "Add Server", href: "/servers/add" }}  // 可选
/>
```

### 15.2 LoadingSkeleton

路径: `components/shared/loading-skeleton.tsx`

```tsx
import { PageSkeleton, CardSkeleton, TableSkeleton } from "@/components/shared/loading-skeleton";

// 页面级骨架: header + 4 个统计卡片 + 2 个内容块
<PageSkeleton />

// 单卡片骨架
<CardSkeleton />

// 表格骨架 (header + 3 行)
<TableSkeleton />
```

### 15.3 ConfirmDialog

路径: `components/shared/confirm-dialog.tsx`

```tsx
<ConfirmDialog
  open={showConfirm}
  onOpenChange={setShowConfirm}
  title="Delete Server"
  description="This action cannot be undone."
  confirmLabel="Delete"
  variant="destructive"       // 默认 "default"
  onConfirm={handleDelete}
/>
```

### 15.4 ServerStatusBadge

路径: `components/servers/server-status-badge.tsx`

```tsx
<ServerStatusBadge status="online" />    // 绿色脉冲
<ServerStatusBadge status="offline" />   // 灰色
<ServerStatusBadge status="warning" />   // 琥珀色
```

### 15.5 MetricChart

路径: `components/servers/metric-chart.tsx`

```tsx
<MetricChart
  title="CPU Usage"
  data={cpuData}              // { time: string, value: number }[]
  color="hsl(var(--chart-1))"
  unit="%"
/>
```

空数据时显示 "Waiting for data..." 提示。基于 Recharts `LineChart` + `ResponsiveContainer`。

---

## 16. 构建与部署

### 16.1 构建输出

```
✓ Compiled successfully in 2.6s
✓ TypeScript passed
✓ Generating static pages (11/11)

Route (app)
┌ ○ /                          # 静态
├ ○ /_not-found
├ ƒ /[slug]                    # 动态 (SSR)
├ ○ /alerts
├ ○ /login
├ ○ /monitors
├ ○ /register
├ ○ /servers
├ ƒ /servers/[id]              # 动态 (SSR)
├ ○ /settings
└ ○ /tasks
```

- `○` Static — 构建时预渲染
- `ƒ` Dynamic — 请求时服务器渲染

### 16.2 Dockerfile

```dockerfile
# 参考模板 (待创建)
FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY .next .next
COPY public public
EXPOSE 3000
CMD ["npm", "start"]
```

### 16.3 环境变量清单

| 变量 | 默认值 | 必需 |
|------|--------|------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001/api/v1` | 是 |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:3001/ws` | 是 |

---

## 17. 扩展指南

### 17.1 添加新页面

1. 在 `app/(dashboard)/` 下创建新路由目录和 `page.tsx`
2. 添加 `"use client"` 指令
3. 在 `components/layout/sidebar.tsx` 的 `navItems` 数组中添加导航项
4. 在 `components/layout/command-palette.tsx` 的 `actions` 数组中添加快捷入口

```tsx
// 例: 添加 billing 页面
// 1. 创建 app/(dashboard)/billing/page.tsx
// 2. sidebar.tsx navItems 添加:
{ href: "/billing", label: "Billing", icon: CreditCard },
// 3. command-palette.tsx actions 添加:
{ id: "billing", label: "Go to Billing", icon: CreditCard, href: "/billing" },
```

### 17.2 添加新 Store

1. 在 `stores/` 下创建新文件
2. 使用 `zustand.create<State>()` 定义
3. 在需要的组件中 `import { useXxxStore } from "@/stores/xxx-store"`

```typescript
// stores/notification-store.ts
import { create } from "zustand";

interface NotificationState {
  unreadCount: number;
  notifications: Notification[];
  addNotification: (n: Notification) => void;
  markRead: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  notifications: [],
  addNotification: (n) => set((s) => ({
    notifications: [n, ...s.notifications],
    unreadCount: s.unreadCount + 1,
  })),
  markRead: (id) => set((s) => ({
    notifications: s.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    ),
    unreadCount: Math.max(0, s.unreadCount - 1),
  })),
}));
```

### 17.3 添加新 shadcn 组件

```bash
npx shadcn add <component-name>
```

组件将被生成到 `components/ui/` 下。

### 17.4 对接 TanStack Query

页面目前使用本地 mock 数据。对接后端数据时，替换为 `useQuery` / `useMutation`:

```typescript
// 替换前 (mock):
const [servers, setServers] = useState<Server[]>([]);

// 替换后 (实际 API):
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

const { data: servers = [], isLoading } = useQuery({
  queryKey: ["servers"],
  queryFn: () => api.get<Server[]>("/servers"),
});
```

### 17.5 颜色与主题修改

所有颜色定义集中在 `globals.css` 的 `:root` 和 `.dark` 块中。修改品牌色只需调整:

```css
--primary: oklch(<lightness> <chroma> <hue>);
```

Hue 265 为 Indigo/Violet，调整 hue 值即可切换主题色系:
- 240: Blue
- 265: Indigo (当前)
- 280: Violet
- 320: Pink

---

## 18. 与后端对接清单

以下是前端框架完成情况与后端对接所需步骤:

### 已完成

- [x] Next.js 16 项目脚手架 (Turbopack, TypeScript, Tailwind v4)
- [x] shadcn/ui v4 组件库集成 (16 个组件)
- [x] 主题系统 (dark/light/system + OKLCH 色彩 + 玻璃态 + 自定义动画)
- [x] REST API 客户端 (JWT 注入 + 自动刷新 + 错误处理)
- [x] WebSocket 客户端 (单例 + 重连 + 心跳 + 消息路由)
- [x] Zustand 状态管理 (auth + ui + workspace)
- [x] 认证流程 (login/register → token 存储 → 路由守卫)
- [x] Zod 验证 Schema (6 个) + 类型导出
- [x] 完整路由结构 (auth / dashboard / status 三个 Route Group)
- [x] 布局 Shell (Sidebar + Header + WorkspaceSwitcher + CommandPalette)
- [x] 7 个 Dashboard 页面 + 2 个 Auth 页面 + 1 个 Status 页面
- [x] 公共组件 (EmptyState + LoadingSkeleton + ConfirmDialog)
- [x] 生产构建通过 (0 TypeScript error)

### 待后端接入

1. **环境变量**: 将 `NEXT_PUBLIC_API_URL` 和 `NEXT_PUBLIC_WS_URL` 指向实际后端
2. **Overview 页**: 替换 4 个统计卡片为真实数据 (`useQuery` + WebSocket 实时更新)
3. **Servers 页**: 从 mock 空数组改为 `api.get("/servers")`
4. **Server Detail 页**: 接入 WebSocket `metrics:push` 实时图表数据
5. **Monitors/Alerts/Tasks 页**: 对接实际 CRUD API
6. **Settings 页**: 对接 workspace API
7. **Status 页**: 对接公开状态页 API
8. **Landing 页**: 替换 `app/page.tsx` 的 Next.js 默认模板
9. **Profile 功能**: 实现用户下拉菜单中的 Profile 选项
10. **OAuth**: 登录页中 GitHub 按钮去掉 `disabled`

### API 端点对应关系

| 前端页面 | 所需 API |
|----------|---------|
| Overview | `GET /api/v1/workspaces/:wid/dashboard` (TBD) |
| Servers 列表 | `GET /api/v1/workspaces/:wid/servers` |
| Server 详情 | `GET /api/v1/workspaces/:wid/servers/:id`, `GET .../:id/metrics` |
| Monitors | `GET/POST/PATCH/DELETE /api/v1/workspaces/:wid/monitors` |
| Alerts | `GET/POST/PATCH/DELETE /api/v1/workspaces/:wid/alerts` |
| Tasks | `GET/POST/DELETE /api/v1/workspaces/:wid/cronjobs` |
| Settings | `GET/PATCH /api/v1/workspaces/:wid` |
| Status 页 | `GET /api/v1/public/status/:slug` |
| 实时指标 | WebSocket `metrics:push` |
| 告警通知 | WebSocket `alert:triggered` |
| 登录 | `POST /api/v1/auth/login` |
| 注册 | `POST /api/v1/auth/register` |

---

## 附录 A — 文件清单

```
55 source files:
  app/                   13 files ( layouts + pages )
  components/ui/         16 files ( shadcn base components )
  components/layout/      4 files ( sidebar, header, workspace-switcher, command-palette )
  components/servers/     2 files ( server-status-badge, metric-chart )
  components/shared/      3 files ( empty-state, loading-skeleton, confirm-dialog )
  hooks/                  1 file  ( use-websocket )
  lib/                    6 files ( api-client, ws-client, auth, constants, utils, validators )
  stores/                 3 files ( auth, ui, workspace )
  providers/              3 files ( theme, query, auth )
```

---

## 附录 B — 踩坑记录

1. **`asChild` 不存在** — shadcn/ui v4 使用 `@base-ui/react` 替代 Radix UI。所有 `asChild` 属性均不支持。解决方案: 去掉中间 `<Button>` 包装，将样式直接放在 Trigger 上；或用 `buttonVariants()` + `<Link>`。

2. **`delayDuration` → `delay`** — `TooltipProvider` 的 delay 属性名已变更。

3. **Tailwind v4 + OKLCH** — Tailwind v4 采用 OKLCH 色彩空间，旧的 `hsl()` 变量写法会被自动转换。自定义颜色需使用 `oklch()` 格式。

4. **Turbopack** — Next.js 16 默认启用，开发启动几乎瞬时。但某些 webpack 特定配置不再适用。

---

> **文档版本**: v1.0  
> **最后更新**: 2026-05-24
