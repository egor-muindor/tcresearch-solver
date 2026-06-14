import type { Aspect, AspectData } from '../data/aspects';
import { iconUrl } from './icons';
import { showTooltip, repositionTooltip, hideTooltip } from './tooltip';

export class AspectPalette {
  private activeBrush: Aspect | null = null;
  private itemEls = new Map<Aspect, HTMLElement>();

  constructor(
    private container: HTMLElement,
    private data: AspectData,
    private onAspectPick: (aspect: Aspect) => void,
    private grouped: boolean = true,
  ) {
    this.container.classList.add('aspect-palette');
    this.render();
  }

  /** Toggle Primal / Compound grouping and re-render, preserving the active brush. */
  setGrouped(grouped: boolean): void {
    if (this.grouped === grouped) return;
    this.grouped = grouped;
    const active = this.activeBrush;
    this.render();
    if (active !== null) this.setActiveBrush(active);
  }

  private render(): void {
    this.container.innerHTML = '';
    this.itemEls.clear();
    this.container.classList.toggle('aspect-palette--grouped', this.grouped);

    // Mod registration order (primals first, then compounds by tier).
    const order = this.data.order;

    if (this.grouped) {
      const primals = order.filter((a) => this.data.primals.has(a));
      const compounds = order.filter((a) => !this.data.primals.has(a));
      this.appendGroup('Primal', primals);
      this.appendGroup('Compound', compounds);
    } else {
      for (const aspect of order) this.container.appendChild(this.buildItem(aspect));
    }
  }

  private appendGroup(label: string, aspects: readonly Aspect[]): void {
    if (aspects.length === 0) return;
    const header = document.createElement('div');
    header.className = 'aspect-palette__group-label';
    header.textContent = label;
    this.container.appendChild(header);
    for (const aspect of aspects) this.container.appendChild(this.buildItem(aspect));
  }

  private buildItem(aspect: Aspect): HTMLElement {
    const latin = this.data.translate.get(aspect) ?? aspect;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'aspect-palette__item';
    // No title attribute — custom NEI tooltip is used instead
    item.setAttribute('aria-label', latin);

    const img = document.createElement('img');
    img.src = iconUrl(this.data, aspect);
    img.alt = latin;
    img.width = 22;
    img.height = 22;
    img.className = 'aspect-palette__icon';

    item.appendChild(img);

    item.setAttribute('draggable', 'true');

    item.addEventListener('click', () => {
      this.setActiveBrush(aspect);
      this.onAspectPick(aspect);
    });

    item.addEventListener('dragstart', (e: DragEvent) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.effectAllowed = 'copy';
      e.dataTransfer.setData('text/plain', aspect);
    });

    item.addEventListener('mouseenter', (e: MouseEvent) => {
      showTooltip(latin, e.clientX, e.clientY);
    });
    item.addEventListener('mousemove', (e: MouseEvent) => {
      repositionTooltip(e.clientX, e.clientY);
    });
    item.addEventListener('mouseleave', () => {
      hideTooltip();
    });

    this.itemEls.set(aspect, item);
    return item;
  }

  /** Programmatically set active brush (called by shell after board click etc.) */
  setActiveBrush(aspect: Aspect | null): void {
    if (this.activeBrush !== null) {
      const prev = this.itemEls.get(this.activeBrush);
      if (prev) prev.classList.remove('aspect-palette__item--active');
    }
    this.activeBrush = aspect;
    if (aspect !== null) {
      const el = this.itemEls.get(aspect);
      if (el) el.classList.add('aspect-palette__item--active');
    }
  }

  getActiveBrush(): Aspect | null {
    return this.activeBrush;
  }
}
