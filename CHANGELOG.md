# Changelog

## v1.0 (2026-06-21)

### 新增功能
- **可视化 Cron 任务管理器** — 预设+自定义表达式编辑器、人类可读预览、Server 多选、编辑/启用禁用
- **S3 云备份** — 支持 AWS S3 / 阿里云 OSS / Cloudflare R2 / MinIO，一键上传下载
- **云备份 2.0** — Auto Upload 自动同步、Sync All 全量同步、Retention Days 保留策略
- **DNS 管理** — Cloudflare / DNSPod / GoDaddy / Vercel / DigitalOcean 五合一 Zone/Record CRUD
- **Docker 镜像管理** — List / Pull / Delete / Inspect / Prune
- **官网 + 在线文档** — 产品首页 + `/docs` 使用指南，中英文支持，移动端适配
- **GitHub Release** — v1.0 版本发布，Agent Linux amd64 二进制附件

### 代码优化
- **巨型组件拆分** — `tools/[tool]/page.tsx` 1775行 → 65行路由 + 11 个独立组件
- **Agent main.go 拆分** — 1148行 → 137行入口 + handlers/loops 分离
- **agentFetch 工厂函数** — `tools.service.ts` 消除 42 个重复函数 (-59%)
- **路由工厂化** — `routes/tools.ts` getRoute/postRoute/delRoute 工厂
- **Agent 泛型 helper** — `DecodeBody[T]` / `WriteOK` / `WriteError`
- **前端大页面拆分** — settings/servers/overview 拆出 8 个子组件 + 2 个 hooks
- **API 限流** — `rate-limit.ts` 插件，100 req/min/IP，X-RateLimit-* headers
- **Poller 优化** — 跳过 offline > 5min 的服务器，避免无意义拉取
- **全局错误 toast** — 429/5xx 自动提示，支持 noToast 抑制

### Bug 修复
- **Agent Token 认证** — 所有 Dashboard 代理服务 (tools/fileops/docker) 添加 agentSecret 传递
- **Agent Token 明文存储** — `server.service.ts` 不再 hash agentSecret，Dashboard 需要原文认证
- **CORS 生产环境** — `origin: true` 移除 credentials 冲突，全环境启用
- **Dashboard 模块解析** — 删除 `"type": "module"`，tsconfig 改为 CommonJS
- **外键约束删除** — `cron_executions` / `alert_events` 添加 CASCADE / SET NULL
- **登录重定向** — 登录后返回原始页面，不再始终跳转 `/overview`

### 文档
- **README 全面更新** — 14 工具、80+ 端点完整列表、架构图、对比表
- **CHANGELOG.md** — 本更新日志
- **修复 GitHub 地址** — 全部替换为 `longdicode/ProberX`
