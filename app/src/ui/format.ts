import type { SolverStatus } from '../core/solver';
import type { Cost } from '../core/cost';

export function statusLabel(s: SolverStatus): string {
  switch (s) {
    case 'OPTIMAL': return 'Optimal';
    case 'FEASIBLE_TIMEOUT': return 'Solution found (timeout)';
    case 'UNKNOWN_TIMEOUT': return 'Unknown (timeout)';
    case 'INFEASIBLE_INVENTORY': return 'Not enough inventory';
    case 'UNSAT_PROVEN': return 'No solution';
    case 'CANCELLED': return 'Cancelled';
    case 'INVALID_INPUT': return 'Invalid input';
  }
}

export function costLabel(c: Cost | undefined): string {
  if (!c) return '—';
  const scar = Number.isFinite(c.scarcity) ? String(c.scarcity) : '∞';
  return 'deficit ' + scar + ', cells ' + c.cells;
}
