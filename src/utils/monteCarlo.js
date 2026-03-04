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
 * Monte Carlo simulation using Geometric Brownian Motion (GBM) + CAPM.
 *
 * Model: ln(S(t+1)/S(t)) ~ N(μ - σ²/2, σ²)
 * CAPM: expected return = risk-free + β × equity risk premium
 * Volatility: σ = |β| × σ_market (floored at 12%)
 *
 * Runs `numSims` independent paths, each projecting `horizon` years.
 * Returns percentile bands (P10, P25, P50, P75, P90) per year for:
 *   - sharePrice: price per share
 *   - totalValue: price × shares (DRIP reinvests dividends quarterly)
 *   - cumDividends: total dividends received (if not reinvested)
 *
 * @param {Object} params
 * @param {number} params.price       - Current share price
 * @param {number} params.beta        - Stock beta (default 1.0)
 * @param {number} params.yieldPct    - Current dividend yield (%)
 * @param {number} params.divGrowthPct - Annual dividend growth rate (%)
 * @param {number} params.horizon     - Years to project (default 10)
 * @param {number} params.numSims     - Number of simulations (default 1000)
 * @param {number} params.seed        - PRNG seed for reproducibility
 * @returns {{ years: number[], bands: { p10, p25, p50, p75, p90 }[] }}
 */
export function runMonteCarloGBM({
  price, beta = 1.0, yieldPct = 0, divGrowthPct = 5,
  horizon = 10, numSims = 1000, seed = 42,
}) {
  if (!price || price <= 0) return null;

  const riskFree = 0.03;
  const equityPremium = 0.07;
  const marketVol = 0.16;

  // CAPM expected return; clamp to reasonable range
  const mu = Math.max(0.02, Math.min(riskFree + (beta || 1) * equityPremium, 0.20));
  // Stock volatility from beta; floor at 12% (even low-beta stocks have some vol)
  const sigma = Math.max(0.12, Math.abs(beta || 1) * marketVol);

  const divYield = Math.max(0, (yieldPct || 0) / 100);
  const divGrowth = Math.max(-0.1, Math.min((divGrowthPct || 0) / 100, 0.25));

  // GBM drift (price appreciation = total return minus dividend payout)
  const priceDrift = mu - divYield - 0.5 * sigma * sigma;

  // Collect all simulation endpoints per year
  const allValues = []; // allValues[year] = [totalValue_sim1, totalValue_sim2, ...]
  for (let y = 0; y <= horizon; y++) allValues.push([]);

  for (let sim = 0; sim < numSims; sim++) {
    const rng = seededPRNG(seed + sim * 7919);
    let sharePrice = price;
    let shares = 1; // normalized to 1 share
    let divPerShare = price * divYield;

    allValues[0].push(sharePrice * shares);

    for (let year = 1; year <= horizon; year++) {
      // Grow dividend
      divPerShare *= (1 + divGrowth);

      // Quarterly DRIP: reinvest dividends into more shares
      for (let q = 0; q < 4; q++) {
        const qDiv = shares * divPerShare / 4;
        if (sharePrice > 0) shares += qDiv / sharePrice;
      }

      // GBM price step (annual)
      const z = boxMuller(rng);
      sharePrice = Math.max(0.01, sharePrice * Math.exp(priceDrift + sigma * z));

      allValues[year].push(sharePrice * shares);
    }
  }

  // Compute percentiles per year
  const years = [];
  const bands = [];
  for (let y = 0; y <= horizon; y++) {
    years.push(y);
    const sorted = allValues[y].slice().sort((a, b) => a - b);
    const pct = p => sorted[Math.floor(p * (sorted.length - 1))];
    bands.push({
      p10: pct(0.10),
      p25: pct(0.25),
      p50: pct(0.50),
      p75: pct(0.75),
      p90: pct(0.90),
    });
  }

  return { years, bands };
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

  const marketVol = 0.16;
  const NUM_SIMS = 200;

  // Build initial per-stock state
  function initStocks() {
    return holdings.map(h => {
      const live = liveData?.[h.ticker];
      const price = (live?.price > 0 ? live.price : null) || h.price || 0;
      const yld = (live?.divYield ?? h.yld ?? 0) / 100;
      const divPerShare = live?.annualDiv ?? h.div ?? 0;
      const g5 = Math.max(0, Math.min((h.g5 ?? 5), 20)) / 100;
      const beta = live?.beta ?? 1.0;
      const sigma = Math.max(0.12, Math.abs(beta) * marketVol);

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
        sigma,
      };
    });
  }

  function totalValue(stocks) {
    return Math.round(stocks.reduce((s, st) => s + st.shares * st.price, 0));
  }

  // Run a single simulation path for a given scenario
  function runPath(simRng, scenario) {
    const stocks = initStocks();
    const vals = [totalValue(stocks)];

    for (let year = 1; year <= horizon; year++) {
      // Generate per-stock price returns
      const priceReturns = stocks.map(st => {
        if (simRng) {
          const drift = Math.log(1 + st.priceGrowthRate) - 0.5 * st.sigma * st.sigma;
          return Math.max(Math.exp(drift + st.sigma * boxMuller(simRng)) - 1, -0.30);
        }
        return st.priceGrowthRate;
      });

      if (scenario === 'contrib') {
        // Distribute annual contribution proportionally by current value
        const totalV = stocks.reduce((s, st) => s + st.shares * st.price, 0);
        stocks.forEach(st => {
          const weight = totalV > 0 ? (st.shares * st.price) / totalV : 1 / stocks.length;
          if (st.price > 0) st.shares += (extraContrib * weight) / st.price;
        });
      }

      stocks.forEach((st, i) => {
        st.divPerShare *= (1 + st.g5);
        if (scenario === 'drip' || scenario === 'contrib') {
          for (let q = 0; q < 4; q++) {
            const qDiv = st.shares * st.divPerShare / 4;
            if (st.price > 0) st.shares += qDiv / st.price;
          }
        }
        st.price = Math.max(0, st.price * (1 + priceReturns[i]));
      });
      vals.push(totalValue(stocks));
    }
    return vals;
  }

  // When volatility is off, run a single deterministic path (same as before)
  if (!useVolatility) {
    const noDripVals = runPath(null, 'nodrip');
    const dripVals = runPath(null, 'drip');
    const contribVals = extraContrib > 0 ? runPath(null, 'contrib') : null;
    return { noDripVals, dripVals, contribVals };
  }

  // Single seeded sim with monthly GBM steps for realistic month-to-month volatility
  function runMonthlyPath(scenario) {
    const simRng = seededPRNG(42);
    const stocks = initStocks();
    const monthly = [totalValue(stocks)];

    for (let month = 1; month <= horizon * 12; month++) {
      const monthInYear = ((month - 1) % 12) + 1; // 1-12

      // Annual contribution at start of each year
      if (scenario === 'contrib' && monthInYear === 1) {
        const totalV = stocks.reduce((s, st) => s + st.shares * st.price, 0);
        stocks.forEach(st => {
          const weight = totalV > 0 ? (st.shares * st.price) / totalV : 1 / stocks.length;
          if (st.price > 0) st.shares += (extraContrib * weight) / st.price;
        });
      }

      stocks.forEach(st => {
        // Monthly GBM price step
        const annualDrift = Math.log(1 + st.priceGrowthRate);
        const monthlyDrift = annualDrift / 12 - 0.5 * st.sigma * st.sigma / 12;
        const monthlySigma = st.sigma / Math.sqrt(12);
        const z = boxMuller(simRng);
        st.price = Math.max(0.01, st.price * Math.exp(monthlyDrift + monthlySigma * z));

        // Quarterly DRIP (end of quarter: month 3, 6, 9, 12)
        if (monthInYear % 3 === 0 && (scenario === 'drip' || scenario === 'contrib')) {
          const qDiv = st.shares * st.divPerShare / 4;
          if (st.price > 0) st.shares += qDiv / st.price;
        }

        // Annual dividend growth
        if (monthInYear === 12) {
          st.divPerShare *= (1 + st.g5);
        }
      });

      monthly.push(totalValue(stocks));
    }
    return monthly;
  }

  const monthlyNoDrip = runMonthlyPath('nodrip');
  const monthlyDrip = runMonthlyPath('drip');
  const monthlyContrib = extraContrib > 0 ? runMonthlyPath('contrib') : null;

  // Sample yearly values for stat cards
  function sampleYearly(m) {
    const y = [];
    for (let i = 0; i <= horizon; i++) y.push(m[i * 12]);
    return y;
  }

  return {
    noDripVals: sampleYearly(monthlyNoDrip),
    dripVals: sampleYearly(monthlyDrip),
    contribVals: monthlyContrib ? sampleYearly(monthlyContrib) : null,
    monthlyNoDrip,
    monthlyDrip,
    monthlyContrib,
  };
}
