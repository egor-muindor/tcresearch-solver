import type { UiSettings } from '../state/settings';

export interface SettingsPanelCallbacks {
  onChange: (settings: UiSettings) => void;
}

/**
 * Lightweight settings panel.
 * Opens as a modal with backdrop (Esc / backdrop click to close),
 * with range sliders for the four CSS sizing vars + inventory-hide state.
 */
export class SettingsPanel {
  private current: UiSettings;
  private backdrop: HTMLElement | null = null;
  private callbacks: SettingsPanelCallbacks;

  constructor(initialSettings: UiSettings, callbacks: SettingsPanelCallbacks) {
    this.current = { ...initialSettings };
    this.callbacks = callbacks;
  }

  /** Update the internal settings snapshot (e.g. after an external hide/show change). */
  update(settings: UiSettings): void {
    this.current = { ...settings };
  }

  open(): void {
    if (this.backdrop) return; // already open

    const { backdrop, card } = this.buildPanel();
    this.backdrop = backdrop;

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        this.close();
        document.removeEventListener('keydown', onKeyDown);
      }
    };
    document.addEventListener('keydown', onKeyDown);

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.close();
        document.removeEventListener('keydown', onKeyDown);
      }
    });

    document.body.appendChild(backdrop);

    // Focus the close button for keyboard accessibility
    const closeBtn = card.querySelector<HTMLElement>('.settings-panel__close-btn');
    closeBtn?.focus();
  }

  close(): void {
    this.backdrop?.remove();
    this.backdrop = null;
  }

  private buildPanel(): { backdrop: HTMLElement; card: HTMLElement } {
    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop settings-backdrop';

    // Card
    const card = document.createElement('div');
    card.className = 'modal-card settings-panel';

    // Title
    const title = document.createElement('h2');
    title.className = 'settings-panel__title';
    title.textContent = 'Settings';
    card.appendChild(title);

    // Sliders
    const sliders: HTMLElement = document.createElement('div');
    sliders.className = 'settings-panel__sliders';

    sliders.appendChild(
      this.buildSlider('Palette width', 'paletteWidth', 80, 400, 10, this.current.paletteWidth, (v) => {
        this.current = { ...this.current, paletteWidth: v };
        this.callbacks.onChange({ ...this.current });
      }),
    );

    sliders.appendChild(
      this.buildSlider('Palette icon scale', 'paletteScale', 0.5, 3, 0.1, this.current.paletteScale, (v) => {
        this.current = { ...this.current, paletteScale: v };
        this.callbacks.onChange({ ...this.current });
      }),
    );

    sliders.appendChild(
      this.buildSlider('Inventory width', 'inventoryWidth', 100, 500, 10, this.current.inventoryWidth, (v) => {
        this.current = { ...this.current, inventoryWidth: v };
        this.callbacks.onChange({ ...this.current });
      }),
    );

    sliders.appendChild(
      this.buildSlider('Inventory icon scale', 'inventoryScale', 0.5, 3, 0.1, this.current.inventoryScale, (v) => {
        this.current = { ...this.current, inventoryScale: v };
        this.callbacks.onChange({ ...this.current });
      }),
    );

    sliders.appendChild(
      this.buildToggle('Group palette (Primal / Compound)', 'groupAspects', this.current.groupAspects, (v) => {
        this.current = { ...this.current, groupAspects: v };
        this.callbacks.onChange({ ...this.current });
      }),
    );

    card.appendChild(sliders);

    // Close button
    const btnRow = document.createElement('div');
    btnRow.className = 'modal-btn-row settings-panel__btn-row';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'modal-btn settings-panel__close-btn';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => {
      this.close();
    });
    btnRow.appendChild(closeBtn);

    card.appendChild(btnRow);
    backdrop.appendChild(card);

    return { backdrop, card };
  }

  private buildSlider(
    label: string,
    key: string,
    min: number,
    max: number,
    step: number,
    initial: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-panel__slider-row';

    const labelEl = document.createElement('label');
    labelEl.className = 'settings-panel__slider-label';
    labelEl.htmlFor = 'settings-slider-' + key;
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const controls = document.createElement('div');
    controls.className = 'settings-panel__slider-controls';

    const input = document.createElement('input');
    input.type = 'range';
    input.id = 'settings-slider-' + key;
    input.className = 'settings-panel__slider';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(initial);

    const valueEl = document.createElement('span');
    valueEl.className = 'settings-panel__slider-value';
    valueEl.textContent = String(initial);

    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valueEl.textContent = String(v);
      onChange(v);
    });

    controls.appendChild(input);
    controls.appendChild(valueEl);
    row.appendChild(controls);

    return row;
  }

  private buildToggle(
    label: string,
    key: string,
    initial: boolean,
    onChange: (v: boolean) => void,
  ): HTMLElement {
    const row = document.createElement('div');
    row.className = 'settings-panel__slider-row settings-panel__toggle-row';

    const labelEl = document.createElement('label');
    labelEl.className = 'settings-panel__slider-label';
    labelEl.htmlFor = 'settings-toggle-' + key;
    labelEl.textContent = label;
    row.appendChild(labelEl);

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'settings-toggle-' + key;
    input.className = 'settings-panel__toggle';
    input.checked = initial;
    input.addEventListener('change', () => onChange(input.checked));
    row.appendChild(input);

    return row;
  }
}
