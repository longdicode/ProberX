// 12 个「专项诊断助手」：复用自主排查引擎（白名单只读工具 + LLM 规划），
// 通过不同的专项提示词与工具子集实现聚焦诊断；同时支持点选入口与对话自动路由。
export interface ExpertAgentDef {
  id: ExpertAgentId;
  name: string;
  desc: string;
  icon: string;
  color: string;
  sample: string;
  focus: string;
  tools: string[];
  routes: string[];
  domainRules: string[];
}

export const EXPERT_AGENT_IDS = [
  "website-diag",
  "mysql-diag",
  "traffic-diag",
  "security-diag",
  "server-diag",
  "cron-diag",
  "file-diag",
  "ftp-diag",
  "ssl-diag",
  "log-diag",
  "dns-diag",
  "perf-diag",
] as const;

export type ExpertAgentId = (typeof EXPERT_AGENT_IDS)[number];

export const EXPERT_AGENTS: ExpertAgentDef[] = [
  {
    id: "website-diag",
    name: "网站诊断助手",
    desc: "分析网站配置、站点设置、运行状态，提供全面的诊断报告",
    icon: "Globe",
    color: "#f97316",
    sample: "帮我全面诊断一下这台服务器上的网站运行状态与配置",
    focus: "聚焦 Web 站点配置与运行链路：Nginx/Apache/Caddy、宝塔站点、容器反向代理、监听端口、证书与本机/公网访问。",
    tools: ["network", "web_stack", "http_check", "cert_check", "ssl_config", "access_traffic", "error_logs", "logs", "services", "docker", "processes", "cat_file", "files", "os_info"],
    routes: [
      "(网站|站点|虚拟主机|域名|首页|页面).{0,14}(打不开|访问不了|无法访问|502|503|504|500|异常|报错|故障|排查|慢|卡|拒绝|超时|为什么)",
      "(打不开|无法访问|访问不了|504|502|503|500|异常|报错).{0,10}(网站|站点|域名|https?://)",
      "(网站|站点|域名).{0,12}(配置|运行状态|诊断|分析|检查|排查|正常吗|是否正常|怎么回事|什么情况)",
      "[a-z0-9][a-z0-9.-]+\\.[a-z]{2,}.{0,8}(打不开|无法访问|访问不了|异常|报错|排查|诊断|是否正常|正常运行|状态)",
      "(分析|看看|查看).{0,10}(网站|站点).{0,12}(类型|技术|框架|搭建|配置|状态|问题)",
    ],
    domainRules: [
      "1. 先用 web_stack 确认真实运行的 Web 进程与 80/443/8080/8888 监听，再决定下一步，禁止仅凭 systemd 状态断言 Web 服务未运行（宝塔 Nginx 常由 /www/server/nginx 启动）。",
      "2. 查看站点配置时兼容宝塔（/www/server/panel/vhost/nginx、/www/server/nginx/conf/vhost）与通用路径（/etc/nginx/sites-enabled、/etc/nginx/conf.d、/etc/httpd 等）。",
      "3. 涉及 HTTPS/证书时必须用 cert_check/ssl_config 做真实握手或 openssl 校验 subject/SAN/有效期；证书目录名与域名不一致只是命名差异，不能作为证书无效依据。",
      "4. 结论中的每个断言必须与已执行步骤输出一致；证据不足时写“待验证”，confidence 不超过 70。",
      "5. 若发现 443 正常监听但站点仍打不开，继续查证书握手、Nginx 实际加载的配置与反代上游（如 127.0.0.1:PORT），不要停在端口层面。",
    ],
  },
  {
    id: "mysql-diag",
    name: "数据库诊断助手",
    desc: "分析 MySQL 性能、慢查询、库表大小，给出优化建议",
    icon: "Database",
    color: "#06b6d4",
    sample: "帮我看看 MySQL 运行状态、慢查询和库表大小",
    focus: "专项诊断 MySQL/MariaDB：运行状态、连接数、慢查询配置与日志、库表大小与性能建议。",
    tools: ["network", "mysql", "processes", "services", "disk_usage", "memory", "logs", "cat_file", "files", "os_info"],
    routes: [
      "(mysql|mariadb|数据库|慢查询|库表|数据表|表空间|innodb|连接数|performance_schema|sql优化|sql 优化).{0,16}(状态|性能|慢|查询|连接|异常|报错|故障|卡|满|大小|占用|优化|排查|分析|失败|打不开|无法|启动|停止|重启|崩溃)",
      "(帮我|请|看看|查一下|分析|排查|检查|诊断).{0,6}(mysql|数据库|慢查询|库表大小|数据表)",
      "(数据库|mysql).{0,10}(连不上|连接失败|拒绝连接|访问不了|error|报错)",
    ],
    domainRules: [
      "1. 只允许使用 mysql 工具内的白名单只读 SQL（状态/连接/慢查询变量/库表大小），严禁任何写库、删库、DDL/DML SQL。",
      "2. mysql 工具会先尝试本机 socket 免密连接；连接被拒绝（需要密码）时如实记录“凭据不足”，并转向进程/3306 监听/数据目录/慢查询日志文件等无需凭据的证据。",
      "3. 慢查询分析优先读慢查询日志文件与 slow_query_log 配置；没有慢查询日志不代表没有性能问题。",
      "4. 库表大小以 information_schema 统计为准，单位为 MB/GB，结论注明是估算值。",
      "5. 结论必须与步骤输出一致；无法连接数据库时不要编造连接数/慢查询数据，区分“已确认”与“待验证”。",
    ],
  },
  {
    id: "traffic-diag",
    name: "网站流量分析助手",
    desc: "分析网站流量趋势、来源和带宽使用情况",
    icon: "Activity",
    color: "#14b8a6",
    sample: "分析一下网站最近的访问流量与来源分布",
    focus: "基于 access 访问日志与带宽指标分析站点流量：请求量、独立 IP、状态码分布、TOP 路径/来源与近期趋势。",
    tools: ["network", "access_traffic", "error_logs", "logs", "processes", "services", "docker", "cat_file", "files", "os_info"],
    routes: [
      "(流量|访问量|访问统计|独立访客|uv|pv|带宽|点击量|访问来源|来源分布).{0,14}(分析|查看|统计|趋势|排行|top|怎么样|报告|异常|大|高|小|低)",
      "(分析|查看|统计|监控).{0,10}(流量|访问|带宽|uv|pv)",
      "(流量|带宽).{0,12}(异常|暴涨|暴跌|打满|跑满|超了|不够|监控)",
    ],
    domainRules: [
      "1. 流量/访问统计全部来自 access_traffic 对访问日志的静态聚合；先说明日志覆盖的时间范围与站点，再给数字。",
      "2. 日志按天轮转，跨天分析时注意日期范围；不要因为“今天日志为空”就断言网站停机。",
      "3. TOP IP/路径给前 5-10 条即可；异常流量需结合状态码分布（如 4xx/5xx 占比、CC 特征）给出判断。",
      "4. 只引用实际读到的日志数据；找不到日志时如实说明并建议确认 Nginx/BT 日志目录。",
    ],
  },
  {
    id: "security-diag",
    name: "安全诊断助手",
    desc: "分析服务器安全风险、异常进程和入侵迹象",
    icon: "ShieldAlert",
    color: "#ef4444",
    sample: "帮我做一次服务器安全风险检查",
    focus: "专项安全审计：登录记录与暴力破解迹象、fail2ban、异常进程/连接、可疑定时任务与后门风险。",
    tools: ["network", "auth_audit", "crontab", "processes", "services", "docker", "logs", "error_logs", "cat_file", "files", "os_info", "disk_usage"],
    routes: [
      "(安全|入侵|被黑|webshell|木马|后门|爆破|暴力破解|异常登录|可疑进程|风险扫描|安全检测|安全体检|fail2ban|端口扫描)",
      "(排查|检查|检测|扫描|分析).{0,10}(入侵|病毒|木马|后门|webshell|安全)",
      "(登录|ssh).{0,10}(异常|失败|爆破|被黑|风险)",
    ],
    domainRules: [
      "1. 全部为只读审计：last/lastb/fail2ban/进程与连接白名单统计/定时任务列举，禁止任何封禁、删除、写入操作。",
      "2. lastb 或 btmp 无记录不代表绝对安全，只能说“未发现该日志源的失败登录记录”；结论要区分已确认与证据不足。",
      "3. 发现可疑进程/脚本/定时任务时先取证（完整命令行、启动时间、父进程、文件路径与修改时间），再给人工处置建议，不自动删除。",
      "4. 对外监听的非常规端口要结合运行进程判断用途，不要一看到监听就判定为风险。",
    ],
  },
  {
    id: "server-diag",
    name: "服务器分析助手",
    desc: "分析服务器资源使用情况和健康状况",
    icon: "Server",
    color: "#8b5cf6",
    sample: "分析一下服务器当前的资源使用和健康状况",
    focus: "专项分析服务器整体资源与健康：CPU/内存/磁盘/负载/进程/系统日志，判断是否存在异常或隐患。",
    tools: ["network", "load", "memory", "disk_usage", "dir_usage", "processes", "services", "docker", "logs", "error_logs", "os_info"],
    routes: [
      "(服务器|本机|主机|机器).{0,10}(卡|很慢|变慢|死机|重启|异常|高|满|健康|状态|资源)",
      "(负载高|负载过高|cpu\\s*高|cpu\\s*100|内存不足|内存不够|内存占满|磁盘满|磁盘写满|swap|资源占用|占用率|io\\s*等待)",
      "(帮我|请).{0,6}(看看|检查|分析).{0,8}(服务器|资源|负载|cpu|内存|磁盘|系统状态)",
      "没有.?空间|空间不足|磁盘告警",
    ],
    domainRules: [
      "1. 综合多类证据下结论：负载要与 CPU 核数比较（如 load 高但核数多可能正常）、内存要看 buff/cache、磁盘要看使用率与 inode。",
      "2. 本工具看到的是当前或最近快照；涉及趋势时若无法回溯历史数据要如实说明。",
      "3. 定位高占用进程后给出针对性建议（重启服务、清理日志、扩容等），修复类操作需人工确认。",
      "4. 结论与步骤输出保持一致；避免把单次采样波动写成持续故障。",
    ],
  },
  {
    id: "cron-diag",
    name: "计划任务诊断助手",
    desc: "分析定时任务配置、执行状态和失败原因",
    icon: "CalendarClock",
    color: "#f59e0b",
    sample: "帮我看看这台服务器的定时任务有没有异常",
    focus: "专项诊断计划任务：crontab/宝塔计划任务/systemd timer 的配置、脚本路径与最近执行痕迹，定位任务不执行或失败原因。",
    tools: ["network", "crontab", "services", "processes", "logs", "cat_file", "files", "os_info", "docker"],
    routes: [
      "(定时任务|计划任务|cron|crond|自动任务|周期任务|脚本任务).{0,16}(没(跑|执行|生效)|不(跑|执行|生效)|失败|异常|报错|排查|诊断|查看|分析|状态|配置|原因)",
      "(任务|脚本).{0,8}(每天|每周|定时|凌晨|半夜).{0,10}(没|不|失败|异常|排查)",
      "(crontab|cron).{0,8}(列表|配置|查看|排查|异常|失败)",
      "(开机|启动).{0,8}(自启|自动启动).{0,10}(失败|没有|不|排查)",
    ],
    domainRules: [
      "1. 兼容系统 cron（crontab -l、/var/spool/cron/crontabs、/etc/cron.d、/etc/crontab）与宝塔（/www/server/cron 脚本目录、面板计划任务）。",
      "2. 判定任务是否执行成功时优先找脚本日志/系统日志痕迹；仅有配置没有执行记录时写“待验证”，不要猜测成功。",
      "3. 环境变量、脚本权限、路径不存在是常见失败原因，检查脚本可执行权限与首行解释器。",
      "4. 全部只读，不修改任何 crontab 配置。",
    ],
  },
  {
    id: "file-diag",
    name: "文件分析助手",
    desc: "分析服务器文件结构、权限、占用情况，提供文件管理建议",
    icon: "FolderSearch",
    color: "#10b981",
    sample: "分析一下服务器文件占用情况，帮我找出大文件",
    focus: "专项文件与目录分析：磁盘占用分布、大文件、目录结构与权限问题，给出清理与管理建议（只读）。",
    tools: ["network", "disk_usage", "dir_usage", "files", "cat_file", "logs", "os_info"],
    routes: [
      "(大文件|文件占用|哪个目录占|目录结构|文件权限|占空间|清理文件|磁盘空间|空间不够|空间不足|没空间|释放空间|找出大)",
      "(看看|查找|分析|排查|清理).{0,10}(文件|目录|磁盘).{0,10}(占用|大小|大|满|结构|权限)",
    ],
    domainRules: [
      "1. du/find 均为只读统计，注意命令覆盖范围与耗时；大目录只列 top N，不展开全盘。",
      "2. 判定“可清理”必须谨慎：只建议清理明确安全的内容（如过期备份、日志轮转产物），并说明清理前应备份。",
      "3. 权限问题描述准确：区分属主/属组/other 权限与 ACL；不要仅凭 ls -l 判定文件被篡改。",
      "4. 删除类操作绝不自动执行，仅给建议。",
    ],
  },
  {
    id: "ftp-diag",
    name: "FTP 诊断助手",
    desc: "分析 FTP 账户权限、连接配置问题",
    icon: "UploadCloud",
    color: "#ec4899",
    sample: "帮我诊断一下 FTP 为什么连不上",
    focus: "专项诊断 FTP 服务：进程与 21 端口监听、pure-ftpd/vsftpd 配置、被动端口范围与账户列表，定位连接/上传失败。",
    tools: ["network", "ftp_check", "auth_audit", "services", "processes", "logs", "cat_file", "files", "os_info"],
    routes: [
      "(ftp|21端口|上传失败|无法上传|连接ftp|ftp账号|ftp账户|pure-ftpd|vsftpd|被动模式|ftp连不上)",
      "(上传|下载).{0,8}(失败|断开|超时|拒绝|连不上)",
      "ftp.{0,6}(排查|诊断|分析|状态|配置|异常|报错)",
    ],
    domainRules: [
      "1. 先确认 FTP 进程与 21 端口监听、监听地址是否包含公网；连接失败常与防火墙/安全组、被动端口范围有关。",
      "2. 配置检查优先读取实际运行服务的配置文件（pure-ftpd.conf、vsftpd.conf）；宝塔路径 /www/server/pure-ftpd/etc/pure-ftpd.conf 也要覆盖。",
      "3. 账户信息只读取 pure-pw list 级别内容，不尝试用任何账号登录、不读取密码文件。",
      "4. 结论区分服务端监听问题与客户端/网络问题；证据不足时标注待验证。",
    ],
  },
  {
    id: "ssl-diag",
    name: "SSL 诊断助手",
    desc: "分析 SSL 证书状态、有效期、配置问题",
    icon: "ShieldCheck",
    color: "#3b82f6",
    sample: "检查一下服务器上所有 SSL 证书的有效期与配置",
    focus: "专项诊断 SSL/TLS：证书文件解析（subject/SAN/有效期）、Nginx 证书配置、HTTPS 真实握手，定位过期/不匹配/配置错误。",
    tools: ["network", "ssl_config", "cert_check", "http_check", "web_stack", "services", "cat_file", "files", "os_info"],
    routes: [
      "(ssl|https证书|证书过期|证书无效|证书错误|证书即将到期|证书不匹配|证书配置|tls)",
      "(证书|https).{0,12}(有效期|到期|过期|校验|验证|报错|异常|排查|诊断|检查|状态|配置|分析)",
      "检查.{0,8}证书",
    ],
    domainRules: [
      "1. 证书信息以 openssl 实际解析的 subject/issuer/dates/SAN 为准；不要依据证书目录名或文件名判断。",
      "2. “域名与证书不匹配”的判定标准是 SAN/CN 不含该域名；到期时间以 openssl 输出日期为准并换算剩余天数。",
      "3. 涉及站点 HTTPS 异常时用 cert_check 做真实（不带 -k）握手验证，并查看 Nginx 实际加载的证书路径（ssl_certificate/ssl_certificate_key）。",
      "4. 密钥文件不打印内容，只确认存在性与基本权限。",
    ],
  },
  {
    id: "log-diag",
    name: "日志分析助手",
    desc: "分析系统和应用日志中的错误和异常",
    icon: "ScrollText",
    color: "#6366f1",
    sample: "分析一下这台服务器最近的错误日志",
    focus: "专项日志分析：journald 错误、Nginx/宝塔/系统 error 日志中的错误与异常，按时间窗汇总并定位来源。",
    tools: ["network", "error_logs", "logs", "access_traffic", "services", "processes", "docker", "cat_file", "files", "os_info"],
    routes: [
      "(错误日志|异常日志|error log|error_log|报错日志|日志排查|日志分析|查看日志|查日志|日志里|系统日志)",
      "(分析|查看|排查|找|查).{0,8}(日志|log).{0,8}(错误|异常|报错|失败|error)",
      "(nginx|php|mysql|应用).{0,6}(错误|报错).{0,6}(日志|log)",
    ],
    domainRules: [
      "1. 日志来源优先 journald（journalctl -p err）与常见 error 日志文件；不同发行版/宝塔路径不同，找不到就换路径继续。",
      "2. 报告错误时要给出：时间、来源（服务/文件）、错误文本摘要、发生频率，便于定位。",
      "3. “某日志文件为空”只能说明该文件该时段无记录，不能反向排除问题；结合时间窗与错误类别说明。",
      "4. 日志中的敏感信息（密码、token）做脱敏展示。",
    ],
  },
  {
    id: "dns-diag",
    name: "DNS 诊断助手",
    desc: "分析域名 DNS 解析记录和生效状态",
    icon: "Network",
    color: "#0ea5e9",
    sample: "帮我检查一下域名 DNS 解析是否正常生效",
    focus: "专项诊断 DNS：本机解析、公共 DNS 对照、NS/记录类型与 hosts/resolv.conf 干扰，判断解析是否生效与异常。",
    tools: ["network", "dns_check", "http_check", "web_stack", "cert_check", "services", "cat_file", "files", "os_info"],
    routes: [
      "(dns|域名解析|解析记录|ns记录|解析不到|解析异常|解析不生效|解析失效|解析慢|解析错)",
      "(解析|dns).{0,12}(不生效|没生效|异常|失败|错误|不到|不了|排查|诊断|检查|分析|状态|记录)",
      "(域名|网址).{0,8}(解析).{0,12}(问题|失败|异常|不|没)",
    ],
    domainRules: [
      "1. 用 dns_check 对照本机 getent/dig 与公共 DNS（1.1.1.1、8.8.8.8）的解析结果；差异时说明可能是缓存/传播延迟。",
      "2. 检查 /etc/hosts 与 /etc/resolv.conf 是否干扰解析，结论要指明是本机解析问题还是权威 DNS 配置问题。",
      "3. 涉及网站访问异常时结合 web_stack/http_check/cert_check 区分 DNS 问题与其他链路问题。",
      "4. 只读查询，不修改任何 DNS 记录或 hosts 文件。",
    ],
  },
  {
    id: "perf-diag",
    name: "性能分析助手",
    desc: "分析 CPU、内存、磁盘使用趋势和瓶颈",
    icon: "Gauge",
    color: "#a855f7",
    sample: "分析一下服务器当前的性能瓶颈",
    focus: "专项性能分析：CPU/内存/磁盘/IO/负载多维度取证，定位瓶颈进程与优化方向（只读）。",
    tools: ["network", "load", "memory", "disk_usage", "dir_usage", "processes", "services", "docker", "error_logs", "logs", "os_info"],
    routes: [
      "(性能瓶颈|性能分析|性能优化|卡顿|高负载|cpu\\s*100|cpu\\s*满载|内存占满|磁盘io|io\\s*等待|磁盘读写|优化建议|性能排查)",
      "(为什么|怎么).{0,8}(这么慢|这么卡|卡顿|慢)",
      "(分析|定位).{0,8}(性能|瓶颈|cpu|内存|磁盘io)",
    ],
    domainRules: [
      "1. 结论必须建立在多维证据上：负载、CPU 各进程占用、内存、磁盘 IO/空间；避免只看单一指标。",
      "2. 高负载要结合核数判断（nproc），CPU 高要定位到具体进程并观察是否异常（如单进程占满、僵尸进程等）。",
      "3. 磁盘性能用 iostat/vmstat 数据，若工具不可用则明确说明缺少该维度证据。",
      "4. 优化建议给出可执行步骤与预期效果；涉及配置修改/重启前标注需要人工确认。",
    ],
  },
];

export const EXPERT_BY_ID: Record<ExpertAgentId, ExpertAgentDef> = Object.fromEntries(
  EXPERT_AGENTS.map((e) => [e.id, e])
) as Record<ExpertAgentId, ExpertAgentDef>;

export function isExpertAgent(id: string | undefined | null): id is ExpertAgentId {
  return !!id && id in EXPERT_BY_ID;
}

export function expertDef(id: string | undefined | null): ExpertAgentDef | null {
  if (!id || !isExpertAgent(id)) return null;
  return EXPERT_BY_ID[id];
}

// 自动路由优先级：越具体越靠前（dns/ssl/ftp/mysql/cron/security/traffic/website/log/file/perf/server）
export const EXPERT_ROUTE_PRIORITY: ExpertAgentId[] = [
  "dns-diag",
  "ssl-diag",
  "ftp-diag",
  "mysql-diag",
  "cron-diag",
  "security-diag",
  "traffic-diag",
  "website-diag",
  "log-diag",
  "file-diag",
  "perf-diag",
  "server-diag",
];

const EXPERT_ROUTERS = EXPERT_ROUTE_PRIORITY.map((id) => ({
  id,
  re: new RegExp(EXPERT_BY_ID[id].routes.join("|"), "i"),
}));

/** 对话自动路由：命中任一专项关键词即返回对应专家助手 id */
export function routeExpert(message: string): ExpertAgentId | null {
  const m = (message ?? "").trim();
  if (!m) return null;
  for (const r of EXPERT_ROUTERS) {
    if (!r.re.test(m)) continue;
    // 排除会与「AI 巡检」等既有能力冲突的健康体检类语义（如"检查服务器健康状况"仍走 AI 巡检）
    if ((r.id === "server-diag" || r.id === "perf-diag") && /巡检|体检|健康检查|健康评分|健康报告|健康状态/.test(m)) continue;
    return r.id;
  }
  return null;
}

/** 供 GET /agents 目录与前端展示的元数据（不含内部路由/规则） */
export const EXPERT_CATALOG = EXPERT_AGENTS.map((e) => ({
  id: e.id,
  name: e.name,
  desc: e.desc,
  icon: e.icon,
  color: e.color,
  kind: "expert" as const,
}));

