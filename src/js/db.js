import { supabase } from './config.js';

// ── Helper: get current user id ──
function uid() {
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

  if (error) {
    console.error('loadMonthData:', error);
    // Propaga o erro para que a UI possa exibir feedback
    throw error;
  }
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

  if (error) {
    console.error('saveMonthData:', error);
    throw error;
  }
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

// ────────────────────────────────────────────────
// METAS — carrega metas do ano para o usuário
// Tabela: monthly_goals (user_id, year, goals jsonb)
// goals = { [monthIndex]: { [sectionId]: limitValue } }
// ────────────────────────────────────────────────
export async function loadYearGoals(year) {
  const userId = await uid();
  if (!userId) return null;

  const { data, error } = await supabase
    .from('monthly_goals')
    .select('goals')
    .eq('user_id', userId)
    .eq('year', year)
    .maybeSingle();

  if (error) { console.error('loadYearGoals:', error); return null; }
  return data?.goals ?? null;
}

export async function saveYearGoals(year, goals) {
  const userId = await uid();
  if (!userId) return;

  const { error } = await supabase
    .from('monthly_goals')
    .upsert(
      { user_id: userId, year, goals, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,year' }
    );

  if (error) { console.error('saveYearGoals:', error); throw error; }
}

// ────────────────────────────────────────────────
// RELATÓRIO ANUAL — carrega todos os meses de um ano
// Returns array of { month, data: { incomes, sections } }
// ────────────────────────────────────────────────
export async function loadYearData(year) {
  const userId = await uid();
  if (!userId) return [];

  const { data, error } = await supabase
    .from('months')
    .select('month, year, data')
    .eq('user_id', userId)
    .eq('year', year)
    .order('month', { ascending: true });

  if (error) { console.error('loadYearData:', error); return []; }
  return data ?? [];
}
