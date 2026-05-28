import { describe, it, expect } from "vitest";
import {
  loginSchema,
  registerSchema,
  serverSchema,
  monitorSchema,
  alertRuleSchema,
  cronJobSchema,
} from "../validators";

describe("loginSchema", () => {
  it("accepts valid input", () => {
    const r = loginSchema.safeParse({ email: "a@b.com", password: "abcdef" });
    expect(r.success).toBe(true);
  });

  it("rejects missing email", () => {
    const r = loginSchema.safeParse({ password: "abcdef" });
    expect(r.success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("accepts valid input", () => {
    const r = registerSchema.safeParse({
      name: "Alice",
      email: "a@b.com",
      password: "abcdefgh",
      confirmPassword: "abcdefgh",
    });
    expect(r.success).toBe(true);
  });

  it("rejects short password", () => {
    const r = registerSchema.safeParse({
      name: "Alice",
      email: "a@b.com",
      password: "123",
      confirmPassword: "123",
    });
    expect(r.success).toBe(false);
  });

  it("rejects mismatched confirmPassword", () => {
    const r = registerSchema.safeParse({
      name: "Alice",
      email: "a@b.com",
      password: "abcdefgh",
      confirmPassword: "different",
    });
    expect(r.success).toBe(false);
  });
});

describe("serverSchema", () => {
  it("accepts valid input", () => {
    const r = serverSchema.safeParse({ name: "prod-1", tags: ["web"] });
    expect(r.success).toBe(true);
  });

  it("rejects missing name", () => {
    const r = serverSchema.safeParse({});
    expect(r.success).toBe(false);
  });
});

describe("monitorSchema", () => {
  it("accepts valid input", () => {
    const r = monitorSchema.safeParse({
      name: "My Monitor",
      type: "http",
      target: "https://example.com",
      intervalSec: 30,
      timeoutMs: 5000,
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid type", () => {
    const r = monitorSchema.safeParse({
      name: "M",
      type: "invalid",
      target: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects interval below min", () => {
    const r = monitorSchema.safeParse({
      name: "M",
      type: "http",
      target: "x",
      intervalSec: 5,
    });
    expect(r.success).toBe(false);
  });
});

describe("alertRuleSchema", () => {
  it("accepts valid input", () => {
    const r = alertRuleSchema.safeParse({
      name: "High CPU",
      targetType: "server",
      targetId: "550e8400-e29b-41d4-a716-446655440000",
      metric: "cpu",
      operator: "gt",
      threshold: 90,
      severity: "critical",
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid operator", () => {
    const r = alertRuleSchema.safeParse({
      name: "X",
      targetType: "server",
      targetId: "550e8400-e29b-41d4-a716-446655440000",
      metric: "cpu",
      operator: "bad",
      threshold: 90,
      severity: "critical",
    });
    expect(r.success).toBe(false);
  });
});

describe("cronJobSchema", () => {
  it("rejects empty targetServers array", () => {
    const r = cronJobSchema.safeParse({
      name: "Backup",
      cronExpr: "0 2 * * *",
      command: "/usr/bin/backup.sh",
      targetServers: [],
    });
    expect(r.success).toBe(false);
  });
});
