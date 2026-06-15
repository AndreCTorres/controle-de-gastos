import { state } from '../state.js';
import { scheduleSave } from '../persist.js';
import { loadMonthData, saveMonthData, loadYearData } from '../db.js';
import { recalc } from './recalc.js';
import { showConfirmToast } from './toast.js';

// ── Propagate parcel removal to future months ──
export async function _removeParcelFromFutureMonths(baseTitle, sid, fromMonth, fromYear, totalParcels, fromNum) {
  // Build list of (month, year, expected label) for all remaining parcels
  const targets = [];
  for (let n = fromNum + 1; n <= totalParcels; n++) {
    let m = fromMonth + (n - fromNum);
    let y = fromYear;
    while (m > 11) { m -= 12; y++; }
    targets.push({ m, y, label: `${baseTitle} (${n}/${totalParcels})` });
  }

  // Load all months in parallel
  const loaded = await Promise.all(
    targets.map(async t => ({ ...t, data: await loadMonthData(t.m, t.y) }))
  );

  // Mutate and save in parallel (only months that actually had the parcel)
  await Promise.all(
    loaded
      .filter(t => t.data)
      .map(t => {
        const sec = t.data.sections?.find(s => s.id === sid);
        if (sec) sec.items = sec.items.filter(i => i.label !== t.label);
        return saveMonthData(t.m, t.y, t.data);
      })
  );
}

export async function _moveParcelInFutureMonths(baseTitle, fromSid, toSection, fromMonth, fromYear, totalParcels, fromNum) {
  const targets = [];
  for (let n = fromNum + 1; n <= totalParcels; n++) {
    let m = fromMonth + (n - fromNum);
    let y = fromYear;
    while (m > 11) { m -= 12; y++; }
    targets.push({ m, y, label: `${baseTitle} (${n}/${totalParcels})` });
  }

  let count = 0;
  for (const t of targets) {
    const data = await loadMonthData(t.m, t.y);
    if (!data?.sections) continue;

    const fromSec = data.sections.find(s => s.id === fromSid);
    if (!fromSec) continue;

    const itemIdx = (fromSec.items || []).findIndex(i => i.label === t.label);
    if (itemIdx === -1) continue;

    const [item] = fromSec.items.splice(itemIdx, 1);
    let destSec = data.sections.find(s =>
      s.id === toSection.id || (s.title || '').trim().toLowerCase() === (toSection.title || '').trim().toLowerCase()
    );
    if (!destSec) {
      destSec = { ...toSection, items: [] };
      data.sections.push(destSec);
    }
    destSec.items = destSec.items || [];
    destSec.items.push(item);
    await saveMonthData(t.m, t.y, data);
    count++;
  }
  return count;
}

// ── Propagate item removal to future months ──
export async function _removeItemFromFutureMonths(sid, iid, itemLabel) {
  const futureSameYear = (await loadYearData(state.currentYear)).filter(m => m.month > state.currentMonth);
  const nextYearMonths = await loadYearData(state.currentYear + 1);
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

// ── Propagate section removal to future months ──
export async function _removeSectionFromFutureMonths(secId) {
  const futureSameYear = (await loadYearData(state.currentYear)).filter(m => m.month > state.currentMonth);
  const nextYearMonths = await loadYearData(state.currentYear + 1);
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

// ── Remove item (always confirms before deleting) ──
export function removeItem(sid, iid) {
  const sec  = state.sections.find(s => s.id === sid);
  const item = sec?.items.find(i => i.id === iid);
  if (!item) return;

  // Case 1: installment — special flow
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
          window.showToast(`Parcela ${currentNum}/${totalParcels} removida`);
        },
      },
    ];
    if (remaining > 0) {
      buttons.push({
        label: 'Este e futuros',
        style: { fontSize: '11px' },
        onClick: async () => {
          _doRemoveItem(sid, iid);
          await _removeParcelFromFutureMonths(baseTitle, sid, state.currentMonth, state.currentYear, totalParcels, currentNum);
          window.showToast(`"${baseTitle}" removida dos meses seguintes`);
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

  // Case 2: item with no value — still confirm, but only for the current month
  const hasValue = parseFloat(item.val) > 0;
  if (!hasValue) {
    showConfirmToast(msgDiv => {
      msgDiv.append('Remover ');
      const strong = document.createElement('strong');
      strong.textContent = `"${item.label || 'item sem nome'}"`;
      msgDiv.appendChild(strong);
      msgDiv.append('?');
    }, [
      {
        label: 'Remover',
        style: { background: 'var(--danger)' },
        onClick: () => {
          _doRemoveItem(sid, iid);
          window.showToast(`"${item.label || 'Item'}" removido`);
        },
      },
    ]);
    return;
  }

  // Case 3: item with value — ask scope
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
        window.showToast(`"${item.label}" removido`);
      },
    },
    {
      label: 'Este e futuros',
      style: { background: 'var(--primary)', fontSize: '11px' },
      onClick: async () => {
        _doRemoveItem(sid, iid);
        const count = await _removeItemFromFutureMonths(sid, iid, item.label);
        window.showToast(count > 0
          ? `"${item.label}" removido deste e de ${count} mês(es) seguinte(s)`
          : `"${item.label}" removido`);
      },
    },
  ]);
}

function _doRemoveItem(sid, iid) {
  const sec = state.sections.find(s => s.id === sid);
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

// ── Move item between sections ──
export function moveItemToSection(iid, fromSid, toSid) {
  if (fromSid === toSid) return;

  const fromSec = state.sections.find(s => s.id === fromSid);
  const toSec   = state.sections.find(s => s.id === toSid);
  if (!fromSec || !toSec) return;

  const itemIdx = fromSec.items.findIndex(i => i.id === iid);
  if (itemIdx === -1) return;
  const item = fromSec.items[itemIdx];

  if (item.parcel) {
    const baseTitle    = item.label.replace(/\s*\(\d+\/\d+\)\s*$/, '').trim();
    const matchTotal   = item.label.match(/\((\d+)\/(\d+)\)$/);
    const totalParcels = matchTotal ? parseInt(matchTotal[2]) : 0;
    const currentNum   = matchTotal ? parseInt(matchTotal[1]) : 0;
    const remaining    = totalParcels - currentNum;

    if (remaining > 0) {
      showConfirmToast(msgDiv => {
        msgDiv.append('Mover as próximas parcelas de ');
        const strong = document.createElement('strong');
        strong.textContent = `"${baseTitle}"`;
        msgDiv.appendChild(strong);
        msgDiv.append(` para "${toSec.title}" também?`);
        const sub = document.createElement('div');
        sub.style.cssText = 'font-size:11px;color:var(--muted);margin-top:4px';
        sub.textContent = `Se a categoria não existir nos meses futuros, ela será criada com o mesmo nome.`;
        msgDiv.appendChild(sub);
      }, [
        {
          label: 'Só este mês',
          style: { background: 'var(--primary)' },
          onClick: () => _doMoveItemToSection(iid, fromSid, toSid),
        },
        {
          label: 'Este e futuros',
          style: { fontSize: '11px' },
          onClick: async () => {
            try {
              _doMoveItemToSection(iid, fromSid, toSid);
              const count = await _moveParcelInFutureMonths(baseTitle, fromSid, toSec, state.currentMonth, state.currentYear, totalParcels, currentNum);
              window.showToast(count > 0
                ? `Parcelas futuras movidas para ${toSec.title}`
                : `Item movido para ${toSec.title}`);
            } catch (err) {
              console.error('move parcel future months:', err);
              window.showToast('Item movido neste mês, mas não foi possível atualizar as parcelas futuras.', 'error');
            }
          },
        },
      ]);
      return;
    }
  }

  _doMoveItemToSection(iid, fromSid, toSid);
}

function _doMoveItemToSection(iid, fromSid, toSid) {
  const fromSec = state.sections.find(s => s.id === fromSid);
  const toSec   = state.sections.find(s => s.id === toSid);
  if (!fromSec || !toSec) return;

  const itemIdx = fromSec.items.findIndex(i => i.id === iid);
  if (itemIdx === -1) return;
  const [item] = fromSec.items.splice(itemIdx, 1);

  toSec.items.push(item);

  const oldRow = document.querySelector(`.item-row[data-iid="${iid}"]`);
  if (oldRow) oldRow.remove();

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
  window.showToast(`"${item.label || 'Item'}" movido para ${toSec.title}`);
}

// ── Move popover ──
let _activeMovePopover = null;

export function openMovePopover(rowEl, iid, fromSid) {
  closeMovePopover();

  const otherSections = state.sections.filter(s => s.id !== fromSid);
  if (otherSections.length === 0) {
    window.showToast('Não há outras categorias para mover o item.', 'error');
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

  const btnEl     = rowEl.querySelector('.move-btn');
  const actionsEl = rowEl.querySelector('.item-actions');

  const btnRect   = btnEl.getBoundingClientRect();
  const midScreen = window.innerHeight / 2;
  if (btnRect.top > midScreen) {
    popover.classList.add('popover-above');
  }

  actionsEl.appendChild(popover);

  setTimeout(() => popover.classList.add('open'), 0);
  _activeMovePopover = popover;
}

export function closeMovePopover() {
  if (_activeMovePopover) {
    _activeMovePopover.remove();
    _activeMovePopover = null;
  }
}

// Close popover when clicking outside
document.addEventListener('click', (e) => {
  if (_activeMovePopover && !_activeMovePopover.contains(e.target) && !e.target.closest('.move-btn')) {
    closeMovePopover();
  }
});

// ── Build a single item row ──
export function buildItemRow(item, sid) {
  const row       = document.createElement('div');
  row.className   = 'item-row';
  row.dataset.iid = item.id;
  row.dataset.sid = sid;
  if (item.parcel) row.dataset.parcel = 'true';
  row.draggable = true;
  row.innerHTML = `
    <div class="item-drag-handle" title="Arrastar para outra categoria">⠿</div>
    <button class="item-check-toggle" type="button" title="Marcar como conferido" aria-label="Marcar item como conferido">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    </button>
    <div class="item-label"><input class="label-input" type="text" placeholder="Nome do item" maxlength="120" value="${(item.label || '').replace(/"/g, '&quot;')}"></div>
    <div class="item-amount">
      <span class="prefix">R$</span>
      <input class="amount-input" type="number" placeholder="—" step="0.01" min="0" max="9999999" value="${item.val || ''}">
    </div>
    <div class="item-actions">
      <button class="move-btn" title="Mover para outra categoria" aria-label="Mover item para outra categoria">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="5 9 2 12 5 15"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
      </button>
      <button class="clear-btn" title="Limpar valor" aria-label="Limpar valor do item">⌫</button>
      <button class="del-btn" title="Remover item" aria-label="Remover item">×</button>
    </div>`;

  row.querySelector('.amount-input').addEventListener('input', e => {
    // Clamp negative values and scientific notation on the fly
    const raw = parseFloat(e.target.value);
    if (!isNaN(raw) && raw < 0) e.target.value = '0';
    recalc();
  });
  row.querySelector('.label-input').addEventListener('input', recalc);
  row.querySelector('.clear-btn').addEventListener('click', () => { row.querySelector('.amount-input').value = ''; recalc(); });
  row.querySelector('.del-btn').addEventListener('click', () => removeItem(sid, item.id));
  row.querySelector('.move-btn').addEventListener('click', (e) => { e.stopPropagation(); openMovePopover(row, item.id, sid); });
  row.querySelector('.item-check-toggle').addEventListener('click', (e) => {
    e.stopPropagation();
    window.toggleItemChecked?.(sid, item.id);
  });
  row.addEventListener('click', e => {
    if (!state.checkMode) return;
    if (e.target.closest('button, input, .item-actions')) return;
    window.toggleItemChecked?.(sid, item.id);
  });
  row.classList.toggle('checked', !!item.checked);

  // Drag & Drop
  row.addEventListener('dragstart', (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({ iid: item.id, fromSid: sid }));
    row.classList.add('dragging');
    setTimeout(() => row.classList.add('drag-hidden'), 0);
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging', 'drag-hidden');
    document.querySelectorAll('.items-container.drag-over').forEach(c => c.classList.remove('drag-over'));
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
  });

  return row;
}

// ── Remove a section ──
export function removeSection(secId) {
  const sec = state.sections.find(s => s.id === secId);
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
        window.showToast(`"${sec.title}" removida`);
      },
    },
    {
      label: 'Este e futuros',
      style: { background: 'var(--primary)', fontSize: '11px' },
      onClick: async () => {
        _doRemoveSection(secId);
        const count = await _removeSectionFromFutureMonths(secId);
        window.showToast(count > 0
          ? `"${sec.title}" removida deste e de ${count} mês(es) seguinte(s)`
          : `"${sec.title}" removida`);
      },
    },
  ]);
}

function _doRemoveSection(secId) {
  state.sections = state.sections.filter(s => s.id !== secId);
  const el = document.querySelector(`.section[data-sid="${secId}"]`);
  if (el) {
    el.style.transition = 'opacity 0.2s, transform 0.2s';
    el.style.opacity    = '0';
    el.style.transform  = 'scale(0.97)';
    setTimeout(() => el.remove(), 220);
  }
  setTimeout(recalc, 250);
}

// ── Build a section card ──
export function buildSection(sec) {
  const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888888';
  const safeBg    = /^#[0-9A-Fa-f]{3,8}$/.test(sec.bg    || '') ? sec.bg    : '#F0F0F0';

  const div       = document.createElement('div');
  div.className   = 'section';
  div.dataset.sid = sec.id;
  div.innerHTML = `
    <div class="section-head">
      <div class="section-head-title-row">
        <span class="section-tag" style="color:${safeColor};background:${safeBg}"></span>
      </div>
      <div class="section-goal-indicator"></div>
      <div class="section-head-bottom">
        <span class="section-check-counter">0/0</span>
        <span class="section-total">R$ 0,00</span>
        <button class="section-del-btn" title="Remover categoria" aria-label="Remover categoria">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
        </button>
      </div>
    </div>
    <div class="section-progress"><div class="section-progress-fill" style="width:0%"></div></div>
    <div class="items-container"></div>
    <div class="add-row"><button class="add-btn">+ Adicionar item</button></div>`;

  div.querySelector('.section-tag').textContent = sec.title;
  div.querySelector('.section-tag').title = sec.title;

  const cont = div.querySelector('.items-container');
  sec.items.forEach(item => cont.appendChild(buildItemRow(item, sec.id)));

  // Drop target listeners
  cont.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.item-row');
    cont.querySelectorAll('.drop-indicator').forEach(el => el.remove());

    if (target && !target.classList.contains('drag-hidden')) {
      const rect      = target.getBoundingClientRect();
      const midY      = rect.top + rect.height / 2;
      const indicator = document.createElement('div');
      indicator.className = 'drop-indicator';
      if (e.clientY < midY) {
        cont.insertBefore(indicator, target);
      } else {
        cont.insertBefore(indicator, target.nextSibling);
      }
      cont.classList.remove('drag-over');
    } else {
      cont.classList.add('drag-over');
    }
  });
  cont.addEventListener('dragleave', (e) => {
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
        moveItemToSection(iid, fromSid, sec.id);
      } else {
        const draggedRow = cont.querySelector(`.item-row[data-iid="${iid}"]`);
        if (!draggedRow) return;

        const target = e.target.closest('.item-row');
        if (!target || target === draggedRow) return;

        const rect  = target.getBoundingClientRect();
        const after = e.clientY >= rect.top + rect.height / 2;

        if (after) {
          cont.insertBefore(draggedRow, target.nextSibling);
        } else {
          cont.insertBefore(draggedRow, target);
        }

        const sec2 = state.sections.find(s => s.id === sec.id);
        if (sec2) {
          const newOrder = [...cont.querySelectorAll('.item-row[data-iid]')].map(r => r.dataset.iid);
          sec2.items.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
        }

        scheduleSave();
      }
    } catch (_) { /* invalid data — ignore */ }
  });

  div.querySelector('.section-del-btn').addEventListener('click', () => removeSection(sec.id));
  div.querySelector('.add-btn').addEventListener('click', () => {
    const id   = 'i' + (state.nextId++);
    const sec2 = state.sections.find(s => s.id === sec.id);
    if (sec2) sec2.items.push({ id, label: '', val: '' });
    const newRow = buildItemRow({ id, label: '', val: '' }, sec.id);
    cont.appendChild(newRow);
    newRow.querySelector('.label-input').focus();
    recalc();
  });
  return div;
}

// ── Render all sections ──
export function renderSections() {
  const wrap = document.getElementById('sections-container');
  wrap.innerHTML = '';
  state.sections.forEach(sec => wrap.appendChild(buildSection(sec)));
}
