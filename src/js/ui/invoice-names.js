import { state } from '../state.js';
import { snapshotCurrent, persistData } from '../persist.js';
import { originalInvoiceLabel, canNamePurchase, invoiceNameKey, renameInvoiceItem } from '../invoice-names.js';
import { openModal, closeModal } from './modal.js';
import { renderSections } from './sections.js';
import { recalc } from './recalc.js';
let editing = null;
window.openInvoiceName = function(itemId) {
  if (state.busy || state.loading) return;
  const item = state.sections.flatMap(s => s.items).find(i => i.id === itemId);
  if (!item || item.invoicePosition == null) return;
  editing = itemId;
  document.getElementById('invoiceNameOriginal').textContent = originalInvoiceLabel(item);
  document.getElementById('invoiceNameInput').value = item.friendlyName ?? (item.label !== originalInvoiceLabel(item) ? item.label.replace(/\s*\(\d+\/\d+\)\s*$/, '') : '');
  const scope = document.getElementById('invoiceNameScope');
  scope.querySelector('[value="purchase"]').disabled = !canNamePurchase(item, state.sections, state.currentYear, state.currentMonth);
  scope.querySelector('[value="merchant"]').disabled = !invoiceNameKey(item, state.currentYear, state.currentMonth, 'merchant');
  scope.value = item.nameScope ?? (scope.querySelector('[value="purchase"]').disabled ? 'once' : 'purchase');
  if (scope.selectedOptions[0]?.disabled) scope.value = 'once';
  scope.dispatchEvent(new Event('select:sync'));
  document.getElementById('invoiceNameError').textContent = '';
  openModal('invoiceNameModal', '#invoiceNameInput');
  document.getElementById('invoiceNameInput').focus();
};
window.closeInvoiceName = () => closeModal('invoiceNameModal');
document.getElementById('invoiceNameForm').addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy || !editing) return;
  const button = document.getElementById('invoiceNameSave');
  state.busy = true; button.disabled = true;
  try {
    const next = renameInvoiceItem(snapshotCurrent(), editing, document.getElementById('invoiceNameInput').value,
      document.getElementById('invoiceNameScope').value, state.currentYear, state.currentMonth);
    state.sections = next.sections;
    renderSections(); recalc();
    await persistData();
    closeModal('invoiceNameModal');
    window.showToast(document.getElementById('invoiceNameScope').value === 'once' ? 'Nome salvo para este lançamento.' : 'Nome salvo para as próximas importações.');
  } catch (error) {
    document.getElementById('invoiceNameError').textContent = error.message || 'Não foi possível salvar agora. Tente novamente.';
  } finally { state.busy = false; button.disabled = false; }
});
