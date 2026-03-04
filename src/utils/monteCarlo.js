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
 * @returns {{ noDripVals: number[], dripVals: number[], contribVals: number[]|null, divIncomePerYear: number[]|null, simPeriodsPerYear: number }}
 */
export function projectPortfolioPerStock(horizon, holdings, liveData, extraContrib, useVolatility, rng) {
  if (!holdings?.length) {
    const simPPY = useVolatility ? 12 : 1;
    const len = horizon * simPPY + 1;
    const zeros = new Array(len).fill(0);
    return { noDripVals: zeros, dripVals: zeros, contribVals: null, divIncomePerYear: new Array(horizon).fill(0), simPeriodsPerYear: simPPY };
  }

  const marketVol = 0.20;

  // Build initial per-stock state
  function initStocks() {
    return holdings.map(h => {
      const live = liveData?.[h.ticker];
      const price = (live?.price > 0 ? live.price : null) || h.price || 0;
      const yld = (live?.divYield ?? h.yld ?? 0) / 100;
      const divPerShare = live?.annualDiv ?? h.div ?? 0;
      // Cap g5 at 10% (few companies sustain >10% div growth long-term)
      const g5 = Math.max(0, Math.min((h.g5 ?? 5), 10)) / 100;
      const beta = live?.beta ?? 1.0;
      const sigma = Math.max(0.18, Math.abs(beta) * marketVol);

      // Gordon model: expected total return ≈ yield + dividend growth
      // Cap at 15% (still generous but not fantasy)
      const expectedReturn = Math.max(0.02, Math.min(yld + g5, 0.15));
      // Price appreciation = total return minus what's paid out as dividends
      const priceGrowthRate = Math.max(0, expectedReturn - yld);

      // Idiosyncratic volatility: total^2 - systematic^2
      const idioSigma = Math.sqrt(Math.max(0, sigma * sigma - beta * beta * marketVol * marketVol));

      return {
        shares: h.shares || 0,
        price,
        divPerShare,
        g5,
        priceGrowthRate,
        sigma,
        beta,
        idioSigma,
      };
    });
  }

  function totalValue(stocks, cashDividends) {
    return Math.round(stocks.reduce((s, st) => s + st.shares * st.price, 0) + (cashDividends || 0));
  }

  // Run a single simulation path for a given scenario with pre-generated returns
  // divStress: if true, cut dividends during bad years (Real World mode only)
  function runPath(priceReturnsMatrix, scenario, divStress = false, ppy = 1) {
    const stocks = initStocks();
    let cashDividends = 0;
    const vals = [totalValue(stocks, 0)];
    const totalPeriods = priceReturnsMatrix.length;
    const divIncomePerYear = new Array(Math.ceil(totalPeriods / ppy)).fill(0);

    // Dividend payment schedule: up to 4 times per year (quarterly)
    const divEventsPerYear = Math.min(4, ppy);
    const periodsPerDivEvent = Math.max(1, Math.round(ppy / divEventsPerYear));
    const quartersPerEvent = 4 / divEventsPerYear;

    let yearStartPrices = stocks.map(st => st.price);

    for (let t = 0; t < totalPeriods; t++) {
      const periodInYear = t % ppy;

      // Start of year: contributions
      if (periodInYear === 0 && scenario === 'contrib') {
        const totalV = stocks.reduce((s, st) => s + st.shares * st.price, 0);
        stocks.forEach(st => {
          const weight = totalV > 0 ? (st.shares * st.price) / totalV : 1 / stocks.length;
          if (st.price > 0) st.shares += (extraContrib * weight) / st.price;
        });
      }

      // Track start-of-year prices for dividend stress
      if (periodInYear === 0) {
        yearStartPrices = stocks.map(st => st.price);
      }

      // Price update
      const priceReturns = priceReturnsMatrix[t];
      stocks.forEach((st, i) => {
        st.price = Math.max(0, st.price * (1 + priceReturns[i]));
      });

      // Pay dividends at quarter boundaries
      const isDivEvent = (periodInYear + 1) % periodsPerDivEvent === 0;
      if (isDivEvent) {
        let periodDivTotal = 0;
        stocks.forEach(st => {
          // Cap effective yield at 15%
          if (st.price > 0 && st.divPerShare > st.price * 0.15) {
            st.divPerShare = st.price * 0.15;
          }
          const qDiv = st.shares * st.divPerShare / 4 * quartersPerEvent;
          periodDivTotal += qDiv;
          if (scenario === 'drip' || scenario === 'contrib') {
            if (st.price > 0) st.shares += qDiv / st.price;
          } else {
            cashDividends += qDiv;
          }
        });
        divIncomePerYear[Math.floor(t / ppy)] += periodDivTotal;
      }

      // End of year: dividend stress + dividend growth
      if (periodInYear === ppy - 1) {
        stocks.forEach((st, i) => {
          if (divStress) {
            const yearReturn = yearStartPrices[i] > 0 ? (st.price / yearStartPrices[i] - 1) : 0;
            if (yearReturn < -0.15) {
              const drop = -yearReturn;
              const cutPct = Math.min((drop - 0.15) * 0.8, 0.50);
              st.divPerShare *= (1 - cutPct);
            }
          }
          st.divPerShare *= (1 + st.g5);
        });
      }

      const periodVal = totalValue(stocks, scenario === 'nodrip' ? cashDividends : 0);
      vals.push(Math.min(periodVal, 1e11));
    }
    return { vals, divIncomePerYear };
  }

  // Generate correlated GBM price returns for all stocks at sub-annual frequency.
  // Uses market factor model: each stock's shock = beta * market + idiosyncratic.
  // This preserves per-stock total vol while creating portfolio-level drawdowns.
  function generatePriceReturns(simRng, ppy) {
    const template = initStocks();
    const totalPeriods = horizon * ppy;
    const periodMarketVol = marketVol / Math.sqrt(ppy);
    const matrix = [];

    for (let t = 0; t < totalPeriods; t++) {
      // ONE shared market draw per time step — all stocks see the same market shock
      const marketZ = boxMuller(simRng);

      const periodReturns = template.map(st => {
        // GBM drift-corrected: E[exp(drift + sigma*Z)] = exp(priceGrowthRate)
        const annualDrift = Math.log(1 + st.priceGrowthRate) - 0.5 * st.sigma * st.sigma;
        const periodDrift = annualDrift / ppy;

        // Correlated shock: systematic (shared) + idiosyncratic (independent)
        const periodBetaVol = st.beta * periodMarketVol;
        const periodIdioVol = st.idioSigma / Math.sqrt(ppy);
        const idioZ = boxMuller(simRng);
        const totalShock = periodBetaVol * marketZ + periodIdioVol * idioZ;

        return Math.max(Math.exp(periodDrift + totalShock) - 1, -0.70);
      });
      matrix.push(periodReturns);
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
    const noDrip = runPath(detReturns, 'nodrip', false, 1);
    const drip = runPath(detReturns, 'drip', false, 1);
    const contrib = extraContrib > 0 ? runPath(detReturns, 'contrib', false, 1) : null;
    // Use divIncomePerYear from the drip/contrib path (reflects DRIP share accumulation)
    const divSource = contrib || drip;
    return { noDripVals: noDrip.vals, dripVals: drip.vals, contribVals: contrib?.vals ?? null, divIncomePerYear: divSource.divIncomePerYear, simPeriodsPerYear: 1 };
  }

  // --- Real World mode: single realistic path (fixed seed) ---
  // Always simulate at monthly resolution (simPPY=12) regardless of display granularity.
  // This ensures the PRNG always consumes the same sequence → stable path across granularity toggles.
  const simPPY = 12;
  const simRng = seededPRNG(42);
  const priceReturnsMatrix = generatePriceReturns(simRng, simPPY);

  // divStress=true enables dividend cuts during bad years
  const noDrip = runPath(priceReturnsMatrix, 'nodrip', true, simPPY);
  const drip = runPath(priceReturnsMatrix, 'drip', true, simPPY);
  const contrib = extraContrib > 0 ? runPath(priceReturnsMatrix, 'contrib', true, simPPY) : null;
  const divSource = contrib || drip;

  return { noDripVals: noDrip.vals, dripVals: drip.vals, contribVals: contrib?.vals ?? null, divIncomePerYear: divSource.divIncomePerYear, simPeriodsPerYear: simPPY };
}
