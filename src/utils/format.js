export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatCurrency(value) {
  return "$" + Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function formatPct(value, decimals = 1) {
  return value != null ? value.toFixed(decimals) + "%" : "—";
}

/** Compact money: $50k, $1.25M — one canonical version */
export function shortMoney(val) {
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${Math.round(val / 1e3)}k`;
  return `$${Math.round(val)}`;
}

/** Price: always 2 decimals → $XX.XX */
export function formatPrice(val) {
  return `$${Number(val).toFixed(2)}`;
}

/** Yield: always 2 decimals → X.XX% */
export function formatYield(val) {
  return `${Number(val).toFixed(2)}%`;
}

/** Dividend growth: always 1 decimal → X.X% */
export function formatGrowth(val) {
  return `${Number(val).toFixed(1)}%`;
}

/** Dividend per share: always 2 decimals → $X.XX */
export function formatDivPerShare(val) {
  return `$${Number(val).toFixed(2)}`;
}
