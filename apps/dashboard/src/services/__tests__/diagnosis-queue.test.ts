import { describe, it, expect, vi, afterEach } from "vitest";

type QueueModule = typeof import("../diagnosis-queue");

const ENV_GLOBAL = "DIAGNOSIS_MAX_CONCURRENCY";
const ENV_PER_SERVER = "DIAGNOSIS_MAX_PER_SERVER";

/** The queue reads its limits at import time, so reload it per test. */
async function loadQueue(limits: { global?: number; perServer?: number } = {}): Promise<QueueModule> {
  vi.resetModules();
  if (limits.global === undefined) delete process.env[ENV_GLOBAL];
  else process.env[ENV_GLOBAL] = String(limits.global);
  if (limits.perServer === undefined) delete process.env[ENV_PER_SERVER];
  else process.env[ENV_PER_SERVER] = String(limits.perServer);
  return import("../diagnosis-queue");
}

afterEach(() => {
  delete process.env[ENV_GLOBAL];
  delete process.env[ENV_PER_SERVER];
});

function ref(runId: string, serverId: string) {
  return { runId, serverId, workspaceId: "ws-1" };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Lets the queue's microtasks (job start, slot release) settle. */
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("diagnosis queue defaults", () => {
  it("allows 3 concurrent runs with 1 per server", async () => {
    const q = await loadQueue();
    expect(q.MAX_GLOBAL).toBe(3);
    expect(q.MAX_PER_SERVER).toBe(1);
  });

  it("ignores non-positive or malformed overrides", async () => {
    const q = await loadQueue({ global: 0, perServer: -2 });
    expect(q.MAX_GLOBAL).toBe(3);
    expect(q.MAX_PER_SERVER).toBe(1);
  });
});

describe("diagnosis queue scheduling", () => {
  it("starts the first job immediately and reports position 0", async () => {
    const q = await loadQueue({ global: 3, perServer: 1 });
    const gate = deferred();
    const startedAt: string[] = [];
    const a = q.submit(ref("r1", "s1"), async () => {
      startedAt.push("r1");
      await gate.promise;
    });

    expect(a.position).toBe(0);
    expect(q.isRunning("r1")).toBe(true);
    expect(q.isQueued("r1")).toBe(false);
    await tick();
    expect(startedAt).toEqual(["r1"]);

    gate.resolve();
    await a.done;
    expect(q.runningCount()).toBe(0);
  });

  it("queues a second job for a busy server and runs it afterwards", async () => {
    const q = await loadQueue({ global: 3, perServer: 1 });
    const gate = deferred();
    const order: string[] = [];

    const a = q.submit(ref("r1", "s1"), async () => {
      order.push("r1");
      await gate.promise;
      order.push("r1-end");
    });
    const b = q.submit(ref("r2", "s1"), async () => {
      order.push("r2");
    });

    expect(a.position).toBe(0);
    expect(b.position).toBe(1);
    expect(q.queuedCount()).toBe(1);
    await tick();
    expect(order).toEqual(["r1"]);

    gate.resolve();
    await a.done;
    await b.done;
    expect(order).toEqual(["r1", "r1-end", "r2"]);
    expect(q.runningCount()).toBe(0);
    expect(q.queuedCount()).toBe(0);
  });

  it("keeps FIFO order for the same server", async () => {
    const q = await loadQueue({ global: 3, perServer: 1 });
    const gate = deferred();
    const order: string[] = [];
    const a = q.submit(ref("r1", "s1"), async () => {
      await gate.promise;
    });
    const b = q.submit(ref("r2", "s1"), async () => {
      order.push("r2");
    });
    const c = q.submit(ref("r3", "s1"), async () => {
      order.push("r3");
    });

    expect(b.position).toBe(1);
    expect(c.position).toBe(2);
    expect(q.queuePosition("r3")).toBe(2);

    gate.resolve();
    await Promise.all([a.done, b.done, c.done]);
    expect(order).toEqual(["r2", "r3"]);
  });

  it("does not let a saturated server block another server", async () => {
    const q = await loadQueue({ global: 2, perServer: 1 });
    const gate = deferred();
    const a = q.submit(ref("r1", "s1"), () => gate.promise);
    const b = q.submit(ref("r2", "s1"), async () => undefined);
    const c = q.submit(ref("r3", "s2"), async () => undefined);

    // r3 is behind r2 in arrival order but s2 is free, so it jumps ahead.
    expect(q.isRunning("r3")).toBe(true);
    expect(q.isQueued("r2")).toBe(true);
    expect(q.queuedCount()).toBe(1);

    gate.resolve();
    await Promise.all([a.done, b.done, c.done]);
  });

  it("caps global concurrency and drains as slots free up", async () => {
    const q = await loadQueue({ global: 2, perServer: 1 });
    const gates = [deferred(), deferred(), deferred()];
    const jobs = [
      q.submit(ref("r1", "s1"), () => gates[0].promise),
      q.submit(ref("r2", "s2"), () => gates[1].promise),
      q.submit(ref("r3", "s3"), () => gates[2].promise),
    ];

    expect(q.runningCount()).toBe(2);
    expect(q.queuedCount()).toBe(1);
    expect(jobs[2].position).toBe(1);

    gates[0].resolve();
    await jobs[0].done;
    expect(q.isRunning("r3")).toBe(true);
    expect(q.queuedCount()).toBe(0);

    gates[1].resolve();
    gates[2].resolve();
    await Promise.all(jobs.map((j) => j.done));
    expect(q.runningCount()).toBe(0);
  });

  it("honours a per-server limit above 1", async () => {
    const q = await loadQueue({ global: 4, perServer: 2 });
    const gates = [deferred(), deferred()];
    const a = q.submit(ref("r1", "s1"), () => gates[0].promise);
    const b = q.submit(ref("r2", "s1"), () => gates[1].promise);
    const c = q.submit(ref("r3", "s1"), async () => undefined);

    expect(q.runningCount()).toBe(2);
    expect(c.position).toBe(1);
    gates[0].resolve();
    gates[1].resolve();
    await Promise.all([a.done, b.done, c.done]);
  });

  it("releases the slot before settling the caller's promise", async () => {
    const q = await loadQueue({ global: 3, perServer: 1 });
    const a = q.submit(ref("r1", "s1"), async () => "a");
    await a.done;
    expect(q.runningCount()).toBe(0);
    expect(q.snapshot().running).toHaveLength(0);

    const b = q.submit(ref("r2", "s1"), async () => "b");
    expect(b.position).toBe(0);
    await b.done;
  });

  it("frees the server slot when a job fails", async () => {
    const q = await loadQueue({ global: 3, perServer: 1 });
    const a = q.submit(ref("r1", "s1"), async () => {
      throw new Error("boom");
    });
    await expect(a.done).rejects.toThrow("boom");

    const b = q.submit(ref("r2", "s1"), async () => "ok");
    expect(b.position).toBe(0);
    await expect(b.done).resolves.toBe("ok");
  });
});

describe("diagnosis queue cancellation", () => {
  it("cancels a waiting job and resolves it as stopped", async () => {
    const q = await loadQueue({ global: 3, perServer: 1 });
    const gate = deferred();
    const a = q.submit(ref("r1", "s1"), () => gate.promise);
    const b = q.submit(ref("r2", "s1"), async () => undefined);

    expect(q.cancelQueued("r2")).toBe(true);
    expect(q.isQueued("r2")).toBe(false);
    expect(q.queuedCount()).toBe(0);
    await expect(b.done).resolves.toEqual({
      id: "r2",
      status: "stopped",
      cancelledWhileQueued: true,
    });

    gate.resolve();
    await a.done;
  });

  it("refuses to cancel a job that is already running", async () => {
    const q = await loadQueue({ global: 3, perServer: 1 });
    const gate = deferred();
    const a = q.submit(ref("r1", "s1"), () => gate.promise);

    expect(q.cancelQueued("r1")).toBe(false);
    expect(q.isRunning("r1")).toBe(true);

    gate.resolve();
    await a.done;
  });

  it("returns false when cancelling an unknown run", async () => {
    const q = await loadQueue();
    expect(q.cancelQueued("nope")).toBe(false);
  });

  it("frees a server slot immediately when a waiting job is cancelled", async () => {
    const q = await loadQueue({ global: 3, perServer: 1 });
    const gate = deferred();
    const a = q.submit(ref("r1", "s1"), () => gate.promise);
    const b = q.submit(ref("r2", "s1"), async () => "b");
    q.cancelQueued("r2");
    await expect(b.done).resolves.toEqual({
      id: "r2",
      status: "stopped",
      cancelledWhileQueued: true,
    });
    expect(q.isQueued("r2")).toBe(false);

    // r3 still waits for r1, but must not be stuck behind the cancelled r2.
    const c = q.submit(ref("r3", "s1"), async () => "c");
    expect(c.position).toBe(1);

    gate.resolve();
    await a.done;
    await expect(c.done).resolves.toBe("c");
  });
});

describe("diagnosis queue snapshot", () => {
  it("reports running jobs with elapsed time and the waiting list", async () => {
    const q = await loadQueue({ global: 3, perServer: 1 });
    const gate = deferred();
    const a = q.submit(ref("r1", "s1"), () => gate.promise);
    const b = q.submit(ref("r2", "s1"), async () => undefined);

    const snap = q.snapshot();
    expect(snap.maxGlobal).toBe(3);
    expect(snap.maxPerServer).toBe(1);
    expect(snap.running).toHaveLength(1);
    expect(snap.running[0]).toMatchObject({ runId: "r1", serverId: "s1" });
    expect(snap.running[0].elapsedMs).toBeGreaterThanOrEqual(0);
    expect(snap.queued).toHaveLength(1);
    expect(snap.queued[0]).toMatchObject({ runId: "r2", serverId: "s1", workspaceId: "ws-1" });
    expect(typeof snap.queued[0].enqueuedAt).toBe("number");

    gate.resolve();
    await a.done;
    await b.done;
    const empty = q.snapshot();
    expect(empty.running).toHaveLength(0);
    expect(empty.queued).toHaveLength(0);
  });
});
