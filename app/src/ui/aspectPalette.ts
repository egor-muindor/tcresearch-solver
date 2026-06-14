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
  ) {
    this.container.classList.add('aspect-palette');
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.itemEls.clear();

    const sorted = [...this.data.universe].sort((a, b) => {
      const la = this.data.translate.get(a) ?? a;
      const lb = this.data.translate.get(b) ?? b;
      return la.localeCompare(lb);
    });

    for (const aspect of sorted) {
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

      item.addEventListener('click', () => {
        this.setActiveBrush(aspect);
        this.onAspectPick(aspect);
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
      this.container.appendChild(item);
    }
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
