import { monthTotals as calculateMonth, cents, csvField } from '../finance.js';
import { persistData } from '../persist.js';
import { state } from '../state.js';
import { MONTHS } from '../constants.js';
import { fmt } from '../utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { loadYearData } from '../db.js';

// ── Annual report modal ──

// Holds computed report data so the export function can access it without re-fetching
let _reportSnapshot = null;

window.openYearReport = async function() {
  _reportSnapshot = null;
  document.getElementById('yearReportExportBtn').style.display = 'none';
  const body = document.getElementById('yearReportBody');
  body.innerHTML = `<div class="year-report-loading"><div class="spinner"></div></div>`;
  openModal('yearReportModal');

  let yearData = [];
  try {
    await persistData().catch(()=>{});
    yearData = await loadYearData(state.currentYear);
  } catch (err) {
    body.innerHTML = `<p style="color:var(--danger);text-align:center;padding:32px">Erro ao carregar dados. Verifique sua conexão.</p>`;
    return;
  }

  document.getElementById('yearReportTitle').textContent = `Relatório Anual de Gastos — ${state.currentYear}`;

  const byMonth = {};
  yearData.forEach(row => { byMonth[row.month] = row.data; });

  const allSecIds   = new Set();
  const allSecMeta  = {};
  const monthTotals = [];

  for (let m = 0; m < 12; m++) {
    const d = byMonth[m];
    if (!d) { monthTotals.push(null); continue; }

    const renda = calculateMonth(d).income;
    const bySec = {};
    let totalDesp = 0;
    (d.sections || []).forEach(sec => {
      allSecIds.add(sec.id);
      allSecMeta[sec.id] = { title: sec.title, color: sec.color };
      const sub = (sec.items || []).reduce((a, i) => a + cents(i.val), 0) / 100;
      bySec[sec.id] = sub;
      totalDesp = (Math.round(totalDesp*100)+Math.round(sub*100))/100;
    });
    monthTotals.push({ renda, totalDesp, bySec, saldo: (Math.round(renda*100)-Math.round(totalDesp*100))/100 });
  }

  // Store snapshot for CSV export
  _reportSnapshot = { monthTotals, allSecIds, allSecMeta, year: state.currentYear };

  const activeMonths = monthTotals.filter(Boolean);
  const totalRenda   = activeMonths.reduce((a, m) => a + m.renda, 0);
  const totalDesp    = activeMonths.reduce((a, m) => a + m.totalDesp, 0);
  const totalSaldo   = totalRenda - totalDesp;
  const avgDesp      = activeMonths.length > 0 ? totalDesp / activeMonths.length : 0;

  let peakMonth = null, peakVal = 0;
  monthTotals.forEach((d, i) => {
    if (d && d.totalDesp > peakVal) { peakVal = d.totalDesp; peakMonth = i; }
  });
  const peakLabel = peakMonth !== null ? `${MONTHS[peakMonth]} (${fmt(peakVal)})` : '—';

  const secIds = [...allSecIds];

  body.innerHTML = `
    <div class="yr-summary">
      <div class="yr-stat-pill">
        <label>Renda total no ano</label>
        <div class="yr-val">${fmt(totalRenda)}</div>
      </div>
      <div class="yr-stat-pill">
        <label>Despesas totais</label>
        <div class="yr-val neg">${fmt(totalDesp)}</div>
      </div>
      <div class="yr-stat-pill">
        <label>Saldo acumulado</label>
        <div class="yr-val ${totalSaldo >= 0 ? 'pos' : 'neg'}">${fmt(totalSaldo)}</div>
      </div>
      <div class="yr-stat-pill">
        <label>Média mensal de despesas</label>
        <div class="yr-val">${fmt(avgDesp)}</div>
      </div>
      <div class="yr-stat-pill">
        <label>Mês de maior gasto</label>
        <div class="yr-val">${peakLabel}</div>
      </div>
    </div>

    <div class="yr-section-title">Despesas por mês</div>
    <div class="yr-bar-chart" id="yrBarChart"></div>

    <div class="yr-section-title" style="margin-top:24px">Detalhamento mensal</div>
    <div class="yr-table-wrap">
      <table class="yr-table" id="yrTable"></table>
    </div>
  `;

  // Bar chart
  const barChart = document.getElementById('yrBarChart');
  const maxDesp  = Math.max(...monthTotals.map(m => m ? m.totalDesp : 0), 1);
  MONTHS.forEach((name, i) => {
    const d   = monthTotals[i];
    const p   = d && d.totalDesp > 0 ? Math.max(Math.round(d.totalDesp / maxDesp * 100), 2) : 0;
    const isNeg = d && d.saldo < 0;
    const col = document.createElement('div');
    col.className = 'yr-bar-col';
    col.innerHTML = `
      <div class="yr-bar-val${d && d.totalDesp > 0 ? '' : ' empty'}">${d && d.totalDesp > 0 ? fmt(d.totalDesp) : ''}</div>
      <div class="yr-bar-track">
        <div class="yr-bar-fill ${isNeg ? 'neg' : ''}" style="height:${p}%"></div>
      </div>
      <div class="yr-bar-label">${name.slice(0,3)}</div>
    `;
    barChart.appendChild(col);
  });

  // Table
  const table = document.getElementById('yrTable');

  function makeTd(text, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    td.textContent = text;
    return td;
  }
  function makeStrongTd(text, className) {
    const td = document.createElement('td');
    if (className) td.className = className;
    const s = document.createElement('strong');
    s.textContent = text;
    td.appendChild(s);
    return td;
  }

  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  const thCat = document.createElement('th');
  thCat.textContent = 'Categoria';
  headTr.appendChild(thCat);
  MONTHS.forEach(m => {
    const th = document.createElement('th');
    th.textContent = m.slice(0, 3);
    headTr.appendChild(th);
  });
  const thTotal = document.createElement('th');
  thTotal.textContent = 'Total';
  headTr.appendChild(thTotal);
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  const rendaTr = document.createElement('tr');
  rendaTr.className = 'yr-renda-row';
  rendaTr.appendChild(makeTd('💰 Renda'));
  let annualRenda = 0;
  monthTotals.forEach(d => {
    if (d) { rendaTr.appendChild(makeTd(fmt(d.renda))); annualRenda += d.renda; }
    else   { rendaTr.appendChild(makeTd('—', 'yr-empty')); }
  });
  rendaTr.appendChild(makeStrongTd(fmt(annualRenda)));
  tbody.appendChild(rendaTr);

  secIds.forEach(sid => {
    const meta = allSecMeta[sid];
    const tr = document.createElement('tr');

    const tdCat = document.createElement('td');
    const tag = document.createElement('span');
    tag.className = 'yr-sec-tag';
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(meta?.color || '') ? meta.color : '#888';
    tag.style.background = safeColor + '22';
    tag.style.color = safeColor;
    tag.textContent = meta?.title || sid;
    tdCat.appendChild(tag);
    tr.appendChild(tdCat);

    let secTotal = 0;
    monthTotals.forEach(d => {
      const v = d?.bySec[sid] || 0;
      if (d) {
        if (v > 0) {
          tr.appendChild(makeTd(fmt(v)));
        } else {
          const td = document.createElement('td');
          const span = document.createElement('span');
          span.className = 'yr-zero';
          span.textContent = '—';
          td.appendChild(span);
          tr.appendChild(td);
        }
        secTotal += v;
      } else {
        tr.appendChild(makeTd('—', 'yr-empty'));
      }
    });
    tr.appendChild(makeStrongTd(secTotal > 0 ? fmt(secTotal) : '—'));
    tbody.appendChild(tr);
  });

  const saldoTr = document.createElement('tr');
  saldoTr.className = 'yr-saldo-row';
  saldoTr.appendChild(makeTd('Saldo'));
  let annualSaldo = 0;
  monthTotals.forEach(d => {
    if (d) {
      const td = makeTd(fmt(d.saldo), d.saldo >= 0 ? 'pos' : 'neg');
      saldoTr.appendChild(td);
      annualSaldo += d.saldo;
    } else {
      saldoTr.appendChild(makeTd('—', 'yr-empty'));
    }
  });
  const saldoTotalTd = makeStrongTd(fmt(annualSaldo), annualSaldo >= 0 ? 'pos' : 'neg');
  saldoTr.appendChild(saldoTotalTd);
  tbody.appendChild(saldoTr);

  table.appendChild(tbody);

  // Show export button now that data is ready
  document.getElementById('yearReportExportBtn').style.display = '';
};

// ── CSV Export ──
window.exportYearReport = function() {
  if (!_reportSnapshot) return;
  const { monthTotals, allSecIds, allSecMeta, year } = _reportSnapshot;
  const secIds = [...allSecIds];

  // Helper: format number for CSV (dot as decimal separator, no currency symbol)
  const num = v => v.toFixed(2).replace('.', ',');

  // Helper: escape CSV field
  const esc = csvField;

  const rows = [];

  // Header row
  rows.push([esc('Categoria'), ...MONTHS.map(esc), esc('Total')].join(';'));

  // Renda row
  let annualRenda = 0;
  const rendaCols = monthTotals.map(d => { if (d) { annualRenda += d.renda; return num(d.renda); } return ''; });
  rows.push([esc('Renda'), ...rendaCols, num(annualRenda)].join(';'));

  // Section rows
  secIds.forEach(sid => {
    let secTotal = 0;
    const cols = monthTotals.map(d => {
      if (!d) return '';
      const v = d.bySec[sid] || 0;
      secTotal += v;
      return num(v);
    });
    rows.push([esc(allSecMeta[sid]?.title || sid), ...cols, num(secTotal)].join(';'));
  });

  // Despesas totais row
  let annualDesp = 0;
  const despCols = monthTotals.map(d => { if (d) { annualDesp += d.totalDesp; return num(d.totalDesp); } return ''; });
  rows.push([esc('Despesas totais'), ...despCols, num(annualDesp)].join(';'));

  // Saldo row
  let annualSaldo = 0;
  const saldoCols = monthTotals.map(d => { if (d) { annualSaldo += d.saldo; return num(d.saldo); } return ''; });
  rows.push([esc('Saldo'), ...saldoCols, num(annualSaldo)].join(';'));

  // BOM for Excel UTF-8 compatibility
  const csv     = '\uFEFF' + rows.join('\n');
  const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url     = URL.createObjectURL(blob);
  const link    = document.createElement('a');
  link.href     = url;
  link.download = `relatorio-gastos-${year}.csv`;
  link.click();
  URL.revokeObjectURL(url);

  window.showToast('Relatório exportado com sucesso!');
};

window.closeYearReport = function() {
  closeModal('yearReportModal');
};

document.getElementById('yearReportModal').addEventListener('click', function(e) {
  if (e.target === this) window.closeYearReport();
});