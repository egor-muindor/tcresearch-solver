import type { Aspect, AspectData } from '../data/aspects';
import { mult } from './aspectGraph';

export const DEFAULT_THRESHOLD = 50;
export const BASE = 1; // spec §4.1: base > 0
export const K = 1; // spec §4.1: k >= 0

export interface Inventory {
  /** Non-negative integer counts. Absent key => 0. */
  readonly supply: ReadonlyMap<Aspect, number>;
  /** Strictly > 0. */
  readonly threshold: number;
}

export function makeInventory(entries: ReadonlyArray<readonly [Aspect, number]>, threshold = DEFAULT_THRESHOLD): Inventory {
  return { supply: new Map(entries), threshold };
}

export function validateInventory(inv: Inventory): void {
  if (!(inv.threshold > 0) || !Number.isFinite(inv.threshold)) {
    throw new Error(`threshold must be > 0, got ${inv.threshold}`);
  }
  for (const [a, n] of inv.supply) {
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`supply['${a}'] must be a non-negative integer, got ${n}`);
    }
  }
}

function supplyOf(inv: Inventory, a: Aspect): number {
  return inv.supply.get(a) ?? 0;
}

export function directPenalty(inv: Inventory, _data: AspectData, a: Aspect): number {
  const s = supplyOf(inv, a);
  if (s >= inv.threshold) return 0;
  if (s > 0) return BASE + K * (inv.threshold - s);
  return Number.POSITIVE_INFINITY;
}

const obtainCache = new WeakMap<Inventory, Map<Aspect, number>>();

export function obtainCost(inv: Inventory, data: AspectData, a: Aspect): number {
  let cache = obtainCache.get(inv);
  if (!cache) {
    cache = new Map();
    obtainCache.set(inv, cache);
  }
  return obtainRec(inv, data, a, cache, new Set());
}

function obtainRec(inv: Inventory, data: AspectData, a: Aspect, cache: Map<Aspect, number>, stack: Set<Aspect>): number {
  const memo = cache.get(a);
  if (memo !== undefined) return memo;
  if (stack.has(a)) return Number.POSITIVE_INFINITY; // cycle guard (data is a DAG; defensive)
  const direct = directPenalty(inv, data, a);
  let best = direct;
  const recipe = data.combinations.get(a);
  if (recipe) {
    stack.add(a);
    const craft = obtainRec(inv, data, recipe[0], cache, stack) + obtainRec(inv, data, recipe[1], cache, stack);
    stack.delete(a);
    if (craft < best) best = craft;
  }
  cache.set(a, best);
  return best;
}

export function globalMinObtain(inv: Inventory, data: AspectData): number {
  let min = Number.POSITIVE_INFINITY;
  for (const a of data.universe) {
    const c = obtainCost(inv, data, a);
    if (c < min) min = c;
  }
  return min;
}

// mult re-exported for the allocator below.
export { mult };
