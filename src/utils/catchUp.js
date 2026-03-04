/**
 * Catch-up processing: apply dividends and stock splits that occurred
 * since the portfolio was last updated.
 *
 * Uses historical price/dividend data (read-only) from the history worker.
 * Updates share counts (DRIP) or cash balance (no DRIP) accordingly.
 */

/**
 * Find the closing price on or before a target date.
 * Prices must be sorted ascending by date.
 */
function findPriceOnDate(prices, targetDate) {
  let best = null;
  for (const p of prices) {
    if (p.d <= targetDate) best = p.c;
    else break;
  }
  return best;
}

/**
 * Detect stock splits within a date window by comparing raw close (c)
 * vs adjusted close (ac) ratios between consecutive trading days.
 *
 * Same detection logic as computeSplitAdjustedClose() in history.js.
 */
function detectSplitsInWindow(prices, afterDate) {
  const splits = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i].d <= afterDate) continue;

    const cPrev = prices[i - 1].c;
    const cCurr = prices[i].c;
    if (!cPrev || !cCurr) continue;

    const cRatio = cCurr / cPrev;
    const acCurr = prices[i].ac || cCurr;
    const acPrev = prices[i - 1].ac || cPrev;
    const acRatio = acCurr / acPrev;

    // Forward split: raw close drops significantly but adjusted close stable
    if (cRatio < 0.7 && cRatio > 0.05 && acRatio > 0.85 && acRatio < 1.15) {
      const ratio = Math.round(1 / cRatio);
      if (ratio >= 2 && ratio <= 10) {
        splits.push({ date: prices[i].d, ratio, type: 'forward' });
      }
    }
    // Reverse split: raw close jumps but adjusted close stable
    else if (cRatio > 1.5 && acRatio > 0.85 && acRatio < 1.15) {
      const ratio = Math.round(cRatio);
      if (ratio >= 2 && ratio <= 10) {
        splits.push({ date: prices[i].d, ratio: 1 / ratio, type: 'reverse' });
      }
    }
  }
  return splits;
}

/**
 * Process all dividends and splits between lastProcessedAt and today.
 *
 * @param {Object} portfolioState
 * @param {Array}  portfolioState.holdings - [{ ticker, shares, ... }]
 * @param {number} portfolioState.cashBalance - current cash balance
 * @param {boolean} portfolioState.dripEnabled - reinvest dividends?
 * @param {string} portfolioState.lastProcessedAt - ISO date "YYYY-MM-DD"
 * @param {Object} historyMap - { TICKER: { p: [...], d: [...] } }
 * @returns {{ holdings, cashBalance, lastProcessedAt, events }}
 */
export function processCatchUp(portfolioState, historyMap) {
  const { holdings, dripEnabled, lastProcessedAt } = portfolioState;
  let cashBalance = portfolioState.cashBalance || 0;
  const cutoff = lastProcessedAt || '1970-01-01';
  const today = new Date().toISOString().substring(0, 10);

  // Build a mutable shares map
  const sharesMap = {};
  holdings.forEach(h => { sharesMap[h.ticker] = h.shares || 0; });

  // Collect all events across all tickers
  const events = [];

  for (const h of holdings) {
    const hist = historyMap[h.ticker];
    if (!hist) continue;

    // Collect dividends after cutoff
    if (hist.d) {
      for (const div of hist.d) {
        if (div.d > cutoff && div.d <= today) {
          events.push({
            date: div.d,
            type: 'dividend',
            ticker: h.ticker,
            value: div.v, // per-share amount
            prices: hist.p,
          });
        }
      }
    }

    // Detect splits after cutoff
    if (hist.p) {
      const splits = detectSplitsInWindow(hist.p, cutoff);
      for (const s of splits) {
        if (s.date <= today) {
          events.push({
            date: s.date,
            type: 'split',
            ticker: h.ticker,
            ratio: s.ratio,
            splitType: s.type,
          });
        }
      }
    }
  }

  // Sort chronologically so compounding is correct
  events.sort((a, b) => a.date.localeCompare(b.date));

  // Process events in order
  const log = [];
  for (const evt of events) {
    const shares = sharesMap[evt.ticker] || 0;
    if (shares <= 0) continue;

    if (evt.type === 'split') {
      const oldShares = shares;
      sharesMap[evt.ticker] = shares * evt.ratio;
      log.push({
        type: 'split',
        ticker: evt.ticker,
        date: evt.date,
        splitType: evt.splitType,
        ratio: evt.ratio,
        oldShares,
        newShares: sharesMap[evt.ticker],
      });
    } else if (evt.type === 'dividend') {
      const totalDiv = evt.value * shares;
      if (dripEnabled) {
        // Look up historical price on dividend payment date
        const price = findPriceOnDate(evt.prices, evt.date);
        if (price && price > 0) {
          const newShares = totalDiv / price;
          sharesMap[evt.ticker] += newShares;
          log.push({
            type: 'drip',
            ticker: evt.ticker,
            date: evt.date,
            dividendPerShare: evt.value,
            totalDividend: totalDiv,
            priceUsed: price,
            newShares,
          });
        } else {
          // No price available — add to cash instead
          cashBalance += totalDiv;
          log.push({
            type: 'dividend_cash',
            ticker: evt.ticker,
            date: evt.date,
            amount: totalDiv,
            reason: 'no_price',
          });
        }
      } else {
        cashBalance += totalDiv;
        log.push({
          type: 'dividend_cash',
          ticker: evt.ticker,
          date: evt.date,
          amount: totalDiv,
        });
      }
    }
  }

  // Build updated holdings
  const updatedHoldings = holdings.map(h => ({
    ...h,
    shares: sharesMap[h.ticker] || h.shares,
  }));

  return {
    holdings: updatedHoldings,
    cashBalance: Math.round(cashBalance * 100) / 100,
    lastProcessedAt: today,
    events: log,
  };
}
