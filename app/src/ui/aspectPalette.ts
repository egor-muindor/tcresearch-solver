import type { Aspect, AspectData } from '../data/aspects';
import { iconUrl } from './icons';
import { showTooltip, repositionTooltip, hideTooltip } from './tooltip';
import { aspectMatchesQuery } from './search';

export class AspectPalette {
  private activeBrush: Aspect | null = null;
  private itemEls = new Map<Aspect, HTMLElement>();
  private searchInput!: HTMLInputElement;
  private gridEl!: HTMLElement;
  /** Group header element keyed by label, so filtering can hide empty groups. */
  private groupHeaders = new Map<string, HTMLElement>();
  private noResultsEl!: HTMLElement;

  constructor(
    private container: HTMLElement,
    private data: AspectData,
    private onAspectPick: (aspect: Aspect) => void,
    private grouped: boolean = true,
  ) {
    this.container.classList.add('aspect-palette');
    this.buildChrome();
    this.render();
  }

  /** Build the persistent parts of the palette (search box + grid wrapper) once. */
  private buildChrome(): void {
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.className = 'aspect-palette__search ui-search';
    this.searchInput.placeholder = 'Search…';
    this.searchInput.setAttribute('aria-label', 'Search aspects');
    this.searchInput.addEventListener('input', () => {
      this.applyFilter();
    });
    this.container.appendChild(this.searchInput);

    this.gridEl = document.createElement('div');
    this.gridEl.className = 'aspect-palette__grid';
    this.container.appendChild(this.gridEl);

    // Empty-search-result hint (hidden unless a query matches nothing)
    this.noResultsEl = document.createElement('div');
    this.noResultsEl.className = 'aspect-palette__no-results';
    this.noResultsEl.hidden = true;
    this.container.appendChild(this.noResultsEl);
  }

  /** Toggle Primal / Compound grouping and re-render, preserving the active brush. */
  setGrouped(grouped: boolean): void {
    if (this.grouped === grouped) return;
    this.grouped = grouped;
    const active = this.activeBrush;
    this.render();
    if (active !== null) this.setActiveBrush(active);
    // Re-apply any active filter so it survives the grouping toggle.
    this.applyFilter();
  }

  private render(): void {
    this.gridEl.innerHTML = '';
    this.itemEls.clear();
    this.groupHeaders.clear();
    this.gridEl.classList.toggle('aspect-palette--grouped', this.grouped);

    // Mod registration order (primals first, then compounds by tier).
    const order = this.data.order;

    if (this.grouped) {
      const primals = order.filter((a) => this.data.primals.has(a));
      const compounds = order.filter((a) => !this.data.primals.has(a));
      this.appendGroup('Primal', primals);
      this.appendGroup('Compound', compounds);
    } else {
      for (const aspect of order) this.gridEl.appendChild(this.buildItem(aspect));
    }
  }

  private appendGroup(label: string, aspects: readonly Aspect[]): void {
    if (aspects.length === 0) return;
    const header = document.createElement('div');
    header.className = 'aspect-palette__group-label';
    header.textContent = label;
    this.gridEl.appendChild(header);
    this.groupHeaders.set(label, header);
    for (const aspect of aspects) this.gridEl.appendChild(this.buildItem(aspect));
  }

  /** Hide non-matching items (and empty group headers) per the current query. */
  private applyFilter(): void {
    const query = this.searchInput.value;
    let visible = 0;
    if (this.grouped) {
      const order = this.data.order;
      visible += this.filterGroup('Primal', order.filter((a) => this.data.primals.has(a)), query);
      visible += this.filterGroup('Compound', order.filter((a) => !this.data.primals.has(a)), query);
    } else {
      for (const [aspect, el] of this.itemEls) {
        const latin = this.data.translate.get(aspect) ?? aspect;
        const matches = aspectMatchesQuery(query, latin, aspect);
        el.classList.toggle('aspect-palette__item--hidden', !matches);
        if (matches) visible++;
      }
    }
    this.noResultsEl.hidden = visible !== 0;
    if (visible === 0) this.noResultsEl.textContent = `No aspects match “${query.trim()}”`;
  }

  /** Filter one group's items; hide the header when no item in it matches. Returns visible count. */
  private filterGroup(label: string, aspects: readonly Aspect[], query: string): number {
    let visible = 0;
    for (const aspect of aspects) {
      const el = this.itemEls.get(aspect);
      if (!el) continue;
      const latin = this.data.translate.get(aspect) ?? aspect;
      const matches = aspectMatchesQuery(query, latin, aspect);
      el.classList.toggle('aspect-palette__item--hidden', !matches);
      if (matches) visible++;
    }
    const header = this.groupHeaders.get(label);
    if (header) header.classList.toggle('aspect-palette__group-label--hidden', visible === 0);
    return visible;
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
