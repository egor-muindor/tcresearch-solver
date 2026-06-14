import type { SolveRequest, WorkerOutbound, SerializableResult } from './protocol';
import type { Progress } from '../core/solver';

export class SolverClient {
  private worker: Worker | null = null;
  private settle: ((r: SerializableResult) => void) | null = null;

  private spawn(): Worker {
    // EXACT static form required by Vite to rewrite the base path (spec §6).
    return new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  }

  solve(req: SolveRequest, onProgress: (p: Progress) => void): Promise<SerializableResult> {
    this.cancel(); // settle any in-flight solve as CANCELLED and drop its worker
    const worker = this.spawn();
    this.worker = worker;
    return new Promise<SerializableResult>((resolve, reject) => {
      this.settle = resolve;
      worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => {
        if (worker !== this.worker) return; // ignore a stale (terminated) worker's events
        const m = ev.data;
        if (m.type === 'progress') onProgress(m.progress);
        else if (m.type === 'result') { this.settle = null; resolve(m.result); this.dispose(); }
        else if (m.type === 'error') { this.settle = null; reject(new Error(m.message)); this.dispose(); }
      };
      worker.onerror = (e) => {
        if (worker !== this.worker) return;
        this.settle = null; reject(new Error(e.message)); this.dispose();
      };
      worker.postMessage({ type: 'solve', req });
    });
  }

  /** Guaranteed cancel: hard-terminate, drop the worker, and resolve any in-flight solve as CANCELLED (spec §5.5). */
  cancel(): void {
    const settle = this.settle;
    this.settle = null;
    if (this.worker) { this.worker.terminate(); this.worker = null; }
    if (settle) settle({ status: 'CANCELLED', stats: { nodes: 0, timeMs: 0 } });
  }

  private dispose(): void {
    this.settle = null;
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }
}
