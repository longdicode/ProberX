/**
 * 面板接入层的统一数据模型。
 * 所有面板适配器（BT / aaPanel / 未来的 1Panel 等）都必须输出该结构，
 * 上层（路由 / UI / 后续智能体工具）只依赖这里的 ProberX 自有模型，不感知具体面板协议。
 */

export type PanelAdapterKind = "bt" | "aapanel";

export interface PanelConnectionConfig {
  adapter: PanelAdapterKind;
  /** 面板入口地址，如 http://1.2.3.4:8888 */
  panelUrl: string;
  /** 面板开放 API 密钥 */
  apiKey: string;
}

/** 服务器系统概况（归一化自面板数据） */
export interface PanelSystemStats {
  os: string;
  panelVersion: string;
  hostname: string;
  cpuPercent: number | null;
  memTotalBytes: number | null;
  memUsedBytes: number | null;
  diskTotalBytes: number | null;
  reportedAt: string;
}

/** 站点概况（归一化） */
export interface PanelSite {
  id: string;
  name: string;
  rootPath: string;
  enabled: boolean;
}

export interface PanelSitesData {
  total: number;
  list: PanelSite[];
}

/** 证书概况（归一化） */
export interface PanelCertificate {
  id: string;
  domains: string[];
  issuer: string;
  expiresAt: string | null;
  daysLeft: number | null;
}

export interface PanelCertsData {
  total: number;
  expired: number;
  expiringSoon: number;
  list: PanelCertificate[];
}

/** 数据库概况（归一化） */
export interface PanelDatabase {
  name: string;
  engine: string;
  sizeBytes: number | null;
}

export interface PanelDatabasesData {
  total: number;
  list: PanelDatabase[];
}

/** FTP 用户概况（归一化） */
export interface PanelFtpUser {
  username: string;
  homePath: string;
  enabled: boolean;
}

export interface PanelFtpUsersData {
  total: number;
  list: PanelFtpUser[];
}

/** 计划任务概况（归一化） */
export interface PanelCronTask {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
}

export interface PanelCronTasksData {
  total: number;
  running: number;
  list: PanelCronTask[];
}

/** 安全扫描概况（归一化） */
export interface PanelSecurityScan {
  state: "idle" | "scanning" | "done" | "unknown";
  progressPercent: number | null;
  score: number | null;
  riskCount: number | null;
}

/** 实时网络与负载（归一化） */
export interface PanelNetworkStats {
  upRateKbps: number | null;
  downRateKbps: number | null;
  upTotalMb: number | null;
  downTotalMb: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
}

/** 系统服务概况（归一化，来自 systemd 等原生数据源） */
export interface PanelService {
  name: string;
  description: string;
  active: boolean;
  failed: boolean;
}

export interface PanelServicesData {
  total: number;
  running: number;
  failed: number;
  list: PanelService[];
}

/** 每个采集分组独立成功/失败，避免单个接口异常拖垮整份概览 */
export type PanelSectionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface PanelBindingOverview {
  system: PanelSectionResult<PanelSystemStats>;
  sites: PanelSectionResult<PanelSitesData>;
  certificates: PanelSectionResult<PanelCertsData>;
  databases: PanelSectionResult<PanelDatabasesData>;
  ftpUsers: PanelSectionResult<PanelFtpUsersData>;
  cronTasks: PanelSectionResult<PanelCronTasksData>;
  securityScan: PanelSectionResult<PanelSecurityScan>;
  network: PanelSectionResult<PanelNetworkStats>;
  checkedAt: string;
}

/**
 * 服务器资源总览（ProberX Agent 原生采集，不依赖任何控制面板）。
 * 上层 UI / 智能体只消费该归一化结构。
 */
export interface ServerResourceOverview {
  system: PanelSectionResult<PanelSystemStats>;
  sites: PanelSectionResult<PanelSitesData>;
  certificates: PanelSectionResult<PanelCertsData>;
  databases: PanelSectionResult<PanelDatabasesData>;
  cronTasks: PanelSectionResult<PanelCronTasksData>;
  services: PanelSectionResult<PanelServicesData>;
  securityScan: PanelSectionResult<PanelSecurityScan>;
  network: PanelSectionResult<PanelNetworkStats>;
  checkedAt: string;
}

/** 连接测试结果 */
export interface PanelTestResult {
  ok: boolean;
  latencyMs: number;
  panelVersion?: string;
  os?: string;
  error?: string;
}

export interface PanelAdapter {
  kind: PanelAdapterKind;
  label: string;
  testConnection(config: PanelConnectionConfig): Promise<PanelTestResult>;
  fetchOverview(config: PanelConnectionConfig): Promise<PanelBindingOverview>;
}
