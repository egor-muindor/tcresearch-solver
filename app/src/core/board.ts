import type { Aspect, AspectData } from '../data/aspects';
import { type Hex, hexKey, isOnBoard, boardCells, neighborsOf } from './hex';
import { isValidLink } from './aspectGraph';

export type CellState =
  | { kind: 'DEAD' }
  | { kind: 'ANCHOR'; aspect: Aspect }
  | { kind: 'EMPTY' }
  | { kind: 'PLACED'; aspect: Aspect; locked: boolean };

export interface Board {
  readonly radius: number;
  /** Only non-EMPTY cells are stored; absent on-board key => EMPTY. */
  readonly cells: Map<string, CellState>;
}

export function createBoard(radius: number): Board {
  if (!Number.isInteger(radius) || radius < 2 || radius > 5) {
    throw new Error(`radius must be an integer 2..5, got ${radius}`);
  }
  return { radius, cells: new Map() };
}

export function getState(board: Board, h: Hex): CellState {
  if (!isOnBoard(h, board.radius)) throw new Error(`hex ${hexKey(h)} is off board (R=${board.radius})`);
  return board.cells.get(hexKey(h)) ?? { kind: 'EMPTY' };
}

export function setState(board: Board, h: Hex, s: CellState): void {
  if (!isOnBoard(h, board.radius)) throw new Error(`hex ${hexKey(h)} is off board (R=${board.radius})`);
  if (s.kind === 'EMPTY') board.cells.delete(hexKey(h));
  else board.cells.set(hexKey(h), s);
}

export interface FilledCell { hex: Hex; aspect: Aspect; locked: boolean; isAnchor: boolean; }

export function filledCells(board: Board): FilledCell[] {
  const out: FilledCell[] = [];
  for (const h of boardCells(board.radius)) {
    const s = getState(board, h);
    if (s.kind === 'ANCHOR') out.push({ hex: h, aspect: s.aspect, locked: false, isAnchor: true });
    else if (s.kind === 'PLACED') out.push({ hex: h, aspect: s.aspect, locked: s.locked, isAnchor: false });
  }
  return out;
}

export function anchorCells(board: Board): Array<{ hex: Hex; aspect: Aspect }> {
  return filledCells(board).filter((c) => c.isAnchor).map((c) => ({ hex: c.hex, aspect: c.aspect }));
}

/** On-board neighbors that are filled (ANCHOR or PLACED). */
export function filledNeighbors(board: Board, h: Hex): FilledCell[] {
  const out: FilledCell[] = [];
  for (const n of neighborsOf(h)) {
    if (!isOnBoard(n, board.radius)) continue;
    const s = getState(board, n);
    if (s.kind === 'ANCHOR') out.push({ hex: n, aspect: s.aspect, locked: false, isAnchor: true });
    else if (s.kind === 'PLACED') out.push({ hex: n, aspect: s.aspect, locked: s.locked, isAnchor: false });
  }
  return out;
}

export type ValidationErrorType =
  | 'INVALID_LINK' | 'SAME_ASPECT_ADJACENT' | 'ANCHORS_DISCONNECTED' | 'PLACED_ON_DEAD' | 'MALFORMED';

export interface ValidationError { type: ValidationErrorType; cells: Hex[]; }
export interface ValidationResult { valid: boolean; errors: ValidationError[]; }

export function validate(data: AspectData, board: Board): ValidationResult {
  const errors: ValidationError[] = [];
  const filled = filledCells(board);
  const filledKeys = new Set(filled.map((c) => hexKey(c.hex)));
  const aspectAt = new Map(filled.map((c) => [hexKey(c.hex), c.aspect]));

  // 1) pairwise adjacency validity (each undirected pair once)
  for (const c of filled) {
    for (const n of neighborsOf(c.hex)) {
      const nk = hexKey(n);
      if (!filledKeys.has(nk)) continue;
      if (hexKey(c.hex) >= nk) continue; // dedupe ordered pair
      const a = c.aspect;
      const b = aspectAt.get(nk)!;
      if (a === b) errors.push({ type: 'SAME_ASPECT_ADJACENT', cells: [c.hex, n] });
      else if (!isValidLink(data, a, b)) errors.push({ type: 'INVALID_LINK', cells: [c.hex, n] });
    }
  }

  // 2) anchors connectivity (>=2 anchors must share one filled component)
  if (!anchorsConnectedInternal(board)) {
    errors.push({ type: 'ANCHORS_DISCONNECTED', cells: anchorCells(board).map((a) => a.hex) });
  }

  return { valid: errors.length === 0, errors };
}

function anchorsConnectedInternal(board: Board): boolean {
  const anchors = anchorCells(board);
  if (anchors.length <= 1) return true;
  const filled = new Set(filledCells(board).map((c) => hexKey(c.hex)));
  // BFS from first anchor over filled adjacency
  const start = hexKey(anchors[0]!.hex);
  const seen = new Set<string>([start]);
  const queue = [anchors[0]!.hex];
  while (queue.length) {
    const cur = queue.pop()!;
    for (const n of neighborsOf(cur)) {
      const nk = hexKey(n);
      if (filled.has(nk) && !seen.has(nk)) {
        seen.add(nk);
        queue.push(n);
      }
    }
  }
  return anchors.every((a) => seen.has(hexKey(a.hex)));
}

export function allAnchorsConnected(board: Board): boolean {
  return anchorsConnectedInternal(board);
}

/** A finished solution: fully valid AND all anchors in one component. */
export function isComplete(data: AspectData, board: Board): boolean {
  return validate(data, board).valid;
}
