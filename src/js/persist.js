import { saveMonthData } from './db.js';
import { state } from './state.js';

// ── Debounced save ──
// Waits 800ms after the last change before hitting Supabase

export function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(persistData, 800);
}

export async function persistData() {
  const incomeData = state.incomes.map(inc => {
    // Prefer state values; fall back to DOM if the row exists (keeps edited-but-not-yet-flushed values)
    const row = document.querySelector(`.income-row[data-iid="${inc.id}"]`);
    return {
      id:    inc.id,
      label: row ? row.querySelector('.income-label input').value : inc.label,
      val:   row ? row.querySelector('.income-input').value       : inc.val,
    };
  });

  const secs = state.sections.map(sec => {
    const items = sec.items.map(item => {
      const row = document.querySelector(`.item-row[data-iid="${item.id}"]`);
      const entry = {
        id:    item.id,
        label: row ? row.querySelector('.label-input').value  : item.label,
        val:   row ? row.querySelector('.amount-input').value : item.val,
      };
      if (item.parcel) entry.parcel = true;
      return entry;
    });
    return { id: sec.id, title: sec.title, color: sec.color, bg: sec.bg, items };
  });

  try {
    await saveMonthData(state.currentMonth, state.currentYear, { incomes: incomeData, sections: secs });
  } catch (err) {
    const isOffline = !navigator.onLine || err?.message?.toLowerCase().includes('fetch');
    if (isOffline) {
      // Signal offline — import lazily to avoid circular dependency
      const { setPendingSave } = await import('./ui/offline.js');
      setPendingSave(true);
      window.showToast('Sem conexão. Dados salvos localmente e serão sincronizados em breve.', 'error');
    } else {
      // Non-network error (e.g. RLS policy denied, payload too large) — alert the user
      console.error('persistData:', err);
      window.showToast('Erro ao salvar. Seus dados podem não ter sido gravados.', 'error');
    }
  }
}

// ── beforeunload: force immediate save if a pending change exists ──
window.addEventListener('beforeunload', () => {
  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    persistData(); // fire-and-forget — best effort
  }
});

// ── Save a specific future-month payload directly ──
export async function persistFutureMonth(month, year, payload) {
  await saveMonthData(month, year, payload);
}
