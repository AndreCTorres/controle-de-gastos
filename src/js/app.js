import { supabase } from './config.js';
import { loadMonthData, saveMonthData, loadYearGoals, saveYearGoals, loadYearData, loadMonthsWithData } from './db.js';

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
let yearGoals    = {};   // { [monthIndex]: { [sectionId]: limitValue } }

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

  try {
    await saveMonthData(currentMonth, currentYear, { incomes: incomeData, sections: secs });
  } catch (err) {
    showToast('Erro ao salvar dados. Verifique sua conexão.', 'error');
  }
}

// ── beforeunload: força save imediato se houver mudança pendente ──
window.addEventListener('beforeunload', () => {
  if (saveTimer) {
    clearTimeout(saveTimer);
    persistData(); // fire-and-forget — melhor esforço
  }
});

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
    const p  = pct(s.total, totalDesp);
    // Valida cor antes de usar em style
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(s.color || '') ? s.color : '#888';

    const el = document.createElement('div');
    el.className = 'legend-item';

    const dot = document.createElement('div');
    dot.className = 'legend-dot';
    dot.style.background = safeColor;

    const labelEl = document.createElement('span');
    labelEl.className = 'legend-label';
    labelEl.textContent = s.title;

    const pctEl = document.createElement('span');
    pctEl.className = 'legend-pct';
    pctEl.textContent = p + '%';

    el.appendChild(dot);
    el.appendChild(labelEl);
    el.appendChild(pctEl);
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
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(s.color || '') ? s.color : '#888';

    const item = document.createElement('div');
    item.className = 'pct-item';

    const head = document.createElement('div');
    head.className = 'pct-item-head';

    const nameEl = document.createElement('span');
    nameEl.className = 'pct-item-name';
    nameEl.textContent = s.title;

    const infoEl = document.createElement('span');
    infoEl.className = 'pct-item-info';
    infoEl.append(`${fmt(s.total)} · `);
    const strong = document.createElement('strong');
    strong.style.color = safeColor;
    strong.textContent = `${pctRenda}% da renda`;
    infoEl.appendChild(strong);

    head.appendChild(nameEl);
    head.appendChild(infoEl);

    const track = document.createElement('div');
    track.className = 'pct-bar-track';
    const fill = document.createElement('div');
    fill.className = 'pct-bar-fill';
    fill.style.width = Math.min(pctDesp, 100) + '%';
    fill.style.background = safeColor;
    track.appendChild(fill);

    item.appendChild(head);
    item.appendChild(track);
    pctList.appendChild(item);
  });

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    const sec = secTotals.find(s => s.id === sid);
    if (!sec) return;
    const fillEl   = el.querySelector('.section-progress-fill');
    const pctLabel = el.querySelector('.section-pct-label');
    if (!fillEl || !pctLabel) return;
    const p = pct(sec.total, totalDesp);
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888';
    fillEl.style.width      = p + '%';
    fillEl.style.background = safeColor;
    pctLabel.textContent    = totalDesp > 0 ? p + '% do total' : '';
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
  const monthGoals = yearGoals[currentMonth] || {};

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    const sec = sections.find(s => s.id === sid);
    let sub = 0;
    el.querySelectorAll('.amount-input').forEach(inp => { sub += parseFloat(inp.value) || 0; });
    totalDesp += sub;
    const tot = el.querySelector('.section-total');
    if (tot) tot.textContent = fmt(sub);

    // Indicador de meta por categoria
    const goal = parseFloat(monthGoals[sid]) || 0;
    const goalEl = el.querySelector('.section-goal-indicator');
    if (goalEl) {
      if (goal > 0) {
        const overBudget = sub > goal;
        const pctUsed    = Math.min(Math.round(sub / goal * 100), 999);
        goalEl.innerHTML = `<span class="goal-badge ${overBudget ? 'over' : 'ok'}">${overBudget ? '⚠ ' : ''}${pctUsed}% da meta</span><span class="goal-limit-label">limite: ${fmt(goal)}</span>`;
      } else {
        goalEl.innerHTML = '';
      }
    }

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
    <div class="income-label"><input type="text" placeholder="Nome da renda" maxlength="80" value="${(income.label || '').replace(/"/g, '&quot;')}"></div>
    <div class="income-input-wrap"><span>R$</span><input class="income-input" type="number" placeholder="0,00" step="0.01" min="0" max="9999999" value="${income.val || ''}"></div>
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

// ── Helper: cria e exibe toast de confirmação com botões customizados ──
// buttons: [{ label, style, onClick }]
function showConfirmToast(msgBuilder, buttons) {
  const t = document.getElementById('toast');
  clearTimeout(t._timer);
  t.className = 'toast confirm';

  const msgDiv = document.createElement('div');
  msgDiv.className = 'toast-confirm-msg';
  msgBuilder(msgDiv); // callback constrói o conteúdo da mensagem via DOM

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'toast-confirm-actions';

  const dismiss = () => {
    t.classList.remove('show');
    setTimeout(() => { t.className = 'toast'; t.innerHTML = ''; }, 300);
  };

  buttons.forEach(({ label, style, onClick }) => {
    const btn = document.createElement('button');
    btn.className = 'toast-confirm-ok';
    if (style) Object.assign(btn.style, style);
    btn.textContent = label;
    btn.addEventListener('click', () => { dismiss(); onClick(); });
    actionsDiv.appendChild(btn);
  });

  // Botão cancelar sempre presente como primeiro
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'toast-confirm-cancel';
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.addEventListener('click', dismiss);
  actionsDiv.insertBefore(cancelBtn, actionsDiv.firstChild);

  t.innerHTML = '';
  t.appendChild(msgDiv);
  t.appendChild(actionsDiv);
  void t.offsetWidth;
  t.classList.add('show');
}

// ── Propaga remoção de item para meses futuros salvos ──
async function _removeItemFromFutureMonths(sid, iid, itemLabel) {
  const futureSameYear = (await loadYearData(currentYear)).filter(m => m.month > currentMonth);
  const nextYearMonths = await loadYearData(currentYear + 1);
  const allFuture = [...futureSameYear, ...nextYearMonths];

  let count = 0;
  for (const entry of allFuture) {
    const data = entry.data;
    if (!data) continue;
    const sec = data.sections?.find(s => s.id === sid);
    if (!sec) continue;
    const before = sec.items.length;
    sec.items = sec.items.filter(i => i.id !== iid && i.label !== itemLabel);
    if (sec.items.length < before) {
      await saveMonthData(entry.month, entry.year, data);
      count++;
    }
  }
  return count;
}

// ── Propaga remoção de seção para meses futuros salvos ──
async function _removeSectionFromFutureMonths(secId) {
  const futureSameYear = (await loadYearData(currentYear)).filter(m => m.month > currentMonth);
  const nextYearMonths = await loadYearData(currentYear + 1);
  const allFuture = [...futureSameYear, ...nextYearMonths];

  let count = 0;
  for (const entry of allFuture) {
    const data = entry.data;
    if (!data) continue;
    const before = (data.sections || []).length;
    data.sections = (data.sections || []).filter(s => s.id !== secId);
    if (data.sections.length < before) {
      await saveMonthData(entry.month, entry.year, data);
      count++;
    }
  }
  return count;
}

// ── ITEM ROWS ──
function removeItem(sid, iid) {
  const sec  = sections.find(s => s.id === sid);
  const item = sec?.items.find(i => i.id === iid);
  if (!item) return;

  // ── Caso 1: parcelada — mantém fluxo especial existente ──
  if (item.parcel) {
    const baseTitle    = item.label.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
    const matchTotal   = item.label.match(/\((\d+)\/(\d+)\)$/);
    const totalParcels = matchTotal ? parseInt(matchTotal[2]) : 0;
    const currentNum   = matchTotal ? parseInt(matchTotal[1]) : 0;
    const remaining    = totalParcels - currentNum;

    const buttons = [
      {
        label: 'Só este mês',
        style: { background: 'var(--primary)', fontSize: '11px' },
        onClick: () => {
          _doRemoveItem(sid, iid);
          showToast(`Parcela ${currentNum}/${totalParcels} removida`);
        },
      },
    ];
    if (remaining > 0) {
      buttons.push({
        label: 'Este e futuros',
        style: { fontSize: '11px' },
        onClick: async () => {
          _doRemoveItem(sid, iid);
          await _removeParcelFromFutureMonths(baseTitle, sid, currentMonth, currentYear, totalParcels, currentNum);
          showToast(`"${baseTitle}" removida dos meses seguintes`);
        },
      });
    }

    showConfirmToast(msgDiv => {
      const strong = document.createElement('strong');
      strong.textContent = `"${baseTitle}"`;
      msgDiv.appendChild(strong);
      msgDiv.append(' é uma compra parcelada.');
      msgDiv.appendChild(document.createElement('br'));
      const sub = document.createElement('span');
      sub.style.cssText = 'font-weight:400;font-size:11px;opacity:0.75';
      sub.textContent = `Parcela ${currentNum} de ${totalParcels}${remaining > 0 ? ` · ${remaining} restante(s) em meses futuros` : ''}`;
      msgDiv.appendChild(sub);
    }, buttons);
    return;
  }

  // ── Caso 2: item sem valor — remove silenciosamente ──
  const hasValue = parseFloat(item.val) > 0;
  if (!hasValue) {
    _doRemoveItem(sid, iid);
    return;
  }

  // ── Caso 3: item com valor — pergunta o escopo ──
  showConfirmToast(msgDiv => {
    msgDiv.append('Remover ');
    const strong = document.createElement('strong');
    strong.textContent = `"${item.label}"`;
    msgDiv.appendChild(strong);
    msgDiv.append('?');
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:11px;color:var(--muted);margin-top:4px';
    sub.textContent = 'Escolha se a remoção vale só para este mês ou para os meses futuros também.';
    msgDiv.appendChild(sub);
  }, [
    {
      label: 'Só este mês',
      style: { background: 'var(--danger)' },
      onClick: () => {
        _doRemoveItem(sid, iid);
        showToast(`"${item.label}" removido`);
      },
    },
    {
      label: 'Este e futuros',
      style: { background: 'var(--primary)', fontSize: '11px' },
      onClick: async () => {
        _doRemoveItem(sid, iid);
        const count = await _removeItemFromFutureMonths(sid, iid, item.label);
        showToast(count > 0
          ? `"${item.label}" removido deste e de ${count} mês(es) seguinte(s)`
          : `"${item.label}" removido`);
      },
    },
  ]);
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

// ── MOVER ITEM ENTRE SEÇÕES ──
function moveItemToSection(iid, fromSid, toSid) {
  if (fromSid === toSid) return;

  const fromSec = sections.find(s => s.id === fromSid);
  const toSec   = sections.find(s => s.id === toSid);
  if (!fromSec || !toSec) return;

  const itemIdx = fromSec.items.findIndex(i => i.id === iid);
  if (itemIdx === -1) return;
  const [item] = fromSec.items.splice(itemIdx, 1);

  toSec.items.push(item);

  // Remove o row do DOM origem (sem animação de altura para não piscar)
  const oldRow = document.querySelector(`.item-row[data-iid="${iid}"]`);
  if (oldRow) oldRow.remove();

  // Insere no container destino
  const destContainer = document.querySelector(`.section[data-sid="${toSid}"] .items-container`);
  if (destContainer) {
    const newRow = buildItemRow(item, toSid);
    newRow.style.opacity   = '0';
    newRow.style.transform = 'translateY(-6px)';
    destContainer.appendChild(newRow);
    requestAnimationFrame(() => {
      newRow.style.transition = 'opacity 0.2s, transform 0.2s';
      newRow.style.opacity    = '1';
      newRow.style.transform  = 'translateY(0)';
    });
  }

  recalc();
  const toTitle = toSec.title;
  showToast(`"${item.label || 'Item'}" movido para ${toTitle}`);
}

// ── POPOVER: MOVER PARA OUTRA SEÇÃO ──
let _activeMovePopover = null;

function openMovePopover(rowEl, iid, fromSid) {
  closeMovePopover();

  const otherSections = sections.filter(s => s.id !== fromSid);
  if (otherSections.length === 0) {
    showToast('Não há outras categorias para mover o item.', 'error');
    return;
  }

  const popover = document.createElement('div');
  popover.className = 'move-popover';
  popover.innerHTML = `<div class="move-popover-title">Mover para</div>`;

  otherSections.forEach(sec => {
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888';
    const safeBg    = /^#[0-9A-Fa-f]{3,8}$/.test(sec.bg    || '') ? sec.bg    : '#F0F0F0';
    const btn = document.createElement('button');
    btn.className = 'move-popover-option';
    const tag = document.createElement('span');
    tag.className = 'move-popover-tag';
    tag.style.color      = safeColor;
    tag.style.background = safeBg;
    tag.textContent = sec.title;
    btn.appendChild(tag);
    btn.addEventListener('click', () => {
      closeMovePopover();
      moveItemToSection(iid, fromSid, sec.id);
    });
    popover.appendChild(btn);
  });

  // Posiciona o popover dentro do .item-actions (position:relative) —
  // usa CSS absolute para que zoom, scroll e layout não afetem as coordenadas.
  const btnEl      = rowEl.querySelector('.move-btn');
  const actionsEl  = rowEl.querySelector('.item-actions');

  // Decide se abre acima ou abaixo com base na posição do botão no viewport
  const btnRect    = btnEl.getBoundingClientRect();
  const midScreen  = window.innerHeight / 2;
  if (btnRect.top > midScreen) {
    popover.classList.add('popover-above');
  }

  // Insere dentro do container do botão — sem coordenadas absolutas manuais
  actionsEl.appendChild(popover);

  // Animação de entrada — setTimeout garante que o click atual já terminou
  // antes de marcar o popover como aberto (evita fechar imediatamente)
  setTimeout(() => popover.classList.add('open'), 0);

  _activeMovePopover = popover;
}

function closeMovePopover() {
  if (_activeMovePopover) {
    _activeMovePopover.remove();
    _activeMovePopover = null;
  }
}

// Fecha popover ao clicar fora
document.addEventListener('click', (e) => {
  if (_activeMovePopover && !_activeMovePopover.contains(e.target) && !e.target.closest('.move-btn')) {
    closeMovePopover();
  }
});

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
  row.dataset.sid = sid;
  if (item.parcel) row.dataset.parcel = 'true';
  row.draggable = true;
  row.innerHTML = `
    <div class="item-drag-handle" title="Arrastar para outra categoria">⠿</div>
    <div class="item-label"><input class="label-input" type="text" placeholder="Nome do item" maxlength="120" value="${(item.label || '').replace(/"/g, '&quot;')}"></div>
    <div class="item-amount">
      <span class="prefix">R$</span>
      <input class="amount-input" type="number" placeholder="—" step="0.01" min="0" max="9999999" value="${item.val || ''}">
    </div>
    <div class="item-actions">
      <button class="move-btn" title="Mover para outra categoria">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 9 2 12 5 15"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
      </button>
      <button class="clear-btn" title="Limpar valor">⌫</button>
      <button class="del-btn" title="Remover item">×</button>
    </div>`;

  row.querySelector('.amount-input').addEventListener('input', recalc);
  row.querySelector('.label-input').addEventListener('input', recalc);
  row.querySelector('.clear-btn').addEventListener('click', () => { row.querySelector('.amount-input').value = ''; recalc(); });
  row.querySelector('.del-btn').addEventListener('click', () => removeItem(sid, item.id));
  row.querySelector('.move-btn').addEventListener('click', (e) => { e.stopPropagation(); openMovePopover(row, item.id, sid); });

  // ── Drag & Drop ──
  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ iid: item.id, fromSid: sid }));
    row.classList.add('dragging');
    // Pequeno delay para o ghost aparecer antes de esconder o original
    setTimeout(() => row.classList.add('drag-hidden'), 0);
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging', 'drag-hidden');
    document.querySelectorAll('.items-container.drag-over').forEach(c => c.classList.remove('drag-over'));
    // Limpa indicador de inserção que possa ter ficado visível
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  });

  return row;
}

// ── SECTION CARDS ──
function removeSection(secId) {
  const sec = sections.find(s => s.id === secId);
  if (!sec) return;

  showConfirmToast(msgDiv => {
    msgDiv.append('Remover a categoria ');
    const strong = document.createElement('strong');
    strong.textContent = `"${sec.title}"`;
    msgDiv.appendChild(strong);
    msgDiv.append('?');
    const sub = document.createElement('div');
    sub.style.cssText = 'font-size:11px;color:var(--muted);margin-top:4px';
    sub.textContent = 'Você pode remover só deste mês ou dos meses futuros também.';
    msgDiv.appendChild(sub);
  }, [
    {
      label: 'Só este mês',
      style: { background: 'var(--danger)' },
      onClick: () => {
        _doRemoveSection(secId);
        showToast(`"${sec.title}" removida`);
      },
    },
    {
      label: 'Este e futuros',
      style: { background: 'var(--primary)', fontSize: '11px' },
      onClick: async () => {
        _doRemoveSection(secId);
        const count = await _removeSectionFromFutureMonths(secId);
        showToast(count > 0
          ? `"${sec.title}" removida deste e de ${count} mês(es) seguinte(s)`
          : `"${sec.title}" removida`);
      },
    },
  ]);
}

function _doRemoveSection(secId) {
  sections = sections.filter(s => s.id !== secId);
  const el = document.querySelector(`.section[data-sid="${secId}"]`);
  if (el) {
    el.style.transition = 'opacity 0.2s, transform 0.2s';
    el.style.opacity    = '0';
    el.style.transform  = 'scale(0.97)';
    setTimeout(() => el.remove(), 220);
  }
  setTimeout(recalc, 250);
}

function buildSection(sec) {
  // Valida cores antes de usá-las em style — valores vindos do banco ou do estado
  const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888888';
  const safeBg    = /^#[0-9A-Fa-f]{3,8}$/.test(sec.bg    || '') ? sec.bg    : '#F0F0F0';

  const div       = document.createElement('div');
  div.className   = 'section';
  div.dataset.sid = sec.id;
  div.innerHTML = `
    <div class="section-head">
      <div class="section-head-left">
        <span class="section-tag" style="color:${safeColor};background:${safeBg}"></span>
      </div>
      <div class="section-goal-indicator"></div>
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

  // Título via textContent — nunca innerHTML com dado do usuário
  div.querySelector('.section-tag').textContent = sec.title;

  const cont = div.querySelector('.items-container');
  sec.items.forEach(item => cont.appendChild(buildItemRow(item, sec.id)));

  // ── Drop target listeners ──
  cont.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Detecta o item-row sob o cursor para mostrar indicador de posição
    const target = e.target.closest('.item-row');
    // Remove qualquer indicador anterior neste container
    cont.querySelectorAll('.drop-indicator').forEach(el => el.remove());

    if (target && !target.classList.contains('drag-hidden')) {
      // Determina se o cursor está na metade superior ou inferior do item alvo
      const rect      = target.getBoundingClientRect();
      const midY      = rect.top + rect.height / 2;
      const indicator = document.createElement('div');
      indicator.className = 'drop-indicator';
      if (e.clientY < midY) {
        cont.insertBefore(indicator, target);
      } else {
        cont.insertBefore(indicator, target.nextSibling);
      }
      // Quando há posição específica não precisa highlight no container inteiro
      cont.classList.remove('drag-over');
    } else {
      // Cursor sobre área vazia do container — highlight genérico
      cont.classList.add('drag-over');
    }
  });
  cont.addEventListener('dragleave', (e) => {
    // Só limpa se realmente saiu do container (não entrou num filho)
    if (!cont.contains(e.relatedTarget)) {
      cont.classList.remove('drag-over');
      cont.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    }
  });
  cont.addEventListener('drop', (e) => {
    e.preventDefault();
    cont.classList.remove('drag-over');
    cont.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    try {
      const { iid, fromSid } = JSON.parse(e.dataTransfer.getData('text/plain'));

      if (fromSid !== sec.id) {
        // ── Mover entre seções (comportamento existente) ──
        moveItemToSection(iid, fromSid, sec.id);
      } else {
        // ── Reordenar dentro da mesma seção ──
        const draggedRow = cont.querySelector(`.item-row[data-iid="${iid}"]`);
        if (!draggedRow) return;

        // Determina o item alvo e a posição (antes ou depois)
        const target = e.target.closest('.item-row');
        if (!target || target === draggedRow) return; // sem movimento real

        const rect  = target.getBoundingClientRect();
        const after = e.clientY >= rect.top + rect.height / 2;

        if (after) {
          cont.insertBefore(draggedRow, target.nextSibling);
        } else {
          cont.insertBefore(draggedRow, target);
        }

        // Sincroniza o array sections[] com a nova ordem do DOM
        const sec2 = sections.find(s => s.id === sec.id);
        if (sec2) {
          const newOrder = [...cont.querySelectorAll('.item-row[data-iid]')]
            .map(r => r.dataset.iid);
          sec2.items.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
        }

        scheduleSave();
      }
    } catch (_) { /* dado inválido — ignora */ }
  });

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

  let data = null;
  try {
    data = await loadMonthData(currentMonth, currentYear);
  } catch (err) {
    document.getElementById('sections-container').style.opacity = '1';
    showToast('Erro ao carregar dados. Verifique sua conexão e tente novamente.', 'error');
    return;
  }

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

async function populateMonths() {
  const dropdown = document.getElementById('monthDropdown');
  dropdown.innerHTML = '';

  // Busca todos os meses com dados para calcular o intervalo real
  let startYear = 2026;
  let endYear   = currentYear + 2; // mínimo: 2 anos à frente para cobrir parcelamentos

  try {
    const saved = await loadMonthsWithData();
    if (saved.length > 0) {
      const years = saved.map(s => s.year);
      startYear = Math.min(startYear, Math.min(...years));
      endYear   = Math.max(endYear,   Math.max(...years));
    }
  } catch (e) { /* falha silenciosa — usa os valores padrão */ }

  for (let y = startYear; y <= endYear; y++) {
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
        const prevYear = currentYear;
        currentMonth = parseInt(this.dataset.m);
        currentYear  = parseInt(this.dataset.y);
        updateMonthChipLabel();
        dropdown.querySelectorAll('.month-opt').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
        closeMonthDropdown();
        // Se o ano mudou, recarrega as metas do novo ano
        if (currentYear !== prevYear) {
          loadYearGoals(currentYear).then(g => { yearGoals = g || {}; }).catch(() => {});
        }
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

  // Exporta todas as rendas com valor
  incomes.forEach(inc => {
    const v = parseFloat(document.querySelector(`.income-row[data-iid="${inc.id}"] .income-input`)?.value) || 0;
    csv += `${inc.label};${v.toFixed(2).replace('.', ',')}\n`;
  });
  csv += `Total Renda;${renda.toFixed(2).replace('.', ',')}\n`;

  let total = 0;
  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid   = el.dataset.sid;
    const sec   = sections.find(s => s.id === sid);
    const title = el.querySelector('.section-tag').textContent;
    // Inclui cor e bg para reconstrução fiel no import
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
    download: `gastos_${MONTHS[currentMonth]}_${currentYear}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
};

// ── IMPORT MODAL ──
let _importParsed = null; // { incomes, sections } prontos para confirmar

// Gera o prompt para a IA baseado no formato de exportação atual
function buildImportPrompt() {
  const exampleSections = DEFAULT_SECTIONS.slice(0, 3)
    .map(s => `${s.title};color:${s.color};bg:${s.bg}\n${s.items.slice(0, 2).map(i => `${i.label};0,00`).join('\n')}`)
    .join('\n\n');

  return `Tenho uma planilha com meus gastos mensais e preciso converter os dados para um formato CSV específico.

FORMATO ESPERADO (cada bloco é uma categoria):
Renda principal;3500,00
Renda extra;500,00

Supermercado;color:#2D6A4F;bg:#E8F5EE
Alimentos;320,50
Carnes;150,00

Moradia & Contas;color:#1D5A8A;bg:#E8F0FA
Conta de luz;85,00
Internet;120,00

REGRAS IMPORTANTES:
- Primeira seção são as RENDAS (sem cabeçalho, apenas nome;valor)
- Depois cada categoria no formato: NomeCategoria;color:#HEXCOR;bg:#HEXFUNDO
- Os itens dentro de cada categoria: NomeItem;valor
- Valores usam vírgula como decimal (ex: 1.250,00)
- Se não souber a cor de uma categoria, omita os valores de cor (deixe color: e bg: vazios)
- Não inclua totais, cabeçalhos extras ou colunas desnecessárias
- Linhas em branco entre categorias são opcionais

Aqui estão os meus dados da planilha — por favor converta para esse formato CSV:
[COLE AQUI OS DADOS DA SUA PLANILHA]`;
}

window.triggerImport = function() {
  openImportModal();
};

window.openImportModal = function() {
  _importParsed = null;

  // Popula o prompt
  const promptEl = document.getElementById('importPromptText');
  if (promptEl) promptEl.textContent = buildImportPrompt();

  // Reseta estado visual
  document.getElementById('importStep1').style.display = '';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importBackBtn').style.display = 'none';
  document.getElementById('importNextBtn').textContent = 'Continuar →';
  document.getElementById('importCsvTextarea').value = '';
  document.getElementById('importParseError').style.display = 'none';

  document.getElementById('importModal').classList.add('open');
};

window.closeImportModal = function() {
  document.getElementById('importModal').classList.remove('open');
  _importParsed = null;
};

window.copyImportPrompt = function() {
  const text = document.getElementById('importPromptText').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('importCopyBtn');
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copiado!`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar`;
    }, 2200);
  }).catch(() => showToast('Não foi possível copiar. Selecione e copie manualmente.', 'error'));
};

// Leitura de arquivo no input do modal de importação
document.getElementById('csvImportFileInput')?.addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('importCsvTextarea').value = e.target.result;
    document.getElementById('importParseError').style.display = 'none';
  };
  reader.readAsText(file, 'UTF-8');
  this.value = '';
});

// Parseia o CSV no formato do app — retorna { incomes, sections } ou lança erro com mensagem
function parseImportCsv(rawText) {
  // Remove BOM se presente
  const text  = rawText.replace(/^\uFEFF/, '').trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) throw new Error('O arquivo parece vazio ou muito curto. Verifique se o conteúdo foi colado corretamente.');

  const importedIncomes  = [];
  const importedSections = [];

  // Reseta o índice de cor para que cada importação comece da primeira cor da paleta
  importSecColorIdx = 0;

  // Regex para linha de seção com cores
  const secColorRe = /^(.+?);color:(#[0-9A-Fa-f]{3,8})?;bg:(#[0-9A-Fa-f]{3,8})?$/i;

  // Cor cinza genérica que a IA costuma gerar — será substituída pela paleta
  const GRAY_COLOR = /^#8{6}$/i;

  let inHeaderBlock = true; // tudo antes da primeira linha de seção são rendas
  let currentSec = null;
  let idCounter  = 0;
  const uid = () => 'imp_' + Date.now() + '_' + (idCounter++);

  // Detecta se há bloco RENDAS explícito (formato de exportação do app)
  const hasRendasBlock  = lines.some(l => l.trim() === 'RENDAS');
  let inRendasBlock     = false;

  lines.forEach(line => {
    const parts  = line.split(';');
    const label  = (parts[0] || '').trim();
    const rawVal = (parts[1] || '').trim().replace(/\./g, '').replace(',', '.');
    const val    = parseFloat(rawVal) || 0;

    // Ignora linhas de metadados do export nativo
    if (label === 'Total Renda' || label === 'TOTAL DESPESAS' || label === 'SALDO') return;
    if (line.startsWith('Controle de Gastos')) return; // título do export

    // Formato export nativo — bloco RENDAS explícito
    if (hasRendasBlock) {
      if (label === 'RENDAS') { inRendasBlock = true; inHeaderBlock = false; return; }
      if (inRendasBlock) {
        const colorMatch = secColorRe.exec(line);
        if (colorMatch) { inRendasBlock = false; } // saiu do bloco de rendas — cai no tratamento de seção abaixo
        else {
          importedIncomes.push({ id: importedIncomes.length === 0 ? 'main' : uid(), label, val: val > 0 ? String(val) : '' });
          return;
        }
      }
    }

    // Linha de seção (com metadados de cor)
    const colorMatch = secColorRe.exec(line);
    if (colorMatch) {
      inHeaderBlock = false;
      const title    = colorMatch[1].trim();
      const csvColor = colorMatch[2] || '';
      const csvBg    = colorMatch[3] || '';
      const defSec   = DEFAULT_SECTIONS.find(s => s.title.toLowerCase() === title.toLowerCase());

      // Usa a cor do CSV só se for uma cor real (não ausente e não o cinza genérico da IA)
      const isGenericGray = (c) => !c || GRAY_COLOR.test(c) || c.toLowerCase() === '#f0f0f0';
      let resolvedColor, resolvedBg;
      if (defSec) {
        // Categoria padrão conhecida — sempre usa a cor canônica, independente do CSV
        resolvedColor = defSec.color;
        resolvedBg    = defSec.bg;
      } else if (!isGenericGray(csvColor)) {
        // CSV trouxe cor real para categoria customizada — respeita
        resolvedColor = csvColor;
        resolvedBg    = !isGenericGray(csvBg) ? csvBg : NEW_SEC_COLORS[importSecColorIdx % NEW_SEC_COLORS.length].bg;
      } else {
        // Sem cor útil — atribui da paleta rotativa
        const palette = NEW_SEC_COLORS[importSecColorIdx % NEW_SEC_COLORS.length];
        resolvedColor = palette.color;
        resolvedBg    = palette.bg;
        importSecColorIdx++;
      }

      currentSec = {
        id:    defSec ? defSec.id : 'imp_custom_' + uid(),
        title,
        color: resolvedColor,
        bg:    resolvedBg,
        items: [],
      };
      importedSections.push(currentSec);
      return;
    }

    // Cabeçalho de seção — sem metadados (fallback: só nome da categoria sem valor)
    const defSecMatch = DEFAULT_SECTIONS.find(s => s.title.toLowerCase() === label.toLowerCase());
    if (defSecMatch && (parts.length === 1 || !rawVal)) {
      inHeaderBlock = false;
      currentSec = { ...defSecMatch, items: [] };
      importedSections.push(currentSec);
      return;
    }

    // Linha de renda (antes da primeira seção, no formato simples sem bloco RENDAS)
    if (inHeaderBlock && !hasRendasBlock && label && parts.length >= 1) {
      importedIncomes.push({ id: importedIncomes.length === 0 ? 'main' : uid(), label, val: val > 0 ? String(val) : '' });
      return;
    }

    // Item de seção
    if (currentSec && label) {
      currentSec.items.push({ id: uid(), label, val: val > 0 ? String(val) : '' });
    }
  });

  if (importedIncomes.length === 0) {
    importedIncomes.push({ id: 'main', label: 'Renda principal', val: '' });
  }
  if (importedSections.length === 0) {
    throw new Error('Nenhuma categoria foi encontrada no CSV. Verifique se o formato está correto — cada categoria precisa da linha "Nome;color:#COR;bg:#FUNDO".');
  }

  return { incomes: importedIncomes, sections: importedSections };
}

// Monta o painel de preview
function renderImportPreview(parsed) {
  const body = document.getElementById('importPreviewBody');
  body.innerHTML = '';

  // Rendas
  const rendaCard = document.createElement('div');
  rendaCard.className = 'import-preview-renda';
  const rendaHead = document.createElement('div');
  rendaHead.className = 'import-preview-renda-head';
  rendaHead.textContent = '💵 Rendas';
  rendaCard.appendChild(rendaHead);
  parsed.incomes.forEach(inc => {
    const row = document.createElement('div');
    row.className = 'import-preview-item';
    const lbl = document.createElement('span');
    lbl.className = 'import-preview-item-label';
    lbl.textContent = inc.label || 'Renda';
    const vEl = document.createElement('span');
    const v = parseFloat(inc.val) || 0;
    vEl.className = 'import-preview-item-val' + (v === 0 ? ' empty' : '');
    vEl.textContent = v > 0 ? fmt(v) : '—';
    row.appendChild(lbl); row.appendChild(vEl);
    rendaCard.appendChild(row);
  });
  body.appendChild(rendaCard);

  // Seções
  parsed.sections.forEach(sec => {
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888';
    const safeBg    = /^#[0-9A-Fa-f]{3,8}$/.test(sec.bg    || '') ? sec.bg    : '#F0F0F0';
    const total = sec.items.reduce((a, i) => a + (parseFloat(i.val) || 0), 0);

    const card = document.createElement('div');
    card.className = 'import-preview-section';

    const head = document.createElement('div');
    head.className = 'import-preview-section-head';

    const tag = document.createElement('span');
    tag.className = 'section-tag';
    tag.style.color      = safeColor;
    tag.style.background = safeBg;
    tag.textContent = sec.title;

    const totEl = document.createElement('span');
    totEl.className = 'import-preview-section-total';
    totEl.textContent = total > 0 ? fmt(total) : '—';

    head.appendChild(tag); head.appendChild(totEl);
    card.appendChild(head);

    sec.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'import-preview-item';
      const lbl = document.createElement('span');
      lbl.className = 'import-preview-item-label';
      lbl.textContent = item.label || 'Item';
      const vEl = document.createElement('span');
      const v = parseFloat(item.val) || 0;
      vEl.className = 'import-preview-item-val' + (v === 0 ? ' empty' : '');
      vEl.textContent = v > 0 ? fmt(v) : '—';
      row.appendChild(lbl); row.appendChild(vEl);
      card.appendChild(row);
    });
    body.appendChild(card);
  });
}

window.importNext = async function() {
  const step1 = document.getElementById('importStep1');
  const step2 = document.getElementById('importStep2');

  // Passo 1 → valida e vai para preview
  if (step2.style.display === 'none') {
    const raw = document.getElementById('importCsvTextarea').value.trim();
    const errEl = document.getElementById('importParseError');

    if (!raw) {
      errEl.textContent = 'Cole ou carregue um arquivo CSV antes de continuar.';
      errEl.style.display = '';
      return;
    }

    try {
      _importParsed = parseImportCsv(raw);
      errEl.style.display = 'none';
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = '';
      return;
    }

    renderImportPreview(_importParsed);
    document.getElementById('importTargetMonthLabel').textContent = `${MONTHS[currentMonth]} ${currentYear}`;

    step1.style.display = 'none';
    step2.style.display = '';
    document.getElementById('importBackBtn').style.display = '';
    document.getElementById('importNextBtn').textContent = 'Importar dados';
    return;
  }

  // Passo 2 → confirma importação
  if (!_importParsed) return;

  incomes  = _importParsed.incomes;
  sections = _importParsed.sections;
  renderIncomes();
  renderSections();
  recalc();
  closeImportModal();
  showToast(`Dados importados para ${MONTHS[currentMonth]} ${currentYear}!`);
};

window.importGoBack = function() {
  document.getElementById('importStep1').style.display = '';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importBackBtn').style.display = 'none';
  document.getElementById('importNextBtn').textContent = 'Continuar →';
};

document.getElementById('importModal')?.addEventListener('click', function(e) {
  if (e.target === this) closeImportModal();
});

// ── PDF EXPORT ──
window.exportPDF = function() {
  let ph = document.getElementById('print-header-inject');
  if (!ph) {
    ph = document.createElement('div');
    ph.id = 'print-header-inject';
    ph.className = 'print-header';
    document.querySelector('.main').prepend(ph);
  }
  const renda = getTotalIncome();
  const despesas = document.getElementById('stat-despesas').textContent;
  const saldo    = document.getElementById('stat-saldo').textContent;
  const saldoNeg = parseFloat(saldo.replace(/[^\d,\-]/g, '').replace(',', '.')) < 0;
  ph.innerHTML = `
    <div class="print-header-title">Controle de Gastos — ${MONTHS[currentMonth]} ${currentYear}</div>
    <div class="print-header-sub">
      <span>Renda: <strong>${fmt(renda)}</strong></span>
      <span class="print-sep">·</span>
      <span>Despesas: <strong>${despesas}</strong></span>
      <span class="print-sep">·</span>
      <span>Saldo: <strong style="color:${saldoNeg ? '#c0392b' : '#2D6A4F'}">${saldo}</strong></span>
    </div>
    <div class="print-header-rule"></div>
  `;

  // Move summary-row para o final do .main antes de imprimir
  const main       = document.querySelector('.main');
  const summaryRow = document.querySelector('.summary-row');
  const summaryOriginalNext = summaryRow?.nextSibling;
  if (summaryRow) main.appendChild(summaryRow);

  window.print();

  // Restaura a posição original do summary-row após o print
  if (summaryRow && summaryOriginalNext) {
    main.insertBefore(summaryRow, summaryOriginalNext);
  } else if (summaryRow) {
    // Estava no final — garante posição após income-banner
    const incomeBanner = document.querySelector('.income-banner');
    if (incomeBanner?.nextSibling) main.insertBefore(summaryRow, incomeBanner.nextSibling);
  }
};

window.toggleCsvMenu = function() {
  document.getElementById('csvMenu').classList.toggle('open');
};

window.closeCsvMenu = function() {
  document.getElementById('csvMenu').classList.remove('open');
};


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

  const check = document.createElement('div');
  check.className = 'copy-option-check';

  const info = document.createElement('div');

  const labelEl = document.createElement('div');
  labelEl.className   = 'copy-option-label';
  labelEl.textContent = label; // textContent — seguro contra XSS

  const subEl = document.createElement('div');
  subEl.className   = 'copy-option-sub';
  subEl.textContent = sub;

  info.appendChild(labelEl);
  info.appendChild(subEl);
  el.appendChild(check);
  el.appendChild(info);

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
let newSecColorIdx    = 0;
let importSecColorIdx = 0; // contador separado para importação — não interfere com o modal

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
    tag.textContent = sec.title; // textContent — seguro

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

  document.getElementById('parcelModal').classList.add('open');
  setTimeout(() => document.getElementById('parcelTitle').focus(), 120);
};

window.closeParcelModal = function() {
  document.getElementById('parcelModal').classList.remove('open');
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

    // Calcula o ano da última parcela
    let lastMonth = currentMonth + (count - 1);
    let lastYear  = currentYear;
    while (lastMonth > 11) { lastMonth -= 12; lastYear++; }

    // Avisa se ultrapassa o horizonte atual do seletor (currentYear + 2)
    const selectorHorizon = currentYear + 2;
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

  // Após salvar, reconstrói o seletor de meses para incluir
  // quaisquer anos novos criados pelas parcelas
  await populateMonths();
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
// Called directly by auth.js after session is confirmed
export async function initApp(user) {
  await populateMonths();
  yearGoals = (await loadYearGoals(currentYear)) || {};
  await loadMonth();
  await checkForUpdates(user);
  await maybeShowWelcome(user);
}

// ── UPDATE NOTIFICATION ──
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

    // Usa textContent para evitar XSS — dados do banco nunca vão para innerHTML
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
      document.getElementById('updateModal').classList.remove('open');
      await supabase.auth.updateUser({ data: { last_update_seen: data.id } });
    }, { once: true });
  } catch (e) { /* silently ignore */ }
}

// ── WELCOME MODAL ──
async function maybeShowWelcome(user) {
  const seen = user.user_metadata?.welcome_seen;
  if (seen) return;

  const name = user.user_metadata?.name || user.email.split('@')[0];
  document.getElementById('welcomeModalTitle').textContent  = `Olá, ${name}! 👋`;

  const modal = document.getElementById('welcomeModal');
  modal.classList.add('open');

  document.getElementById('welcomeModalBtn').addEventListener('click', async () => {
    modal.classList.remove('open');
    // Marca como visto para não aparecer de novo
    await supabase.auth.updateUser({ data: { welcome_seen: true } });
  }, { once: true });
}

// ═══════════════════════════════════════════════════════
// ── METAS MENSAIS ──
// ═══════════════════════════════════════════════════════

window.openGoalsModal = async function() {
  // Recarrega metas do ano atual caso tenha mudado
  yearGoals = (await loadYearGoals(currentYear)) || {};
  const monthGoals = yearGoals[currentMonth] || {};

  const body = document.getElementById('goalsModalBody');
  body.innerHTML = '';

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid  = el.dataset.sid;
    const sec  = sections.find(s => s.id === sid);
    if (!sec) return;
    const goal = monthGoals[sid] || '';

    const row = document.createElement('div');
    row.className = 'goal-row';

    // Label com tag colorida — cores validadas, título em textContent
    const labelDiv = document.createElement('div');
    labelDiv.className = 'goal-row-label';
    const tag = document.createElement('span');
    tag.className = 'goal-tag';
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888';
    const safeBg    = /^#[0-9A-Fa-f]{3,8}$/.test(sec.bg    || '') ? sec.bg    : '#eee';
    tag.style.background = safeBg;
    tag.style.color = safeColor;
    tag.textContent = sec.title;
    labelDiv.appendChild(tag);

    // Input wrap
    const inputWrap = document.createElement('div');
    inputWrap.className = 'goal-input-wrap';
    const currency = document.createElement('span');
    currency.className = 'goal-currency';
    currency.textContent = 'R$';
    const input = document.createElement('input');
    input.className = 'goal-input';
    input.type = 'number';
    input.placeholder = 'Sem meta';
    input.step = '0.01';
    input.min = '0';
    input.max = '9999999'; // limite razoável
    input.dataset.sid = sid;
    if (goal) input.value = goal;
    input.addEventListener('focus',  () => { input.style.borderColor = 'var(--primary)'; });
    input.addEventListener('blur',   () => { input.style.borderColor = 'var(--border)'; });
    inputWrap.appendChild(currency);
    inputWrap.appendChild(input);

    row.appendChild(labelDiv);
    row.appendChild(inputWrap);
    body.appendChild(row);
  });

  document.getElementById('goalsModal').classList.add('open');
};

window.closeGoalsModal = function() {
  document.getElementById('goalsModal').classList.remove('open');
};

window.confirmGoals = async function() {
  const monthGoals = {};
  document.querySelectorAll('.goal-input[data-sid]').forEach(inp => {
    const v = parseFloat(inp.value);
    if (v > 0) monthGoals[inp.dataset.sid] = v;
  });

  yearGoals[currentMonth] = monthGoals;

  try {
    await saveYearGoals(currentYear, yearGoals);
    recalc();
    closeGoalsModal();
    showToast('Metas salvas!');
  } catch (err) {
    showToast('Erro ao salvar metas. Tente novamente.', 'error');
  }
};

document.getElementById('goalsModal').addEventListener('click', function(e) {
  if (e.target === this) closeGoalsModal();
});

// ═══════════════════════════════════════════════════════
// ── RELATÓRIO ANUAL ──
// ═══════════════════════════════════════════════════════

window.openYearReport = async function() {
  const modal = document.getElementById('yearReportModal');
  const body  = document.getElementById('yearReportBody');

  body.innerHTML = `<div class="year-report-loading"><div class="spinner"></div></div>`;
  modal.classList.add('open');

  let yearData = [];
  try {
    yearData = await loadYearData(currentYear);
  } catch (err) {
    body.innerHTML = `<p style="color:var(--danger);text-align:center;padding:32px">Erro ao carregar dados. Verifique sua conexão.</p>`;
    return;
  }

  document.getElementById('yearReportTitle').textContent = `Relatório Anual de Gastos — ${currentYear}`;

  // Monta mapa: month → { incomes, sections }
  const byMonth = {};
  yearData.forEach(row => { byMonth[row.month] = row.data; });

  // Agrega totais por mês e por categoria
  const allSecIds   = new Set();
  const allSecMeta  = {}; // id → { title, color }
  const monthTotals = []; // array de 12 posições

  for (let m = 0; m < 12; m++) {
    const d = byMonth[m];
    if (!d) { monthTotals.push(null); continue; }

    const renda = (d.incomes || []).reduce((a, i) => a + (parseFloat(i.val) || 0), 0);
    const bySec = {};
    let totalDesp = 0;
    (d.sections || []).forEach(sec => {
      allSecIds.add(sec.id);
      allSecMeta[sec.id] = { title: sec.title, color: sec.color };
      const sub = (sec.items || []).reduce((a, i) => a + (parseFloat(i.val) || 0), 0);
      bySec[sec.id] = sub;
      totalDesp += sub;
    });
    monthTotals.push({ renda, totalDesp, bySec, saldo: renda - totalDesp });
  }

  // ── Sumário anual ──
  const activeMonths = monthTotals.filter(Boolean);
  const totalRenda   = activeMonths.reduce((a, m) => a + m.renda, 0);
  const totalDesp    = activeMonths.reduce((a, m) => a + m.totalDesp, 0);
  const totalSaldo   = totalRenda - totalDesp;
  const avgDesp      = activeMonths.length > 0 ? totalDesp / activeMonths.length : 0;

  // Mês com maior despesa
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
        <div class="yr-val" style="font-size:14px">${peakLabel}</div>
      </div>
    </div>

    <div class="yr-section-title">Despesas por mês</div>
    <div class="yr-bar-chart" id="yrBarChart"></div>

    <div class="yr-section-title" style="margin-top:24px">Detalhamento mensal</div>
    <div class="yr-table-wrap">
      <table class="yr-table" id="yrTable"></table>
    </div>
  `;

  // ── Gráfico de barras (vertical, valor na horizontal) ──
  const barChart = document.getElementById('yrBarChart');
  const maxDesp  = Math.max(...monthTotals.map(m => m ? m.totalDesp : 0), 1);
  MONTHS.forEach((name, i) => {
    const d   = monthTotals[i];
    const pct = d && d.totalDesp > 0 ? Math.max(Math.round(d.totalDesp / maxDesp * 100), 2) : 0;
    const isNeg = d && d.saldo < 0;
    const col = document.createElement('div');
    col.className = 'yr-bar-col';
    col.innerHTML = `
      <div class="yr-bar-val${d && d.totalDesp > 0 ? '' : ' empty'}">${d && d.totalDesp > 0 ? fmt(d.totalDesp) : ''}</div>
      <div class="yr-bar-track">
        <div class="yr-bar-fill ${isNeg ? 'neg' : ''}" style="height:${pct}%"></div>
      </div>
      <div class="yr-bar-label">${name.slice(0,3)}</div>
    `;
    barChart.appendChild(col);
  });

  // ── Tabela ──
  const table = document.getElementById('yrTable');

  // Helper seguro para criar célula <td>
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

  // Header
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

  // Body
  const tbody = document.createElement('tbody');

  // Renda row
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

  // Por categoria
  secIds.forEach(sid => {
    const meta = allSecMeta[sid];
    const tr = document.createElement('tr');

    // Célula de categoria com tag colorida — cor vem do banco, usamos só como style
    const tdCat = document.createElement('td');
    const tag = document.createElement('span');
    tag.className = 'yr-sec-tag';
    // Cor é usada apenas em style (não executável), título em textContent
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

  // Saldo row
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
};

window.closeYearReport = function() {
  document.getElementById('yearReportModal').classList.remove('open');
};

document.getElementById('yearReportModal').addEventListener('click', function(e) {
  if (e.target === this) closeYearReport();
});
