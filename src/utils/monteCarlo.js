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
 * Core portfolio projection engine with DRIP and Monte Carlo support.
 *
 * @param {number} horizon - Years to project
 * @param {boolean} drip - Enable dividend reinvestment
 * @param {number} extraContrib - Annual extra contribution ($)
 * @param {number} startValue - Initial portfolio value ($)
 * @param {number} yieldPct - Dividend yield (e.g. 3.5 for 3.5%)
 * @param {number} baseReturnPct - Expected annual market return (e.g. 8 for 8%)
 * @param {boolean} useVolatility - Enable Monte Carlo simulation
 * @param {Function|null} rng - PRNG function (required if useVolatility)
 * @param {number} divGrowthPct - Annual dividend growth rate (e.g. 5 for 5%)
 * @returns {number[]} Array of portfolio values, length = horizon + 1
 */
export function projectPortfolio(horizon, drip, extraContrib, startValue, yieldPct, baseReturnPct, useVolatility, rng, divGrowthPct) {
  const divGrowthRate = Math.max(0, Math.min(divGrowthPct || 5, 20)) / 100;
  const values = [Math.round(startValue)];
  let portfolio = startValue;
  let currentYield = yieldPct / 100;
  const volatility = 0.15;
  const annualReturn = baseReturnPct / 100;

  for (let year = 1; year <= horizon; year++) {
    // Add extra annual contribution
    portfolio += extraContrib;

    // DRIP: reinvest dividends quarterly
    const divIncome = portfolio * currentYield;
    if (drip) {
      for (let q = 0; q < 4; q++) {
        portfolio += (portfolio * currentYield) / 4;
      }
    }

    // Market return (with optional Monte Carlo volatility)
    let totalReturn;
    if (useVolatility && rng) {
      const halfVol = volatility / 2;
      const quarterDrift = (annualReturn - 0.5 * volatility * volatility) / 4;
      let cumReturn = 0;
      for (let q = 0; q < 4; q++) {
        cumReturn += Math.exp(quarterDrift + halfVol * boxMuller(rng)) - 1;
      }
      totalReturn = Math.max(cumReturn, -0.4);
    } else {
      totalReturn = Math.pow(1 + annualReturn, 1) - 1;
    }

    portfolio = Math.max(portfolio * (1 + totalReturn), 0);

    // Grow dividend yield for next year
    currentYield = currentYield * (1 + divGrowthRate);

    values.push(Math.round(portfolio));
  }

  return values;
}
