import { describe, expect, it, vi } from "vitest";
import { ProviderQueue } from "./provider-queue";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Enqueues `count` tasks whose `activate` resolves the task immediately after
 * a microtask tick. Returns the queue, the activated ids in order, the peak
 * number of concurrently-active tasks, and the per-task results.
 */
function runConcurrent(count: number) {
  const queue = new ProviderQueue<string>();
  const activated: string[] = [];
  const inFlight = { count: 0, max: 0 };

  const promises = Array.from({ length: count }, (_, i) =>
    queue.enqueue(async (task) => {
      inFlight.count += 1;
      inFlight.max = Math.max(inFlight.max, inFlight.count);
      activated.push(task.id);
      await Promise.resolve();
      inFlight.count -= 1;
      queue.resolveActive(`result:${i}`, task.id);
    }, `req-${i}`),
  );

  return { queue, promises, activated, inFlight };
}

describe("ProviderQueue", () => {
  it("processes tasks strictly in FIFO order", async () => {
    const { queue, promises, activated } = runConcurrent(5);

    await expect(Promise.all(promises)).resolves.toEqual([
      "result:0",
      "result:1",
      "result:2",
      "result:3",
      "result:4",
    ]);
    expect(activated).toEqual(["req-0", "req-1", "req-2", "req-3", "req-4"]);
    expect(queue.isIdle).toBe(true);
    expect(queue.pendingCount).toBe(0);
  });

  it("keeps exactly one task active at a time", async () => {
    const { promises, inFlight } = runConcurrent(10);
    await expect(Promise.all(promises)).resolves.toHaveLength(10);
    expect(inFlight.max).toBe(1);
  });

  it("rejects the active request and advances to the next in line", async () => {
    const queue = new ProviderQueue<string>();
    const order: string[] = [];

    // activate returns immediately (like presentPopup); the task stays active
    // until it is settled externally via rejectActive (popup close).
    const first = queue.enqueue(async (task) => {
      order.push(`${task.id}:open`);
    }, "req-0");

    const second = queue.enqueue(async (task) => {
      order.push(`${task.id}:open`);
      queue.resolveActive("signed:1", task.id);
    }, "req-1");

    await vi.waitFor(() => expect(queue.activeId).toBe("req-0"));
    expect(queue.pendingCount).toBe(2);
    expect(order).toEqual(["req-0:open"]);

    queue.rejectActive(new Error("USER_REJECTED"), "req-0");

    await expect(first).rejects.toThrow("USER_REJECTED");
    await expect(second).resolves.toBe("signed:1");
    expect(order).toEqual(["req-0:open", "req-1:open"]);
    expect(queue.isIdle).toBe(true);
    expect(queue.activeId).toBeNull();
  });

  it("resolving with a non-matching id is a no-op", async () => {
    const queue = new ProviderQueue<string>();
    const first = queue.enqueue(async () => undefined, "req-0");

    await vi.waitFor(() => expect(queue.activeId).toBe("req-0"));
    expect(queue.resolveActive("nope", "other-id")).toBe(false);
    expect(queue.pendingCount).toBe(1);

    queue.rejectActive(new Error("USER_REJECTED"), "req-0");
    await expect(first).rejects.toThrow("USER_REJECTED");
    expect(queue.isIdle).toBe(true);
  });

  it("dispose rejects both queued and active tasks and clears state", async () => {
    const queue = new ProviderQueue<string>();
    const active = queue.enqueue(async () => {
      await new Promise<void>(() => undefined);
    }, "req-0");
    const queued = queue.enqueue(async () => {
      queue.resolveActive("ok", "req-1");
    }, "req-1");

    await vi.waitFor(() => expect(queue.activeId).toBe("req-0"));
    queue.dispose(new Error("disposed"));

    await expect(active).rejects.toThrow("disposed");
    await expect(queued).rejects.toThrow("disposed");
    expect(queue.isDisposed).toBe(true);
    expect(queue.pendingCount).toBe(0);
    expect(queue.size).toBe(0);
    expect(queue.activeId).toBeNull();
  });

  it("is a no-op to settle a task that was already disposed", async () => {
    const queue = new ProviderQueue<string>();
    queue.dispose();
    await expect(
      queue.enqueue(async () => undefined, "late"),
    ).rejects.toThrow("disposed");
  });

  it("continues draining after an activation throws", async () => {
    const queue = new ProviderQueue<string>();
    const order: string[] = [];

    const failing = queue.enqueue(async (task) => {
      order.push(task.id);
      throw new Error("popup-open-failed");
    }, "req-0");
    const next = queue.enqueue(async (task) => {
      order.push(task.id);
      queue.resolveActive("signed:1", task.id);
    }, "req-1");

    await expect(failing).rejects.toThrow("popup-open-failed");
    await expect(next).resolves.toBe("signed:1");
    expect(order).toEqual(["req-0", "req-1"]);
    expect(queue.isIdle).toBe(true);
  });

  it("leaks no tasks or state after 1,000 sequential requests", async () => {
    const queue = new ProviderQueue<string>();
    const settled = Array.from({ length: 1000 }, (_, i) =>
      queue.enqueue(async (task) => {
        queue.resolveActive(`signed:${i}`, task.id);
      }, `req-${i}`),
    );

    await Promise.all(settled);
    await flush();

    expect(queue.size).toBe(0);
    expect(queue.pendingCount).toBe(0);
    expect(queue.activeId).toBeNull();
    expect(queue.isIdle).toBe(true);
  });
});
