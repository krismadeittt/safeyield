/**
 * Portfolio snapshot utilities — build daily snapshots for tracking.
 */

/**
 * Get today's date in US Eastern Time (NYSE market timezone) as YYYY-MM-DD.
 * This ensures snapshot boundaries align with the trading calendar regardless
 * of the user's local timezone or server timezone.
 */
export function getMarketDate() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date()); // en-CA formats as YYYY-MM-DD
}

/**
 * Compute Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 * Returns a Date object in UTC.
 */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

// NYSE holidays (fixed dates + observed rules + Good Friday).
function getHolidays(year) {
  const holidays = new Set();
  // New Year's Day
  holidays.add(`${year}-01-01`);
  // MLK Day: 3rd Monday of January
  holidays.add(nthWeekday(year, 0, 1, 3));
  // Presidents' Day: 3rd Monday of February
  holidays.add(nthWeekday(year, 1, 1, 3));
  // Good Friday: 2 days before Easter Sunday
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  holidays.add(goodFriday.toISOString().substring(0, 10));
  // Memorial Day: Last Monday of May
  holidays.add(lastWeekday(year, 4, 1));
  // Juneteenth
  holidays.add(`${year}-06-19`);
  // Independence Day
  holidays.add(`${year}-07-04`);
  // Labor Day: 1st Monday of September
  holidays.add(nthWeekday(year, 8, 1, 1));
  // Thanksgiving: 4th Thursday of November
  holidays.add(nthWeekday(year, 10, 4, 4));
  // Christmas
  holidays.add(`${year}-12-25`);

  // Handle observed holidays (if holiday falls on weekend, observed on nearest weekday)
  const observed = new Set();
  holidays.forEach(d => {
    const day = new Date(d + 'T12:00:00Z').getUTCDay();
    if (day === 0) observed.add(addDays(d, 1)); // Sunday → Monday
    else if (day === 6) observed.add(addDays(d, -1)); // Saturday → Friday
    else observed.add(d);
  });
  return observed;
}

function nthWeekday(year, month, weekday, n) {
  let count = 0;
  for (let day = 1; day <= 31; day++) {
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCMonth() !== month) break;
    if (d.getUTCDay() === weekday) {
      count++;
      if (count === n) return d.toISOString().substring(0, 10);
    }
  }
  return null;
}

function lastWeekday(year, month, weekday) {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  for (let day = lastDay; day >= 1; day--) {
    const d = new Date(Date.UTC(year, month, day));
    if (d.getUTCDay() === weekday) return d.toISOString().substring(0, 10);
  }
  return null;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().substring(0, 10);
}

// Cache holidays by year
const holidayCache = {};
function getHolidaySet(year) {
  if (!holidayCache[year]) holidayCache[year] = getHolidays(year);
  return holidayCache[year];
}

/**
 * Check if a date is a trading day (weekday + not a NYSE holiday).
 */
export function isTradingDay(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  const year = d.getUTCFullYear();
  return !getHolidaySet(year).has(dateStr);
}

/**
 * Get the next trading day after dateStr.
 */
export function nextTradingDay(dateStr) {
  let d = addDays(dateStr, 1);
  let safety = 0;
  while (!isTradingDay(d) && safety < 10) {
    d = addDays(d, 1);
    safety++;
  }
  return d;
}

/**
 * Get the previous trading day (or same day if it's a trading day).
 */
export function prevTradingDay(dateStr) {
  let d = dateStr;
  let safety = 0;
  while (!isTradingDay(d) && safety < 10) {
    d = addDays(d, -1);
    safety++;
  }
  return d;
}

/**
 * Create a single snapshot for today using live prices.
 */
export function createSnapshot(holdings, cashBalance, liveData) {
  const today = getMarketDate();
  let holdingsValue = 0;
  const holdingsSnap = [];

  holdings.forEach(h => {
    const price = liveData[h.ticker]?.price || h.price || 0;
    const value = price * (h.shares || 0);
    holdingsValue += value;
    holdingsSnap.push({
      t: h.ticker,
      s: h.shares || 0,
      p: Math.round(price * 100) / 100,
      v: Math.round(value * 100) / 100,
      d: 0,
    });
  });

  return {
    date: today,
    total_value: Math.round((holdingsValue + cashBalance) * 100) / 100,
    cash_value: Math.round(cashBalance * 100) / 100,
    holdings_value: Math.round(holdingsValue * 100) / 100,
    total_div_income: 0,
    holdings_snapshot: JSON.stringify(holdingsSnap),
  };
}

/**
 * Build missing daily snapshots between lastDate and today.
 *
 * @param {string} lastDate - YYYY-MM-DD of most recent snapshot
 * @param {Array} holdings - current holdings [{ticker, shares, price, ...}]
 * @param {number} cashBalance - current cash balance
 * @param {Object} dailyPrices - {TICKER: [{date, close, adj_close}, ...]}
 * @param {Object} dividendHistory - {TICKER: [{date, amount}, ...]} (from KV historyMap)
 * @param {Object} liveData - current live prices {ticker: {price, ...}}
 * @returns {Array} snapshots to save
 */
export function buildMissingSnapshots(lastDate, holdings, cashBalance, dailyPrices, dividendHistory, liveData) {
  const today = getMarketDate();
  if (!lastDate || lastDate >= today) return [];

  // Build per-ticker price lookup: { TICKER: { "2024-01-15": {close, adj_close} } }
  const tickerPriceMap = {};
  holdings.forEach(h => {
    const priceArr = dailyPrices[h.ticker] || [];
    const map = {};
    priceArr.forEach(entry => { map[entry.date] = entry; });
    tickerPriceMap[h.ticker] = map;
  });

  // Build per-ticker dividend lookup: { TICKER: { "2024-01-15": amount } }
  const tickerDivMap = {};
  holdings.forEach(h => {
    const divArr = dividendHistory[h.ticker] || [];
    const map = {};
    divArr.forEach(entry => {
      let divDate = entry.d || entry.date;
      // If dividend falls on non-trading day, assign to next trading day
      if (divDate && !isTradingDay(divDate)) {
        divDate = nextTradingDay(divDate);
      }
      const amount = entry.v || entry.amount || 0;
      if (divDate && amount > 0) {
        map[divDate] = (map[divDate] || 0) + amount;
      }
    });
    tickerDivMap[h.ticker] = map;
  });

  // Track last known prices for carry-forward
  const lastKnownPrice = {};
  holdings.forEach(h => {
    // Start with the most recent price before or at lastDate
    const priceMap = tickerPriceMap[h.ticker] || {};
    const dates = Object.keys(priceMap).sort();
    for (let i = dates.length - 1; i >= 0; i--) {
      if (dates[i] <= lastDate) {
        lastKnownPrice[h.ticker] = priceMap[dates[i]].close;
        break;
      }
    }
    if (!lastKnownPrice[h.ticker]) {
      lastKnownPrice[h.ticker] = liveData?.[h.ticker]?.price || h.price || 0;
    }
  });

  // Detect stock splits via adjusted close ratio changes
  // Track cumulative split factor per ticker
  const splitFactor = {};
  holdings.forEach(h => { splitFactor[h.ticker] = 1; });

  const snapshots = [];
  let currentDate = nextTradingDay(lastDate);
  let prevDate = lastDate;

  while (currentDate <= today) {
    let holdingsValue = 0;
    let totalDivIncome = 0;
    const holdingsSnap = [];

    const isToday = currentDate === today;

    holdings.forEach(h => {
      const priceMap = tickerPriceMap[h.ticker] || {};
      const divMap = tickerDivMap[h.ticker] || {};

      // Get price for this day
      let dayPrice;
      if (isToday && liveData?.[h.ticker]?.price) {
        dayPrice = liveData[h.ticker].price;
      } else if (priceMap[currentDate]) {
        dayPrice = priceMap[currentDate].close;

        // Detect split: if adj_close ratio vs close ratio diverges significantly
        if (priceMap[prevDate] && priceMap[currentDate].adj_close && priceMap[prevDate].adj_close) {
          const closeRatio = priceMap[currentDate].close / priceMap[prevDate].close;
          const adjRatio = priceMap[currentDate].adj_close / priceMap[prevDate].adj_close;
          // Forward split: close drops sharply but adj_close stays stable
          if (closeRatio < 0.7 && closeRatio > 0.05 && adjRatio > 0.85 && adjRatio < 1.15) {
            const ratio = Math.round(1 / closeRatio);
            if (ratio >= 2 && ratio <= 10) {
              splitFactor[h.ticker] *= ratio;
            }
          }
          // Reverse split
          else if (closeRatio > 1.5 && adjRatio > 0.85 && adjRatio < 1.15) {
            const ratio = Math.round(closeRatio);
            if (ratio >= 2 && ratio <= 10) {
              splitFactor[h.ticker] /= ratio;
            }
          }
        }
      }

      if (dayPrice !== undefined) {
        lastKnownPrice[h.ticker] = dayPrice;
      }
      const price = lastKnownPrice[h.ticker] || 0;

      // Apply split factor to shares
      const effectiveShares = (h.shares || 0) * splitFactor[h.ticker];
      const value = price * effectiveShares;
      holdingsValue += value;

      // Check for dividends
      const divPerShare = divMap[currentDate] || 0;
      const divIncome = divPerShare * effectiveShares;
      totalDivIncome += divIncome;

      holdingsSnap.push({
        t: h.ticker,
        s: Math.round(effectiveShares * 10000) / 10000,
        p: Math.round(price * 100) / 100,
        v: Math.round(value * 100) / 100,
        d: Math.round(divIncome * 100) / 100,
      });
    });

    snapshots.push({
      date: currentDate,
      total_value: Math.round((holdingsValue + cashBalance) * 100) / 100,
      cash_value: Math.round(cashBalance * 100) / 100,
      holdings_value: Math.round(holdingsValue * 100) / 100,
      total_div_income: Math.round(totalDivIncome * 100) / 100,
      holdings_snapshot: JSON.stringify(holdingsSnap),
    });

    prevDate = currentDate;
    currentDate = nextTradingDay(currentDate);
  }

  return snapshots;
}
