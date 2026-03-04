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
 * Per-stock portfolio projection engine.
 *
 * Projects each holding individually using its own:
 *   - Dividend yield (current)
 *   - Dividend growth rate (g5 — 5-year historical)
 *   - Expected total return ≈ yield + div growth (Gordon model)
 *
 * DRIP reinvests each stock's dividends back into that same stock quarterly.
 * Extra contributions are distributed proportionally by current weight.
 * Price returns are identical across all scenarios (same market, different strategy).
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

  const marketVol = 0.16;

  // Build initial per-stock state
  function initStocks() {
    return holdings.map(h => {
      const live = liveData?.[h.ticker];
      const price = (live?.price > 0 ? live.price : null) || h.price || 0;
      const yld = (live?.divYield ?? h.yld ?? 0) / 100;
      const divPerShare = live?.annualDiv ?? h.div ?? 0;
      // Step 2: Cap g5 at 10% (few companies sustain >10% div growth long-term)
      const g5 = Math.max(0, Math.min((h.g5 ?? 5), 10)) / 100;
      const beta = live?.beta ?? 1.0;
      const sigma = Math.max(0.12, Math.abs(beta) * marketVol);

      // Gordon model: expected total return ≈ yield + dividend growth
      // Step 2: Cap at 15% (still generous but not fantasy)
      const expectedReturn = Math.max(0.02, Math.min(yld + g5, 0.15));
      // Price appreciation = total return minus what's paid out as dividends
      const priceGrowthRate = Math.max(0, expectedReturn - yld);

      return {
        shares: h.shares || 0,
        price,
        divPerShare,
        g5,
        priceGrowthRate,
        sigma,
      };
    });
  }

  function totalValue(stocks, cashDividends) {
    return Math.round(stocks.reduce((s, st) => s + st.shares * st.price, 0) + (cashDividends || 0));
  }

  // Run a single simulation path for a given scenario with pre-generated returns
  function runPath(priceReturnsMatrix, scenario) {
    const stocks = initStocks();
    let cashDividends = 0;
    const vals = [totalValue(stocks, 0)];

    for (let year = 1; year <= horizon; year++) {
      const priceReturns = priceReturnsMatrix[year - 1];

      if (scenario === 'contrib') {
        const totalV = stocks.reduce((s, st) => s + st.shares * st.price, 0);
        stocks.forEach(st => {
          const weight = totalV > 0 ? (st.shares * st.price) / totalV : 1 / stocks.length;
          if (st.price > 0) st.shares += (extraContrib * weight) / st.price;
        });
      }

      stocks.forEach((st, i) => {
        // Price update BEFORE dividend reinvestment
        st.price = Math.max(0, st.price * (1 + priceReturns[i]));

        // Cap effective yield at 15%
        if (st.price > 0 && st.divPerShare > st.price * 0.15) {
          st.divPerShare = st.price * 0.15;
        }

        if (scenario === 'drip' || scenario === 'contrib') {
          for (let q = 0; q < 4; q++) {
            const qDiv = st.shares * st.divPerShare / 4;
            if (st.price > 0) st.shares += qDiv / st.price;
          }
        } else {
          for (let q = 0; q < 4; q++) {
            const qDiv = st.shares * st.divPerShare / 4;
            cashDividends += qDiv;
          }
        }

        // Grow dividend AFTER reinvestment (end of year)
        st.divPerShare *= (1 + st.g5);
      });

      const yearVal = totalValue(stocks, scenario === 'nodrip' ? cashDividends : 0);
      vals.push(Math.min(yearVal, 1e11));
    }
    return vals;
  }

  // Generate one set of annual GBM price returns for all stocks
  // Uses proper log-normal: ln(S(t+1)/S(t)) ~ N(drift, sigma^2)
  function generatePriceReturns(simRng) {
    const template = initStocks();
    const matrix = [];
    for (let year = 0; year < horizon; year++) {
      const yearReturns = template.map(st => {
        // GBM drift-corrected: E[exp(drift + sigma*Z)] = exp(priceGrowthRate)
        const drift = Math.log(1 + st.priceGrowthRate) - 0.5 * st.sigma * st.sigma;
        const z = boxMuller(simRng);
        return Math.max(Math.exp(drift + st.sigma * z) - 1, -0.50);
      });
      matrix.push(yearReturns);
    }
    return matrix;
  }

  // --- Deterministic mode: single path, no noise ---
  if (!useVolatility) {
    const template = initStocks();
    const detReturns = [];
    for (let year = 0; year < horizon; year++) {
      detReturns.push(template.map(st => st.priceGrowthRate));
    }
    const noDripVals = runPath(detReturns, 'nodrip');
    const dripVals = runPath(detReturns, 'drip');
    const contribVals = extraContrib > 0 ? runPath(detReturns, 'contrib') : null;
    return { noDripVals, dripVals, contribVals };
  }

  // --- Real World mode: proper Monte Carlo ---
  // Run NUM_SIMS independent simulations, take median (P50) per year.
  // All 3 scenarios share the SAME random returns per sim (same market, different strategy).
  const NUM_SIMS = 500;
  const VALUE_CAP = 1e11;

  // Collect per-year values across all sims: [year] = [val_sim1, val_sim2, ...]
  const noDripBySim = Array.from({ length: horizon + 1 }, () => []);
  const dripBySim = Array.from({ length: horizon + 1 }, () => []);
  const contribBySim = extraContrib > 0 ? Array.from({ length: horizon + 1 }, () => []) : null;

  for (let sim = 0; sim < NUM_SIMS; sim++) {
    // Each sim gets a unique deterministic seed
    const simRng = seededPRNG(42 + sim * 7919);
    const priceReturnsMatrix = generatePriceReturns(simRng);

    // Run all scenarios with identical market returns
    const nd = runPath(priceReturnsMatrix, 'nodrip');
    const dr = runPath(priceReturnsMatrix, 'drip');
    const ct = contribBySim ? runPath(priceReturnsMatrix, 'contrib') : null;

    for (let y = 0; y <= horizon; y++) {
      noDripBySim[y].push(Math.min(nd[y], VALUE_CAP));
      dripBySim[y].push(Math.min(dr[y], VALUE_CAP));
      if (contribBySim && ct) contribBySim[y].push(Math.min(ct[y], VALUE_CAP));
    }
  }

  // Extract median (P50) for each year
  function median(arr) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  const noDripVals = noDripBySim.map(arr => Math.round(median(arr)));
  const dripVals = dripBySim.map(arr => Math.round(median(arr)));
  const contribVals = contribBySim ? contribBySim.map(arr => Math.round(median(arr))) : null;

  return { noDripVals, dripVals, contribVals };
}
