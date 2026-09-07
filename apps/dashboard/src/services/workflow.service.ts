import { and, desc, eq } from "drizzle-orm";
import { workflows } from "../db/schema/workflows";
import { AppError } from "../utils/errors";
import { executeShellCommand } from "./tools.service";
import { DIAGNOSIS_TOOLS } from "./diagnosis.service";
import { MCP_TOOLS, callTool as callMCPTool } from "../routes/mcp";
import type { DbClient } from "../db/index";

// Types

export interface WorkflowStep {
  id: string;
  kind: "builtin" | "shell" | "mcp";
  tool: string;
  name?: string;
  args?: Record<string, unknown>;
}

export type WorkflowRow = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  trigger: string | null;
  steps: WorkflowStep[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export interface WorkflowRunStep {
  id: string;
  kind: WorkflowStep["kind"];
  tool: string;
  name: string;
  status: "running" | "done" | "error";
  output?: string;
  exitCode?: number;
  startedAt: number;
  finishedAt?: number;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  workspaceId: string;
  serverId: string;
  status: "running" | "done" | "failed";
  steps: WorkflowRunStep[];
  text: string;
  error?: string;
  createdAt: number;
}

export interface WorkflowInput {
  name: string;
  description?: string | null;
  trigger?: string | null;
  steps: WorkflowStep[];
  enabled: boolean;
}

// CRUD

export async function listWorkflows(workspaceId: string, db: DbClient) {
  return db
    .select()
    .from(workflows)
    .where(eq(workflows.workspaceId, workspaceId))
    .orderBy(desc(workflows.createdAt));
}

export async function getWorkflow(workspaceId: string, workflowId: string, db: DbClient): Promise<WorkflowRow> {
  const [row] = await db
    .select()
    .from(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.workspaceId, workspaceId)))
    .limit(1);
  if (!row) throw AppError.notFound("Workflow", workflowId);
  return { ...row, steps: (Array.isArray(row.steps) ? row.steps : []) as WorkflowStep[] };
}

export async function createWorkflow(workspaceId: string, input: WorkflowInput, db: DbClient) {
  const [row] = await db
    .insert(workflows)
    .values({ workspaceId, ...input })
    .returning();
  return row;
}

export async function updateWorkflow(workspaceId: string, workflowId: string, input: WorkflowInput, db: DbClient) {
  const [row] = await db
    .update(workflows)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(workflows.id, workflowId), eq(workflows.workspaceId, workspaceId)))
    .returning();
  if (!row) throw AppError.notFound("Workflow", workflowId);
  return row;
}

export async function deleteWorkflow(workspaceId: string, workflowId: string, db: DbClient) {
  const [row] = await db
    .delete(workflows)
    .where(and(eq(workflows.id, workflowId), eq(workflows.workspaceId, workspaceId)))
    .returning({ id: workflows.id });
  if (!row) throw AppError.notFound("Workflow", workflowId);
  return row;
}

// Tool catalog exposed to the workflow builder

export function workflowToolCatalog() {
  return {
    builtin: Object.entries(DIAGNOSIS_TOOLS).map(([id, t]) => ({ id, name: id, desc: t.desc })),
    mcp: MCP_TOOLS.map((t) => ({ id: t.name, name: t.name, desc: t.description, inputSchema: t.inputSchema })),
  };
}

// Execution

async function execStep(wid: string, sid: string, step: WorkflowStep, db: DbClient): Promise<{ output: string; exitCode?: number }> {
  if (step.kind === "shell") {
    const command = String(step.args?.command ?? "");
    if (!command.trim()) throw new Error("Shell step missing command");
    const res = await executeShellCommand(wid, sid, { command, timeout: 30 }, db);
    return { output: (res.stdout || res.stderr || "(空输出)").slice(0, 4000), exitCode: res.exit_code };
  }
  if (step.kind === "mcp") {
    const args = { ...(step.args ?? {}), server_id: sid };
    const data = await callMCPTool(step.tool, args, wid, db);
    return { output: JSON.stringify(data, null, 2).slice(0, 6000) };
  }
  const tool = DIAGNOSIS_TOOLS[step.tool];
  if (!tool) throw new Error(`未知内置工具: ${step.tool}`);
  const command = tool.build(step.args ?? {});
  if (!command) throw new Error(`内置工具参数不完整: ${step.tool}`);
  const res = await executeShellCommand(wid, sid, { command, timeout: 30 }, db);
  return { output: (res.stdout || res.stderr || "(空输出)").slice(0, 4000), exitCode: res.exit_code };
}

export async function executeWorkflowSteps(
  wid: string,
  sid: string,
  wf: WorkflowRow,
  onStep: (s: WorkflowRunStep) => void,
  db: DbClient,
): Promise<string> {
  const steps = Array.isArray(wf.steps) ? wf.steps : [];
  for (const st of steps) {
    const runStep: WorkflowRunStep = {
      id: st.id, kind: st.kind, tool: st.tool, name: st.name || st.tool,
      status: "running", startedAt: Date.now(),
    };
    onStep({ ...runStep });
    try {
      const r = await execStep(wid, sid, st, db);
      onStep({ ...runStep, status: "done", output: r.output, exitCode: r.exitCode, finishedAt: Date.now() });
    } catch (err) {
      const msg = String((err as Error).message);
      onStep({ ...runStep, status: "error", output: msg, finishedAt: Date.now() });
      throw new Error(`工作流「${wf.name}」执行中断：第${runStep.name}步执行失败：${msg}`);
    }
  }
  return `工作流「${wf.name}」执行完成 ✅ 共 ${steps.length} 步，结果见上方工具卡片。`;
}

// In-memory run store (polled by the frontend)

const runs = new Map<string, WorkflowRun>();
const RUN_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, r] of runs) {
    if (now - r.createdAt > RUN_TTL_MS) runs.delete(id);
  }
}, 5 * 60 * 1000).unref?.();

export async function startWorkflowRun(
  wid: string,
  sid: string,
  workflowId: string,
  db: DbClient,
): Promise<{ runId: string }> {
  const wf = await getWorkflow(wid, workflowId, db);
  const run: WorkflowRun = {
    id: crypto.randomUUID(),
    workflowId,
    workflowName: wf.name,
    workspaceId: wid,
    serverId: sid,
    status: "running",
    steps: [],
    text: "",
    createdAt: Date.now(),
  };
  runs.set(run.id, run);
  void (async () => {
    try {
      run.text = await executeWorkflowSteps(wid, sid, wf, (s) => {
        const i = run.steps.findIndex((x) => x.id === s.id);
        if (i >= 0) run.steps[i] = s;
        else run.steps.push(s);
      }, db);
      run.status = "done";
    } catch (err) {
      run.status = "failed";
      run.error = String((err as Error).message);
      run.text = `工作流执行失败：${run.error}`;
    }
  })();
  return { runId: run.id };
}

export function getWorkflowRun(runId: string, wid: string): WorkflowRun | null {
  const r = runs.get(runId);
  if (!r || r.workspaceId !== wid) return null;
  return r;
}
