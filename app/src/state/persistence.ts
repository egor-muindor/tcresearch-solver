import type { AspectData } from '../data/aspects';
import { deserializeBoard, type SerializedBoard } from '../core/board';

export const STATE_SCHEMA_VERSION = 1;
const KEY = 'gtnh-solver-state';

export interface AppState {
  schemaVersion: number;
  radius: number;
  addons: string[];
  threshold: number;
  supply: Array<[string, number]>;
  board: SerializedBoard;
}

export function saveState(state: AppState, storage: Storage = globalThis.localStorage): void {
  storage.setItem(KEY, JSON.stringify({ ...state, schemaVersion: STATE_SCHEMA_VERSION }));
}

export function loadState(data: AspectData, storage: Storage = globalThis.localStorage): AppState | null {
  const raw = storage.getItem(KEY);
  if (raw === null) return null;
  try {
    const obj = JSON.parse(raw) as Partial<AppState>;
    if (obj.schemaVersion !== STATE_SCHEMA_VERSION) return null; // migration hook (only v1 today)
    if (!obj.board) return null;
    deserializeBoard(data, obj.board); // throws if invalid -> caught -> null
    if (typeof obj.threshold !== 'number' || obj.threshold <= 0) return null;
    if (!Number.isInteger(obj.radius)) return null;
    if (!Array.isArray(obj.supply)) return null;
    for (const e of obj.supply) {
      if (!Array.isArray(e) || e.length !== 2) return null;
      const [a, nval] = e as [unknown, unknown];
      if (typeof a !== 'string' || !data.universe.has(a)) return null;
      if (!Number.isInteger(nval) || (nval as number) < 0) return null; // spec §4.1
    }
    return obj as AppState;
  } catch {
    return null; // corrupt -> reset to default
  }
}
