import { cents } from '../finance.js';
import { state } from '../state.js';
import { fmt } from '../utils.js';
import { updateSummary } from './chart.js';
import { scheduleSave } from '../persist.js';

// ── Recalculate totals and update the UI ──

export function getTotalIncome() {
  let t = 0;
  document.querySelectorAll('.income-input').forEach(inp => { t += cents(inp.value); });
  return t / 100;
}

export function recalc(save = true) {
  const renda = getTotalIncome();
  let totalDesp = 0;
  const secTotals = [];
  const monthGoals = state.yearGoals[state.currentMonth] || {};

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    const sec = state.sections.find(s => s.id === sid);
    let sub = 0;
    el.querySelectorAll('.amount-input').forEach(inp => { sub += cents(inp.value); });
    sub /= 100;
    totalDesp = (Math.round(totalDesp * 100) + Math.round(sub * 100)) / 100;
    const tot = el.querySelector('.section-total');
    if (tot) tot.textContent = fmt(sub);
    const remove=el.querySelector('.section-del-btn');if(remove){const imported=sec?.items.some(i=>i.invoiceId);remove.disabled=!!imported;remove.title=imported?'Mova os lançamentos da fatura para outra categoria antes de remover esta.':'Remover categoria';}

    // Goal indicator per category
    const goal = parseFloat(monthGoals[sid]) || 0;
    const goalEl = el.querySelector('.section-goal-indicator');
    if (goalEl) {
      if (goal > 0) {
        const overBudget = sub > goal;
        const pctUsed    = Math.min(Math.round(sub / goal * 100), 999);
        goalEl.innerHTML = `
          <span class="goal-badge ${overBudget ? 'over' : 'ok'}">${overBudget ? '⚠ ' : ''}${pctUsed}% da meta</span>
          <span class="goal-limit-label">limite: ${fmt(goal)}</span>`;
      } else {
        goalEl.innerHTML = '';
      }
    }

    secTotals.push({ id: sid, title: sec ? sec.title : sid, color: sec ? sec.color : '#999', total: sub });
  });

  const saldo = (Math.round(renda * 100) - Math.round(totalDesp * 100)) / 100;
  document.getElementById('stat-renda').textContent     = fmt(renda);
  document.getElementById('stat-despesas').textContent  = fmt(totalDesp);
  const ss = document.getElementById('stat-saldo');
  ss.textContent = fmt(saldo);
  ss.className   = 'val ' + (saldo >= 0 ? 'pos' : 'neg');

  updateSummary(secTotals, renda, totalDesp);
  window.renderInvoicePanel?.();
  window.updateCheckModeUI?.();
  if (save) scheduleSave();
}
