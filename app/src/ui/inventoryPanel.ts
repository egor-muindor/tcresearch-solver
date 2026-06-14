import type { Aspect, AspectData } from '../data/aspects';
import type { AllocationResult } from '../core/inventory';
import { iconUrl } from './icons';

export interface InventoryCallbacks {
  onSupplyChange: (aspect: Aspect, count: number) => void;
  onThresholdChange: (n: number) => void;
  onSubtractUsed: () => void;
}

export class InventoryPanel {
  private supplyInputs = new Map<Aspect, HTMLInputElement>();
  private thresholdInput!: HTMLInputElement;
  private allocArea!: HTMLElement;
  private lastAlloc: AllocationResult | null = null;

  constructor(
    private container: HTMLElement,
    private data: AspectData,
    private callbacks: InventoryCallbacks,
  ) {
    this.container.classList.add('inventory-panel');
    this.build();
  }

  private build(): void {
    this.container.innerHTML = '';

    // Threshold row
    const threshRow = document.createElement('div');
    threshRow.className = 'inventory-panel__thresh-row';

    const threshLabel = document.createElement('label');
    threshLabel.textContent = 'Порог:';
    threshLabel.className = 'inventory-panel__thresh-label';

    this.thresholdInput = document.createElement('input');
    this.thresholdInput.type = 'number';
    this.thresholdInput.min = '1';
    this.thresholdInput.step = '1';
    this.thresholdInput.value = '50';
    this.thresholdInput.className = 'inventory-panel__thresh-input';
    threshLabel.htmlFor = 'inv-threshold';
    this.thresholdInput.id = 'inv-threshold';

    this.thresholdInput.addEventListener('change', () => {
      const v = this.parsePositiveInt(this.thresholdInput.value, 50);
      this.thresholdInput.value = String(v);
      this.callbacks.onThresholdChange(v);
    });

    threshRow.appendChild(threshLabel);
    threshRow.appendChild(this.thresholdInput);
    this.container.appendChild(threshRow);

    // Allocation summary area
    this.allocArea = document.createElement('div');
    this.allocArea.className = 'inventory-panel__alloc';
    this.allocArea.textContent = '—';
    this.container.appendChild(this.allocArea);

    // Subtract used button
    const subtractBtn = document.createElement('button');
    subtractBtn.type = 'button';
    subtractBtn.className = 'inventory-panel__subtract-btn';
    subtractBtn.textContent = 'Вычесть использованное';
    subtractBtn.addEventListener('click', () => {
      this.callbacks.onSubtractUsed();
    });
    this.container.appendChild(subtractBtn);

    // Supply list
    const listEl = document.createElement('div');
    listEl.className = 'inventory-panel__list';

    const sorted = [...this.data.universe].sort((a, b) => {
      const la = this.data.translate.get(a) ?? a;
      const lb = this.data.translate.get(b) ?? b;
      return la.localeCompare(lb);
    });

    for (const aspect of sorted) {
      const latin = this.data.translate.get(aspect) ?? aspect;

      const row = document.createElement('div');
      row.className = 'inventory-panel__row';

      const img = document.createElement('img');
      img.src = iconUrl(this.data, aspect);
      img.alt = latin;
      img.width = 20;
      img.height = 20;
      img.className = 'inventory-panel__icon';

      const label = document.createElement('label');
      label.textContent = latin;
      label.className = 'inventory-panel__aspect-label';
      const inputId = `inv-supply-${aspect}`;
      label.htmlFor = inputId;

      const input = document.createElement('input');
      input.type = 'number';
      input.id = inputId;
      input.min = '0';
      input.step = '1';
      input.value = '0';
      input.className = 'inventory-panel__supply-input';

      input.addEventListener('change', () => {
        const v = this.parseNonNegInt(input.value, 0);
        input.value = String(v);
        this.callbacks.onSupplyChange(aspect, v);
      });

      this.supplyInputs.set(aspect, input);

      row.appendChild(img);
      row.appendChild(label);
      row.appendChild(input);
      listEl.appendChild(row);
    }

    this.container.appendChild(listEl);
  }

  // --- public API ---

  /** Update supply input for an aspect (e.g. after Subtract used applied by shell). */
  setSupply(aspect: Aspect, count: number): void {
    const input = this.supplyInputs.get(aspect);
    if (input) input.value = String(Math.max(0, Math.floor(count)));
  }

  /** Read current supply as array of [aspect, count] for nonzero entries. */
  getSupply(): Array<[Aspect, number]> {
    const result: Array<[Aspect, number]> = [];
    for (const [aspect, input] of this.supplyInputs) {
      const v = parseInt(input.value, 10);
      if (Number.isInteger(v) && v > 0) result.push([aspect, v]);
    }
    return result;
  }

  /** Read current threshold (positive integer, default 50). */
  getThreshold(): number {
    return this.parsePositiveInt(this.thresholdInput.value, 50);
  }

  /** Show allocation result in the panel (craftOps + leaf consumption breakdown). */
  setAllocation(alloc: AllocationResult): void {
    this.lastAlloc = alloc;
    this.renderAlloc();
  }

  clearAllocation(): void {
    this.lastAlloc = null;
    this.allocArea.textContent = '—';
  }

  private renderAlloc(): void {
    if (!this.lastAlloc) {
      this.allocArea.textContent = '—';
      return;
    }
    const alloc = this.lastAlloc;
    this.allocArea.innerHTML = '';

    const opsLine = document.createElement('div');
    const feasStr =
      alloc.feasible === true ? 'Возможно' :
      alloc.feasible === false ? 'Невозможно' : 'Неизвестно';
    opsLine.textContent = `${feasStr} · крафтов: ${alloc.craftOps}`;
    this.allocArea.appendChild(opsLine);

    if (alloc.leafConsumption.size > 0) {
      const title = document.createElement('div');
      title.className = 'inventory-panel__alloc-title';
      title.textContent = 'Прямые расходы:';
      this.allocArea.appendChild(title);

      for (const [aspect, count] of alloc.leafConsumption) {
        const latin = this.data.translate.get(aspect) ?? aspect;
        const row = document.createElement('div');
        row.className = 'inventory-panel__alloc-row';

        const img = document.createElement('img');
        img.src = iconUrl(this.data, aspect);
        img.alt = latin;
        img.width = 16;
        img.height = 16;

        const text = document.createElement('span');
        text.textContent = `${latin}: ${count}`;

        row.appendChild(img);
        row.appendChild(text);
        this.allocArea.appendChild(row);
      }
    }
  }

  // --- helpers ---

  private parseNonNegInt(s: string, fallback: number): number {
    const v = parseInt(s, 10);
    return Number.isInteger(v) && v >= 0 ? v : fallback;
  }

  private parsePositiveInt(s: string, fallback: number): number {
    const v = parseInt(s, 10);
    return Number.isInteger(v) && v > 0 ? v : fallback;
  }
}
