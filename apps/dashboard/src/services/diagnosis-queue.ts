// In-process scheduler for autonomous diagnosis runs.
//
// A diagnosis is a long job (LLM planning + multiple read-only tool calls, up
// to 20 minutes). Running it inside the HTTP request kept the request open for
// the whole duration, so a reverse proxy could time out, and the per-server
// lock rejected a second request instead of letting it wait.
//
// This queue makes starts return immediately while still bounding the load:
//   DIAGNOSIS_MAX_CONCURRENCY   running jobs per dashboard process (default 3)
//   DIAGNOSIS_MAX_PER_SERVER    running jobs per server (default 1)
//
// Jobs are FIFO, but one saturated server does not block other servers.

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const MAX_GLOBAL = envInt("DIAGNOSIS_MAX_CONCURRENCY", 3);
export const MAX_PER_SERVER = envInt("DIAGNOSIS_MAX_PER_SERVER", 1);

export interface DiagnosisJobRef {
  runId: string;
  workspaceId: string;
  serverId: string;
}

export interface DiagnosisQueueItem {
  runId: string;
  serverId: string;
  workspaceId: string;
  enqueuedAt: number;
}

interface QueuedJob {
  ref: DiagnosisJobRef;
  run: (ref: DiagnosisJobRef) => Promise<unknown>;
  enqueuedAt: number;
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
}

const queue: QueuedJob[] = [];
const running = new Map<string, { serverId: string; workspaceId: string; startedAt: number }>();

function runningForServer(serverId: string): number {
  let count = 0;
  for (const job of running.values()) if (job.serverId === serverId) count += 1;
  return count;
}

/** 1-based position in the waiting queue, or 0 when the job is not waiting. */
export function queuePosition(runId: string): number {
  const idx = queue.findIndex((j) => j.ref.runId === runId);
  return idx < 0 ? 0 : idx + 1;
}

function drain(): void {
  for (;;) {
    if (running.size >= MAX_GLOBAL) return;
    // Pick the first job whose server still has a free slot so that a busy
    // server cannot hold up every other server.
    const idx = queue.findIndex((j) => runningForServer(j.ref.serverId) < MAX_PER_SERVER);
    if (idx < 0) return;
    const [job] = queue.splice(idx, 1);
    start(job);
  }
}

/** Releases the slot and promotes the next eligible job. */
function finish(runId: string): void {
  running.delete(runId);
  drain();
}

function start(job: QueuedJob): void {
  const { ref } = job;
  running.set(ref.runId, {
    serverId: ref.serverId,
    workspaceId: ref.workspaceId,
    startedAt: Date.now(),
  });
  // The slot is released *before* the caller's promise settles, so awaiting
  // `done` guarantees the server is free again and `snapshot()` is accurate.
  Promise.resolve()
    .then(() => job.run(ref))
    .then(
      (value) => {
        finish(ref.runId);
        job.resolve(value);
      },
      (err) => {
        finish(ref.runId);
        job.reject(err);
      }
    );
}

/**
 * Adds a job to the queue and returns its position plus a promise that settles
 * when the job finishes (or is cancelled while waiting).
 */
export function submit(
  ref: DiagnosisJobRef,
  run: (ref: DiagnosisJobRef) => Promise<unknown>
): { position: number; done: Promise<unknown> } {
  let resolve!: (value: unknown) => void;
  let reject!: (err: unknown) => void;
  const done = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const job: QueuedJob = { ref, run, enqueuedAt: Date.now(), resolve, reject };
  queue.push(job);
  // Drain before reading the position: a job that starts right away must
  // report position 0 (running) instead of 1 (waiting).
  drain();
  return { position: queuePosition(ref.runId), done };
}

/**
 * Removes a still-waiting job. Returns true when the job was cancelled here
 * (so the caller should also flip its run row to "stopped").
 */
export function cancelQueued(runId: string): boolean {
  const idx = queue.findIndex((j) => j.ref.runId === runId);
  if (idx < 0) return false;
  const [job] = queue.splice(idx, 1);
  job.resolve({ id: runId, status: "stopped" as const, cancelledWhileQueued: true });
  return true;
}

export function isQueued(runId: string): boolean {
  return queue.some((j) => j.ref.runId === runId);
}

export function isRunning(runId: string): boolean {
  return running.has(runId);
}

export interface DiagnosisQueueSnapshot {
  maxGlobal: number;
  maxPerServer: number;
  running: { runId: string; serverId: string; startedAt: number; elapsedMs: number }[];
  queued: DiagnosisQueueItem[];
}

export function snapshot(): DiagnosisQueueSnapshot {
  const now = Date.now();
  return {
    maxGlobal: MAX_GLOBAL,
    maxPerServer: MAX_PER_SERVER,
    running: [...running.entries()].map(([runId, info]) => ({
      runId,
      serverId: info.serverId,
      startedAt: info.startedAt,
      elapsedMs: now - info.startedAt,
    })),
    queued: queue.map((j) => ({
      runId: j.ref.runId,
      serverId: j.ref.serverId,
      workspaceId: j.ref.workspaceId,
      enqueuedAt: j.enqueuedAt,
    })),
  };
}

/** Test/maintenance helper: number of jobs waiting to start. */
export function queuedCount(): number {
  return queue.length;
}

/** Test/maintenance helper: number of jobs currently executing. */
export function runningCount(): number {
  return running.size;
}
