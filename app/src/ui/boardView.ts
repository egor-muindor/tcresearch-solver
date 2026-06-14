import type { AspectData } from '../data/aspects';
import { type Board, type ValidationError, getState } from '../core/board';
import { boardCells, type Hex, hexKey } from '../core/hex';
import { hexToPixel, hexCorners } from './layout';
import { iconUrl } from './icons';

const SIZE = 26;
const SVG_NS = 'http://www.w3.org/2000/svg';
const PADDING = 4;

// Parchment fill for normal cells.
const FILL_EMPTY = '#f5e6c8';
// Dead cells use a visually distinct grey.
const FILL_DEAD = '#888';
// Stroke colours.
const STROKE_NORMAL = '#8b7355';
const STROKE_ANCHOR = '#ffd700';
const STROKE_ERROR = '#e53e3e';
const STROKE_WIDTH_NORMAL = '1';
const STROKE_WIDTH_ANCHOR = '3';
const STROKE_WIDTH_ERROR = '3';
// Hatch pattern id (unique per instance would require UUIDs; one per document is fine for our app).
const HATCH_PATTERN_ID = 'dead-hatch';

export class BoardView {
  private svg: SVGSVGElement;

  constructor(
    private container: HTMLElement,
    private data: AspectData,
    private onCellClick: (h: Hex) => void,
  ) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('role', 'img');
    this.svg.setAttribute('aria-label', 'Research board');
    this.svg.style.display = 'block';

    // Single delegated click handler on the SVG.
    this.svg.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as SVGElement | null;
      if (!target) return;
      // Walk up to find the polygon that carries data-coord.
      let el: SVGElement | null = target;
      while (el && el !== this.svg) {
        const coord = el.getAttribute('data-coord');
        if (coord) {
          const parts = coord.split(',');
          if (parts.length === 2) {
            const q = parseInt(parts[0]!, 10);
            const r = parseInt(parts[1]!, 10);
            if (!isNaN(q) && !isNaN(r)) {
              this.onCellClick({ q, r });
            }
          }
          return;
        }
        el = el.parentElement as SVGElement | null;
      }
    });

    this.container.appendChild(this.svg);
  }

  render(board: Board, errors: ValidationError[] = []): void {
    const cells = boardCells(board.radius);

    // Compute pixel bounds.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const hex of cells) {
      const center = hexToPixel(hex, SIZE);
      const corners = hexCorners(center, SIZE);
      for (const c of corners) {
        if (c.x < minX) minX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.x > maxX) maxX = c.x;
        if (c.y > maxY) maxY = c.y;
      }
    }

    const vx = minX - PADDING;
    const vy = minY - PADDING;
    const vw = maxX - minX + PADDING * 2;
    const vh = maxY - minY + PADDING * 2;

    this.svg.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`);
    this.svg.setAttribute('width', String(vw));
    this.svg.setAttribute('height', String(vh));

    // Clear previous children.
    while (this.svg.firstChild) this.svg.removeChild(this.svg.firstChild);

    // Build defs with hatch pattern for DEAD cells.
    const defs = document.createElementNS(SVG_NS, 'defs');

    const pattern = document.createElementNS(SVG_NS, 'pattern');
    pattern.setAttribute('id', HATCH_PATTERN_ID);
    pattern.setAttribute('patternUnits', 'userSpaceOnUse');
    pattern.setAttribute('width', '6');
    pattern.setAttribute('height', '6');

    const patBg = document.createElementNS(SVG_NS, 'rect');
    patBg.setAttribute('width', '6');
    patBg.setAttribute('height', '6');
    patBg.setAttribute('fill', FILL_DEAD);
    pattern.appendChild(patBg);

    const line1 = document.createElementNS(SVG_NS, 'line');
    line1.setAttribute('x1', '0'); line1.setAttribute('y1', '0');
    line1.setAttribute('x2', '6'); line1.setAttribute('y2', '6');
    line1.setAttribute('stroke', '#555'); line1.setAttribute('stroke-width', '1.5');
    pattern.appendChild(line1);

    const line2 = document.createElementNS(SVG_NS, 'line');
    line2.setAttribute('x1', '6'); line2.setAttribute('y1', '0');
    line2.setAttribute('x2', '0'); line2.setAttribute('y2', '6');
    line2.setAttribute('stroke', '#555'); line2.setAttribute('stroke-width', '1.5');
    pattern.appendChild(line2);

    defs.appendChild(pattern);
    this.svg.appendChild(defs);

    // Build set of error cells for O(1) lookup.
    const errorKeys = new Set<string>();
    for (const err of errors) {
      for (const h of err.cells) errorKeys.add(hexKey(h));
    }

    // Draw each cell.
    for (const hex of cells) {
      const state = getState(board, hex);
      const center = hexToPixel(hex, SIZE);
      const corners = hexCorners(center, SIZE);
      const key = hexKey(hex);
      const isError = errorKeys.has(key);

      // Build points string for polygon.
      const points = corners.map((c) => `${c.x},${c.y}`).join(' ');

      // Determine fill and stroke.
      const isDead = state.kind === 'DEAD';
      const isAnchor = state.kind === 'ANCHOR';

      const fill = isDead ? `url(#${HATCH_PATTERN_ID})` : FILL_EMPTY;
      const stroke = isError ? STROKE_ERROR : isAnchor ? STROKE_ANCHOR : STROKE_NORMAL;
      const strokeWidth = isError ? STROKE_WIDTH_ERROR : isAnchor ? STROKE_WIDTH_ANCHOR : STROKE_WIDTH_NORMAL;

      // Group element for the cell.
      const g = document.createElementNS(SVG_NS, 'g');

      const polygon = document.createElementNS(SVG_NS, 'polygon');
      polygon.setAttribute('points', points);
      polygon.setAttribute('fill', fill);
      polygon.setAttribute('stroke', stroke);
      polygon.setAttribute('stroke-width', strokeWidth);
      polygon.setAttribute('stroke-linejoin', 'round');
      polygon.setAttribute('data-coord', key);
      polygon.style.cursor = 'pointer';
      g.appendChild(polygon);

      // For ANCHOR cells add a second ring for the highlighted border effect.
      if (isAnchor && !isError) {
        const ring = document.createElementNS(SVG_NS, 'polygon');
        ring.setAttribute('points', points);
        ring.setAttribute('fill', 'none');
        ring.setAttribute('stroke', STROKE_ANCHOR);
        ring.setAttribute('stroke-width', '3');
        ring.setAttribute('stroke-linejoin', 'round');
        ring.setAttribute('data-coord', key);
        ring.style.cursor = 'pointer';
        g.appendChild(ring);
      }

      // Draw icon for ANCHOR and PLACED cells.
      if (state.kind === 'ANCHOR' || state.kind === 'PLACED') {
        const aspect = state.aspect;
        const iconSize = SIZE * 1.2;
        const img = document.createElementNS(SVG_NS, 'image');
        img.setAttribute('href', iconUrl(this.data, aspect));
        img.setAttribute('x', String(center.x - iconSize / 2));
        img.setAttribute('y', String(center.y - iconSize / 2));
        img.setAttribute('width', String(iconSize));
        img.setAttribute('height', String(iconSize));
        img.setAttribute('data-coord', key);
        img.style.cursor = 'pointer';
        g.appendChild(img);
      }

      this.svg.appendChild(g);
    }
  }
}
