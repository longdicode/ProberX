import { describe, it, expect } from "vitest";
import { DIAGNOSIS_TOOLS } from "../diagnosis.service";

describe("docker diagnosis tool", () => {
  it("exposes container port mappings", () => {
    const cmd = DIAGNOSIS_TOOLS.docker.build({ sub: "ps" }) as string;
    // Without PORTS the planner cannot tie a container to the port it serves
    // and re-runs the same listing instead of moving on.
    expect(cmd).toContain("{{.Ports}}");
    expect(cmd).toContain("{{.Names}}");
    expect(cmd).toContain("{{.Status}}");
  });

  it("stays read-only", () => {
    const cmd = DIAGNOSIS_TOOLS.docker.build({ sub: "ps" }) as string;
    expect(cmd.startsWith("docker ps -a")).toBe(true);
    expect(cmd).not.toMatch(/\b(start|stop|rm|restart|update|kill|exec)\b/);
  });

  it("refuses to read logs without a container name", () => {
    expect(DIAGNOSIS_TOOLS.docker.build({ sub: "logs" })).toBeNull();
  });
});
