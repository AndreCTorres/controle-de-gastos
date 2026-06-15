import { state } from '../state.js';
import { MONTHS, DEFAULT_SECTIONS } from '../constants.js';
import { fmt } from '../utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { loadMonthData, saveMonthData } from '../db.js';
import { buildItemRow } from '../ui/sections.js';
import { recalc } from '../ui/recalc.js';

// ── Parcel (installment purchase) modal ──

let selectedParcelSectionId = null;

window.openParcelModal = function() {
  document.getElementById('parcelTitle').value       = '';
  document.getElementById('parcelTotal').value       = '';
  document.getElementById('parcelCount').value       = '';
  document.getElementById('parcelPreview').style.display = 'none';
  selectedParcelSectionId = null;

  const opts = document.getElementById('parcelSectionOptions');
  opts.innerHTML = '';

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    const sec = state.sections.find(s => s.id === sid);
    if (!sec) return;
    const opt     = document.createElement('div');
    opt.className = 'copy-option';
    opt.dataset.sid = sec.id;

    const check = document.createElement('div');
    check.className = 'copy-option-check';
    check.style.borderRadius = '50%';

    const info = document.createElement('div');
    const labelWrap = document.createElement('div');
    labelWrap.className = 'copy-option-label';

    const tag = document.createElement('span');
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888';
    const safeBg    = /^#[0-9A-Fa-f]{3,8}$/.test(sec.bg    || '') ? sec.bg    : '#eee';
    tag.style.cssText = `display:inline-block;background:${safeBg};color:${safeColor};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px`;
    tag.textContent = sec.title;

    labelWrap.appendChild(tag);
    info.appendChild(labelWrap);
    opt.appendChild(check);
    opt.appendChild(info);

    opt.addEventListener('click', () => {
      opts.querySelectorAll('.copy-option').forEach(o => {
        o.classList.remove('selected');
        o.querySelector('.copy-option-check').textContent = '';
      });
      opt.classList.add('selected');
      opt.querySelector('.copy-option-check').textContent = '✓';
      selectedParcelSectionId = sec.id;
    });
    opts.appendChild(opt);
  });

  openModal('parcelModal', '#parcelTitle');
};

window.closeParcelModal = function() {
  closeModal('parcelModal');
  document.getElementById('parcelOverflowWarn').style.display = 'none';
};

window.updateParcelPreview = function() {
  const total   = parseFloat(document.getElementById('parcelTotal').value) || 0;
  const count   = parseInt(document.getElementById('parcelCount').value)   || 0;
  const preview = document.getElementById('parcelPreview');
  const warn    = document.getElementById('parcelOverflowWarn');

  if (total > 0 && count >= 2) {
    document.getElementById('parcelPreviewText').textContent =
      `${count}x de ${fmt(total / count)} = ${fmt(total)} no total`;
    preview.style.display = 'block';

    let lastMonth = state.currentMonth + (count - 1);
    let lastYear  = state.currentYear;
    while (lastMonth > 11) { lastMonth -= 12; lastYear++; }

    const selectorHorizon = state.currentYear + 2;
    if (lastYear > selectorHorizon) {
      document.getElementById('parcelOverflowYear').textContent = `${MONTHS[lastMonth]}/${lastYear}`;
      warn.style.display = 'block';
    } else {
      warn.style.display = 'none';
    }
  } else {
    preview.style.display = 'none';
    warn.style.display    = 'none';
  }
};

window.confirmParcel = async function() {
  const confirmBtn = document.querySelector('#parcelModal .modal-btn-primary');
  const title = document.getElementById('parcelTitle').value.trim();
  const total = parseFloat(document.getElementById('parcelTotal').value) || 0;
  const count = parseInt(document.getElementById('parcelCount').value)   || 0;

  const flashError = id => {
    const f = document.getElementById(id);
    f.style.borderColor = 'var(--danger)'; f.focus();
    setTimeout(() => f.style.borderColor = 'var(--border)', 1400);
  };
  if (!title)                   { flashError('parcelTitle');  return; }
  if (total <= 0)               { flashError('parcelTotal');  return; }
  if (count < 2)                { flashError('parcelCount');  return; }
  if (!selectedParcelSectionId) { window.showToast('Selecione uma categoria', 'error'); return; }

  confirmBtn.disabled = true;
  const originalBtnText = confirmBtn.textContent;
  confirmBtn.textContent = 'Adicionando...';

  const parcelVal = parseFloat((total / count).toFixed(2));
  const parcels   = [];

  try {
    for (let i = 0; i < count; i++) {
      let m = state.currentMonth + i, y = state.currentYear;
      while (m > 11) { m -= 12; y++; }
      parcels.push({ month: m, year: y, val: parcelVal, num: i + 1, total: count });
    }

    // Persist future months before changing current UI, avoiding a visibly partial operation.
    const future    = parcels.filter(p => !(p.month === state.currentMonth && p.year === state.currentYear));
    const monthsMap = {};

    await Promise.all(future.map(async p => {
      const key = `${p.year}_${p.month}`;
      if (!monthsMap[key]) {
        const existing = await loadMonthData(p.month, p.year);
        monthsMap[key] = existing || {
          incomes:  [{ id: 'main', label: 'Renda principal', val: '' }],
          sections: JSON.parse(JSON.stringify(DEFAULT_SECTIONS)),
        };
      }
      const data = monthsMap[key];
      const sec  = data.sections.find(s => s.id === selectedParcelSectionId);
      if (sec) {
        sec.items.push({
          id:     crypto.randomUUID(),
          label:  `${title} (${p.num}/${p.total})`,
          val:    String(p.val),
          parcel: true,
        });
      }
    }));

    await Promise.all(
      Object.entries(monthsMap).map(([key, data]) => {
        const [y, m] = key.split('_').map(Number);
        return saveMonthData(m, y, data);
      })
    );

    parcels
      .filter(p => p.month === state.currentMonth && p.year === state.currentYear)
      .forEach(p => {
        const sec = state.sections.find(s => s.id === selectedParcelSectionId);
        if (!sec) return;
        const id    = crypto.randomUUID();
        const label = `${title} (${p.num}/${p.total})`;
        sec.items.push({ id, label, val: String(p.val), parcel: true });
        const sectionEl = document.querySelector(`.section[data-sid="${selectedParcelSectionId}"]`);
        if (sectionEl) sectionEl.querySelector('.items-container').appendChild(
          buildItemRow({ id, label, val: String(p.val), parcel: true }, selectedParcelSectionId)
        );
      });

    recalc();
    window.closeParcelModal();
    const secName = state.sections.find(s => s.id === selectedParcelSectionId)?.title || '';
    window.showToast(`${count} parcelas de ${title} adicionadas em ${secName}`);

    // Rebuild month selector to include any new years created by parcels
    // Import lazily to avoid circular dependency with app.js
    const { populateMonths } = await import('../app.js');
    await populateMonths();
  } catch (err) {
    console.error('confirmParcel:', err);
    window.showToast('Não foi possível salvar todas as parcelas. Verifique a conexão e tente novamente.', 'error');
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = originalBtnText;
  }
};

document.getElementById('parcelModal').addEventListener('click', function(e) {
  if (e.target === this) window.closeParcelModal();
});

document.getElementById('parcelTitle').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') window.confirmParcel();
});
