// ── Modal focus management ──

let _modalPrevFocus = null;

export function openModal(id, firstFocusSelector = null) {
  _modalPrevFocus = document.activeElement;
  const overlay = document.getElementById(id);
  overlay.classList.add('open');

  // Focus first interactive element after CSS animation (200ms)
  setTimeout(() => {
    const target = firstFocusSelector
      ? overlay.querySelector(firstFocusSelector)
      : overlay.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (target) target.focus();
  }, 220);

  // Focus trap: Tab/Shift+Tab stay inside the modal
  overlay._focusTrap = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = [...overlay.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(el => !el.closest('[style*="display:none"]'));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  overlay.addEventListener('keydown', overlay._focusTrap);

  // Close on Escape
  overlay._escHandler = (e) => {
    if (e.key === 'Escape') overlay.querySelector('.modal-close')?.click();
  };
  document.addEventListener('keydown', overlay._escHandler);
}

export function closeModal(id) {
  const overlay = document.getElementById(id);
  overlay.classList.remove('open');
  if (overlay._focusTrap)  { overlay.removeEventListener('keydown', overlay._focusTrap); overlay._focusTrap = null; }
  if (overlay._escHandler) { document.removeEventListener('keydown', overlay._escHandler); overlay._escHandler = null; }
  if (_modalPrevFocus) { _modalPrevFocus.focus(); _modalPrevFocus = null; }
}
