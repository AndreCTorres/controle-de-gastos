import { supabase } from './config.js';
import { state } from './state.js';

// ── Helper: get current user id (cached to avoid repeated network calls) ──
async function uid() {
  if (state.userId) return state.userId;
  const { data } = await supabase.auth.getUser();
  state.userId = data.user?.id ?? null;
  return state.userId;
}

// ── Cache local (localStorage) ──
// Chave: `cgastos_<userId>_<year>_<month>`  — isolada por usuário e período
// Usado como fallback de leitura quando o Supabase está inacessível.
// Os dados são sempre sobrescritos em cada save bem-sucedido.

const CACHE_VERSION = 'v1';

function cacheKey(userId, month, year) {
  return `cgastos_${CACHE_VERSION}_${userId}_${year}_${month}`;
}

function cacheGoalsKey(userId, year) {
  return `cgastos_${CACHE_VERSION}_goals_${userId}_${year}`;
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    // localStorage cheio ou indisponível — falha silenciosa
  }
}

function readCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw)?.data ?? null;
  } catch (e) {
    return null;
  }
}

// ────────────────────────────────────────────────
// LOAD month data for a given (month, year)
// Returns { incomes, sections } or null if not found
// Falls back to localStorage cache when offline.
// ────────────────────────────────────────────────
export async function loadMonthData(month, year) {
  const userId = await uid();
  if (!userId) return null;

  try {
    const { data, error } = await supabase
      .from('months')
      .select('data')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    if (error) throw error;

    const result = data?.data ?? null;

    // Atualiza o cache local sempre que a leitura do servidor for bem-sucedida
    if (result !== null) {
      writeCache(cacheKey(userId, month, year), result);
    }

    return result;
  } catch (err) {
    console.warn('loadMonthData: offline ou erro de rede — usando cache local', err);

    const cached = readCache(cacheKey(userId, month, year));
    if (cached) {
      // Retorna os dados cacheados e sinaliza que veio do cache
      const error = Object.assign(new Error('offline'), { fromCache: true, cachedData: cached });
      throw error;
    }

    // Sem cache disponível — propaga o erro original
    throw err;
  }
}

// ────────────────────────────────────────────────
// SAVE month data (upsert)
// payload: { incomes: [...], sections: [...] }
// Writes to localStorage cache before hitting the server (write-through).
// ────────────────────────────────────────────────
export async function saveMonthData(month, year, payload) {
  const userId = await uid();
  if (!userId) return;

  // Escrita antecipada no cache — garante que dados recentes sobrevivam a quedas de rede
  writeCache(cacheKey(userId, month, year), payload);

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

  try {
    const { data, error } = await supabase
      .from('monthly_goals')
      .select('goals')
      .eq('user_id', userId)
      .eq('year', year)
      .maybeSingle();

    if (error) throw error;

    const result = data?.goals ?? null;
    if (result !== null) {
      writeCache(cacheGoalsKey(userId, year), result);
    }
    return result;
  } catch (err) {
    console.warn('loadYearGoals: offline — usando cache local', err);
    return readCache(cacheGoalsKey(userId, year));
  }
}

export async function saveYearGoals(year, goals) {
  const userId = await uid();
  if (!userId) return;

  // Escrita antecipada no cache
  writeCache(cacheGoalsKey(userId, year), goals);

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
