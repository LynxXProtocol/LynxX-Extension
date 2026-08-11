import { createRequestId } from "./messages";

/**
 * A single queued signing request. `activate` is invoked by the queue the
 * moment the request becomes the active (only) popup-worthy request; the
 * background worker uses it to open the confirmation popup.
 */
export interface QueueTask<T = unknown> {
  readonly id: string;
  readonly enqueuedAt: number;
  readonly activate: (task: QueueTask<T>) => void | Promise<void>;
}

interface PendingTask<T> extends QueueTask<T> {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
  settled: boolean;
  waitForSettlement: Promise<void>;
  settle: () => void;
}

/**
 * FIFO transaction request queue that guarantees exactly one signing request
 * is "active" (and therefore exactly one confirmation popup is open) at a
 * time.
 *
 * Guarantees:
 * - Requests are processed strictly in arrival order (nonce sequencing).
 * - A request stays active until `resolveActive` / `rejectActive` is called,
 *   after which the queue advances to the next request.
 * - Rejecting the active request (popup dismissed) immediately frees the
 *   queue so the next request in line opens its popup.
 * - `dispose` settles every pending and queued promise and removes internal
 *   state, so long-lived service workers never accumulate dangling state.
 */
export class ProviderQueue<T = unknown> {
  private readonly tasks: PendingTask<T>[] = [];
  private activeTask: PendingTask<T> | null = null;
  private draining = false;
  private disposed = false;

  /** Number of requests waiting to be processed (excluding the active one). */
  get size(): number {
    return this.tasks.length;
  }

  /** Number of unprocessed requests including the active one. */
  get pendingCount(): number {
    return (this.activeTask ? 1 : 0) + this.tasks.length;
  }

  get activeId(): string | null {
    return this.activeTask?.id ?? null;
  }

  get isIdle(): boolean {
    return !this.draining && this.activeTask === null && this.tasks.length === 0;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Queues a task and returns a promise that resolves with the value supplied
   * to {@link resolveActive} or rejects when the task is rejected or the
   * queue is disposed.
   */
  enqueue(
    activate: (task: QueueTask<T>) => void | Promise<void>,
    id: string = createRequestId(),
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settleFn: (() => void) | undefined;
      const waitForSettlement = new Promise<void>((resolveSettlement) => {
        settleFn = resolveSettlement;
      });

      const task: PendingTask<T> = {
        id,
        enqueuedAt: Date.now(),
        activate,
        resolve,
        reject,
        settled: false,
        waitForSettlement,
        settle: () => settleFn?.(),
      };

      if (this.disposed) {
        this.rejectTask(task, this.disposalError());
        return;
      }

      this.tasks.push(task);
      void this.drain();
    });
  }

  /**
   * Resolves the active request. No-op if there is no active request or it
   * already settled.
   */
  resolveActive(value: T, id?: string): boolean {
    return this.settleActive((task) => task.resolve(value), id);
  }

  /**
   * Rejects the active request (e.g. popup dismissed) and advances the queue
   * to the next request in line.
   */
  rejectActive(error: unknown, id?: string): boolean {
    return this.settleActive((task) => task.reject(error), id);
  }

  /**
   * Rejects every queued and active request. Removes any pending state so no
   * event listener, promise, or task survives disposal.
   */
  dispose(error?: unknown): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const settleError = error ?? this.disposalError();
    const all = this.activeTask ? [this.activeTask, ...this.tasks] : [...this.tasks];
    this.tasks.length = 0;
    this.activeTask = null;
    for (const task of all) {
      this.rejectTask(task, settleError);
    }
  }

  /**
   * Runs the queue. Exactly one task is active at a time; the queue blocks on
   * its settlement before activating the next task.
   */
  private async drain(): Promise<void> {
    if (this.draining) {
      return;
    }
    this.draining = true;
    try {
      while (this.tasks.length > 0) {
        if (this.disposed) {
          return;
        }
        const task = this.tasks.shift()!;
        this.activeTask = task;

        try {
          await task.activate(task);
        } catch (error) {
          // Popup failed to open — reject this request and move on so the
          // rest of the queue is not silently stuck.
          this.rejectTask(task, error);
        }

        if (!task.settled) {
          await task.waitForSettlement;
        }

        if (this.activeTask === task) {
          this.activeTask = null;
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private settleActive(
    settle: (task: PendingTask<T>) => void,
    id?: string,
  ): boolean {
    const task = this.activeTask;
    if (!task || task.settled) {
      return false;
    }
    if (id !== undefined && task.id !== id) {
      return false;
    }
    task.settled = true;
    settle(task);
    task.settle();
    return true;
  }

  private rejectTask(task: PendingTask<T>, error: unknown): void {
    if (task.settled) {
      return;
    }
    task.settled = true;
    task.reject(error);
    task.settle();
  }

  private disposalError(): Error {
    return new Error("ProviderQueue was disposed before the request was settled");
  }
}