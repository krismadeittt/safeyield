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
export function projectPortfolioPerStock(horizon, holdings, liveData, extraContrib, useVolatility, rng, cashBalance = 0, cashApy = 0, cashCompounding = 'none') {
  const effectiveCashRate = (cashCompounding !== 'none' && cashApy > 0) ? cashApy / 100 : 0;

  if (!holdings?.length) {
    const simPPY = 12;
    const len = horizon * simPPY + 1;
    // If there's cash with a rate, project its growth
    if (cashBalance > 0 && effectiveCashRate > 0) {
      const vals = [Math.round(cashBalance)];
      const divIncomePerYear = new Array(horizon).fill(0);
      let pool = cashBalance;
      for (let t = 0; t < horizon * simPPY; t++) {
        const interest = pool * effectiveCashRate / simPPY;
        pool += interest;
        divIncomePerYear[Math.floor(t / simPPY)] += interest;
        vals.push(Math.round(pool));
      }
      return { noDripVals: vals, dripVals: vals, contribVals: null, divIncomePerYear, simPeriodsPerYear: simPPY };
    }
    if (cashBalance > 0) {
      const vals = new Array(len).fill(Math.round(cashBalance));
      return { noDripVals: vals, dripVals: vals, contribVals: null, divIncomePerYear: new Array(horizon).fill(0), simPeriodsPerYear: simPPY };
    }
    const zeros = new Array(len).fill(0);
    return { noDripVals: zeros, dripVals: zeros, contribVals: null, divIncomePerYear: new Array(horizon).fill(0), simPeriodsPerYear: simPPY };
  }

  const marketVol = 0.20;

  // Build initial per-stock state
  function initStocks() {
    return holdings.map(h => {
      const live = liveData?.[h.ticker];
      const price = (live?.price > 0 ? live.price : null) || h.price || 0;
      const divPerShare = live?.annualDiv ?? h.div ?? 0;
      // Use ACTUAL yield from divPerShare/price for consistency with Gordon model.
      // Reported divYield can differ from annualDiv/price (forward vs trailing,
      // special distributions, split adjustments), causing double-counted returns.
      const reportedYld = (live?.divYield ?? h.yld ?? 0) / 100;
      const yld = (price > 0 && divPerShare > 0) ? divPerShare / price : reportedYld;
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

  function totalValue(stocks, cashDividends, cashPool) {
    return Math.round(stocks.reduce((s, st) => s + st.shares * st.price, 0) + (cashDividends || 0) + (cashPool || 0));
  }

  // Run a single simulation path for a given scenario with pre-generated returns
  // divStress: if true, cut dividends during bad years (Real World mode only)
  function runPath(priceReturnsMatrix, scenario, divStress = false, ppy = 1) {
    const stocks = initStocks();
    let cashDividends = 0;
    let cashPool = cashBalance || 0;
    const vals = [totalValue(stocks, 0, cashPool)];
    const totalPeriods = priceReturnsMatrix.length;
    const divIncomePerYear = new Array(Math.ceil(totalPeriods / ppy)).fill(0);

    // Dividend payment schedule: pay every period (monthly when ppy=12).
    // This handles monthly payers correctly and compounds DRIP at each payment.
    const divEventsPerYear = ppy;
    const periodsPerDivEvent = 1;
    const quartersPerEvent = 4 / divEventsPerYear;

    let yearStartPrices = stocks.map(st => st.price);
    const initialShares = stocks.map(st => st.shares);
    let dripLogCount = 0;

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
            if (st.price > 0) {
              const newShares = qDiv / st.price;
              st.shares += newShares;
            }
          } else {
            cashDividends += qDiv;
          }
          // Grow dividends incrementally at each payment — compounds to g5 annually
          // (1 + g5)^(quartersPerEvent/4) per event, so 4/quartersPerEvent events = (1+g5) per year
          st.divPerShare *= Math.pow(1 + st.g5, quartersPerEvent / 4);
        });
        divIncomePerYear[Math.floor(t / ppy)] += periodDivTotal;

        // Debug: log first 12 DRIP payments
        if (scenario === 'drip' && dripLogCount < 12) {
          const month = (t % ppy) + 1;
          const year = Math.floor(t / ppy) + 1;
          stocks.forEach((st, i) => {
            const dripShares = st.shares - initialShares[i];
            const dripValue = dripShares * st.price;
            console.log(`[DRIP] Y${year} M${month}: stock#${i} div=$${(st.shares > initialShares[i] ? periodDivTotal / stocks.length : 0).toFixed(2)} price=$${st.price.toFixed(2)} cumDripShares=${dripShares.toFixed(4)} cumDripValue=$${dripValue.toFixed(2)}`);
          });
          dripLogCount++;
        }
      }

      // End of year: dividend stress (macro event based on annual price returns)
      if (periodInYear === ppy - 1) {
        if (divStress) {
          stocks.forEach((st, i) => {
            const yearReturn = yearStartPrices[i] > 0 ? (st.price / yearStartPrices[i] - 1) : 0;
            if (yearReturn < -0.15) {
              const drop = -yearReturn;
              const cutPct = Math.min((drop - 0.15) * 0.8, 0.50);
              st.divPerShare *= (1 - cutPct);
            }
          });
        }
      }

      // Accrue cash interest
      if (effectiveCashRate > 0 && cashPool > 0) {
        const interest = cashPool * effectiveCashRate / ppy;
        cashPool += interest;
        divIncomePerYear[Math.floor(t / ppy)] += interest;
      }

      // noDrip shows pure price appreciation (no dividend value);
      // drip/contrib already have dividends in share count, cashDividends is 0 for them.
      const periodVal = totalValue(stocks, 0, cashPool);
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
  // Run at monthly resolution (ppy=12) so quarterly dividend growth compounds intra-year.
  if (!useVolatility) {
    const detPPY = 12;
    const template = initStocks();
    const detReturns = [];
    for (let t = 0; t < horizon * detPPY; t++) {
      // Convert annual price growth to monthly: (1 + r)^(1/12) - 1
      detReturns.push(template.map(st => Math.pow(1 + st.priceGrowthRate, 1 / detPPY) - 1));
    }
    const noDrip = runPath(detReturns, 'nodrip', false, detPPY);
    const drip = runPath(detReturns, 'drip', false, detPPY);
    const contrib = extraContrib > 0 ? runPath(detReturns, 'contrib', false, detPPY) : null;
    // Use divIncomePerYear from the drip/contrib path (reflects DRIP share accumulation)
    const divSource = contrib || drip;
    return { noDripVals: noDrip.vals, dripVals: drip.vals, contribVals: contrib?.vals ?? null, divIncomePerYear: divSource.divIncomePerYear, simPeriodsPerYear: detPPY };
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

// ── Retirement Monte Carlo ──

const MARKET_VOL = 0.20;

/**
 * Build initial per-stock state from holdings + liveData.
 * Shared between existing engine and retirement simulation.
 */
function buildStockState(holdings, liveData) {
  return holdings.map(h => {
    const live = liveData?.[h.ticker];
    const price = (live?.price > 0 ? live.price : null) || h.price || 0;
    const divPerShare = live?.annualDiv ?? h.div ?? 0;
    // Use ACTUAL yield from divPerShare/price for consistency with Gordon model.
    const reportedYld = (live?.divYield ?? h.yld ?? 0) / 100;
    const yld = (price > 0 && divPerShare > 0) ? divPerShare / price : reportedYld;
    const g5 = Math.max(0, Math.min((h.g5 ?? 5), 10)) / 100;
    const beta = live?.beta ?? 1.0;
    const sigma = Math.max(0.18, Math.abs(beta) * MARKET_VOL);
    const expectedReturn = Math.max(0.02, Math.min(yld + g5, 0.15));
    const priceGrowthRate = Math.max(0, expectedReturn - yld);
    const idioSigma = Math.sqrt(Math.max(0, sigma * sigma - beta * beta * MARKET_VOL * MARKET_VOL));

    return { shares: h.shares || 0, price, divPerShare, g5, priceGrowthRate, sigma, beta, idioSigma };
  });
}

/**
 * Generate correlated GBM price returns for N months.
 */
function generateMonthlyReturns(stockTemplate, totalMonths, rng) {
  const periodMarketVol = MARKET_VOL / Math.sqrt(12);
  const matrix = [];
  for (let t = 0; t < totalMonths; t++) {
    const marketZ = boxMuller(rng);
    const periodReturns = stockTemplate.map(st => {
      const annualDrift = Math.log(1 + st.priceGrowthRate) - 0.5 * st.sigma * st.sigma;
      const periodDrift = annualDrift / 12;
      const periodBetaVol = st.beta * periodMarketVol;
      const periodIdioVol = st.idioSigma / Math.sqrt(12);
      const idioZ = boxMuller(rng);
      const totalShock = periodBetaVol * marketZ + periodIdioVol * idioZ;
      return Math.max(Math.exp(periodDrift + totalShock) - 1, -0.70);
    });
    matrix.push(periodReturns);
  }
  return matrix;
}

/**
 * Run a single two-phase retirement simulation.
 *
 * Phase 1 (Growth): DRIP reinvestment, no withdrawals
 * Phase 2 (Withdrawal): monthly withdrawal, sell shares proportionally if dividends insufficient
 *
 * @param {Object} params
 * @param {number} params.growthMonths
 * @param {number} params.withdrawalMonths
 * @param {Array} params.holdings
 * @param {Object} params.liveData
 * @param {number} params.monthlyWithdrawal - dollars
 * @param {number} params.cashBalance
 * @param {number} params.seed
 * @returns {{ values: number[], ruined: boolean, ruinMonth: number|null }}
 */
export function simulateRetirementPath({ growthMonths, withdrawalMonths, holdings, liveData, monthlyWithdrawal, cashBalance = 0, seed }) {
  if (!holdings?.length) {
    const totalMonths = growthMonths + withdrawalMonths;
    const values = [Math.round(cashBalance)];
    let pool = cashBalance;
    for (let t = 0; t < totalMonths; t++) {
      if (t >= growthMonths) pool -= monthlyWithdrawal;
      if (pool <= 0) {
        values.push(0);
        return { values: values.concat(new Array(totalMonths - t - 1).fill(0)), ruined: true, ruinMonth: t };
      }
      values.push(Math.round(pool));
    }
    return { values, ruined: false, ruinMonth: null };
  }

  const rng = seededPRNG(seed);
  const totalMonths = growthMonths + withdrawalMonths;
  const template = buildStockState(holdings, liveData);
  const returnsMatrix = generateMonthlyReturns(template, totalMonths, rng);

  // Clone stock state for this simulation
  const stocks = template.map(st => ({ ...st }));
  let cash = cashBalance || 0;

  function portfolioValue() {
    return Math.round(stocks.reduce((s, st) => s + st.shares * st.price, 0) + cash);
  }

  const values = [portfolioValue()];
  let ruined = false;
  let ruinMonth = null;

  for (let t = 0; t < totalMonths; t++) {
    const isWithdrawalPhase = t >= growthMonths;

    // Apply price returns
    const returns = returnsMatrix[t];
    stocks.forEach((st, i) => {
      st.price = Math.max(0, st.price * (1 + returns[i]));
    });

    // Pay dividends (monthly)
    let monthDivs = 0;
    stocks.forEach(st => {
      if (st.price > 0 && st.divPerShare > st.price * 0.15) {
        st.divPerShare = st.price * 0.15;
      }
      const div = st.shares * st.divPerShare / 12;
      monthDivs += div;

      if (!isWithdrawalPhase) {
        // Growth phase: DRIP
        if (st.price > 0) st.shares += div / st.price;
      }
      // Grow dividend per share
      st.divPerShare *= Math.pow(1 + st.g5, 1 / 12);
    });

    if (isWithdrawalPhase) {
      // Dividends go to cash, then withdraw from cash
      cash += monthDivs;
      let deficit = monthlyWithdrawal;

      // First use cash
      if (cash >= deficit) {
        cash -= deficit;
        deficit = 0;
      } else {
        deficit -= cash;
        cash = 0;
      }

      // If still deficit, sell shares proportionally
      if (deficit > 0) {
        const stocksValue = stocks.reduce((s, st) => s + st.shares * st.price, 0);
        if (stocksValue <= 0) {
          ruined = true;
          ruinMonth = t;
          values.push(0);
          // Fill remaining with zeros
          for (let r = t + 1; r < totalMonths; r++) values.push(0);
          break;
        }
        const sellFraction = Math.min(1, deficit / stocksValue);
        stocks.forEach(st => {
          st.shares *= (1 - sellFraction);
        });
      }
    }

    const val = portfolioValue();
    if (val <= 0 && isWithdrawalPhase) {
      ruined = true;
      ruinMonth = t;
      values.push(0);
      for (let r = t + 1; r < totalMonths; r++) values.push(0);
      break;
    }
    values.push(Math.max(0, val));
  }

  return { values, ruined, ruinMonth };
}

/**
 * Run N retirement simulations and compute percentile bands + success rate.
 * Designed for use in a Web Worker.
 *
 * @param {Object} params - Same as simulateRetirementPath plus:
 * @param {number} params.numSims - Number of simulations (default 10000)
 * @param {Function} [params.onProgress] - Progress callback (fraction 0-1)
 * @returns {{ months: number[], bands: { p10, p25, p50, p75, p90 }[], successRate: number, numSims: number,
 *             retirementMonthIdx: number, medianAtRetirement: number, medianAtEnd: number }}
 */
export function runRetirementMonteCarlo(params) {
  const { numSims = 10000, onProgress, growthMonths, withdrawalMonths, ...simBase } = params;
  const totalMonths = growthMonths + withdrawalMonths;

  // Collect values at each time step
  const allValues = Array.from({ length: totalMonths + 1 }, () => []);
  let ruinCount = 0;

  for (let i = 0; i < numSims; i++) {
    const result = simulateRetirementPath({
      ...simBase,
      growthMonths,
      withdrawalMonths,
      seed: i * 7 + 13,
    });
    // Ensure values array matches expected length
    for (let t = 0; t <= totalMonths; t++) {
      allValues[t].push(result.values[t] ?? 0);
    }
    if (result.ruined) ruinCount++;
    if (onProgress && i % 200 === 0) onProgress(i / numSims);
  }

  // Compute percentiles at each time step
  const bands = allValues.map(vals => {
    vals.sort((a, b) => a - b);
    const n = vals.length;
    return {
      p10: vals[Math.floor(n * 0.10)],
      p25: vals[Math.floor(n * 0.25)],
      p50: vals[Math.floor(n * 0.50)],
      p75: vals[Math.floor(n * 0.75)],
      p90: vals[Math.floor(n * 0.90)],
    };
  });

  const months = Array.from({ length: totalMonths + 1 }, (_, i) => i);
  const successRate = ((numSims - ruinCount) / numSims) * 100;
  const retirementMonthIdx = growthMonths;
  const medianAtRetirement = bands[growthMonths]?.p50 ?? 0;
  const medianAtEnd = bands[totalMonths]?.p50 ?? 0;

  if (onProgress) onProgress(1);

  return { months, bands, successRate, numSims, retirementMonthIdx, medianAtRetirement, medianAtEnd };
}
