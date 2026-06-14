const KEY = 'gtnh-solver-ui-settings';

export interface UiSettings {
  paletteWidth: number;
  paletteScale: number;
  inventoryWidth: number;
  inventoryScale: number;
  inventoryHidden: boolean;
}

export const DEFAULT_SETTINGS: UiSettings = {
  paletteWidth: 160,
  paletteScale: 1,
  inventoryWidth: 230,
  inventoryScale: 1,
  inventoryHidden: false,
};

export function loadSettings(storage: Storage = globalThis.localStorage): UiSettings {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return { ...DEFAULT_SETTINGS };
    const obj = JSON.parse(raw) as Partial<UiSettings>;
    return {
      paletteWidth:
        typeof obj.paletteWidth === 'number' && isFinite(obj.paletteWidth) && obj.paletteWidth > 0
          ? obj.paletteWidth
          : DEFAULT_SETTINGS.paletteWidth,
      paletteScale:
        typeof obj.paletteScale === 'number' && isFinite(obj.paletteScale) && obj.paletteScale > 0
          ? obj.paletteScale
          : DEFAULT_SETTINGS.paletteScale,
      inventoryWidth:
        typeof obj.inventoryWidth === 'number' && isFinite(obj.inventoryWidth) && obj.inventoryWidth > 0
          ? obj.inventoryWidth
          : DEFAULT_SETTINGS.inventoryWidth,
      inventoryScale:
        typeof obj.inventoryScale === 'number' && isFinite(obj.inventoryScale) && obj.inventoryScale > 0
          ? obj.inventoryScale
          : DEFAULT_SETTINGS.inventoryScale,
      inventoryHidden: typeof obj.inventoryHidden === 'boolean' ? obj.inventoryHidden : DEFAULT_SETTINGS.inventoryHidden,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: UiSettings, storage: Storage = globalThis.localStorage): void {
  storage.setItem(KEY, JSON.stringify(settings));
}
