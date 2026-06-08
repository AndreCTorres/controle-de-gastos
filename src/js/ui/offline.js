import { persistData } from '../persist.js';

// ── Offline banner ──
// Shown when data was loaded from local cache due to no connection.
// Disappears automatically when connectivity is restored.

let _pendingSave = false;

export function setPendingSave(value) {
  _pendingSave = value;
}

export function showOfflineBanner() {
  let banner = document.getElementById('offlineBanner');
  if (banner) return; // already visible

  banner = document.createElement('div');
  banner.id = 'offlineBanner';
  banner.setAttribute('role', 'alert');
  banner.innerHTML = `
    <span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.56 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"/></svg>
      Você está offline. Exibindo dados salvos localmente. As alterações serão sincronizadas quando a conexão for restaurada.
    </span>`;
  banner.style.cssText = `
    position:fixed;top:0;left:0;right:0;z-index:999;
    background:#7A6010;color:#fff;
    font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;
    padding:8px 20px;text-align:center;
    box-shadow:0 2px 8px rgba(0,0,0,0.2);
    animation:slideDown 0.3s ease;
  `;

  if (!document.querySelector('#offlineBannerStyle')) {
    const style = document.createElement('style');
    style.id = 'offlineBannerStyle';
    style.textContent = `@keyframes slideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}`;
    document.head.appendChild(style);
  }

  document.body.prepend(banner);
  _pendingSave = true;
}

export function hideOfflineBanner() {
  const banner = document.getElementById('offlineBanner');
  if (banner) {
    banner.style.animation = 'slideDown 0.3s ease reverse';
    setTimeout(() => banner.remove(), 300);
  }
}

// Monitor reconnection to sync pending data
window.addEventListener('online', async () => {
  if (!_pendingSave) return;
  try {
    await persistData();
    _pendingSave = false;
    hideOfflineBanner();
    window.showToast('Conexão restaurada. Dados sincronizados.', 'success');
  } catch (_) {
    // Still no stable connection — keep the banner
  }
});

window.addEventListener('offline', () => {
  showOfflineBanner();
});
