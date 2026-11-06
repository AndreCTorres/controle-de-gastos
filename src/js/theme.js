// Runs in the head, before the stylesheet, to avoid a light flash on reload.
(() => {
  const key = 'cgastos_theme', media = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = value => ['light', 'dark', 'system'].includes(value);
  let preference = 'system';
  try { const saved = localStorage.getItem(key); if (valid(saved)) preference = saved; } catch {}
  function apply() {
    const dark = preference === 'dark' || (preference === 'system' && media.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#111923' : '#F2EFE9');
    document.querySelectorAll('[data-theme-select]').forEach(select => { select.value = preference; select.dispatchEvent(new Event('select:sync')); });
    window.dispatchEvent(new CustomEvent('themechange'));
  }
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-theme-select]').forEach(select => {
      select.value = preference;
      select.addEventListener('change', () => {
        if (!valid(select.value)) return;
        preference = select.value;
        try { localStorage.setItem(key, preference); } catch {}
        apply();
      });
    });
    apply();
  });
  media.addEventListener('change', () => { if (preference === 'system') apply(); });
  window.addEventListener('storage', event => {
    if (event.key === key) { preference = valid(event.newValue) ? event.newValue : 'system'; apply(); }
  });
})();
