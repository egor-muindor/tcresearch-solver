/** Guided help tour — lightweight, closure-based, zero globals. */

export interface TourStep {
  selector: string;
  title: string;
  text: string;
}

export function startTour(steps: TourStep[]): void {
  // Filter out steps whose selector matches nothing.
  const validSteps = steps.filter((s) => !!document.querySelector(s.selector));
  if (validSteps.length === 0) return;

  let current = 0;

  // --- DOM nodes ---
  const backdrop = document.createElement('div');
  backdrop.className = 'tour-backdrop';

  const highlight = document.createElement('div');
  highlight.className = 'tour-highlight';

  const card = document.createElement('div');
  card.className = 'tour-card';

  document.body.appendChild(backdrop);
  document.body.appendChild(highlight);
  document.body.appendChild(card);

  // --- helpers ---
  function close(): void {
    backdrop.remove();
    highlight.remove();
    card.remove();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
  }

  function positionHighlight(el: Element): void {
    const rect = el.getBoundingClientRect();
    const pad = 4;
    highlight.style.left = rect.left - pad + 'px';
    highlight.style.top = rect.top - pad + 'px';
    highlight.style.width = rect.width + pad * 2 + 'px';
    highlight.style.height = rect.height + pad * 2 + 'px';
  }

  function positionCard(el: Element): void {
    const rect = el.getBoundingClientRect();
    const cardW = 260;
    const gap = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Try: right of target, left of target, below, above.
    let left: number;
    let top: number;

    if (rect.right + cardW + gap < vw) {
      // Right
      left = rect.right + gap;
      top = Math.max(8, Math.min(rect.top, vh - card.offsetHeight - 8));
    } else if (rect.left - cardW - gap > 0) {
      // Left
      left = rect.left - cardW - gap;
      top = Math.max(8, Math.min(rect.top, vh - card.offsetHeight - 8));
    } else if (rect.bottom + 120 + gap < vh) {
      // Below
      left = Math.max(8, Math.min(rect.left, vw - cardW - 8));
      top = rect.bottom + gap;
    } else {
      // Above
      left = Math.max(8, Math.min(rect.left, vw - cardW - 8));
      top = Math.max(8, rect.top - 120 - gap);
    }

    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.width = cardW + 'px';
  }

  function renderStep(index: number): void {
    const step = validSteps[index];
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (!el) {
      // Should not happen (filtered above), but be safe.
      if (index < validSteps.length - 1) {
        renderStep(index + 1);
      } else {
        close();
      }
      return;
    }

    // Highlight
    positionHighlight(el);

    // Card content
    card.innerHTML = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'tour-card__title';
    titleEl.textContent = step.title;
    card.appendChild(titleEl);

    const textEl = document.createElement('div');
    textEl.className = 'tour-card__text';
    textEl.textContent = step.text;
    card.appendChild(textEl);

    const counterEl = document.createElement('div');
    counterEl.className = 'tour-card__counter';
    counterEl.textContent = index + 1 + ' / ' + validSteps.length;
    card.appendChild(counterEl);

    const btnRow = document.createElement('div');
    btnRow.className = 'tour-card__btn-row';

    if (index > 0) {
      const backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.className = 'tour-card__btn';
      backBtn.textContent = 'Back';
      backBtn.addEventListener('click', () => {
        current = index - 1;
        renderStep(current);
      });
      btnRow.appendChild(backBtn);
    }

    const isLast = index === validSteps.length - 1;
    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'tour-card__btn tour-card__btn--primary';
    nextBtn.textContent = isLast ? 'Done' : 'Next';
    nextBtn.addEventListener('click', () => {
      if (isLast) {
        close();
      } else {
        current = index + 1;
        renderStep(current);
      }
    });
    btnRow.appendChild(nextBtn);

    // On the last step the primary "Done" button already closes the tour,
    // so the separate Close button would be redundant — omit it there.
    if (!isLast) {
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'tour-card__btn tour-card__btn--close';
      closeBtn.textContent = 'Close';
      closeBtn.addEventListener('click', close);
      btnRow.appendChild(closeBtn);
    }

    card.appendChild(btnRow);

    // Position card after DOM update (offsetHeight needs layout)
    requestAnimationFrame(() => {
      positionCard(el);
    });
  }

  function onResize(): void {
    const step = validSteps[current];
    if (!step) return;
    const el = document.querySelector(step.selector);
    if (el) {
      positionHighlight(el);
      positionCard(el);
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      close();
    }
  }

  // Clicking the backdrop closes the tour.
  backdrop.addEventListener('click', close);

  window.addEventListener('resize', onResize);
  window.addEventListener('keydown', onKey);

  renderStep(current);
}
