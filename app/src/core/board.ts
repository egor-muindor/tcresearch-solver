import type { Aspect } from '../data/aspects';
import { type Hex, hexKey, isOnBoard, boardCells, neighborsOf } from './hex';

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
