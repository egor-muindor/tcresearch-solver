/**
 * Promise-based custom confirm dialog that replaces native window.confirm().
 * Matches the parchment/wood Thaumcraft theme via CSS classes:
 *   .modal-backdrop, .modal-card, .modal-message,
 *   .modal-btn, .modal-btn--confirm, .modal-btn--cancel
 */
export function confirmDialog(
  message: string,
  opts?: { confirmText?: string; cancelText?: string },
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;

    function settle(result: boolean): void {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
      resolve(result);
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        settle(false);
      }
    }

    // Backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        settle(false);
      }
    });

    // Card
    const card = document.createElement('div');
    card.className = 'modal-card';

    // Message
    const msgEl = document.createElement('p');
    msgEl.className = 'modal-message';
    msgEl.textContent = message;
    card.appendChild(msgEl);

    // Button row
    const btnRow = document.createElement('div');
    btnRow.className = 'modal-btn-row';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'modal-btn modal-btn--cancel';
    cancelBtn.textContent = opts?.cancelText ?? 'Cancel';
    cancelBtn.addEventListener('click', () => settle(false));
    btnRow.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'modal-btn modal-btn--confirm';
    confirmBtn.textContent = opts?.confirmText ?? 'OK';
    confirmBtn.addEventListener('click', () => settle(true));
    btnRow.appendChild(confirmBtn);

    card.appendChild(btnRow);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    document.addEventListener('keydown', onKeyDown);

    // Focus the confirm button so Enter/Esc work immediately
    confirmBtn.focus();
  });
}
