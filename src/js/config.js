// ── Supabase configuration ──
export const SUPABASE_URL      = 'https://nmjiuftfypxgjgfkdxyt.supabase.co';

// A SUPABASE_ANON_KEY é uma chave pública por design — ela fica exposta no cliente
// e é segura para uso em produção. O acesso real aos dados é controlado por Row Level
// Security (RLS) no Supabase: cada usuário só enxerga e edita os próprios dados.
// Não há segredo aqui que precise ser ocultado.
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5taml1ZnRmeXB4Z2pnZmtkeHl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA4NDI2ODMsImV4cCI6MjA5NjQxODY4M30.H5oUWrxXQ30cN7pAJdKPbheyUC96h45FNDQucHuSs38';

// ── Supabase singleton ──
// Shared across all modules to avoid circular imports
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
