import { state } from '../state.js';
import { MONTHS } from '../constants.js';
import { supabase } from '../config.js';

// ── Endpoint Formspree ──
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xzdqrzgb';

let feedbackTimer  = null;
let menuOpen       = false;

// ── Toggle menu ──
window.toggleFeedbackMenu = function () {
  menuOpen ? closeFeedbackMenu() : openFeedbackMenu();
};

function openFeedbackMenu() {
  document.getElementById('feedbackFabMenu').classList.add('open');
  menuOpen = true;
}

function closeFeedbackMenu() {
  document.getElementById('feedbackFabMenu').classList.remove('open');
  menuOpen = false;
}
window.closeFeedbackMenu = closeFeedbackMenu;

// ── Inicialização ──
export function initFeedbackWidget() {
  const fab      = document.getElementById('feedbackFab');
  const form     = document.getElementById('feedbackForm');
  const textarea = document.getElementById('feedbackText');
  const btn      = document.getElementById('feedbackBtn');
  const status   = document.getElementById('feedbackStatus');

  if (!fab || !form) return;

  // Fechar ao clicar fora
  document.addEventListener('click', (e) => {
    if (menuOpen && !fab.contains(e.target)) {
      closeFeedbackMenu();
    }
  });

  // Envio do formulário
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const text = textarea.value.trim();
    if (!text) return;

    // Estado: loading
    btn.disabled    = true;
    btn.textContent = 'Enviando…';
    status.className   = 'feedback-fab-status';
    status.textContent = '';

    // E-mail do usuário logado
    let userEmail = '';
    try {
      const { data } = await supabase.auth.getUser();
      userEmail = data?.user?.email ?? '';
    } catch (_) {
      // não bloqueia o envio
    }

    const payload = {
      feedback: text,
      usuario:  userEmail,
      mes:      `${MONTHS[state.currentMonth]} ${state.currentYear}`,
    };

    try {
      const res = await fetch(FORMSPREE_ENDPOINT, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body:    JSON.stringify(payload),
      });

      if (res.ok) {
        status.className   = 'feedback-fab-status feedback-fab-status--ok';
        status.textContent = 'Obrigado! Feedback recebido.';
        textarea.value     = '';

        // Fecha o menu e reseta após 3 s
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => {
          closeFeedbackMenu();
          status.className   = 'feedback-fab-status';
          status.textContent = '';
          btn.disabled       = false;
          btn.textContent    = 'Enviar';
        }, 3000);
      } else {
        throw new Error('server error');
      }
    } catch (_) {
      status.className   = 'feedback-fab-status feedback-fab-status--err';
      status.textContent = 'Erro ao enviar. Tente novamente.';
      btn.disabled       = false;
      btn.textContent    = 'Enviar';
    }
  });
}
