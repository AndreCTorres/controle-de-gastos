import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// ── Supabase client (singleton) ──
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Current session ──
export let currentUser = null;

// ── Auth state listener ──
// Called once on load and on every sign-in / sign-out
supabase.auth.onAuthStateChange((_event, session) => {
  currentUser = session?.user ?? null;

  if (currentUser) {
    showApp();
  } else {
    showAuth();
  }
});

// ── UI helpers ──
function showApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display = 'block';

  const meta = currentUser.user_metadata;
  const name = meta?.name || currentUser.email.split('@')[0];
  document.getElementById('headerGreeting').textContent = `Olá, ${name}! 👋`;

  // Trigger app bootstrap (defined in app.js)
  window.dispatchEvent(new CustomEvent('app:ready', { detail: { user: currentUser } }));
}

function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
}

// ── Tab switch ──
window.switchAuthTab = function (tab) {
  const isLogin = tab === 'login';
  document.getElementById('loginForm').style.display = isLogin ? 'flex' : 'none';
  document.getElementById('signupForm').style.display = isLogin ? 'none' : 'flex';
  document.getElementById('tabLogin').classList.toggle('active', isLogin);
  document.getElementById('tabSignup').classList.toggle('active', !isLogin);
};

// ── Login ──
window.handleLogin = async function (e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Entrando…';

  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    errEl.textContent = translateAuthError(error.message);
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
  // on success, onAuthStateChange handles the rest
};

// ── Sign up ──
window.handleSignup = async function (e) {
  e.preventDefault();
  const btn = document.getElementById('signupBtn');
  const errEl = document.getElementById('signupError');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Criando conta…';

  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    errEl.textContent = translateAuthError(error.message);
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Criar conta';
  } else {
    errEl.style.cssText = 'display:block;background:#E8F5EE;color:var(--green)';
    errEl.textContent = 'Conta criada! Verifique seu e-mail para confirmar o cadastro.';
    btn.textContent = 'E-mail enviado ✓';
  }
};

// ── Logout ──
window.handleLogout = async function () {
  await supabase.auth.signOut();
};

// ── Error translation ──
function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('User already registered')) return 'Este e-mail já está cadastrado.';
  if (msg.includes('Password should be')) return 'A senha deve ter no mínimo 6 caracteres.';
  return msg;
}
