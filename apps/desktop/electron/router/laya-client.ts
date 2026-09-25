import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import type { LayaStatus } from "../../contracts/router";

export interface LayaWireQuestion {
  readonly key: string;
  readonly type: "choice" | "score" | "noul";
  readonly instructions: string;
  /** `[label, description?]` pairs; score levels use the label only; noul takes none. */
  readonly options: readonly (readonly [string, string?])[];
}

export interface LayaWireAnswer {
  readonly key: string;
  readonly labels: readonly string[];
  readonly probabilities: readonly number[];
  readonly selected: string;
  readonly confidence: number;
  readonly truncated: boolean;
}

export interface LayaAnswers {
  readonly answers: readonly LayaWireAnswer[];
  readonly latencyMs: number;
}

/** What the router needs from Laya; tests supply a scripted implementation. */
export interface LayaClassifier {
  status(): LayaStatus;
  /** Starts loading weights in the background; later calls are no-ops while loaded. */
  warm(): void;
  answer(state: string, questions: readonly LayaWireQuestion[]): Promise<LayaAnswers>;
  dispose(): void;
}

interface PendingRequest {
  readonly resolve: (answers: LayaAnswers) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

const REQUEST_TIMEOUT_MS = 2_000;
const READY_WAIT_MS = 1_500;

/**
 * Drives the `routey-laya-helper` Swift process over JSON lines. The helper loads
 * Laya's Core ML buckets once and then answers in milliseconds. It never downloads
 * weights on its own; a missing cache reports `unavailable` and the router falls
 * back to heuristics.
 */
export class LayaProcessClient implements LayaClassifier {
  private child: ChildProcessWithoutNullStreams | undefined;
  private current: LayaStatus = { state: "stopped" };
  private readonly pending = new Map<string, PendingRequest>();
  private readonly readyWaiters = new Set<() => void>();
  private nextId = 1;
  private disposed = false;

  constructor(
    private readonly helperPath: string,
    private readonly onStatus: (status: LayaStatus) => void = () => {},
  ) {}

  status(): LayaStatus {
    return this.current;
  }

  warm(): void {
    if (this.disposed || this.child || this.current.state === "unavailable") return;
    if (!existsSync(this.helperPath)) {
      this.setStatus({
        state: "unavailable",
        message: `The Laya helper is not built (${this.helperPath}).`,
      });
      return;
    }
    const child = spawn(this.helperPath, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    this.setStatus({ state: "loading" });
    createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
    child.stderr.on("data", (chunk: Buffer) => {
      console.warn("[laya-helper]", chunk.toString().trim());
    });
    child.on("error", (error) => {
      this.handleExit(`The Laya helper failed to start: ${error.message}`);
    });
    child.on("exit", (code, signal) => {
      this.handleExit(`The Laya helper exited (${signal ?? code ?? "unknown"}).`);
    });
  }

  async answer(state: string, questions: readonly LayaWireQuestion[]): Promise<LayaAnswers> {
    this.warm();
    if (this.current.state === "loading") await this.waitForReady(READY_WAIT_MS);
    const child = this.child;
    if (this.current.state !== "ready" || !child) {
      throw new Error(
        this.current.state === "unavailable" ? this.current.message : "Laya is still loading.",
      );
    }
    const id = String(this.nextId++);
    return new Promise<LayaAnswers>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Laya did not answer within ${REQUEST_TIMEOUT_MS} ms.`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, state, questions })}\n`);
    });
  }

  dispose(): void {
    this.disposed = true;
    this.child?.kill();
    this.child = undefined;
    this.rejectAll("Laya was shut down.");
  }

  private waitForReady(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.readyWaiters.delete(done);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.readyWaiters.add(done);
    });
  }

  private handleLine(line: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      console.warn("[laya-helper] ignored non-JSON output", line);
      return;
    }
    if (message.event === "ready") {
      const lengths = Array.isArray(message.lengths)
        ? message.lengths.filter((value): value is number => typeof value === "number")
        : [];
      this.setStatus({ state: "ready", lengths });
      for (const waiter of [...this.readyWaiters]) waiter();
      return;
    }
    if (message.event === "unavailable") {
      this.setStatus({
        state: "unavailable",
        message: typeof message.message === "string" ? message.message : "Laya is unavailable.",
      });
      for (const waiter of [...this.readyWaiters]) waiter();
      return;
    }
    if (message.event === "loading") return;
    const id = typeof message.id === "string" ? message.id : undefined;
    const request = id ? this.pending.get(id) : undefined;
    if (!id || !request) return;
    this.pending.delete(id);
    clearTimeout(request.timer);
    if (typeof message.error === "string") {
      request.reject(new Error(message.error));
      return;
    }
    request.resolve({
      answers: Array.isArray(message.answers) ? (message.answers as LayaWireAnswer[]) : [],
      latencyMs: typeof message.ms === "number" ? message.ms : 0,
    });
  }

  private handleExit(reason: string): void {
    this.child = undefined;
    this.rejectAll(reason);
    for (const waiter of [...this.readyWaiters]) waiter();
    // A crash after a successful load restarts on the next request; a failed
    // load stays unavailable so every turn does not respawn a broken helper.
    if (!this.disposed && this.current.state !== "unavailable") {
      this.setStatus({ state: "stopped" });
    }
  }

  private rejectAll(reason: string): void {
    for (const [id, request] of this.pending) {
      clearTimeout(request.timer);
      request.reject(new Error(reason));
      this.pending.delete(id);
    }
  }

  private setStatus(status: LayaStatus): void {
    this.current = status;
    this.onStatus(status);
  }
}
