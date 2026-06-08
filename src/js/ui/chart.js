import { fmt, pct } from '../utils.js';
import { state } from '../state.js';

// ── Donut chart ──
export function drawDonut(slices) {
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

// ── Summary panel (chart + legend + pct list + section progress) ──
export function updateSummary(secTotals, renda, totalDesp) {
  drawDonut(secTotals.map(s => ({ color: s.color, val: s.total })));
  document.getElementById('chart-total').textContent = fmt(totalDesp);

  const leg = document.getElementById('chart-legend');
  leg.innerHTML = '';
  secTotals.forEach(s => {
    if (s.total <= 0) return;
    const p = pct(s.total, totalDesp);
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
    const fillEl = el.querySelector('.section-progress-fill');
    if (!fillEl) return;
    const p = pct(sec.total, totalDesp);
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888';
    fillEl.style.width      = p + '%';
    fillEl.style.background = safeColor;
  });
}
