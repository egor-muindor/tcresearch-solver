import type { SolverStatus } from '../core/solver';
import type { Cost } from '../core/cost';

export function statusLabel(s: SolverStatus): string {
  switch (s) {
    case 'OPTIMAL': return 'Оптимально';
    case 'FEASIBLE_TIMEOUT': return 'Решение найдено (по таймауту)';
    case 'UNKNOWN_TIMEOUT': return 'Неизвестно (таймаут)';
    case 'INFEASIBLE_INVENTORY': return 'Не хватает запасов';
    case 'UNSAT_PROVEN': return 'Решения нет';
    case 'CANCELLED': return 'Отменено';
    case 'INVALID_INPUT': return 'Некорректный ввод';
  }
}

export function costLabel(c: Cost | undefined): string {
  if (!c) return '—';
  const scar = Number.isFinite(c.scarcity) ? String(c.scarcity) : '∞';
  return `дефицит ${scar}, клеток ${c.cells}`;
}
