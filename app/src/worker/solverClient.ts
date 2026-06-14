import type { SolveRequest, WorkerOutbound, SerializableResult } from './protocol';
import type { Progress } from '../core/solver';

export class SolverClient {
  private worker: Worker | null = null;

  private spawn(): Worker {
    // EXACT static form required by Vite to rewrite the base path (spec §6).
    return new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' });
  }

  solve(req: SolveRequest, onProgress: (p: Progress) => void): Promise<SerializableResult> {
    this.cancel(); // ensure a clean worker
    const worker = this.spawn();
    this.worker = worker;
    return new Promise<SerializableResult>((resolve, reject) => {
      worker.onmessage = (ev: MessageEvent<WorkerOutbound>) => {
        const m = ev.data;
        if (m.type === 'progress') onProgress(m.progress);
        else if (m.type === 'result') { resolve(m.result); this.dispose(); }
        else if (m.type === 'error') { reject(new Error(m.message)); this.dispose(); }
      };
      worker.onerror = (e) => { reject(new Error(e.message)); this.dispose(); };
      worker.postMessage({ type: 'solve', req });
    });
  }

  /** Guaranteed cancel: hard-terminate and drop the worker (spec §5.5). */
  cancel(): void {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }

  private dispose(): void {
    if (this.worker) { this.worker.terminate(); this.worker = null; }
  }
}
