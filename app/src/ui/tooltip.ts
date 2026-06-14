let tooltipEl: HTMLDivElement | null = null;

function getOrCreate(): HTMLDivElement {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'nei-tooltip';
    tooltipEl.style.display = 'none';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

const OFFSET_X = 12;
const OFFSET_Y = 14;

export function showTooltip(text: string, x: number, y: number): void {
  const el = getOrCreate();
  el.textContent = text;
  el.style.display = 'block';
  repositionTooltip(x, y);
}

export function repositionTooltip(x: number, y: number): void {
  const el = getOrCreate();
  if (el.style.display === 'none') return;

  // Temporarily position off-screen to measure
  el.style.left = '0px';
  el.style.top = '0px';
  const rect = el.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = x + OFFSET_X;
  let top = y + OFFSET_Y;

  // Clamp so the tooltip stays in the viewport
  if (left + w > vw - 4) left = x - w - OFFSET_X;
  if (left < 4) left = 4;
  if (top + h > vh - 4) top = y - h - 4;
  if (top < 4) top = 4;

  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

export function hideTooltip(): void {
  if (tooltipEl) {
    tooltipEl.style.display = 'none';
  }
}
