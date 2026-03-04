/**
 * Export holdings + live data as CSV.
 */
export function exportHoldingsCSV(holdings, liveData) {
  const headers = ['Ticker', 'Name', 'Shares', 'Price', 'Value', 'Yield %', 'Annual Div', 'Payout Ratio', '5Y Growth', 'Streak'];
  const rows = holdings.map(h => {
    const live = liveData?.[h.ticker] || {};
    const price = (live.price > 0 ? live.price : null) || h.price || 0;
    const value = price * (h.shares || 0);
    const yld = live.divYield ?? h.yld ?? 0;
    const annualDiv = live.annualDiv ?? h.div ?? 0;
    const payout = live.payout ?? h.payout ?? '';
    const g5 = live.g5 ?? h.g5 ?? 0;
    const streak = Math.max(live.streak ?? 0, h.streak ?? 0);
    return [
      h.ticker,
      `"${(h.name || h.ticker).replace(/"/g, '""')}"`,
      h.shares?.toFixed(3) ?? 0,
      price.toFixed(2),
      value.toFixed(2),
      yld.toFixed(2),
      annualDiv.toFixed(2),
      payout !== '' && payout != null ? (typeof payout === 'number' ? payout.toFixed(0) : payout) : '',
      g5.toFixed(1),
      streak,
    ].join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `safeyield-holdings-${new Date().toISOString().substring(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
