import { supabase } from './config.js';
import { initApp } from './app.js';
import { state } from './state.js';

// ── Auth state listener ──
supabase.auth.onAuthStateChange((event, session) => {
  const user = session?.user ?? null;
  if (user) {
    const previousUserId = state.userId;
    // Cache userId on login so db.js never needs to call getUser() again
    state.userId = user.id;
    state.userEmail = user.email || '';
    state.userMeta = user.user_metadata || {};

    // Supabase can emit auth/session events when the tab regains focus.
    // Only bootstrap the app once per signed-in user; later token refreshes should not reload data.
    if (state.appReady && previousUserId === user.id) {
      updateUserHeader(user);
      return;
    }

    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
      showApp(user);
    }
  } else {
    // Clear cached userId on logout
    state.userId = null;
    state.userEmail = '';
    state.userMeta = {};
    state.appReady = false;
    showAuth();
  }
});

// ── UI helpers ──
function showApp(user) {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('appScreen').style.display  = 'block';
  document.body.style.overflow = '';

  updateUserHeader(user);
  initApp(user);
}

function updateUserHeader(user) {
  const meta = user.user_metadata;
  const name = meta?.name || user.email.split('@')[0];
  // textContent — o nome do usuário nunca vai para innerHTML
  document.getElementById('headerGreeting').textContent = `Olá, ${name}! 👋`;
}

function showAuth() {
  document.getElementById('authScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display  = 'none';
  document.body.style.overflow = 'hidden';
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
document.getElementById('forgotBtn').addEventListener('click', () => showForgotForm());
document.getElementById('backToLoginBtn').addEventListener('click', () => hideForgotForm());

// ── Forgot password form visibility ──
function showForgotForm() {
  document.getElementById('loginForm').style.display  = 'none';
  document.getElementById('forgotForm').style.display = 'flex';
  document.getElementById('tabLogin').classList.remove('active');
  document.getElementById('tabSignup').classList.remove('active');
}
function hideForgotForm() {
  document.getElementById('forgotForm').style.display = 'none';
  document.getElementById('loginForm').style.display  = 'flex';
  document.getElementById('tabLogin').classList.add('active');
}

// ── Rate limiting no cliente (camada extra — o Supabase também limita no servidor) ──
// Previne ataques de força bruta mesmo antes de chegar à API.
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS   = 5 * 60 * 1000; // 5 minutos

let loginAttempts  = 0;
let loginLockedUntil = 0;

function isLoginLocked() {
  if (loginLockedUntil > Date.now()) return true;
  if (loginAttempts >= LOGIN_MAX_ATTEMPTS) {
    loginLockedUntil = Date.now() + LOGIN_LOCKOUT_MS;
    loginAttempts    = 0;
    return true;
  }
  return false;
}

function getRemainingLockout() {
  const remaining = Math.ceil((loginLockedUntil - Date.now()) / 1000 / 60);
  return remaining;
}

// ── Login ──
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn   = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  // Verifica bloqueio por excesso de tentativas
  if (isLoginLocked()) {
    errEl.textContent   = `Muitas tentativas. Aguarde ${getRemainingLockout()} min antes de tentar novamente.`;
    errEl.style.display = 'block';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Entrando…';

  const email    = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    loginAttempts++;
    errEl.textContent   = translateAuthError(error.message);
    errEl.style.display = 'block';
    btn.disabled        = false;
    btn.textContent     = 'Entrar';

    // Avisa quantas tentativas restam antes do bloqueio
    const remaining = LOGIN_MAX_ATTEMPTS - loginAttempts;
    if (remaining > 0 && remaining <= 2) {
      errEl.textContent += ` (${remaining} tentativa${remaining > 1 ? 's' : ''} restante${remaining > 1 ? 's' : ''})`;
    }
  } else {
    // Login bem-sucedido — zera contador
    loginAttempts    = 0;
    loginLockedUntil = 0;
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

  // Validação extra de senha antes de enviar
  if (password.length < 6) {
    errEl.textContent   = 'A senha deve ter no mínimo 6 caracteres.';
    errEl.style.display = 'block';
    btn.disabled        = false;
    btn.textContent     = 'Criar conta';
    return;
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) {
    console.error('[Signup error]', error.message, error);
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

// ── Forgot password submit ──
document.getElementById('forgotForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn   = document.getElementById('forgotSubmitBtn');
  const errEl = document.getElementById('forgotError');
  errEl.style.display = 'none';
  btn.disabled    = true;
  btn.textContent = 'Enviando…';

  const email = document.getElementById('forgotEmail').value.trim();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  });

  if (error) {
    errEl.textContent   = translateAuthError(error.message);
    errEl.style.display = 'block';
    btn.disabled        = false;
    btn.textContent     = 'Enviar link';
  } else {
    errEl.style.cssText = 'display:block;background:#E8F5EE;color:var(--green)';
    errEl.textContent   = 'Link enviado! Verifique seu e-mail.';
    btn.textContent     = 'E-mail enviado ✓';
  }
});

// ── Logout ──
window.handleLogout = async function () {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    // Se o signOut falhar (ex: sem rede), força a limpeza local
    // O onAuthStateChange não vai disparar, então limpamos a UI diretamente
    showAuth();
  }
};

// ── Error translation ──
function translateAuthError(msg) {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
  if (msg.includes('Email not confirmed'))        return 'Confirme seu e-mail antes de entrar.';
  if (msg.includes('User already registered'))    return 'Este e-mail já está cadastrado.';
  if (msg.includes('Password should be'))         return 'A senha deve ter no mínimo 6 caracteres.';
  if (msg.includes('over_email_send_rate_limit')) return 'Muitos e-mails enviados. Aguarde alguns minutos.';
  if (msg.includes('too_many_requests'))          return 'Muitas tentativas. Aguarde alguns minutos.';
  if (msg.includes('signup_disabled'))            return 'Novos cadastros estão temporariamente desativados.';
  if (msg.includes('email_address_invalid'))      return 'Endereço de e-mail inválido.';
  if (msg.includes('weak_password'))              return 'Senha muito fraca. Use pelo menos 6 caracteres.';
  if (msg.includes('email_exists'))               return 'Este e-mail já está cadastrado.';
  return 'Ocorreu um erro. Tente novamente.'; // não expõe mensagem técnica ao usuário
}
