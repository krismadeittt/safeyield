import { describe, it, expect } from 'vitest';
import {
  parseFundamentals, sf, round, quarterly, annual,
  computeG5, computeStreak, buildAnnualHistory,
} from '../../worker/parse.js';

// =============================================================================
// sf — safe float parser with optional scale
// =============================================================================
describe('sf', () => {
  it('parses a valid number', () => {
    expect(sf(42)).toBe(42);
    expect(sf("3.14")).toBe(3.14);
  });

  it('applies scale multiplier', () => {
    expect(sf(0.05, 100)).toBe(5);
    expect(sf("2.5", 1000)).toBe(2500);
  });

  it('returns null for NaN, zero, null, undefined', () => {
    expect(sf(NaN)).toBeNull();
    expect(sf(0)).toBeNull();
    expect(sf(null)).toBeNull();
    expect(sf(undefined)).toBeNull();
    expect(sf("abc")).toBeNull();
    expect(sf("")).toBeNull();
  });

  it('defaults scale to 1', () => {
    expect(sf(7)).toBe(7);
    expect(sf(7, undefined)).toBe(7);
  });
});

// =============================================================================
// round — safe rounding
// =============================================================================
describe('round', () => {
  it('rounds to specified decimal places', () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(3.14159, 4)).toBe(3.1416);
  });

  it('defaults to 2 decimal places', () => {
    expect(round(3.14159)).toBe(3.14);
  });

  it('returns null for null/undefined input', () => {
    expect(round(null)).toBeNull();
    expect(round(undefined)).toBeNull();
  });
});

// =============================================================================
// quarterly — extracts quarterly time series
// =============================================================================
describe('quarterly', () => {
  it('extracts values from quarterly data sorted by date', () => {
    const section = {
      "2024-Q1": { totalRevenue: "100000000" },
      "2023-Q4": { totalRevenue: "95000000" },
      "2024-Q2": { totalRevenue: "105000000" },
    };
    const result = quarterly(section, "totalRevenue");
    expect(result).toEqual([
      { date: "2023-Q4", value: 95000000 },
      { date: "2024-Q1", value: 100000000 },
      { date: "2024-Q2", value: 105000000 },
    ]);
  });

  it('applies scale factor', () => {
    const section = { "2024-Q1": { shares: "15000000000" } };
    const result = quarterly(section, "shares", 1 / 1e6);
    expect(result[0].value).toBeCloseTo(15000, 0);
  });

  it('filters out null/NaN/zero values', () => {
    const section = {
      "2024-Q1": { eps: "1.50" },
      "2024-Q2": { eps: null },
      "2024-Q3": { eps: "0" },
      "2024-Q4": { eps: "abc" },
    };
    const result = quarterly(section, "eps");
    expect(result).toEqual([{ date: "2024-Q1", value: 1.5 }]);
  });

  it('returns empty array for null/undefined/non-object', () => {
    expect(quarterly(null, "x")).toEqual([]);
    expect(quarterly(undefined, "x")).toEqual([]);
    expect(quarterly("string", "x")).toEqual([]);
  });

  it('limits to 80 most recent entries', () => {
    const section = {};
    for (let i = 0; i < 100; i++) {
      section[`2000-Q${i}`] = { val: String(i + 1) };
    }
    const result = quarterly(section, "val");
    expect(result.length).toBe(80);
  });
});

// =============================================================================
// annual — same as quarterly but limited to 20
// =============================================================================
describe('annual', () => {
  it('extracts annual values sorted by date', () => {
    const section = {
      "2023": { totalRevenue: "500000" },
      "2022": { totalRevenue: "450000" },
    };
    const result = annual(section, "totalRevenue");
    expect(result).toEqual([
      { date: "2022", value: 450000 },
      { date: "2023", value: 500000 },
    ]);
  });

  it('limits to 20 most recent entries', () => {
    const section = {};
    for (let i = 0; i < 30; i++) {
      section[`${2000 + i}`] = { val: String(i + 1) };
    }
    const result = annual(section, "val");
    expect(result.length).toBe(20);
  });
});

// =============================================================================
// computeG5 — 5-year dividend growth CAGR
// =============================================================================
describe('computeG5', () => {
  it('computes CAGR for growing dividends', () => {
    // $1.00 → $1.61 over 5 years ≈ 10% CAGR
    const dps = [
      { date: "2019", value: 1.00 },
      { date: "2020", value: 1.10 },
      { date: "2021", value: 1.21 },
      { date: "2022", value: 1.331 },
      { date: "2023", value: 1.4641 },
      { date: "2024", value: 1.61051 },
    ];
    expect(computeG5(dps)).toBeCloseTo(10.0, 0);
  });

  it('returns null for insufficient data', () => {
    expect(computeG5(null)).toBeNull();
    expect(computeG5([])).toBeNull();
    expect(computeG5([{ date: "2024", value: 1.0 }])).toBeNull();
  });

  it('returns null when first or last value is zero or negative', () => {
    const dps = [
      { date: "2019", value: 0 },
      { date: "2024", value: 1.0 },
    ];
    expect(computeG5(dps)).toBeNull();
  });

  it('uses last 6 entries for 5-year growth', () => {
    // 8 entries — should use last 6
    const dps = [
      { date: "2017", value: 0.50 },
      { date: "2018", value: 0.60 },
      { date: "2019", value: 1.00 },
      { date: "2020", value: 1.10 },
      { date: "2021", value: 1.21 },
      { date: "2022", value: 1.331 },
      { date: "2023", value: 1.4641 },
      { date: "2024", value: 1.61051 },
    ];
    // Should compute CAGR from 2019 ($1.00) to 2024 ($1.61)
    expect(computeG5(dps)).toBeCloseTo(10.0, 0);
  });

  it('handles 2 entries (1-year growth)', () => {
    const dps = [
      { date: "2023", value: 1.00 },
      { date: "2024", value: 1.05 },
    ];
    expect(computeG5(dps)).toBeCloseTo(5.0, 0);
  });

  it('handles declining dividends (negative CAGR)', () => {
    const dps = [
      { date: "2019", value: 2.00 },
      { date: "2020", value: 1.90 },
      { date: "2021", value: 1.80 },
      { date: "2022", value: 1.70 },
      { date: "2023", value: 1.60 },
      { date: "2024", value: 1.50 },
    ];
    const g5 = computeG5(dps);
    expect(g5).toBeLessThan(0);
  });
});

// =============================================================================
// computeStreak — consecutive years of dividend increases
// =============================================================================
describe('computeStreak', () => {
  it('counts consecutive increases from the end', () => {
    const dps = [
      { date: "2020", value: 1.00 },
      { date: "2021", value: 1.05 },
      { date: "2022", value: 1.10 },
      { date: "2023", value: 1.15 },
      { date: "2024", value: 1.20 },
    ];
    expect(computeStreak(dps)).toBe(4);
  });

  it('stops counting at first non-increase', () => {
    const dps = [
      { date: "2020", value: 1.00 },
      { date: "2021", value: 1.05 },
      { date: "2022", value: 1.00 }, // decrease
      { date: "2023", value: 1.05 },
      { date: "2024", value: 1.10 },
    ];
    expect(computeStreak(dps)).toBe(2);
  });

  it('returns 0 for flat dividends', () => {
    const dps = [
      { date: "2023", value: 1.00 },
      { date: "2024", value: 1.00 },
    ];
    expect(computeStreak(dps)).toBe(0);
  });

  it('returns 0 for declining dividends', () => {
    const dps = [
      { date: "2023", value: 1.00 },
      { date: "2024", value: 0.90 },
    ];
    expect(computeStreak(dps)).toBe(0);
  });

  it('returns 0 for null/empty/single entry', () => {
    expect(computeStreak(null)).toBe(0);
    expect(computeStreak([])).toBe(0);
    expect(computeStreak([{ date: "2024", value: 1.0 }])).toBe(0);
  });
});

// =============================================================================
// buildAnnualHistory — assembles annual financial history
// =============================================================================
describe('buildAnnualHistory', () => {
  const incY = {
    "2022": { totalRevenue: "100000", netIncome: "20000", operatingIncome: "25000" },
    "2023": { totalRevenue: "120000", netIncome: "25000", operatingIncome: "30000" },
  };
  const balY = {
    "2022": { commonStockSharesOutstanding: "10000", cash: "5000", shortLongTermDebtTotal: "30000", totalStockholderEquity: "50000" },
    "2023": { commonStockSharesOutstanding: "10000", cash: "8000", shortLongTermDebtTotal: "25000", totalStockholderEquity: "60000" },
  };
  const cfY = {
    "2022": { totalCashFromOperatingActivities: "30000", capitalExpenditures: "-5000", dividendsPaid: "-5000" },
    "2023": { totalCashFromOperatingActivities: "35000", capitalExpenditures: "-6000", dividendsPaid: "-6000" },
  };

  it('extracts revenue', () => {
    const hist = buildAnnualHistory(incY, balY, cfY);
    expect(hist.revenue).toEqual([
      { date: "2022", value: 100000 },
      { date: "2023", value: 120000 },
    ]);
  });

  it('computes EPS = netIncome / sharesOutstanding', () => {
    const hist = buildAnnualHistory(incY, balY, cfY);
    expect(hist.eps).toEqual([
      { date: "2022", value: 2.0 },  // 20000 / 10000
      { date: "2023", value: 2.5 },  // 25000 / 10000
    ]);
  });

  it('computes FCF = OCF + capex', () => {
    const hist = buildAnnualHistory(incY, balY, cfY);
    expect(hist.fcf).toEqual([
      { date: "2022", value: 25000 },  // 30000 + (-5000)
      { date: "2023", value: 29000 },  // 35000 + (-6000)
    ]);
  });

  it('computes net debt = total debt - cash', () => {
    const hist = buildAnnualHistory(incY, balY, cfY);
    expect(hist.netDebt).toEqual([
      { date: "2022", value: 25000 },  // 30000 - 5000
      { date: "2023", value: 17000 },  // 25000 - 8000
    ]);
  });

  it('computes DPS = |dividendsPaid| / sharesOutstanding', () => {
    const hist = buildAnnualHistory(incY, balY, cfY);
    expect(hist.dps).toEqual([
      { date: "2022", value: 0.5 },   // 5000 / 10000
      { date: "2023", value: 0.6 },   // 6000 / 10000
    ]);
  });

  it('computes margins', () => {
    const hist = buildAnnualHistory(incY, balY, cfY);
    expect(hist.margins[0].opMargin).toBeCloseTo(25.0, 0);   // 25000 / 100000 * 100
    expect(hist.margins[0].netMargin).toBeCloseTo(20.0, 0);   // 20000 / 100000 * 100
  });

  it('computes ROE', () => {
    const hist = buildAnnualHistory(incY, balY, cfY);
    expect(hist.roe[0].value).toBeCloseTo(40.0, 0);  // 20000 / 50000 * 100
  });

  it('handles empty financials gracefully', () => {
    const hist = buildAnnualHistory({}, {}, {});
    expect(hist.revenue).toEqual([]);
    expect(hist.eps).toEqual([]);
    expect(hist.fcf).toEqual([]);
    expect(hist.dps).toEqual([]);
  });
});

// =============================================================================
// parseFundamentals — main parsing function
// =============================================================================
describe('parseFundamentals', () => {
  // ---------- null/empty input ----------
  it('returns empty object for null/undefined/non-object', () => {
    expect(parseFundamentals(null)).toEqual({});
    expect(parseFundamentals(undefined)).toEqual({});
    expect(parseFundamentals("string")).toEqual({});
    expect(parseFundamentals(42)).toEqual({});
  });

  // ---------- General section ----------
  describe('General fields', () => {
    it('extracts name and sector', () => {
      const result = parseFundamentals({
        General: { Name: "Apple Inc", Sector: "Technology" },
      });
      expect(result.name).toBe("Apple Inc");
      expect(result.sector).toBe("Technology");
    });

    it('returns null for missing name/sector', () => {
      const result = parseFundamentals({ General: {} });
      expect(result.name).toBeNull();
      expect(result.sector).toBeNull();
    });

    it('detects ETFs', () => {
      const result = parseFundamentals({
        General: { Type: "ETF" },
      });
      expect(result.isETF).toBe(true);
    });

    it('non-ETF type', () => {
      const result = parseFundamentals({
        General: { Type: "Common Stock" },
      });
      expect(result.isETF).toBe(false);
    });
  });

  // ---------- Dividend yield priority ----------
  describe('divYield priority', () => {
    it('prefers ETF_Data.Yield for ETFs (already in %)', () => {
      const result = parseFundamentals({
        General: { Type: "ETF" },
        ETF_Data: { Yield: "3.45" },
        SplitsDividends: { ForwardAnnualDividendYield: "0.034" },
      });
      expect(result.divYield).toBeCloseTo(3.45, 1);
    });

    it('falls back to ForwardAnnualDividendYield * 100', () => {
      const result = parseFundamentals({
        SplitsDividends: { ForwardAnnualDividendYield: "0.025" },
      });
      expect(result.divYield).toBeCloseTo(2.5, 1);
    });

    it('falls back to Highlights.DividendYield * 100', () => {
      const result = parseFundamentals({
        Highlights: { DividendYield: "0.032" },
      });
      expect(result.divYield).toBeCloseTo(3.2, 1);
    });

    it('ForwardAnnualDividendYield takes priority over DividendYield', () => {
      const result = parseFundamentals({
        SplitsDividends: { ForwardAnnualDividendYield: "0.025" },
        Highlights: { DividendYield: "0.032" },
      });
      expect(result.divYield).toBeCloseTo(2.5, 1);
    });

    it('returns null when no yield source', () => {
      const result = parseFundamentals({ General: {} });
      expect(result.divYield).toBeNull();
    });

    it('computes yield fallback from annualDiv and 52-week midpoint', () => {
      // No direct yield, but annualDiv=2.0, 52wk high=100, low=80 → mid=90 → yield=2.22%
      const result = parseFundamentals({
        SplitsDividends: { ForwardAnnualDividendRate: "2.0" },
        Highlights: { "52WeekHigh": "100", "52WeekLow": "80" },
      });
      expect(result.divYield).toBeCloseTo(2.222, 1);
    });
  });

  // ---------- Annual dividend ----------
  describe('annualDiv', () => {
    it('prefers ForwardAnnualDividendRate', () => {
      const result = parseFundamentals({
        SplitsDividends: { ForwardAnnualDividendRate: "4.50" },
        Highlights: { DividendShare: "4.00" },
      });
      expect(result.annualDiv).toBeCloseTo(4.5, 2);
    });

    it('falls back to DividendShare', () => {
      const result = parseFundamentals({
        Highlights: { DividendShare: "3.20" },
      });
      expect(result.annualDiv).toBeCloseTo(3.2, 2);
    });

    it('returns null when no source', () => {
      const result = parseFundamentals({});
      expect(result.annualDiv).toBeNull();
    });

    it('falls back to DPS history when ForwardAnnualDividendRate and DividendShare are missing', () => {
      // annualDiv from cash flow dividendsPaid / shares
      const result = parseFundamentals({
        Financials: {
          Income_Statement: { yearly: {} },
          Balance_Sheet: { yearly: {
            "2023": { commonStockSharesOutstanding: "1000000" },
          }},
          Cash_Flow: { yearly: {
            "2023": { dividendsPaid: "-2500000" }, // |2500000| / 1000000 = 2.5
          }},
        },
      });
      expect(result.annualDiv).toBeCloseTo(2.5, 1);
    });
  });

  // ---------- Payout ratio ----------
  describe('payout', () => {
    it('uses PayoutRatio * 100', () => {
      const result = parseFundamentals({
        Highlights: { PayoutRatio: "0.65" },
      });
      expect(result.payout).toBeCloseTo(65.0, 0);
    });

    it('computes from annualDiv / EPS when PayoutRatio missing', () => {
      const result = parseFundamentals({
        SplitsDividends: { ForwardAnnualDividendRate: "2.00" },
        Highlights: { EarningsShare: "5.00" },
      });
      expect(result.payout).toBeCloseTo(40.0, 0); // 2/5 * 100
    });

    it('returns null when both PayoutRatio and EPS missing', () => {
      const result = parseFundamentals({});
      expect(result.payout).toBeNull();
    });

    it('does not compute payout when EPS is zero', () => {
      const result = parseFundamentals({
        SplitsDividends: { ForwardAnnualDividendRate: "2.00" },
        Highlights: { EarningsShare: "0" },
      });
      // EPS=0 means sf returns null, so payout shouldn't be computed
      expect(result.payout).toBeNull();
    });
  });

  // ---------- Highlights fields ----------
  describe('Highlights fields', () => {
    it('extracts market cap in billions', () => {
      const result = parseFundamentals({
        Highlights: { MarketCapitalization: "2500000000000" }, // 2.5T
      });
      expect(result.marketCap).toBe(2500);
    });

    it('extracts 52-week range', () => {
      const result = parseFundamentals({
        Highlights: { "52WeekHigh": "200.50", "52WeekLow": "150.25" },
      });
      expect(result.week52High).toBe(200.50);
      expect(result.week52Low).toBe(150.25);
    });

    it('extracts EPS and applies correct scaling', () => {
      const result = parseFundamentals({
        Highlights: {
          EarningsShare: "6.50",
          QuarterlyEarningsGrowthYOY: "0.12",
          QuarterlyRevenueGrowthYOY: "0.08",
        },
      });
      expect(result.eps).toBe(6.50);
      expect(result.epsGrowth).toBeCloseTo(12.0, 0);
      expect(result.salesGrowth).toBeCloseTo(8.0, 0);
    });

    it('extracts profitability metrics (scaled by 100)', () => {
      const result = parseFundamentals({
        Highlights: {
          ReturnOnEquityTTM: "0.35",
          ReturnOnAssetsTTM: "0.15",
          OperatingMarginTTM: "0.28",
          ProfitMargin: "0.22",
        },
      });
      expect(result.roe).toBeCloseTo(35.0, 0);
      expect(result.roa).toBeCloseTo(15.0, 0);
      expect(result.opMargin).toBeCloseTo(28.0, 0);
      expect(result.profitMargin).toBeCloseTo(22.0, 0);
    });

    it('returns null for missing fields', () => {
      const result = parseFundamentals({});
      expect(result.eps).toBeNull();
      expect(result.roe).toBeNull();
      expect(result.marketCap).toBeNull();
    });
  });

  // ---------- SharesStats ----------
  describe('SharesStats', () => {
    it('extracts shares outstanding in millions', () => {
      const result = parseFundamentals({
        SharesStats: { SharesOutstanding: "15000000000" }, // 15B shares
      });
      expect(result.sharesOut).toBeCloseTo(15000, 0); // in millions
    });
  });

  // ---------- Technicals ----------
  describe('Technicals', () => {
    it('extracts beta', () => {
      const result = parseFundamentals({
        Technicals: { Beta: "1.25" },
      });
      expect(result.beta).toBe(1.25);
    });

    it('extracts full technicals object', () => {
      const result = parseFundamentals({
        Technicals: {
          Beta: "1.1",
          "52WeekHigh": "200",
          "52WeekLow": "150",
          "50DayMA": "180",
          "200DayMA": "170",
          SharesShort: "5000000",
          ShortRatio: "2.5",
          ShortPercent: "0.03",
        },
      });
      expect(result.technicals.beta).toBe(1.1);
      expect(result.technicals.week52High).toBe(200);
      expect(result.technicals.week52Low).toBe(150);
      expect(result.technicals.ma50).toBe(180);
      expect(result.technicals.ma200).toBe(170);
      expect(result.technicals.sharesShort).toBe(5000000);
      expect(result.technicals.shortRatio).toBe(2.5);
      expect(result.technicals.shortPercent).toBe(0.03);
    });
  });

  // ---------- Valuation ----------
  describe('Valuation', () => {
    it('extracts valuation metrics', () => {
      const result = parseFundamentals({
        Valuation: {
          TrailingPE: "25.5",
          ForwardPE: "22.0",
          PriceSalesTTM: "7.5",
          PriceBookMRQ: "45.0",
          EnterpriseValueRevenue: "8.0",
          EnterpriseValueEbitda: "20.0",
          EnterpriseValue: "3000000000000",
        },
        Highlights: { PEGRatio: "2.1" },
      });
      expect(result.valuation.trailingPE).toBe(25.5);
      expect(result.valuation.forwardPE).toBe(22.0);
      expect(result.valuation.pegRatio).toBe(2.1);
      expect(result.valuation.priceSales).toBe(7.5);
      expect(result.valuation.priceBook).toBe(45.0);
      expect(result.valuation.evToRevenue).toBe(8.0);
      expect(result.valuation.evToEbitda).toBe(20.0);
      expect(result.valuation.enterpriseValue).toBe(3000000000000);
    });
  });

  // ---------- Analyst Ratings ----------
  describe('AnalystRatings', () => {
    it('extracts analyst consensus', () => {
      const result = parseFundamentals({
        AnalystRatings: {
          Rating: "4.2",
          TargetPrice: "200",
          StrongBuy: "15",
          Buy: "10",
          Hold: "5",
          Sell: "2",
          StrongSell: "1",
        },
      });
      expect(result.analyst.rating).toBe(4.2);
      expect(result.analyst.targetPrice).toBe(200);
      expect(result.analyst.strongBuy).toBe(15);
      expect(result.analyst.buy).toBe(10);
      expect(result.analyst.hold).toBe(5);
      expect(result.analyst.sell).toBe(2);
      expect(result.analyst.strongSell).toBe(1);
    });

    it('returns null for missing ratings', () => {
      const result = parseFundamentals({});
      expect(result.analyst.rating).toBeNull();
      expect(result.analyst.strongBuy).toBeNull();
    });
  });

  // ---------- Earnings estimates ----------
  describe('Earnings estimates', () => {
    it('extracts forward estimates from Earnings.Trend', () => {
      const result = parseFundamentals({
        Earnings: {
          Trend: {
            "2025-03-31": { period: "0q", earningsEstimateAvg: "1.50" },
            "2025-06-30": { period: "+1q", earningsEstimateAvg: "1.60" },
            "2025-12-31": { period: "0y", earningsEstimateAvg: "6.00", revenueEstimateAvg: "400000000000", earningsEstimateGrowth: "0.08" },
            "2026-12-31": { period: "+1y", earningsEstimateAvg: "6.50", revenueEstimateAvg: "430000000000", earningsEstimateGrowth: "0.083" },
          },
        },
      });
      expect(result.estimates.epsCurrentQ).toBe(1.5);
      expect(result.estimates.epsNextQ).toBe(1.6);
      expect(result.estimates.epsCurrentY).toBe(6.0);
      expect(result.estimates.epsNextY).toBe(6.5);
      expect(result.estimates.revCurrentY).toBe(400000000000);
      expect(result.estimates.revNextY).toBe(430000000000);
      expect(result.estimates.epsGrowthCurrentY).toBeCloseTo(8.0, 0);
      expect(result.estimates.epsGrowthNextY).toBeCloseTo(8.3, 0);
    });

    it('returns all nulls when no Earnings data', () => {
      const result = parseFundamentals({});
      expect(result.estimates.epsCurrentQ).toBeNull();
      expect(result.estimates.epsNextQ).toBeNull();
    });
  });

  // ---------- Earnings surprises ----------
  describe('Earnings surprises', () => {
    it('extracts and computes surprise percentage', () => {
      const result = parseFundamentals({
        Earnings: {
          History: {
            "2024-Q4": { epsActual: "1.60", epsEstimate: "1.50" },
            "2024-Q3": { epsActual: "1.45", epsEstimate: "1.50" },
          },
        },
      });
      const surprises = result.history.earningsSurprises;
      expect(surprises).toHaveLength(2);
      // Q3: (1.45 - 1.50) / |1.50| * 100 = -3.33%
      expect(surprises[0].surprise).toBeCloseTo(-3.33, 1);
      // Q4: (1.60 - 1.50) / |1.50| * 100 = 6.67%
      expect(surprises[1].surprise).toBeCloseTo(6.67, 1);
    });

    it('filters entries with missing actual or estimate', () => {
      const result = parseFundamentals({
        Earnings: {
          History: {
            "2024-Q4": { epsActual: "1.60" }, // missing estimate
            "2024-Q3": { epsEstimate: "1.50" }, // missing actual
          },
        },
      });
      expect(result.history.earningsSurprises).toHaveLength(0);
    });
  });

  // ---------- FCF derived metrics ----------
  describe('FCF derived metrics', () => {
    it('computes FCF TTM from last 4 quarters', () => {
      const result = parseFundamentals({
        Highlights: { RevenueTTM: "400000000000" },
        SharesStats: { SharesOutstanding: "15000000000" },
        SplitsDividends: { ForwardAnnualDividendRate: "1.00" },
        Financials: {
          Cash_Flow: {
            quarterly: {
              "2024-Q1": { totalCashFromOperatingActivities: "30000000000", capitalExpenditures: "-3000000000" },
              "2024-Q2": { totalCashFromOperatingActivities: "28000000000", capitalExpenditures: "-2800000000" },
              "2024-Q3": { totalCashFromOperatingActivities: "32000000000", capitalExpenditures: "-3200000000" },
              "2024-Q4": { totalCashFromOperatingActivities: "35000000000", capitalExpenditures: "-3500000000" },
            },
          },
        },
      });
      // FCF = (30-3) + (28-2.8) + (32-3.2) + (35-3.5) = 27+25.2+28.8+31.5 = 112.5B
      expect(result.fcfTTM).toBeCloseTo(112500000000, -6);
      expect(result.fcfMargin).toBeCloseTo(28.125, 0);
      // fcfPerShare = 112.5B / 15B shares = 7.50 (shares scaled to millions internally)
      // sharesOut = 15000000000 * (1/1e6) = 15000 (millions)
      // fcfPerShare = 112.5B / (15000 * 1e6) = 7.50
      expect(result.fcfPerShare).toBeCloseTo(7.5, 1);
    });
  });

  // ---------- Net debt / coverage ----------
  describe('Net debt and coverage', () => {
    it('computes net debt from latest balance sheet quarter', () => {
      const result = parseFundamentals({
        Highlights: { EBITDA: "50000000000" },
        Financials: {
          Balance_Sheet: {
            quarterly: {
              "2024-Q3": { shortLongTermDebtTotal: "100000000000", cash: "30000000000" },
              "2024-Q4": { shortLongTermDebtTotal: "95000000000", cash: "35000000000" },
            },
          },
        },
      });
      // Latest: 95B - 35B = 60B
      expect(result.netDebt).toBe(60000000000);
      // Net debt / EBITDA = 60B / 50B = 1.2
      expect(result.netDebtToEbitda).toBeCloseTo(1.2, 1);
    });

    it('computes interest coverage', () => {
      const result = parseFundamentals({
        Financials: {
          Income_Statement: {
            quarterly: {
              "2024-Q4": { ebit: "10000000000", interestExpense: "-1000000000" },
            },
          },
        },
      });
      // EBIT / |interest| = 10B / 1B = 10.0
      expect(result.interestCoverage).toBeCloseTo(10.0, 0);
    });

    it('uses longTermDebt fallback when shortLongTermDebtTotal missing', () => {
      const result = parseFundamentals({
        Financials: {
          Balance_Sheet: {
            quarterly: {
              "2024-Q4": { longTermDebt: "50000000000", cash: "10000000000" },
            },
          },
        },
      });
      expect(result.netDebt).toBe(40000000000);
    });
  });

  // ---------- Insider transactions ----------
  describe('Insider transactions', () => {
    it('extracts and limits to 20 most recent', () => {
      const insiders = {};
      for (let i = 0; i < 25; i++) {
        insiders[String(i)] = {
          transactionDate: `2024-${String(i + 1).padStart(2, "0")}-15`,
          ownerName: `Person ${i}`,
          transactionCode: "P",
          transactionPrice: "150.00",
          transactionAcquiredDisposed: "A",
        };
      }
      const result = parseFundamentals({ InsiderTransactions: insiders });
      expect(result.insiders.length).toBeLessThanOrEqual(20);
      expect(result.insiders[0]).toHaveProperty("name");
      expect(result.insiders[0]).toHaveProperty("date");
      expect(result.insiders[0]).toHaveProperty("code");
    });

    it('filters entries without transactionDate', () => {
      const result = parseFundamentals({
        InsiderTransactions: {
          "0": { ownerName: "No Date Person" },
          "1": { transactionDate: "2024-01-15", ownerName: "Has Date" },
        },
      });
      expect(result.insiders).toHaveLength(1);
      expect(result.insiders[0].name).toBe("Has Date");
    });
  });

  // ---------- Holders ----------
  describe('Holders', () => {
    it('extracts institutional and fund holders', () => {
      const result = parseFundamentals({
        Holders: {
          Institutions: {
            "0": { name: "Vanguard", currentShares: 200000000, totalShares: "7.5", change_p: "0.5" },
            "1": { name: "BlackRock", currentShares: 180000000, totalShares: "6.8", change_p: "-0.3" },
          },
          Funds: {
            "0": { name: "Total Market Index", currentShares: 50000000, totalShares: "2.0" },
          },
        },
      });
      expect(result.holders.institutions).toHaveLength(2);
      expect(result.holders.institutions[0].name).toBe("Vanguard");
      expect(result.holders.funds).toHaveLength(1);
    });

    it('limits to 10 each and filters entries without name', () => {
      const institutions = {};
      for (let i = 0; i < 15; i++) {
        institutions[String(i)] = { name: `Inst ${i}`, currentShares: 1000 };
      }
      institutions["99"] = { currentShares: 500 }; // no name
      const result = parseFundamentals({ Holders: { Institutions: institutions } });
      expect(result.holders.institutions.length).toBeLessThanOrEqual(10);
      expect(result.holders.institutions.every(h => h.name)).toBe(true);
    });
  });

  // ---------- Dates ----------
  describe('Dividend dates', () => {
    it('extracts ex-div and pay dates', () => {
      const result = parseFundamentals({
        SplitsDividends: {
          ExDividendDate: "2024-11-08",
          DividendDate: "2024-11-14",
        },
      });
      expect(result.exDivDate).toBe("2024-11-08");
      expect(result.divPayDate).toBe("2024-11-14");
    });

    it('returns null when no dates', () => {
      const result = parseFundamentals({});
      expect(result.exDivDate).toBeNull();
      expect(result.divPayDate).toBeNull();
    });
  });

  // ---------- Quarterly history ----------
  describe('Quarterly history arrays', () => {
    it('extracts revenue, EPS, netIncome from Income_Statement', () => {
      const result = parseFundamentals({
        Financials: {
          Income_Statement: {
            quarterly: {
              "2024-Q1": { totalRevenue: "100000", dilutedEPS: "1.50", netIncome: "20000" },
              "2024-Q2": { totalRevenue: "110000", dilutedEPS: "1.60", netIncome: "22000" },
            },
          },
        },
      });
      expect(result.history.revenue).toHaveLength(2);
      expect(result.history.eps).toHaveLength(2);
      expect(result.history.netIncome).toHaveLength(2);
      expect(result.history.revenue[0].value).toBe(100000);
      expect(result.history.eps[1].value).toBe(1.6);
    });

    it('extracts shares from Balance_Sheet (scaled to millions)', () => {
      const result = parseFundamentals({
        Financials: {
          Balance_Sheet: {
            quarterly: {
              "2024-Q1": { commonStockSharesOutstanding: "15000000000" },
            },
          },
        },
      });
      expect(result.history.shares[0].value).toBeCloseTo(15000, 0);
    });
  });

  // ---------- g5 and streak from annual history ----------
  describe('g5 and streak', () => {
    it('computes g5 and streak from DPS history', () => {
      const result = parseFundamentals({
        Financials: {
          Income_Statement: { yearly: {} },
          Balance_Sheet: {
            yearly: {
              "2019": { commonStockSharesOutstanding: "1000000" },
              "2020": { commonStockSharesOutstanding: "1000000" },
              "2021": { commonStockSharesOutstanding: "1000000" },
              "2022": { commonStockSharesOutstanding: "1000000" },
              "2023": { commonStockSharesOutstanding: "1000000" },
              "2024": { commonStockSharesOutstanding: "1000000" },
            },
          },
          Cash_Flow: {
            yearly: {
              "2019": { dividendsPaid: "-1000000" },  // DPS = 1.0
              "2020": { dividendsPaid: "-1100000" },  // DPS = 1.1
              "2021": { dividendsPaid: "-1210000" },  // DPS = 1.21
              "2022": { dividendsPaid: "-1331000" },  // DPS = 1.331
              "2023": { dividendsPaid: "-1464100" },  // DPS = 1.4641
              "2024": { dividendsPaid: "-1610510" },  // DPS = 1.61051
            },
          },
        },
      });
      expect(result.g5).toBeCloseTo(10.0, 0);
      expect(result.streak).toBe(5);
    });

    it('returns null g5 and 0 streak when no DPS history', () => {
      const result = parseFundamentals({});
      expect(result.g5).toBeNull();
      // streak returns 0 (not null) when no DPS data, via computeStreak([])
      expect(result.streak).toBe(0);
    });
  });

  // ---------- Extra Highlights fields ----------
  describe('Extra fields', () => {
    it('extracts bookValue, grossProfit, revenuePerShare', () => {
      const result = parseFundamentals({
        Highlights: {
          BookValue: "25.50",
          GrossProfitTTM: "150000000000",
          RevenuePerShareTTM: "26.50",
        },
      });
      expect(result.bookValue).toBe(25.5);
      expect(result.grossProfit).toBe(150000000000);
      expect(result.revenuePerShare).toBe(26.5);
    });
  });

  // ---------- Full realistic stock ----------
  describe('Full realistic stock (AAPL-like)', () => {
    it('parses a realistic EODHD response', () => {
      const raw = {
        General: { Name: "Apple Inc", Sector: "Technology", Type: "Common Stock" },
        Highlights: {
          MarketCapitalization: "3000000000000",
          EarningsShare: "6.50",
          DividendYield: "0.005",
          PayoutRatio: "0.15",
          "52WeekHigh": "200",
          "52WeekLow": "150",
          RevenueTTM: "400000000000",
          EBITDA: "130000000000",
          ReturnOnEquityTTM: "1.50",
          OperatingMarginTTM: "0.30",
          ProfitMargin: "0.25",
          BookValue: "4.50",
        },
        SplitsDividends: {
          ForwardAnnualDividendRate: "1.00",
          ForwardAnnualDividendYield: "0.005",
          ExDividendDate: "2024-11-08",
        },
        SharesStats: { SharesOutstanding: "15000000000" },
        Technicals: { Beta: "1.25" },
        Valuation: { TrailingPE: "30" },
      };
      const result = parseFundamentals(raw);
      expect(result.name).toBe("Apple Inc");
      expect(result.isETF).toBe(false);
      expect(result.annualDiv).toBeCloseTo(1.0, 2);
      expect(result.divYield).toBeCloseTo(0.5, 1); // 0.005 * 100
      expect(result.payout).toBeCloseTo(15.0, 0);
      expect(result.marketCap).toBe(3000);
      expect(result.eps).toBe(6.5);
      expect(result.beta).toBe(1.25);
      expect(result.exDivDate).toBe("2024-11-08");
      expect(result.valuation.trailingPE).toBe(30);
    });
  });

  // ---------- Full realistic ETF ----------
  describe('Full realistic ETF (SCHD-like)', () => {
    it('parses an ETF response correctly', () => {
      const raw = {
        General: { Name: "Schwab US Dividend Equity ETF", Sector: "", Type: "ETF" },
        ETF_Data: { Yield: "3.45" },
        Highlights: {
          "52WeekHigh": "85",
          "52WeekLow": "70",
        },
        SplitsDividends: {
          ForwardAnnualDividendRate: "2.80",
          ExDividendDate: "2024-12-20",
        },
      };
      const result = parseFundamentals(raw);
      expect(result.isETF).toBe(true);
      // ETF yield comes from ETF_Data.Yield directly (already in %)
      expect(result.divYield).toBeCloseTo(3.45, 1);
      expect(result.annualDiv).toBeCloseTo(2.8, 2);
    });
  });
});
