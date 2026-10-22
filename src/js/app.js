import { persistData, snapshotCurrent, resetSaveSnapshot } from './persist.js';
import { exportMonthCsv } from './finance.js';
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
import './ui/checkMode.js';

// Fallback for tabs that still have an older module graph cached during local development.
window.toggleCheckMode ??= function() {
  state.checkMode = !state.checkMode;
  window.updateCheckModeUI?.();
};

// ── Month navigation ──


export async function loadMonth() {
  const month=state.currentMonth,year=state.currentYear,user=state.userId;
  const main=document.querySelector('.main');
  state.loading=true;state.monthReady=false;main.inert=true;main.setAttribute('aria-busy','true');
  try{
    const [data,goals]=await Promise.all([loadMonthData(month,year),loadYearGoals(year)]);
    if(state.userId!==user||state.currentMonth!==month||state.currentYear!==year)return false;
    state.incomes=data?.incomes??[{id:'main',label:'Renda principal',val:''}];
    state.sections=(data?.sections??structuredClone(DEFAULT_SECTIONS)).map(s=>({...s,bg:s.bg||'#F0F0F0'}));
    state.yearGoals=goals??{};
    renderIncomes();renderSections();resetSaveSnapshot();
    const {recalc}=await import('./ui/recalc.js');recalc(false);
    state.monthReady=true;window.dispatchEvent(new CustomEvent('finance:sync'));return true;
  }catch(error){window.showToast('Não foi possível carregar este mês. Tente novamente com conexão.','error');throw error;}
  finally{state.loading=false;main.inert=!state.monthReady;main.removeAttribute('aria-busy');}
}
window.reloadCurrentMonth=loadMonth;
async function navigateMonth(month,year){
  if(state.loading||state.busy)return;
  try{await persistData();}catch(error){if(error.code==='LOCAL_STORAGE')return;} // Every edit is already in the durable outbox.
  const oldMonth=state.currentMonth,oldYear=state.currentYear;
  state.currentMonth=month;state.currentYear=year;
  try{await loadMonth();}
  catch{state.currentMonth=oldMonth;state.currentYear=oldYear;state.monthReady=true;document.querySelector('.main').inert=false;}
  updateMonthChipLabel();
  document.querySelectorAll('.month-opt').forEach(o=>o.classList.toggle('selected',Number(o.dataset.m)===state.currentMonth&&Number(o.dataset.y)===state.currentYear));
}
export async function populateMonths() {

  const dropdown = document.getElementById('monthDropdown');
  dropdown.innerHTML = '';

  let startYear = new Date().getFullYear();
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
      opt.setAttribute('role','option');opt.tabIndex=0;
      opt.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();opt.click();}});
      opt.dataset.m   = i;
      opt.dataset.y   = y;
      opt.addEventListener('click', async function(e) {
        e.stopPropagation();
        closeMonthDropdown();
        await navigateMonth(Number(this.dataset.m),Number(this.dataset.y));
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
    chip.classList.add('open');chip.setAttribute('aria-expanded','true');
    setTimeout(() => {
      const sel = document.getElementById('monthDropdown').querySelector('.month-opt.selected');
      if (sel) sel.scrollIntoView({ block: 'nearest' });
    }, 50);
  }
};

function closeMonthDropdown() {
  document.getElementById('monthChip').classList.remove('open');document.getElementById('monthChip').setAttribute('aria-expanded','false');
}

// ── CSV Export ──


window.exportCSV=function(){
  const csv=exportMonthCsv(snapshotCurrent(),MONTHS[state.currentMonth],state.currentYear);
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  link.download='gastos_'+MONTHS[state.currentMonth]+'_'+state.currentYear+'.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
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
      <span>Renda: <strong>${renda.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>
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
  function checkScroll() {
    const fab         = document.getElementById('csvFab');
    const feedbackFab = document.getElementById('feedbackFab');
    if (!fab || !feedbackFab) return;

    const scrolled = window.scrollY + window.innerHeight;
    const total    = document.documentElement.scrollHeight;
    if (total - scrolled < 120) {
      fab.style.opacity               = '1';
      fab.style.pointerEvents         = 'all';
      feedbackFab.style.opacity       = '1';
      feedbackFab.style.pointerEvents = 'all';
    } else {
      fab.style.opacity               = '0';
      fab.style.pointerEvents         = 'none';
      feedbackFab.style.opacity       = '0';
      feedbackFab.style.pointerEvents = 'none';
      window.closeCsvMenu?.();
      window.closeFeedbackMenu?.();
    }
  }
  window.addEventListener('scroll', checkScroll, { passive: true });
  // Expõe para o initApp poder disparar a verificação após o login
  window._checkFabScroll = checkScroll;
})();

// ── Footer year ──
// (definido em initApp para garantir que o elemento existe e está visível)

// ── App bootstrap ──
// Called by auth.js after session is confirmed.
export async function initApp(user) {
  if (state.isInitializing && state.initUser === user.id) return;
  state.initUser=user.id;
  state.isInitializing = true;
  document.getElementById('footer-year').textContent = new Date().getFullYear();
  try {
    await populateMonths();
    if(state.userId!==user.id)return;
    await loadMonth();
    if(state.userId!==user.id)return;
    initFeedbackWidget();
    window._checkFabScroll?.();
    state.appReady = true;
    await maybeShowWelcome(user);
    if(state.userId!==user.id)return;
    await checkForUpdates(user);
  } finally {
    if(state.initUser===user.id)state.isInitializing = false;
  }
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

    const seenId = localStorage.getItem(`cgastos_last_update_seen_${state.userId}`);
    if (seenId === data.id) return;

    const titleEl = document.createElement('p');
    titleEl.style.cssText = 'font-size:14px;font-weight:600;color:var(--text);margin-bottom:8px';
    titleEl.textContent = data.title;

    const container = document.getElementById('updateContent');
    container.innerHTML = '';
    container.appendChild(titleEl);
    container.appendChild(buildUpdateBody(data.body || ''));

    openModal('updateModal');
    document.getElementById('updateModalBtn').addEventListener('click', async () => {
      closeModal('updateModal');
      localStorage.setItem(`cgastos_last_update_seen_${state.userId}`, data.id);
    }, { once: true });
  } catch (e) { /* silently ignore */ }
}

function buildUpdateBody(body) {
  const lines = body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  let topicLines = lines
    .map(line => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

  if (lines.length <= 1 && /\s[-*•]\s+/.test(body)) {
    topicLines = body
      .replace(/^[-*•]\s*/, '')
      .split(/\s[-*•]\s+/)
      .map(line => line.trim())
      .filter(Boolean);
  }

  if (topicLines.length >= 2 || lines.some(line => /^[-*•]\s+/.test(line))) {
    const list = document.createElement('div');
    list.className = 'update-topic-list';
    topicLines.forEach(line => {
      const item = document.createElement('div');
      item.className = 'update-topic-item';
      const icon = document.createElement('span');
      icon.className = 'update-topic-icon';
      icon.textContent = '✓';
      const text = document.createElement('span');
      text.textContent = line;
      item.appendChild(icon);
      item.appendChild(text);
      list.appendChild(item);
    });
    return list;
  }

  const bodyEl = document.createElement('p');
  bodyEl.className = 'update-body-text';
  bodyEl.textContent = body;
  return bodyEl;
}

// ── Welcome modal ──

async function maybeShowWelcome(user) {
  const welcomeKey = `cgastos_welcome_seen_${state.userId}`;
  if (localStorage.getItem(welcomeKey) === 'true') return;

  const meta = state.userMeta || user.user_metadata || {};
  const name = meta?.name || user.email.split('@')[0];
  document.getElementById('welcomeModalTitle').textContent = `Olá, ${name}! 👋`;

  openModal('welcomeModal');

  return new Promise(resolve => {
    document.getElementById('welcomeModalBtn').addEventListener('click', () => {
      closeModal('welcomeModal');localStorage.setItem(welcomeKey,'true');resolve();
    },{once:true});
  });
}

// Cache only the public app shell; API responses and user data never enter this cache.
if('serviceWorker' in navigator && location.hostname!=='127.0.0.1' && location.hostname!=='localhost')navigator.serviceWorker.register('/sw.js').catch(()=>{});

document.getElementById('monthChip').addEventListener('keydown',e=>{if(e.target.id==='monthChip'&&(e.key==='Enter'||e.key===' ')){e.preventDefault();window.toggleMonthDropdown();}});
document.addEventListener('keydown',e=>{if(e.target.matches('.copy-option')&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.target.click();}});
