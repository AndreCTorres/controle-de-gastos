// ── Supabase configuration ──
// 1. Copie este arquivo para config.js:   copy config.example.js config.js
// 2. Preencha com os valores do seu projeto (Supabase → Project Settings → API)
// 3. config.js está no .gitignore e NUNCA deve ser commitado

export const SUPABASE_URL      = 'https://SEU_PROJECT_ID.supabase.co';

// A SUPABASE_ANON_KEY é uma chave pública por design — ela fica exposta no cliente
// e é segura para uso em produção. O acesso real aos dados é controlado por Row Level
// Security (RLS) no Supabase: cada usuário só enxerga e edita os próprios dados.
export const SUPABASE_ANON_KEY = 'SUA_ANON_KEY_AQUI';

// ── Supabase singleton ──
// Shared across all modules to avoid circular imports
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
