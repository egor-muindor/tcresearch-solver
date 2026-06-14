import type { Aspect, AspectData } from '../data/aspects';
import { iconUrl } from './icons';

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
      item.title = latin;
      item.setAttribute('aria-label', latin);

      const img = document.createElement('img');
      img.src = iconUrl(this.data, aspect);
      img.alt = latin;
      img.width = 24;
      img.height = 24;
      img.className = 'aspect-palette__icon';

      const label = document.createElement('span');
      label.className = 'aspect-palette__label';
      label.textContent = latin;

      item.appendChild(img);
      item.appendChild(label);

      item.addEventListener('click', () => {
        this.setActiveBrush(aspect);
        this.onAspectPick(aspect);
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
