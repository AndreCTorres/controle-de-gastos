import { supabase } from './auth.js';
import { loadMonthData, saveMonthData } from './db.js';

// ── Constants ──
const MONTHS = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const NOW = new Date();

// ── State ──
let currentMonth = NOW.getMonth();
let currentYear  = NOW.getFullYear();
let sections     = [];
let incomes      = [];
let nextId       = 9000;
let incomeNextId = 100;
let saveTimer    = null; // debounce handle

const DEFAULT_SECTIONS = [
  {id:'supermercado',title:'Supermercado',color:'#2D6A4F',bg:'#E8F5EE',items:[
    {id:'s1',label:'Alimentos / Hortifruti',val:''},
    {id:'s2',label:'Carnes e proteínas',val:''},
    {id:'s3',label:'Laticínios',val:''},
    {id:'s4',label:'Padaria e cereais',val:''},
    {id:'s5',label:'Higiene pessoal',val:''},
    {id:'s6',label:'Limpeza e Descartáveis',val:''},
  ]},
  {id:'moradia',title:'Moradia & Contas',color:'#1D5A8A',bg:'#E8F0FA',items:[
    {id:'m2',label:'Conta de luz',val:''},
    {id:'m3',label:'Conta de água',val:''},
    {id:'m4',label:'Gás',val:''},
    {id:'m5',label:'Internet',val:''},
  ]},
  {id:'transporte',title:'Transporte',color:'#A05C1A',bg:'#FDF0E0',items:[
    {id:'t1',label:'Gasolina / Combustível',val:''},
    {id:'t2',label:'Seguro do carro',val:''},
    {id:'t3',label:'IPVA / licenciamento',val:''},
    {id:'t4',label:'Manutenção',val:''},
  ]},
  {id:'saude',title:'Saúde & Bem-estar',color:'#6B3594',bg:'#F3ECF9',items:[
    {id:'h1',label:'Academia / esportes',val:''},
    {id:'h2',label:'Médico / consultas',val:''},
    {id:'h3',label:'Remédios / farmácia',val:''},
    {id:'h4',label:'Plano de saúde',val:''},
  ]},
  {id:'lazer',title:'Lazer & Outros',color:'#B83A2A',bg:'#FDF0EF',items:[
    {id:'l1',label:'Restaurantes',val:''},
    {id:'l2',label:'Streaming',val:''},
    {id:'l3',label:'Roupas / Calçados',val:''},
    {id:'l4',label:'Outros gastos',val:''},
  ]},
];

// ── Helpers ──
function fmt(n) {
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function pct(v, total) { return total > 0 ? Math.round(v / total * 100) : 0; }

// ── Debounced save ──
// Waits 800ms after the last change before hitting Supabase
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persistData, 800);
}

async function persistData() {
  const incomeData = [];
  document.querySelectorAll('.income-row[data-iid]').forEach(row => {
    incomeData.push({
      id:    row.dataset.iid,
      label: row.querySelector('.income-label input').value,
      val:   row.querySelector('.income-input').value,
    });
  });

  const secs = [];
  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    const sec = sections.find(s => s.id === sid);
    if (!sec) return;
    const items = [];
    el.querySelectorAll('.item-row[data-iid]').forEach(row => {
      const item = {
        id:    row.dataset.iid,
        label: row.querySelector('.label-input').value,
        val:   row.querySelector('.amount-input').value,
      };
      if (row.dataset.parcel === 'true') item.parcel = true;
      items.push(item);
    });
    secs.push({ id: sec.id, title: sec.title, color: sec.color, bg: sec.bg, items });
  });

  await saveMonthData(currentMonth, currentYear, { incomes: incomeData, sections: secs });
}

// ── Save a specific future-month payload directly ──
async function persistFutureMonth(month, year, payload) {
  await saveMonthData(month, year, payload);
}

// ── TOAST ──
const TOAST_ICONS        = { success: '✓', error: '✕', info: 'ℹ' };
const TOAST_DRAIN_COLORS = { success: 'var(--green)', error: 'var(--danger)', info: 'var(--primary)' };
const TOAST_DURATION     = 2800;

window.showToast = function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  const icon       = TOAST_ICONS[type]       || TOAST_ICONS.success;
  const drainColor = TOAST_DRAIN_COLORS[type] || TOAST_DRAIN_COLORS.success;
  t.className = 'toast ' + type;
  t.style.setProperty('--drain-color', drainColor);
  t.style.setProperty('--drain-dur', TOAST_DURATION + 'ms');
  t.style.position = 'fixed';
  t.innerHTML = `<div class="toast-icon">${icon}</div><div class="toast-text">${msg}</div>`;
  void t.offsetWidth;
  t.classList.add('show');
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('draining')));
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.classList.remove('draining'), 300);
  }, TOAST_DURATION);
};

// ── DONUT CHART ──
function drawDonut(slices) {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = 180, H = 180, cx = 90, cy = 90, R = 80, r = 54;
  ctx.clearRect(0, 0, W, H);
  const total = slices.reduce((a, s) => a + s.val, 0);
  if (total === 0) {
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = '#E8E4DC'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    return;
  }
  let angle = -Math.PI / 2;
  slices.forEach(s => {
    if (s.val <= 0) return;
    const sweep = s.val / total * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = s.color;
    ctx.fill();
    angle += sweep;
  });
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 1; ctx.stroke();
}

function updateSummary(secTotals, renda, totalDesp) {
  drawDonut(secTotals.map(s => ({ color: s.color, val: s.total })));
  document.getElementById('chart-total').textContent = fmt(totalDesp);

  const leg = document.getElementById('chart-legend');
  leg.innerHTML = '';
  secTotals.forEach(s => {
    if (s.total <= 0) return;
    const p = pct(s.total, totalDesp);
    const el = document.createElement('div');
    el.className = 'legend-item';
    el.innerHTML = `<div class="legend-dot" style="background:${s.color}"></div><span class="legend-label">${s.title}</span><span class="legend-pct">${p}%</span>`;
    leg.appendChild(el);
  });
  if (totalDesp === 0) {
    leg.innerHTML = '<div style="font-size:11px;color:var(--muted);opacity:0.6">Nenhuma despesa registrada</div>';
  }

  const pctList = document.getElementById('pct-list');
  pctList.innerHTML = '';
  secTotals.forEach(s => {
    const pctRenda = renda > 0 ? Math.round(s.total / renda * 100) : 0;
    const pctDesp  = pct(s.total, totalDesp);
    const item = document.createElement('div');
    item.className = 'pct-item';
    item.innerHTML = `
      <div class="pct-item-head">
        <span class="pct-item-name">${s.title}</span>
        <span class="pct-item-info">${fmt(s.total)} · <strong style="color:${s.color}">${pctRenda}%</strong> da renda</span>
      </div>
      <div class="pct-bar-track">
        <div class="pct-bar-fill" style="width:${Math.min(pctDesp,100)}%;background:${s.color}"></div>
      </div>`;
    pctList.appendChild(item);
  });

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    const sec = secTotals.find(s => s.id === sid);
    if (!sec) return;
    const fill     = el.querySelector('.section-progress-fill');
    const pctLabel = el.querySelector('.section-pct-label');
    if (!fill || !pctLabel) return;
    const p = pct(sec.total, totalDesp);
    fill.style.width      = p + '%';
    fill.style.background = sec.color;
    pctLabel.textContent  = totalDesp > 0 ? p + '% do total' : '';
  });
}

// ── RECALC ──
function getTotalIncome() {
  let t = 0;
  document.querySelectorAll('.income-input').forEach(inp => { t += parseFloat(inp.value) || 0; });
  return t;
}

function recalc() {
  const renda = getTotalIncome();
  let totalDesp = 0;
  const secTotals = [];

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    const sec = sections.find(s => s.id === sid);
    let sub = 0;
    el.querySelectorAll('.amount-input').forEach(inp => { sub += parseFloat(inp.value) || 0; });
    totalDesp += sub;
    const tot = el.querySelector('.section-total');
    if (tot) tot.textContent = fmt(sub);
    secTotals.push({ id: sid, title: sec ? sec.title : sid, color: sec ? sec.color : '#999', total: sub });
  });

  const saldo = renda - totalDesp;
  document.getElementById('stat-renda').textContent     = fmt(renda);
  document.getElementById('stat-despesas').textContent  = fmt(totalDesp);
  const ss = document.getElementById('stat-saldo');
  ss.textContent = fmt(saldo);
  ss.className   = 'val ' + (saldo >= 0 ? 'pos' : 'neg');

  updateSummary(secTotals, renda, totalDesp);
  scheduleSave();
}

// ── INCOME ROWS ──
function removeIncomeRow(iid) {
  incomes = incomes.filter(i => i.id !== iid);
  const row = document.querySelector(`.income-row[data-iid="${iid}"]`);
  if (row) {
    row.style.opacity   = '0';
    row.style.transform = 'translateY(-4px)';
    row.style.transition = 'all 0.2s';
    setTimeout(() => row.remove(), 220);
  }
  setTimeout(recalc, 250);
}

function buildIncomeRow(income) {
  const row = document.createElement('div');
  row.className    = 'income-row';
  row.dataset.iid  = income.id;
  const canRemove  = income.id !== 'main';
  row.innerHTML = `
    <div class="income-label"><input type="text" placeholder="Nome da renda" value="${(income.label || '').replace(/"/g, '&quot;')}"></div>
    <div class="income-input-wrap"><span>R$</span><input class="income-input" type="number" placeholder="0,00" step="0.01" min="0" value="${income.val || ''}"></div>
    ${canRemove ? '<button class="remove-income-btn" title="Remover renda">×</button>' : ''}
  `;
  row.querySelector('.income-input').addEventListener('input', recalc);
  row.querySelector('.income-label input').addEventListener('input', scheduleSave);
  if (canRemove) row.querySelector('.remove-income-btn').addEventListener('click', () => removeIncomeRow(income.id));
  return row;
}

function renderIncomes() {
  const cont = document.getElementById('income-rows');
  cont.innerHTML = '';
  incomes.forEach(inc => cont.appendChild(buildIncomeRow(inc)));
}

window.addIncomeRow = function() {
  const id = 'inc' + (incomeNextId++);
  incomes.push({ id, label: `Renda adicional ${incomes.length}`, val: '' });
  const cont   = document.getElementById('income-rows');
  const newRow = buildIncomeRow(incomes[incomes.length - 1]);
  cont.appendChild(newRow);
  newRow.querySelector('.income-label input').focus();
  newRow.querySelector('.income-label input').select();
  scheduleSave();
};

// ── ITEM ROWS ──
function removeItem(sid, iid) {
  const sec  = sections.find(s => s.id === sid);
  const item = sec?.items.find(i => i.id === iid);

  if (item?.parcel) {
    const baseTitle  = item.label.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
    const matchTotal = item.label.match(/\((\d+)\/(\d+)\)$/);
    const totalParcels = matchTotal ? parseInt(matchTotal[2]) : 0;
    const currentNum   = matchTotal ? parseInt(matchTotal[1]) : 0;
    const remaining    = totalParcels - currentNum;

    const t = document.getElementById('toast');
    clearTimeout(t._timer);
    t.className = 'toast confirm';
    t.innerHTML = `
      <div class="toast-confirm-msg">
        <strong>"${baseTitle}"</strong> é uma compra parcelada.<br>
        <span style="font-weight:400;font-size:11px;opacity:0.75">Parcela ${currentNum} de ${totalParcels}${remaining > 0 ? ` · ${remaining} parcela(s) restante(s) em meses futuros` : ''}</span>
      </div>
      <div class="toast-confirm-actions">
        <button class="toast-confirm-cancel">Cancelar</button>
        <button class="toast-confirm-ok" style="background:var(--primary);font-size:11px">Só este mês</button>
        ${remaining > 0 ? `<button class="toast-confirm-ok toast-confirm-all" style="font-size:11px">Este e futuros</button>` : ''}
      </div>`;
    void t.offsetWidth;
    t.classList.add('show');

    t.querySelector('.toast-confirm-cancel').addEventListener('click', () => {
      t.classList.remove('show');
      setTimeout(() => { t.className = 'toast'; t.innerHTML = ''; }, 300);
    });

    t.querySelector('.toast-confirm-ok').addEventListener('click', () => {
      t.classList.remove('show');
      setTimeout(() => { t.className = 'toast'; t.innerHTML = ''; }, 300);
      _doRemoveItem(sid, iid);
      showToast(`Parcela ${currentNum}/${totalParcels} removida`);
    });

    const allBtn = t.querySelector('.toast-confirm-all');
    if (allBtn) {
      allBtn.addEventListener('click', async () => {
        t.classList.remove('show');
        setTimeout(() => { t.className = 'toast'; t.innerHTML = ''; }, 300);
        _doRemoveItem(sid, iid);
        await _removeParcelFromFutureMonths(baseTitle, sid, currentMonth, currentYear, totalParcels, currentNum);
        showToast(`"${baseTitle}" removida dos meses seguintes`);
      });
    }
    return;
  }

  _doRemoveItem(sid, iid);
}

function _doRemoveItem(sid, iid) {
  const sec = sections.find(s => s.id === sid);
  if (sec) sec.items = sec.items.filter(i => i.id !== iid);
  const row = document.querySelector(`.item-row[data-iid="${iid}"]`);
  if (row) {
    row.style.opacity    = '0';
    row.style.height     = '0';
    row.style.overflow   = 'hidden';
    row.style.transition = 'all 0.2s';
    setTimeout(() => row.remove(), 220);
  }
  setTimeout(recalc, 250);
}

async function _removeParcelFromFutureMonths(baseTitle, sid, fromMonth, fromYear, totalParcels, fromNum) {
  for (let n = fromNum + 1; n <= totalParcels; n++) {
    let m = fromMonth + (n - fromNum);
    let y = fromYear;
    while (m > 11) { m -= 12; y++; }

    const data = await loadMonthData(m, y);
    if (!data) continue;

    const sec = data.sections?.find(s => s.id === sid);
    if (sec) {
      const expectedLabel = `${baseTitle} (${n}/${totalParcels})`;
      sec.items = sec.items.filter(i => i.label !== expectedLabel);
      await saveMonthData(m, y, data);
    }
  }
}

function buildItemRow(item, sid) {
  const row       = document.createElement('div');
  row.className   = 'item-row';
  row.dataset.iid = item.id;
  if (item.parcel) row.dataset.parcel = 'true';
  row.innerHTML = `
    <div class="item-label"><input class="label-input" type="text" placeholder="Nome do item" value="${(item.label || '').replace(/"/g, '&quot;')}"></div>
    <div class="item-amount">
      <span class="prefix">R$</span>
      <input class="amount-input" type="number" placeholder="—" step="0.01" min="0" value="${item.val || ''}">
    </div>
    <div class="item-actions">
      <button class="clear-btn" title="Limpar valor">⌫</button>
      <button class="del-btn" title="Remover item">×</button>
    </div>`;
  row.querySelector('.amount-input').addEventListener('input', recalc);
  row.querySelector('.label-input').addEventListener('input', recalc);
  row.querySelector('.clear-btn').addEventListener('click', () => { row.querySelector('.amount-input').value = ''; recalc(); });
  row.querySelector('.del-btn').addEventListener('click', () => removeItem(sid, item.id));
  return row;
}

// ── SECTION CARDS ──
function removeSection(secId) {
  const sec = sections.find(s => s.id === secId);
  if (!sec) return;

  const t = document.getElementById('toast');
  clearTimeout(t._timer);
  t.className = 'toast confirm';
  t.innerHTML = `
    <div class="toast-confirm-msg">Remover <strong>"${sec.title}"</strong>?</div>
    <div class="toast-confirm-actions">
      <button class="toast-confirm-cancel">Cancelar</button>
      <button class="toast-confirm-ok">Remover</button>
    </div>`;
  void t.offsetWidth;
  t.classList.add('show');

  t.querySelector('.toast-confirm-cancel').addEventListener('click', () => {
    t.classList.remove('show');
    setTimeout(() => { t.className = 'toast'; t.innerHTML = ''; }, 300);
  });

  t.querySelector('.toast-confirm-ok').addEventListener('click', () => {
    t.classList.remove('show');
    setTimeout(() => { t.className = 'toast'; t.innerHTML = ''; }, 300);

    sections = sections.filter(s => s.id !== secId);
    const el = document.querySelector(`.section[data-sid="${secId}"]`);
    if (el) {
      el.style.transition = 'opacity 0.2s, transform 0.2s';
      el.style.opacity    = '0';
      el.style.transform  = 'scale(0.97)';
      setTimeout(() => el.remove(), 220);
    }
    setTimeout(recalc, 250);
    setTimeout(() => showToast(`"${sec.title}" removida`), 350);
  });
}

function buildSection(sec) {
  const div       = document.createElement('div');
  div.className   = 'section';
  div.dataset.sid = sec.id;
  div.innerHTML = `
    <div class="section-head">
      <div class="section-head-left">
        <span class="section-tag" style="color:${sec.color};background:${sec.bg}">${sec.title}</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
        <div class="section-meta">
          <span class="section-total">R$ 0,00</span>
          <span class="section-pct-label"></span>
        </div>
        <button class="section-del-btn" title="Remover categoria">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
    <div class="section-progress"><div class="section-progress-fill" style="width:0%"></div></div>
    <div class="items-container"></div>
    <div class="add-row"><button class="add-btn">+ Adicionar item</button></div>`;

  const cont = div.querySelector('.items-container');
  sec.items.forEach(item => cont.appendChild(buildItemRow(item, sec.id)));

  div.querySelector('.section-del-btn').addEventListener('click', () => removeSection(sec.id));
  div.querySelector('.add-btn').addEventListener('click', () => {
    const id   = 'i' + (nextId++);
    const sec2 = sections.find(s => s.id === sec.id);
    if (sec2) sec2.items.push({ id, label: '', val: '' });
    const newRow = buildItemRow({ id, label: '', val: '' }, sec.id);
    cont.appendChild(newRow);
    newRow.querySelector('.label-input').focus();
    recalc();
  });
  return div;
}

function renderSections() {
  const wrap = document.getElementById('sections-container');
  wrap.innerHTML = '';
  sections.forEach(sec => wrap.appendChild(buildSection(sec)));
}

// ── MONTH NAVIGATION ──
async function loadMonth() {
  // Show a subtle loading state
  document.getElementById('sections-container').style.opacity = '0.5';

  const data = await loadMonthData(currentMonth, currentYear);

  if (data) {
    incomes  = data.incomes  || [{ id: 'main', label: 'Renda principal', val: '' }];
    sections = data.sections || JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
    sections = sections.map(s => {
      const def = DEFAULT_SECTIONS.find(d => d.id === s.id);
      return { ...s, bg: s.bg || (def ? def.bg : '#F0F0F0') };
    });
  } else {
    incomes  = [{ id: 'main', label: 'Renda principal', val: '' }];
    sections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
  }

  renderIncomes();
  renderSections();
  recalc();
  document.getElementById('sections-container').style.opacity = '1';
}

function populateMonths() {
  const dropdown = document.getElementById('monthDropdown');
  dropdown.innerHTML = '';
  const endYear = currentYear + 1;

  for (let y = 2026; y <= endYear; y++) {
    const grp = document.createElement('div');
    grp.className   = 'month-year-group';
    grp.textContent = y;
    dropdown.appendChild(grp);

    MONTHS.forEach((m, i) => {
      const opt       = document.createElement('div');
      opt.className   = 'month-opt' + (i === currentMonth && y === currentYear ? ' selected' : '');
      opt.textContent = `${m} ${y}`;
      opt.dataset.m   = i;
      opt.dataset.y   = y;
      opt.addEventListener('click', function(e) {
        e.stopPropagation();
        currentMonth = parseInt(this.dataset.m);
        currentYear  = parseInt(this.dataset.y);
        updateMonthChipLabel();
        dropdown.querySelectorAll('.month-opt').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        closeMonthDropdown();
        loadMonth();
      });
      dropdown.appendChild(opt);
    });
  }
  updateMonthChipLabel();
}

function updateMonthChipLabel() {
  document.getElementById('monthChipValue').textContent = `${MONTHS[currentMonth]} ${currentYear}`;
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

// ── CSV EXPORT / IMPORT ──
window.exportCSV = function() {
  const renda = getTotalIncome();
  let csv = `Controle de Gastos - ${MONTHS[currentMonth]} ${currentYear}\n\nRENDAS\n`;
  incomes.forEach(inc => {
    const v = document.querySelector(`.income-row[data-iid="${inc.id}"] .income-input`)?.value || 0;
    if (parseFloat(v) > 0) csv += `${inc.label};${parseFloat(v).toFixed(2).replace('.', ',')}\n`;
  });
  csv += `Total Renda;${renda.toFixed(2).replace('.', ',')}\n`;
  let total = 0;
  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const title = el.querySelector('.section-tag').textContent;
    csv += `\n${title}\n`;
    el.querySelectorAll('.item-row[data-iid]').forEach(row => {
      const label = row.querySelector('.label-input').value || 'Item';
      const v     = parseFloat(row.querySelector('.amount-input').value) || 0;
      if (v > 0) { csv += `${label};${v.toFixed(2).replace('.', ',')}\n`; total += v; }
    });
  });
  csv += `\nTOTAL DESPESAS;${total.toFixed(2).replace('.', ',')}\nSALDO;${(renda - total).toFixed(2).replace('.', ',')}\n`;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href:     url,
    download: `gastos_${MONTHS[currentMonth]}_${currentYear}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
};

window.triggerImport = function() {
  document.getElementById('csvFileInput').click();
};

window.toggleCsvMenu = function() {
  document.getElementById('csvMenu').classList.toggle('open');
};

window.closeCsvMenu = function() {
  document.getElementById('csvMenu').classList.remove('open');
};

document.getElementById('csvFileInput').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const text  = e.target.result;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      const importedIncomes  = [{ id: 'main', label: 'Renda principal', val: '' }];
      const importedSections = JSON.parse(JSON.stringify(DEFAULT_SECTIONS));
      let inRendas    = false;
      let currentSid  = null;
      let rendaCount  = 0;

      lines.slice(1).forEach(line => {
        const parts   = line.split(';');
        const label   = parts[0].trim();
        const rawVal  = (parts[1] || '').trim().replace(',', '.');
        const val     = parseFloat(rawVal) || 0;

        if (label === 'RENDAS')                               { inRendas = true;  return; }
        if (label === 'Total Renda')                          { inRendas = false; return; }
        if (label === 'TOTAL DESPESAS' || label === 'SALDO')  return;

        if (inRendas) {
          if (rendaCount === 0) { importedIncomes[0].label = label; importedIncomes[0].val = val > 0 ? String(val) : ''; }
          else importedIncomes.push({ id: 'inc_imp_' + rendaCount, label, val: val > 0 ? String(val) : '' });
          rendaCount++;
          return;
        }

        const matchSec = importedSections.find(s => s.title.toLowerCase() === label.toLowerCase());
        if (matchSec) { currentSid = matchSec.id; return; }

        if (currentSid && val > 0) {
          const sec = importedSections.find(s => s.id === currentSid);
          if (sec) {
            const existing = sec.items.find(i => i.label.toLowerCase() === label.toLowerCase());
            if (existing) existing.val = String(val);
            else sec.items.push({ id: 'imp_' + Date.now() + '_' + Math.random(), label, val: String(val) });
          }
        }
      });

      incomes  = importedIncomes;
      sections = importedSections;
      renderIncomes(); renderSections(); recalc();
      showToast('CSV importado com sucesso para ' + MONTHS[currentMonth] + ' ' + currentYear + '!');
    } catch (err) {
      showToast('Erro ao importar CSV. Verifique se o arquivo foi exportado por esta aplicação.', 'error');
    }
  };
  reader.readAsText(file, 'UTF-8');
  this.value = '';
});

// ── COPY MONTH MODAL ──
let copySourceMonth = null, copySourceYear = null;
let copySelections  = new Set();

window.openCopyModal = async function() {
  let pm = currentMonth - 1, py = currentYear;
  if (pm < 0) { pm = 11; py--; }
  copySourceMonth = pm; copySourceYear = py;

  const prevData = await loadMonthData(pm, py);
  if (!prevData) {
    showToast(`Sem dados em ${MONTHS[pm]} ${py}`, 'error');
    return;
  }

  document.getElementById('copyTargetMonth').textContent = `${MONTHS[currentMonth]} ${currentYear}`;
  const opts = document.getElementById('copyOptions');
  opts.innerHTML = '';
  copySelections  = new Set();

  const hasIncomes = (prevData.incomes || []).some(i => parseFloat(i.val) > 0);
  if (hasIncomes) {
    addCopyOption(opts, 'rendas', '💵 Rendas',
      `${(prevData.incomes || []).filter(i => parseFloat(i.val) > 0).length} fonte(s) de renda`);
  }

  (prevData.sections || []).forEach(sec => {
    const total = (sec.items || []).reduce((a, i) => a + (parseFloat(i.val) || 0), 0);
    if (total > 0) addCopyOption(opts, 'sec_' + sec.id, sec.title, fmt(total) + ' em itens preenchidos');
  });

  if (opts.children.length === 0) {
    showToast(`Sem valores preenchidos em ${MONTHS[pm]} ${py}`, 'error');
    return;
  }

  document.getElementById('copyModal').classList.add('open');
};

function addCopyOption(container, id, label, sub) {
  const el       = document.createElement('div');
  el.className   = 'copy-option';
  el.dataset.id  = id;
  el.innerHTML = `
    <div class="copy-option-check"></div>
    <div>
      <div class="copy-option-label">${label}</div>
      <div class="copy-option-sub">${sub}</div>
    </div>`;
  el.addEventListener('click', () => {
    if (copySelections.has(id)) { copySelections.delete(id); el.classList.remove('selected'); }
    else                         { copySelections.add(id);    el.classList.add('selected'); }
  });
  container.appendChild(el);
}

window.closeCopyModal = function() {
  document.getElementById('copyModal').classList.remove('open');
};

window.confirmCopy = async function() {
  if (copySelections.size === 0) { showToast('Selecione pelo menos uma opção', 'error'); return; }

  const prevData = await loadMonthData(copySourceMonth, copySourceYear);
  if (!prevData) return;

  if (copySelections.has('rendas')) {
    incomes = JSON.parse(JSON.stringify(prevData.incomes || [{ id: 'main', label: 'Renda principal', val: '' }]));
    renderIncomes();
  }

  sections = sections.map(sec => {
    const selKey  = 'sec_' + sec.id;
    if (!copySelections.has(selKey)) return sec;
    const prevSec = (prevData.sections || []).find(s => s.id === sec.id);
    if (!prevSec) return sec;
    return { ...sec, items: JSON.parse(JSON.stringify(prevSec.items)) };
  });

  renderSections();
  recalc();
  closeCopyModal();
  showToast('Dados copiados com sucesso!');
};

document.getElementById('copyModal').addEventListener('click', function(e) {
  if (e.target === this) closeCopyModal();
});

// ── NEW SECTION MODAL ──
const NEW_SEC_COLORS = [
  { color: '#1A6B5A', bg: '#E4F5F1' },
  { color: '#5A3D8A', bg: '#F0EBF9' },
  { color: '#8A3D1A', bg: '#F9EDE5' },
  { color: '#1A4F8A', bg: '#E5EEF9' },
  { color: '#6B6B1A', bg: '#F8F8E4' },
  { color: '#8A1A4F', bg: '#F9E5EE' },
];
let newSecColorIdx = 0;

window.openNewSectionModal = function() {
  document.getElementById('newSectionTitle').value = '';
  document.getElementById('newSectionItems').innerHTML = '';
  addNewSectionItem();
  document.getElementById('newSectionModal').classList.add('open');
  setTimeout(() => document.getElementById('newSectionTitle').focus(), 120);
};

window.closeNewSectionModal = function() {
  document.getElementById('newSectionModal').classList.remove('open');
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
    id:     'custom_' + Date.now(),
    title,
    color:  palette.color,
    bg:     palette.bg,
    items:  items.length > 0 ? items : [{ id: 'cs_' + Date.now(), label: '', val: '' }],
  };

  sections.push(newSec);
  document.getElementById('sections-container').appendChild(buildSection(newSec));
  recalc();
  closeNewSectionModal();
  showToast(`Categoria "${title}" criada!`);
};

document.getElementById('newSectionModal').addEventListener('click', function(e) {
  if (e.target === this) closeNewSectionModal();
});

document.getElementById('newSectionTitle').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') confirmNewSection();
});

// ── PARCEL MODAL ──
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
    const sec = sections.find(s => s.id === sid);
    if (!sec) return;
    const opt     = document.createElement('div');
    opt.className = 'copy-option';
    opt.dataset.sid = sec.id;
    opt.innerHTML = `
      <div class="copy-option-check" style="border-radius:50%"></div>
      <div>
        <div class="copy-option-label">
          <span style="display:inline-block;background:${sec.bg};color:${sec.color};padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">${sec.title}</span>
        </div>
      </div>`;
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

  document.getElementById('parcelModal').classList.add('open');
  setTimeout(() => document.getElementById('parcelTitle').focus(), 120);
};

window.closeParcelModal = function() {
  document.getElementById('parcelModal').classList.remove('open');
};

window.updateParcelPreview = function() {
  const total   = parseFloat(document.getElementById('parcelTotal').value) || 0;
  const count   = parseInt(document.getElementById('parcelCount').value)   || 0;
  const preview = document.getElementById('parcelPreview');
  if (total > 0 && count >= 2) {
    document.getElementById('parcelPreviewText').textContent =
      `${count}x de ${fmt(total / count)} = ${fmt(total)} no total`;
    preview.style.display = 'block';
  } else {
    preview.style.display = 'none';
  }
};

window.confirmParcel = async function() {
  const title = document.getElementById('parcelTitle').value.trim();
  const total = parseFloat(document.getElementById('parcelTotal').value) || 0;
  const count = parseInt(document.getElementById('parcelCount').value)   || 0;

  const flashError = id => {
    const f = document.getElementById(id);
    f.style.borderColor = 'var(--danger)'; f.focus();
    setTimeout(() => f.style.borderColor = 'var(--border)', 1400);
  };
  if (!title)         { flashError('parcelTitle');  return; }
  if (total <= 0)     { flashError('parcelTotal');  return; }
  if (count < 2)      { flashError('parcelCount');  return; }
  if (!selectedParcelSectionId) { showToast('Selecione uma categoria', 'error'); return; }

  const parcelVal = parseFloat((total / count).toFixed(2));
  const parcels   = [];

  for (let i = 0; i < count; i++) {
    let m = currentMonth + i, y = currentYear;
    while (m > 11) { m -= 12; y++; }
    parcels.push({ month: m, year: y, val: parcelVal, num: i + 1, total: count });
  }

  // Apply current month parcels to the UI
  parcels
    .filter(p => p.month === currentMonth && p.year === currentYear)
    .forEach(p => {
      const sec = sections.find(s => s.id === selectedParcelSectionId);
      if (!sec) return;
      const id    = 'parc_' + Date.now() + '_' + p.num;
      const label = `${title} (${p.num}/${p.total})`;
      sec.items.push({ id, label, val: String(p.val), parcel: true });
      const sectionEl = document.querySelector(`.section[data-sid="${selectedParcelSectionId}"]`);
      if (sectionEl) sectionEl.querySelector('.items-container').appendChild(
        buildItemRow({ id, label, val: String(p.val), parcel: true }, selectedParcelSectionId)
      );
    });

  // Persist future months to Supabase
  const future = parcels.filter(p => !(p.month === currentMonth && p.year === currentYear));
  const monthsMap = {};

  for (const p of future) {
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
        id:     'parc_' + Date.now() + '_' + p.num + '_' + p.month,
        label:  `${title} (${p.num}/${p.total})`,
        val:    String(p.val),
        parcel: true,
      });
    }
  }

  for (const [key, data] of Object.entries(monthsMap)) {
    const [y, m] = key.split('_').map(Number);
    await saveMonthData(m, y, data);
  }

  recalc();
  closeParcelModal();
  const secName = sections.find(s => s.id === selectedParcelSectionId)?.title || '';
  showToast(`${count} parcelas de ${title} adicionadas em ${secName}`);
};

document.getElementById('parcelModal').addEventListener('click', function(e) {
  if (e.target === this) closeParcelModal();
});

document.getElementById('parcelTitle').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') confirmParcel();
});

// ── GLOBAL CLICK HANDLERS ──
document.addEventListener('click', function(e) {
  const chip = document.getElementById('monthChip');
  if (chip && !chip.contains(e.target)) closeMonthDropdown();
  const fab  = document.getElementById('csvFab');
  if (fab  && !fab.contains(e.target))  closeCsvMenu();
});

// ── CSV FAB SCROLL VISIBILITY ──
(function() {
  const fab = document.getElementById('csvFab');
  function checkScroll() {
    const scrolled = window.scrollY + window.innerHeight;
    const total    = document.documentElement.scrollHeight;
    if (total - scrolled < 120) {
      fab.style.opacity       = '1';
      fab.style.pointerEvents = 'all';
    } else {
      fab.style.opacity       = '0';
      fab.style.pointerEvents = 'none';
      closeCsvMenu();
    }
  }
  window.addEventListener('scroll', checkScroll, { passive: true });
  checkScroll();
})();

// ── FOOTER YEAR ──
document.getElementById('footer-year').textContent = new Date().getFullYear();

// ── APP BOOTSTRAP ──
// Triggered by auth.js via CustomEvent when a valid session is detected
window.addEventListener('app:ready', () => {
  populateMonths();
  loadMonth();
});
