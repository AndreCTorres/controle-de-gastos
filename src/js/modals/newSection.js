import { state } from '../state.js';
import { NEW_SEC_COLORS } from '../constants.js';
import { openModal, closeModal } from '../ui/modal.js';
import { buildSection } from '../ui/sections.js';
import { recalc } from '../ui/recalc.js';

// ── New section modal ──

let newSecColorIdx = 0;

window.openNewSectionModal = function() {
  document.getElementById('newSectionTitle').value = '';
  document.getElementById('newSectionItems').innerHTML = '';
  window.addNewSectionItem();
  openModal('newSectionModal', '#newSectionTitle');
};

window.closeNewSectionModal = function() {
  closeModal('newSectionModal');
};

window.addNewSectionItem = function() {
  const wrap = document.getElementById('newSectionItems');
  const row  = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px';
  row.innerHTML = `
    <input type="text" placeholder="Nome do item" class="modal-input"
      onfocus="this.style.borderColor='var(--primary)'" onblur="this.style.borderColor='var(--border)'">
    <button title="Remover" style="width:28px;height:28px;border:none;background:transparent;color:#ccc;cursor:pointer;border-radius:5px;font-size:17px;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all 0.15s"
      onmouseover="this.style.background='var(--danger-light)';this.style.color='var(--danger)'"
      onmouseout="this.style.background='transparent';this.style.color='#ccc'"
      onclick="this.parentElement.remove()">×</button>`;
  wrap.appendChild(row);
  row.querySelector('input').focus();
};

window.confirmNewSection = function() {
  const title = document.getElementById('newSectionTitle').value.trim();
  if (!title) {
    const inp = document.getElementById('newSectionTitle');
    inp.style.borderColor = 'var(--danger)'; inp.focus();
    setTimeout(() => inp.style.borderColor = 'var(--border)', 1400);
    return;
  }

  const items = [...document.getElementById('newSectionItems').querySelectorAll('input')]
    .map(inp => inp.value.trim())
    .filter(Boolean)
    .map((label, i) => ({ id: 'cs_' + Date.now() + '_' + i, label, val: '' }));

  const palette = NEW_SEC_COLORS[newSecColorIdx % NEW_SEC_COLORS.length];
  newSecColorIdx++;

  const newSec = {
    id:    'custom_' + Date.now(),
    title,
    color: palette.color,
    bg:    palette.bg,
    items: items.length > 0 ? items : [{ id: 'cs_' + Date.now(), label: '', val: '' }],
  };

  state.sections.push(newSec);
  document.getElementById('sections-container').appendChild(buildSection(newSec));
  recalc();
  window.closeNewSectionModal();
  window.showToast(`Categoria "${title}" criada!`);
};

document.getElementById('newSectionModal').addEventListener('click', function(e) {
  if (e.target === this) window.closeNewSectionModal();
});

document.getElementById('newSectionTitle').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') window.confirmNewSection();
});
