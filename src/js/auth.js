import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// ── Supabase client (singleton) ──
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Auth state listener ──
supabase.auth.onAuthStateChange((_event, session) => {
  const user = session?.user ?? null;
  if (user) {
    showApp(user);
  } else {
    showAuth();
  }
});

// ── UI helpers ──
function showApp(user) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display  = 'block';

  const meta = user.user_metadata;
  const name = meta?.name || user.email.split('@')[0];
  document.getElementById('headerGreeting').textContent = `Olá, ${name}! 👋`;

  window.dispatchEvent(new CustomEvent('app:ready', { detail: { user } }));
}

function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display  = 'none';
}

// ── Tab switch ──
function switchAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('loginForm').style.display  = isLogin ? 'flex' : 'none';
  document.getElementById('signupForm').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('tabLogin').classList.toggle('active',  isLogin);
  document.getElementById('tabSignup').classList.toggle('active', !isLogin);
}

document.getElementById('tabLogin').addEventListener('click',  () => switchAuthTab('login'));
document.getElementById('tabSignup').addEventListener('click', () => switchAuthTab('signup'));

// ── Login ──
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn   = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  btn.disabled    = true;
  btn.textContent = 'Entrando…';

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent   = translateAuthError(error.message);
    errEl.style.display = 'block';
    btn.disabled        = false;
    btn.textContent     = 'Entrar';
  }
});

// ── Sign up ──
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn   = document.getElementById('signupBtn');
  const errEl = document.getElementById('signupError');
  errEl.style.display = 'none';
  btn.disabled    = true;
  btn.textContent = 'Criando conta…';

  const name     = document.getElementById('signupName').value.trim();
  const email    = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    errEl.textContent   = translateAuthError(error.message);
    errEl.style.display = 'block';
    btn.disabled        = false;
    btn.textContent     = 'Criar conta';
  } else {
    errEl.style.cssText = 'display:block;background:#E8F5EE;color:var(--green)';
    errEl.textContent   = 'Conta criada! Verifique seu e-mail para confirmar o cadastro.';
    btn.textContent     = 'E-mail enviado ✓';
  }
});

// ── Logout ──
window.handleLogout = async function () {
  await supabase.auth.signOut();
};

// ── Error translation ──
function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed'))        return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('User already registered'))    return 'Este e-mail já está cadastrado.';
  if (msg.includes('Password should be'))         return 'A senha deve ter no mínimo 6 caracteres.';
  return msg;
}
