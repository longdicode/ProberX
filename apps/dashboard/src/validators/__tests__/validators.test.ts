import { describe, it, expect } from "vitest";
import {
  loginBody, registerBody,
  createWorkspaceBody,
  createServerBody,
  createMonitorBody,
  createCronJobBody,
  createAlertBody,
  createChannelBody,
  agentRegisterBody, agentHeartbeatBody, agentMetricsBody,
} from "../index";

describe("Auth validators", () => {
  it("rejects login without email", () => {
    const r = loginBody.safeParse({ password: "test123" });
    expect(r.success).toBe(false);
  });

  it("rejects weak password", () => {
    const r = registerBody.safeParse({ name: "Test", email: "a@b.com", password: "12" });
    expect(r.success).toBe(false);
  });

  it("accepts valid register", () => {
    const r = registerBody.safeParse({ name: "Test", email: "a@b.com", password: "Test1234!" });
    expect(r.success).toBe(true);
  });
});

describe("Workspace validators", () => {
  it("accepts valid workspace", () => {
    const r = createWorkspaceBody.safeParse({ name: "My Workspace" });
    expect(r.success).toBe(true);
  });
});

describe("Server validators", () => {
  it("accepts valid server", () => {
    const r = createServerBody.safeParse({ name: "web-01", agentId: "agent-abc123" });
    expect(r.success).toBe(true);
  });
});

describe("Monitor validators", () => {
  it("accepts valid http monitor", () => {
    const r = createMonitorBody.safeParse({
      name: "HTTP Check", type: "http", target: "https://example.com",
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid monitor type", () => {
    const r = createMonitorBody.safeParse({
      name: "Bad", type: "invalid", target: "x",
    });
    expect(r.success).toBe(false);
  });
});

describe("Alert validators", () => {
  it("rejects string threshold", () => {
    const r = createAlertBody.safeParse({
      name: "CPU Alert", targetType: "server", metric: "cpu", operator: "gt",
      threshold: "5000", severity: "warning",
    });
    expect(r.success).toBe(false);
  });

  it("accepts number threshold", () => {
    const r = createAlertBody.safeParse({
      name: "CPU Alert", targetType: "server", metric: "cpu", operator: "gt",
      threshold: 5000, severity: "warning",
    });
    expect(r.success).toBe(true);
  });
});

describe("CronJob validators", () => {
  it("accepts valid cron job", () => {
    const r = createCronJobBody.safeParse({
      name: "Daily", cronExpr: "0 9 * * *", command: "health",
      targetServers: ["333740a5-11e5-40af-8db2-51bcf2b791da"],
    });
    expect(r.success).toBe(true);
  });
});

describe("Notification validators", () => {
  it("accepts webhook channel", () => {
    const r = createChannelBody.safeParse({
      name: "Slack", type: "webhook", config: { url: "https://hooks.slack.com/test" },
    });
    expect(r.success).toBe(true);
  });
});

describe("Agent validators", () => {
  it("accepts register with hostInfo", () => {
    const r = agentRegisterBody.safeParse({
      agentId: "agent-test", hostInfo: { hostname: "srv1", os: "linux" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts heartbeat", () => {
    const r = agentHeartbeatBody.safeParse({ agentId: "agent-test", timestamp: Date.now() });
    expect(r.success).toBe(true);
  });

  it("accepts metrics push with snake_case fields", () => {
    const r = agentMetricsBody.safeParse({
      agentId: "agent-test", timestamp: Date.now(),
      cpu_percent: 45.2, mem_total: 16_000_000_000, mem_used: 8_000_000_000,
    });
    expect(r.success).toBe(true);
  });
});
