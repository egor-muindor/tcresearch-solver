import { buildAspectData } from '../data/aspects';
import { deserializeBoard, type SerializedBoard } from '../core/board';
import { makeInventory } from '../core/inventory';
import type { SolveOptions, SolveResult, Progress } from '../core/solver';

export interface SolveRequest {
  version: '4.2.2.0';
  addons: string[];
  board: SerializedBoard;
  supply: Array<[string, number]>;
  threshold: number;
  budget: { maxNodes: number; maxTimeMs: number; beam?: number };
  allocBudget?: { maxNodes: number };
}

export type WorkerInbound = { type: 'solve'; req: SolveRequest } | { type: 'cancel' };
export type WorkerOutbound =
  | { type: 'progress'; progress: Progress }
  | { type: 'result'; result: SerializableResult }
  | { type: 'error'; message: string };

/** SolveResult minus the live Board; the board is sent as SerializedBoard. */
export interface SerializableResult {
  status: SolveResult['status'];
  board?: SerializedBoard;
  cost?: SolveResult['cost'];
  allocation?: { feasible: boolean | 'unknown'; scarcityCost: number; craftOps: number; leafConsumption: Array<[string, number]> };
  errors?: Array<{ type: string; cells: Array<{ q: number; r: number }> }>;
  stats: { nodes: number; timeMs: number };
}

export function encodeSolveRequest(req: SolveRequest): SolveRequest {
  return req; // already structured-clone friendly; explicit fn documents the boundary
}

export function decodeSolveRequest(req: SolveRequest): SolveOptions & { allocBudget?: { maxNodes: number } } {
  const data = buildAspectData({ version: req.version, addons: req.addons });
  const board = deserializeBoard(data, req.board);
  const inventory = makeInventory(req.supply, req.threshold);
  // Conditional spread keeps the literal valid under exactOptionalPropertyTypes (no `allocBudget: undefined`).
  return { data, board, inventory, budget: req.budget, ...(req.allocBudget ? { allocBudget: req.allocBudget } : {}) };
}
