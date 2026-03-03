/**
 * Seeded pseudo-random number generator (LCG).
 * Returns a function that produces deterministic values in [0, 1].
 */
export function seededPRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 739982445) >>> 0;
    s = Math.imul(s ^ (s >>> 12), 695872825) >>> 0;
    s = (s ^ (s >>> 15)) >>> 0;
    return s / 4294967295;
  };
}

/**
 * Box-Muller transform — converts uniform random to normal distribution.
 */
export function boxMuller(rng) {
  const u = Math.max(1e-10, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/**
 * Simple single-stock projection (used by StockDetail view).
 */
export function projectPortfolio(horizon, drip, extraContrib, startValue, yieldPct, baseReturnPct, useVolatility, rng, divGrowthPct) {
  const divGrowthRate = Math.max(0, Math.min(divGrowthPct || 5, 20)) / 100;
  const values = [Math.round(startValue)];
  let portfolio = startValue;
  let currentYield = yieldPct / 100;
  const annualReturn = baseReturnPct / 100;

  for (let year = 1; year <= horizon; year++) {
    portfolio += extraContrib;
    if (drip) {
      for (let q = 0; q < 4; q++) {
        portfolio += (portfolio * currentYield) / 4;
      }
    }
    let totalReturn;
    if (useVolatility && rng) {
      const vol = 0.15;
      const drift = (annualReturn - 0.5 * vol * vol) / 4;
      let cum = 0;
      for (let q = 0; q < 4; q++) cum += Math.exp(drift + (vol / 2) * boxMuller(rng)) - 1;
      totalReturn = Math.max(cum, -0.4);
    } else {
      totalReturn = annualReturn;
    }
    portfolio = Math.max(portfolio * (1 + totalReturn), 0);
    currentYield *= (1 + divGrowthRate);
    values.push(Math.round(portfolio));
  }
  return values;
}

/**
 * Per-stock portfolio projection engine.
 *
 * Projects each holding individually using its own:
 *   - Dividend yield (current)
 *   - Dividend growth rate (g5 — 5-year historical)
 *   - Expected total return ≈ yield + div growth (Gordon model)
 *
 * DRIP reinvests each stock's dividends back into that same stock quarterly.
 * Extra contributions are distributed proportionally by current weight.
 * Price returns are identical across all scenarios (drip doesn't change market).
 *
 * @param {number} horizon - Years to project
 * @param {Array} holdings - [{ ticker, shares, price, yld, div, g5, ... }]
 * @param {Object} liveData - { TICKER: { price, divYield, annualDiv, ... } }
 * @param {number} extraContrib - Annual extra contribution ($)
 * @param {boolean} useVolatility - Enable Monte Carlo noise
 * @param {Function|null} rng - PRNG function (required if useVolatility)
 * @returns {{ noDripVals: number[], dripVals: number[], contribVals: number[]|null }}
 */
export function projectPortfolioPerStock(horizon, holdings, liveData, extraContrib, useVolatility, rng) {
  if (!holdings?.length) {
    const zeros = new Array(horizon + 1).fill(0);
    return { noDripVals: zeros, dripVals: zeros, contribVals: null };
  }

  // Build initial per-stock state
  function initStocks() {
    return holdings.map(h => {
      const live = liveData?.[h.ticker];
      const price = (live?.price > 0 ? live.price : null) || h.price || 0;
      const yld = (live?.divYield ?? h.yld ?? 0) / 100;
      const divPerShare = live?.annualDiv ?? h.div ?? 0;
      const g5 = Math.max(0, Math.min((h.g5 ?? 5), 20)) / 100;

      // Gordon model: expected total return ≈ yield + dividend growth
      const expectedReturn = Math.max(0.02, Math.min(yld + g5, 0.25));
      // Price appreciation = total return minus what's paid out as dividends
      const priceGrowthRate = Math.max(0, expectedReturn - yld);

      return {
        shares: h.shares || 0,
        price,
        divPerShare,
        g5,
        priceGrowthRate,
      };
    });
  }

  function totalValue(stocks) {
    return Math.round(stocks.reduce((s, st) => s + st.shares * st.price, 0));
  }

  const noDripStocks = initStocks();
  const dripStocks = initStocks();
  const contribStocks = extraContrib > 0 ? initStocks() : null;

  const noDripVals = [totalValue(noDripStocks)];
  const dripVals = [totalValue(dripStocks)];
  const contribVals = contribStocks ? [totalValue(contribStocks)] : null;

  for (let year = 1; year <= horizon; year++) {
    // Generate per-stock price returns (same for ALL scenarios — market doesn't
    // care whether the investor reinvests dividends)
    const priceReturns = noDripStocks.map(st => {
      if (useVolatility && rng) {
        const vol = 0.22;
        const drift = st.priceGrowthRate - 0.5 * vol * vol;
        return Math.max(Math.exp(drift + vol * boxMuller(rng)) - 1, -0.5);
      }
      return st.priceGrowthRate;
    });

    // --- NO DRIP: price grows, dividends taken as cash ---
    noDripStocks.forEach((st, i) => {
      st.divPerShare *= (1 + st.g5);
      st.price = Math.max(0, st.price * (1 + priceReturns[i]));
    });
    noDripVals.push(totalValue(noDripStocks));

    // --- DRIP: dividends reinvested quarterly into same stock ---
    dripStocks.forEach((st, i) => {
      st.divPerShare *= (1 + st.g5);
      // Quarterly DRIP before price move
      for (let q = 0; q < 4; q++) {
        const qDiv = st.shares * st.divPerShare / 4;
        if (st.price > 0) st.shares += qDiv / st.price;
      }
      st.price = Math.max(0, st.price * (1 + priceReturns[i]));
    });
    dripVals.push(totalValue(dripStocks));

    // --- DRIP + CONTRIBUTIONS ---
    if (contribStocks) {
      // Distribute annual contribution proportionally by current value
      const totalV = contribStocks.reduce((s, st) => s + st.shares * st.price, 0);
      contribStocks.forEach(st => {
        const weight = totalV > 0 ? (st.shares * st.price) / totalV : 1 / contribStocks.length;
        if (st.price > 0) st.shares += (extraContrib * weight) / st.price;
      });

      contribStocks.forEach((st, i) => {
        st.divPerShare *= (1 + st.g5);
        for (let q = 0; q < 4; q++) {
          const qDiv = st.shares * st.divPerShare / 4;
          if (st.price > 0) st.shares += qDiv / st.price;
        }
        st.price = Math.max(0, st.price * (1 + priceReturns[i]));
      });
      contribVals.push(totalValue(contribStocks));
    }
  }

  return { noDripVals, dripVals, contribVals };
}
