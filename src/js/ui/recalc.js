import { state } from '../state.js';
import { fmt } from '../utils.js';
import { updateSummary } from './chart.js';
import { scheduleSave } from '../persist.js';

// ── Recalculate totals and update the UI ──

export function getTotalIncome() {
  let t = 0;
  document.querySelectorAll('.income-input').forEach(inp => { t += parseFloat(inp.value) || 0; });
  return t;
}

export function recalc() {
  const renda = getTotalIncome();
  let totalDesp = 0;
  const secTotals = [];
  const monthGoals = state.yearGoals[state.currentMonth] || {};

  document.querySelectorAll('.section[data-sid]').forEach(el => {
    const sid = el.dataset.sid;
    const sec = state.sections.find(s => s.id === sid);
    let sub = 0;
    el.querySelectorAll('.amount-input').forEach(inp => { sub += parseFloat(inp.value) || 0; });
    totalDesp += sub;
    const tot = el.querySelector('.section-total');
    if (tot) tot.textContent = fmt(sub);

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

  const saldo = renda - totalDesp;
  document.getElementById('stat-renda').textContent     = fmt(renda);
  document.getElementById('stat-despesas').textContent  = fmt(totalDesp);
  const ss = document.getElementById('stat-saldo');
  ss.textContent = fmt(saldo);
  ss.className   = 'val ' + (saldo >= 0 ? 'pos' : 'neg');

  updateSummary(secTotals, renda, totalDesp);
  window.updateCheckModeUI?.();
  scheduleSave();
}
