import { describe, expect, it } from 'bun:test';
import { buildAspectData } from '../../app/src/data/aspects';
import { createBoard, setState, serializeBoard } from '../../app/src/core/board';
import { saveState, loadState, STATE_SCHEMA_VERSION, type AppState } from '../../app/src/state/persistence';

const data = buildAspectData();

class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

function sampleState(): AppState {
  const b = createBoard(3);
  setState(b, { q: 0, r: 0 }, { kind: 'ANCHOR', aspect: 'air' });
  return { schemaVersion: STATE_SCHEMA_VERSION, radius: 3, addons: ['fm', 'mb', 'gt'], threshold: 50, supply: [['air', 64]], board: serializeBoard(b), accountSupply: false };
}

describe('persistence', () => {
  it('round-trips through storage', () => {
    const s = new FakeStorage();
    saveState(sampleState(), s as unknown as Storage);
    const loaded = loadState(data, s as unknown as Storage);
    expect(loaded?.radius).toBe(3);
    expect(loaded?.supply).toContainEqual(['air', 64]);
  });

  it('returns null on corrupt JSON (reset to default)', () => {
    const s = new FakeStorage();
    s.setItem('gtnh-solver-state', '{not json');
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });

  it('returns null on unknown schemaVersion', () => {
    const s = new FakeStorage();
    s.setItem('gtnh-solver-state', JSON.stringify({ ...sampleState(), schemaVersion: 999 }));
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });

  it('returns null when board fails validation', () => {
    const s = new FakeStorage();
    const bad = sampleState();
    (bad.board.cells[0] as { aspect: string }).aspect = 'nonsense';
    s.setItem('gtnh-solver-state', JSON.stringify(bad));
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });

  it('returns null on negative/non-integer persisted supply (spec §4.1)', () => {
    const s = new FakeStorage();
    s.setItem('gtnh-solver-state', JSON.stringify({ ...sampleState(), supply: [['air', -5]] }));
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });

  it('round-trips accountSupply', () => {
    const s = new FakeStorage();
    const state = { ...sampleState(), accountSupply: false };
    saveState(state, s as unknown as Storage);
    const loaded = loadState(data, s as unknown as Storage);
    expect(loaded?.accountSupply).toBe(false);
  });

  it('loads accountSupply as false when field is missing from stored state', () => {
    const s = new FakeStorage();
    const base = sampleState();
    // Omit accountSupply from the stored object
    const { accountSupply: _omit, ...withoutAccount } = base;
    s.setItem('gtnh-solver-state', JSON.stringify(withoutAccount));
    const loaded = loadState(data, s as unknown as Storage);
    expect(loaded?.accountSupply).toBe(false);
  });

  it('returns null when addons is missing', () => {
    const s = new FakeStorage();
    const base = sampleState();
    const { addons: _omit, ...withoutAddons } = base;
    s.setItem('gtnh-solver-state', JSON.stringify(withoutAddons));
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });

  it('returns null when addons is not an array of strings', () => {
    const s = new FakeStorage();
    s.setItem('gtnh-solver-state', JSON.stringify({ ...sampleState(), addons: [1, 2, 3] }));
    expect(loadState(data, s as unknown as Storage)).toBeNull();
  });
});
