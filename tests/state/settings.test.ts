import { describe, expect, it } from 'bun:test';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type UiSettings } from '../../app/src/state/settings';

class FakeStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const KEY = 'gtnh-solver-ui-settings';

function fullSettings(): UiSettings {
  return {
    paletteWidth: 200,
    paletteScale: 1.5,
    inventoryWidth: 300,
    inventoryScale: 2,
    inventoryHidden: true,
  };
}

describe('settings persistence', () => {
  it('returns defaults when storage is empty', () => {
    const s = new FakeStorage();
    const loaded = loadSettings(s as unknown as Storage);
    expect(loaded).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips all fields', () => {
    const s = new FakeStorage();
    const orig = fullSettings();
    saveSettings(orig, s as unknown as Storage);
    const loaded = loadSettings(s as unknown as Storage);
    expect(loaded.paletteWidth).toBe(200);
    expect(loaded.paletteScale).toBe(1.5);
    expect(loaded.inventoryWidth).toBe(300);
    expect(loaded.inventoryScale).toBe(2);
    expect(loaded.inventoryHidden).toBe(true);
  });

  it('returns defaults on corrupt JSON', () => {
    const s = new FakeStorage();
    s.setItem(KEY, '{not valid json');
    const loaded = loadSettings(s as unknown as Storage);
    expect(loaded).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to defaults for missing individual fields', () => {
    const s = new FakeStorage();
    s.setItem(KEY, JSON.stringify({ paletteWidth: 180 }));
    const loaded = loadSettings(s as unknown as Storage);
    expect(loaded.paletteWidth).toBe(180);
    expect(loaded.paletteScale).toBe(DEFAULT_SETTINGS.paletteScale);
    expect(loaded.inventoryWidth).toBe(DEFAULT_SETTINGS.inventoryWidth);
    expect(loaded.inventoryScale).toBe(DEFAULT_SETTINGS.inventoryScale);
    expect(loaded.inventoryHidden).toBe(DEFAULT_SETTINGS.inventoryHidden);
  });

  it('falls back to defaults for non-positive numeric fields', () => {
    const s = new FakeStorage();
    s.setItem(KEY, JSON.stringify({ paletteWidth: -10, paletteScale: 0, inventoryWidth: 0, inventoryScale: -1, inventoryHidden: false }));
    const loaded = loadSettings(s as unknown as Storage);
    expect(loaded.paletteWidth).toBe(DEFAULT_SETTINGS.paletteWidth);
    expect(loaded.paletteScale).toBe(DEFAULT_SETTINGS.paletteScale);
    expect(loaded.inventoryWidth).toBe(DEFAULT_SETTINGS.inventoryWidth);
    expect(loaded.inventoryScale).toBe(DEFAULT_SETTINGS.inventoryScale);
  });

  it('falls back to defaults for NaN / Infinity numeric fields', () => {
    const s = new FakeStorage();
    // JSON.stringify converts Infinity/NaN to null
    s.setItem(KEY, JSON.stringify({ paletteWidth: null, paletteScale: null }));
    const loaded = loadSettings(s as unknown as Storage);
    expect(loaded.paletteWidth).toBe(DEFAULT_SETTINGS.paletteWidth);
    expect(loaded.paletteScale).toBe(DEFAULT_SETTINGS.paletteScale);
  });

  it('defaults inventoryHidden to false for non-boolean value', () => {
    const s = new FakeStorage();
    s.setItem(KEY, JSON.stringify({ inventoryHidden: 'yes' }));
    const loaded = loadSettings(s as unknown as Storage);
    expect(loaded.inventoryHidden).toBe(false);
  });

  it('round-trips inventoryHidden=false', () => {
    const s = new FakeStorage();
    saveSettings({ ...fullSettings(), inventoryHidden: false }, s as unknown as Storage);
    const loaded = loadSettings(s as unknown as Storage);
    expect(loaded.inventoryHidden).toBe(false);
  });

  it('saveSettings writes to the correct key', () => {
    const s = new FakeStorage();
    saveSettings(DEFAULT_SETTINGS, s as unknown as Storage);
    const raw = s.getItem(KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as UiSettings;
    expect(parsed.paletteWidth).toBe(DEFAULT_SETTINGS.paletteWidth);
  });
});
