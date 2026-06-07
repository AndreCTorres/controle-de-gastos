import { supabase, currentUser } from './auth.js';

// ── Helper: get current user id ──
function uid() {
  // currentUser is a reference; re-import live value via supabase
  return supabase.auth.getUser().then(({ data }) => data.user?.id);
}

// ────────────────────────────────────────────────
// LOAD month data for a given (month, year)
// Returns { incomes, sections } or null if not found
// ────────────────────────────────────────────────
export async function loadMonthData(month, year) {
  const userId = await uid();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('months')
    .select('data')
    .eq('user_id', userId)
    .eq('month', month)
    .eq('year', year)
    .maybeSingle();

  if (error) { console.error('loadMonthData:', error); return null; }
  return data?.data ?? null;
}

// ────────────────────────────────────────────────
// SAVE month data (upsert)
// payload: { incomes: [...], sections: [...] }
// ────────────────────────────────────────────────
export async function saveMonthData(month, year, payload) {
  const userId = await uid();
  if (!userId) return;

  const { error } = await supabase
    .from('months')
    .upsert(
      { user_id: userId, month, year, data: payload, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,month,year' }
    );

  if (error) console.error('saveMonthData:', error);
}

// ────────────────────────────────────────────────
// LOAD all months that have data (for dropdown)
// Returns array of { month, year }
// ────────────────────────────────────────────────
export async function loadMonthsWithData() {
  const userId = await uid();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('months')
    .select('month, year')
    .eq('user_id', userId)
    .order('year', { ascending: true })
    .order('month', { ascending: true });

  if (error) { console.error('loadMonthsWithData:', error); return []; }
  return data ?? [];
}
