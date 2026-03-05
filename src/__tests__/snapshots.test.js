import { describe, it, expect } from 'vitest';
import {
  isTradingDay,
  nextTradingDay,
  prevTradingDay,
  createSnapshot,
  buildMissingSnapshots,
  getMarketDate,
} from '../utils/snapshots';

describe('isTradingDay', () => {
  it('returns true for normal weekdays', () => {
    // 2026-03-02 is Monday
    expect(isTradingDay('2026-03-02')).toBe(true);
    expect(isTradingDay('2026-03-03')).toBe(true); // Tuesday
    expect(isTradingDay('2026-03-04')).toBe(true); // Wednesday
    expect(isTradingDay('2026-03-05')).toBe(true); // Thursday
    expect(isTradingDay('2026-03-06')).toBe(true); // Friday
  });

  it('returns false for weekends', () => {
    expect(isTradingDay('2026-03-07')).toBe(false); // Saturday
    expect(isTradingDay('2026-03-08')).toBe(false); // Sunday
  });

  it('returns false for New Year\'s Day', () => {
    expect(isTradingDay('2026-01-01')).toBe(false);
  });

  it('returns false for Christmas', () => {
    expect(isTradingDay('2025-12-25')).toBe(false);
  });

  it('returns false for Independence Day', () => {
    // July 4, 2025 is Friday — it's a holiday
    expect(isTradingDay('2025-07-04')).toBe(false);
  });

  it('handles observed holidays (holiday on Saturday → Friday off)', () => {
    // July 4, 2026 is Saturday → observed on Friday July 3
    expect(isTradingDay('2026-07-03')).toBe(false);
    expect(isTradingDay('2026-07-06')).toBe(true); // Monday after
  });

  it('handles observed holidays (holiday on Sunday → Monday off)', () => {
    // Juneteenth 2027: June 19 is Saturday → observed Friday June 18
    // Actually let's check: 2022-06-19 is Sunday → observed Monday 2022-06-20
    expect(isTradingDay('2022-06-20')).toBe(false);
  });

  it('returns false for Thanksgiving', () => {
    // 2025 Thanksgiving: 4th Thursday of November = Nov 27
    expect(isTradingDay('2025-11-27')).toBe(false);
  });

  it('returns false for MLK Day', () => {
    // 2026 MLK Day: 3rd Monday of January = Jan 19
    expect(isTradingDay('2026-01-19')).toBe(false);
  });

  it('returns false for Memorial Day', () => {
    // 2026 Memorial Day: Last Monday of May = May 25
    expect(isTradingDay('2026-05-25')).toBe(false);
  });

  it('returns false for Labor Day', () => {
    // 2026 Labor Day: 1st Monday of September = Sep 7
    expect(isTradingDay('2026-09-07')).toBe(false);
  });

  it('returns false for Good Friday', () => {
    // 2025: Easter Sunday = April 20 → Good Friday = April 18
    expect(isTradingDay('2025-04-18')).toBe(false);
    // 2026: Easter Sunday = April 5 → Good Friday = April 3
    expect(isTradingDay('2026-04-03')).toBe(false);
    // 2024: Easter Sunday = March 31 → Good Friday = March 29
    expect(isTradingDay('2024-03-29')).toBe(false);
  });
});

describe('nextTradingDay', () => {
  it('returns next day for normal weekday', () => {
    expect(nextTradingDay('2026-03-02')).toBe('2026-03-03'); // Mon → Tue
  });

  it('skips weekend', () => {
    expect(nextTradingDay('2026-03-06')).toBe('2026-03-09'); // Fri → Mon
  });

  it('skips holiday', () => {
    // Day before New Year's 2026 (Wed Dec 31) → skip Jan 1 (Thu holiday) → Jan 2 (Fri)
    expect(nextTradingDay('2025-12-31')).toBe('2026-01-02');
  });
});

describe('prevTradingDay', () => {
  it('returns same day if it is a trading day', () => {
    expect(prevTradingDay('2026-03-05')).toBe('2026-03-05');
  });

  it('goes back from weekend to Friday', () => {
    expect(prevTradingDay('2026-03-07')).toBe('2026-03-06'); // Sat → Fri
    expect(prevTradingDay('2026-03-08')).toBe('2026-03-06'); // Sun → Fri
  });

  it('skips holiday going backward', () => {
    // Jan 1, 2026 (Thu holiday) → Dec 31, 2025 (Wed)
    expect(prevTradingDay('2026-01-01')).toBe('2025-12-31');
  });
});

describe('createSnapshot', () => {
  it('creates a snapshot from holdings and live data', () => {
    const holdings = [
      { ticker: 'AAPL', shares: 10, price: 180 },
      { ticker: 'JNJ', shares: 5, price: 160 },
    ];
    const liveData = {
      AAPL: { price: 185 },
      JNJ: { price: 165 },
    };
    const cashBalance = 500;

    const snap = createSnapshot(holdings, cashBalance, liveData);

    expect(snap.total_value).toBe(Math.round((185 * 10 + 165 * 5 + 500) * 100) / 100);
    expect(snap.cash_value).toBe(500);
    expect(snap.holdings_value).toBe(Math.round((185 * 10 + 165 * 5) * 100) / 100);
    expect(snap.total_div_income).toBe(0);
    expect(snap.date).toBeTruthy();

    const parsed = JSON.parse(snap.holdings_snapshot);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].t).toBe('AAPL');
    expect(parsed[0].s).toBe(10);
    expect(parsed[0].p).toBe(185);
  });

  it('falls back to holding price if no live data', () => {
    const holdings = [{ ticker: 'XYZ', shares: 5, price: 100 }];
    const snap = createSnapshot(holdings, 0, {});
    expect(snap.holdings_value).toBe(500);
  });
});

describe('getMarketDate', () => {
  it('returns a valid YYYY-MM-DD string', () => {
    const date = getMarketDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('buildMissingSnapshots', () => {
  it('returns empty for same day', () => {
    const today = getMarketDate();
    const result = buildMissingSnapshots(today, [], 0, {}, {}, {});
    expect(result).toEqual([]);
  });

  it('returns empty for future date', () => {
    const result = buildMissingSnapshots('2099-01-01', [], 0, {}, {}, {});
    expect(result).toEqual([]);
  });

  it('builds snapshots for a short gap with daily prices', () => {
    const holdings = [{ ticker: 'AAPL', shares: 10, price: 180 }];
    const cashBalance = 100;
    const dailyPrices = {
      AAPL: [
        { date: '2026-03-02', close: 182, adj_close: 182 },
        { date: '2026-03-03', close: 184, adj_close: 184 },
        { date: '2026-03-04', close: 186, adj_close: 186 },
      ],
    };
    const divHistory = {};
    const liveData = { AAPL: { price: 188 } };

    // Last snapshot was end of Feb (Friday Feb 27 is the prev trading day)
    const result = buildMissingSnapshots('2026-02-27', holdings, cashBalance, dailyPrices, divHistory, liveData);

    // Should have snapshots for Mar 2 (Mon), Mar 3 (Tue), Mar 4 (Wed), Mar 5 (Thu = today)
    expect(result.length).toBeGreaterThan(0);

    // First snapshot should use Mar 2 price
    const firstSnap = result[0];
    expect(firstSnap.date).toBe('2026-03-02');
    expect(firstSnap.holdings_value).toBe(Math.round(182 * 10 * 100) / 100);
    expect(firstSnap.total_value).toBe(Math.round((182 * 10 + 100) * 100) / 100);
  });

  it('carries forward price when no data for a day', () => {
    const holdings = [{ ticker: 'AAPL', shares: 5, price: 180 }];
    const dailyPrices = {
      AAPL: [
        { date: '2026-03-02', close: 182, adj_close: 182 },
        // No data for Mar 3
        { date: '2026-03-04', close: 186, adj_close: 186 },
      ],
    };

    const result = buildMissingSnapshots('2026-02-27', holdings, 0, dailyPrices, {}, {});
    const mar3 = result.find(s => s.date === '2026-03-03');
    if (mar3) {
      // Should carry forward 182 from Mar 2
      expect(mar3.holdings_value).toBe(Math.round(182 * 5 * 100) / 100);
    }
  });

  it('includes dividend income on payment days', () => {
    const holdings = [{ ticker: 'AAPL', shares: 10, price: 180 }];
    const dailyPrices = {
      AAPL: [
        { date: '2026-03-02', close: 182, adj_close: 182 },
        { date: '2026-03-03', close: 184, adj_close: 184 },
      ],
    };
    const divHistory = {
      AAPL: [
        { d: '2026-03-03', v: 0.96 }, // $0.96/share dividend
      ],
    };

    const result = buildMissingSnapshots('2026-02-27', holdings, 0, dailyPrices, divHistory, {});
    const mar3 = result.find(s => s.date === '2026-03-03');
    expect(mar3).toBeTruthy();
    expect(mar3.total_div_income).toBe(Math.round(0.96 * 10 * 100) / 100);
  });

  it('moves weekend dividend to next trading day', () => {
    const holdings = [{ ticker: 'AAPL', shares: 10, price: 180 }];
    // Use dates in the past so buildMissingSnapshots can reach them
    const dailyPrices = {
      AAPL: [
        { date: '2026-02-27', close: 182, adj_close: 182 }, // Friday
        { date: '2026-03-02', close: 184, adj_close: 184 }, // Monday
      ],
    };
    const divHistory = {
      AAPL: [
        { d: '2026-02-28', v: 0.50 }, // Saturday dividend → should move to Monday Mar 2
      ],
    };

    const result = buildMissingSnapshots('2026-02-26', holdings, 0, dailyPrices, divHistory, {});
    const monday = result.find(s => s.date === '2026-03-02');
    expect(monday).toBeTruthy();
    expect(monday.total_div_income).toBe(Math.round(0.50 * 10 * 100) / 100);

    // Friday should have no dividend
    const friday = result.find(s => s.date === '2026-02-27');
    if (friday) {
      expect(friday.total_div_income).toBe(0);
    }
  });

  it('detects forward stock split and adjusts shares', () => {
    const holdings = [{ ticker: 'XYZ', shares: 10, price: 200 }];
    const dailyPrices = {
      XYZ: [
        { date: '2026-03-02', close: 200, adj_close: 200 },
        { date: '2026-03-03', close: 50, adj_close: 200 }, // 4:1 split (close drops 4x, adj stays same)
        { date: '2026-03-04', close: 52, adj_close: 208 },
      ],
    };

    const result = buildMissingSnapshots('2026-02-27', holdings, 0, dailyPrices, {}, {});

    // After split: 10 shares * 4 = 40 shares at $50 each = $2000 (same value)
    const mar3 = result.find(s => s.date === '2026-03-03');
    expect(mar3).toBeTruthy();
    // Holdings value should be ~$2000 (40 shares * 50)
    expect(mar3.holdings_value).toBe(Math.round(50 * 40 * 100) / 100);

    // Mar 4: 40 shares at $52 = $2080
    const mar4 = result.find(s => s.date === '2026-03-04');
    expect(mar4).toBeTruthy();
    expect(mar4.holdings_value).toBe(Math.round(52 * 40 * 100) / 100);
  });
});
