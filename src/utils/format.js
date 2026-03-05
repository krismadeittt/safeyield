export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatCurrency(value) {
  const n = Number(value);
  if (!isFinite(n)) return "—";
  return "$" + n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatPct(value, decimals = 1) {
  return value != null && isFinite(value) ? value.toFixed(decimals) + "%" : "—";
}

/** Compact money: $50k, $1.25M — one canonical version */
export function shortMoney(val) {
  if (!isFinite(val)) return "—";
  if (val < 0) return `-${shortMoney(-val)}`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${Math.round(val / 1e3)}k`;
  return `$${Math.round(val)}`;
}

/** Price: always 2 decimals → $XX.XX */
export function formatPrice(val) {
  const n = Number(val);
  return isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

/** Yield: always 2 decimals → X.XX% */
export function formatYield(val) {
  const n = Number(val);
  return isFinite(n) ? `${n.toFixed(2)}%` : "—";
}

/** Dividend growth: always 1 decimal → X.X% */
export function formatGrowth(val) {
  const n = Number(val);
  return isFinite(n) ? `${n.toFixed(1)}%` : "—";
}

/** Dividend per share: always 2 decimals → $X.XX */
export function formatDivPerShare(val) {
  const n = Number(val);
  return isFinite(n) ? `$${n.toFixed(2)}` : "—";
}
