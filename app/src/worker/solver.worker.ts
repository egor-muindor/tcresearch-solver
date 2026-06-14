/// <reference lib="webworker" />
import { decodeSolveRequest } from './protocol';
import type { WorkerInbound, WorkerOutbound, SerializableResult } from './protocol';
import { solveWithValidation } from '../core/solver';
import { serializeBoard } from '../core/board';

let cancelRequested = false;

self.onmessage = (ev: MessageEvent<WorkerInbound>) => {
  const msg = ev.data;
  if (msg.type === 'cancel') { cancelRequested = true; return; }
  if (msg.type !== 'solve') return;
  cancelRequested = false;
  try {
    const opts = decodeSolveRequest(msg.req);
    const result = solveWithValidation({
      ...opts,
      seed: true,
      now: () => Date.now(),
      shouldCancel: () => cancelRequested,
      onProgress: (p) => post({ type: 'progress', progress: p }),
    });
    // Conditional spreads (not `: undefined`) so the literal satisfies exactOptionalPropertyTypes.
    const out: SerializableResult = {
      status: result.status,
      stats: result.stats,
      ...(result.board ? { board: serializeBoard(result.board) } : {}),
      ...(result.cost ? { cost: result.cost } : {}),
      ...(result.allocation
        ? {
            allocation: {
              feasible: result.allocation.feasible,
              scarcityCost: result.allocation.scarcityCost,
              craftOps: result.allocation.craftOps,
              leafConsumption: [...result.allocation.leafConsumption],
            },
          }
        : {}),
      ...(result.errors ? { errors: result.errors.map((e) => ({ type: e.type, cells: e.cells })) } : {}),
    };
    post({ type: 'result', result: out });
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

function post(m: WorkerOutbound): void {
  (self as DedicatedWorkerGlobalScope).postMessage(m);
}
