// ── Utility helpers ──

/** Format a number as BRL currency string */
export function fmt(n) {
  return 'R$ ' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Return percentage of v relative to total (0–100, integer) */
export function pct(v, total) {
  return total > 0 ? Math.round(v / total * 100) : 0;
}
