import { supabase } from './config.js';
import { loadMonthData, loadYearGoals, loadMonthsWithData } from './db.js';
import { state } from './state.js';
import { MONTHS, DEFAULT_SECTIONS } from './constants.js';

// ── UI modules (import registers listeners and window.* assignments) ──
import './ui/toast.js';
import './ui/offline.js';
import { getTotalIncome } from './ui/recalc.js';
import { renderIncomes } from './ui/income.js';
import { renderSections } from './ui/sections.js';
import { openModal, closeModal } from './ui/modal.js';

// ── Modal modules (import registers window.* assignments and DOM listeners) ──
import './modals/copy.js';
import './modals/newSection.js';
import './modals/parcel.js';
import './modals/goals.js';
import './modals/import.js';
import './modals/yearReport.js';
import { initFeedbackWidget } from './ui/feedback.js';

// ── Month navigation ──

async function loadMonth() {
  document.getElementById('sections-container').style.opacity = '0.5';

  let data = null;
  let fromCache = false;
  try {
    data = await loadMonthData(state.currentMonth, state.currentYear);
  } catch (err) {
    document.getElementById('sections-container').style.opacity = '1';

    if (err.fromCache && err.cachedData) {
      data      = err.cachedData;
      fromCache = true;
      const { showOfflineBanner } = await import('./ui/offline.js');
      showOfflineBanner();
    } else {
      window.showToast('Erro ao carregar dados. Verifique sua conexão e tente novamente.', 'error');
      return;
    }
  }

  if (data) {
    state.incomes  = data.incomes  || [{ id: 'main', label: 'Renda principal', val: '' }];
    state.sections = data.sections || JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
    state.sections = state.sections.map(s => {
      const def = DEFAULT_SECTIONS.find(d => d.id === s.id);
      return { ...s, bg: s.bg || (def ? def.bg : '#F0F0F0') };
    });
  } else {
    state.incomes  = [{ id: 'main', label: 'Renda principal', val: '' }];
    state.sections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
  }

  renderIncomes();
  renderSections();

  // recalc is imported lazily here to avoid circular dependency
  const { recalc } = await import('./ui/recalc.js');
  recalc();
  document.getElementById('sections-container').style.opacity = '1';

  if (!fromCache) {
    const { hideOfflineBanner } = await import('./ui/offline.js');
    hideOfflineBanner();
  }
}

export async function populateMonths() {

  const dropdown = document.getElementById('monthDropdown');
  dropdown.innerHTML = '';

  let startYear = 2026;
  let endYear   = state.currentYear + 2;

  try {
    const saved = await loadMonthsWithData();
    if (saved.length > 0) {
      const years = saved.map(s => s.year);
      startYear = Math.min(startYear, Math.min(...years));
      endYear   = Math.max(endYear,   Math.max(...years));
    }
  } catch (e) { /* silent fallback */ }

  for (let y = startYear; y <= endYear; y++) {
    const grp = document.createElement('div');
    grp.className   = 'month-year-group';
    grp.textContent = y;
    dropdown.appendChild(grp);

    MONTHS.forEach((m, i) => {
      const opt       = document.createElement('div');
      opt.className   = 'month-opt' + (i === state.currentMonth && y === state.currentYear ? ' selected' : '');
      opt.textContent = `${m} ${y}`;
      opt.dataset.m   = i;
      opt.dataset.y   = y;
      opt.addEventListener('click', async function(e) {
        e.stopPropagation();
        const prevYear = state.currentYear;
        state.currentMonth = parseInt(this.dataset.m);
        state.currentYear  = parseInt(this.dataset.y);
        updateMonthChipLabel();
        dropdown.querySelectorAll('.month-opt').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        closeMonthDropdown();
        if (state.currentYear !== prevYear) {
          loadYearGoals(state.currentYear).then(g => { state.yearGoals = g || {}; }).catch(() => {});
        }
        await loadMonth();
      });
      dropdown.appendChild(opt);
    });
  }
  updateMonthChipLabel();
}

function updateMonthChipLabel() {
  document.getElementById('monthChipValue').textContent = `${MONTHS[state.currentMonth]} ${state.currentYear}`;
}

window.toggleMonthDropdown = function() {
  const chip   = document.getElementById('monthChip');
  const isOpen = chip.classList.contains('open');
  if (isOpen) {
    closeMonthDropdown();
  } else {
    chip.classList.add('open');
    setTimeout(() => {
      const sel = document.getElementById('monthDropdown').querySelector('.month-opt.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }, 50);
  }
};

function closeMonthDropdown() {
  document.getElementById('monthChip').classList.remove('open');
}

// ── CSV Export ──

window.exportCSV = function() {
  const renda = getTotalIncome();
  let csv = `Controle de Gastos - ${MONTHS[state.currentMonth]} ${state.currentYear}\n\nRENDAS\n`;

  state.incomes.forEach(inc => {
    const v = parseFloat(document.querySelector(`.income-row[data-iid="${inc.id}"] .income-input`)?.value) || 0;
    csv += `${inc.label};${v.toFixed(2).replace('.', ',')}\n`;
  });
  csv += `Total Renda;${renda.toFixed(2).replace('.', ',')}\n`;

  let total = 0;
  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid   = el.dataset.sid;
    const sec   = state.sections.find(s => s.id === sid);
    const title = el.querySelector('.section-tag').textContent;
    csv += `\n${title};color:${sec?.color || ''};bg:${sec?.bg || ''}\n`;
    el.querySelectorAll('.item-row[data-iid]').forEach(row => {
      const label = row.querySelector('.label-input').value || 'Item';
      const v     = parseFloat(row.querySelector('.amount-input').value) || 0;
      csv += `${label};${v.toFixed(2).replace('.', ',')}\n`;
      if (v > 0) total += v;
    });
  });
  csv += `\nTOTAL DESPESAS;${total.toFixed(2).replace('.', ',')}\nSALDO;${(renda - total).toFixed(2).replace('.', ',')}\n`;

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `gastos_${MONTHS[state.currentMonth]}_${state.currentYear}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
};

// ── PDF Export ──

window.exportPDF = function() {
  let ph = document.getElementById('print-header-inject');
  if (!ph) {
    ph = document.createElement('div');
    ph.id = 'print-header-inject';
    ph.className = 'print-header';
    document.querySelector('.main').prepend(ph);
  }
  const renda    = getTotalIncome();
  const despesas = document.getElementById('stat-despesas').textContent;
  const saldo    = document.getElementById('stat-saldo').textContent;
  const saldoNeg = parseFloat(saldo.replace(/[^\d,\-]/g, '').replace(',', '.')) < 0;
  ph.innerHTML = `
    <div class="print-header-title">Controle de Gastos — ${MONTHS[state.currentMonth]} ${state.currentYear}</div>
    <div class="print-header-sub">
      <span>Renda: <strong>${getTotalIncome().toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>
      <span class="print-sep">·</span>
      <span>Despesas: <strong>${despesas}</strong></span>
      <span class="print-sep">·</span>
      <span>Saldo: <strong style="color:${saldoNeg ? '#c0392b' : '#2D6A4F'}">${saldo}</strong></span>
    </div>
    <div class="print-header-rule"></div>
  `;

  const main       = document.querySelector('.main');
  const summaryRow = document.querySelector('.summary-row');
  const summaryOriginalNext = summaryRow?.nextSibling;
  if (summaryRow) main.appendChild(summaryRow);

  window.print();

  if (summaryRow && summaryOriginalNext) {
    main.insertBefore(summaryRow, summaryOriginalNext);
  } else if (summaryRow) {
    const incomeBanner = document.querySelector('.income-banner');
    if (incomeBanner?.nextSibling) main.insertBefore(summaryRow, incomeBanner.nextSibling);
  }
};

// ── CSV menu toggle ──

window.toggleCsvMenu = function() {
  document.getElementById('csvMenu').classList.toggle('open');
};

window.closeCsvMenu = function() {
  document.getElementById('csvMenu').classList.remove('open');
};

// ── Global click handlers ──

document.addEventListener('click', function(e) {
  const chip = document.getElementById('monthChip');
  if (chip && !chip.contains(e.target)) closeMonthDropdown();
  const fab  = document.getElementById('csvFab');
  if (fab  && !fab.contains(e.target))  window.closeCsvMenu();
});

// ── CSV FAB scroll visibility ──

(function() {
  const fab        = document.getElementById('csvFab');
  const feedbackFab = document.getElementById('feedbackFab');
  function checkScroll() {
    const scrolled = window.scrollY + window.innerHeight;
    const total    = document.documentElement.scrollHeight;
    if (total - scrolled < 120) {
      fab.style.opacity              = '1';
      fab.style.pointerEvents        = 'all';
      feedbackFab.style.opacity      = '1';
      feedbackFab.style.pointerEvents = 'all';
    } else {
      fab.style.opacity              = '0';
      fab.style.pointerEvents        = 'none';
      feedbackFab.style.opacity      = '0';
      feedbackFab.style.pointerEvents = 'none';
      window.closeCsvMenu();
      window.closeFeedbackMenu?.();
    }
  }
  window.addEventListener('scroll', checkScroll, { passive: true });
  checkScroll();
})();

// ── Footer year ──
document.getElementById('footer-year').textContent = new Date().getFullYear();

// ── App bootstrap ──
// Called by auth.js after session is confirmed.
export async function initApp(user) {
  await populateMonths();
  state.yearGoals = (await loadYearGoals(state.currentYear)) || {};
  await loadMonth();
  initFeedbackWidget();
  await checkForUpdates(user);
  await maybeShowWelcome(user);
}

// ── Update notification ──

async function checkForUpdates(user) {
  try {
    const { data, error } = await supabase
      .from('app_updates')
      .select('id, title, body')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return;

    const seenId = user.user_metadata?.last_update_seen;
    if (seenId === data.id) return;

    const titleEl = document.createElement('p');
    titleEl.style.cssText = 'font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px';
    titleEl.textContent = data.title;

    const bodyEl = document.createElement('p');
    bodyEl.style.cssText = 'font-size:13px;color:var(--muted);line-height:1.6';
    bodyEl.textContent = data.body;

    const container = document.getElementById('updateContent');
    container.innerHTML = '';
    container.appendChild(titleEl);
    container.appendChild(bodyEl);

    document.getElementById('updateModal').classList.add('open');
    document.getElementById('updateModalBtn').addEventListener('click', async () => {
      closeModal('updateModal');
      await supabase.auth.updateUser({ data: { last_update_seen: data.id } });
    }, { once: true });
  } catch (e) { /* silently ignore */ }
}

// ── Welcome modal ──

async function maybeShowWelcome(user) {
  const seen = user.user_metadata?.welcome_seen;
  if (seen) return;

  const name = user.user_metadata?.name || user.email.split('@')[0];
  document.getElementById('welcomeModalTitle').textContent = `Olá, ${name}! 👋`;

  openModal('welcomeModal');

  document.getElementById('welcomeModalBtn').addEventListener('click', async () => {
    closeModal('welcomeModal');
    await supabase.auth.updateUser({ data: { welcome_seen: true } });
  }, { once: true });
}
