import { describe, it, expect } from 'vitest';
import {
  SUBSTITUTE_PAIRS,
  findTLHCandidates,
  estimateTaxSavings,
  calcWashSaleDate,
} from '../utils/tlh';

// ============================================================================
// Test data
// ============================================================================

var MOCK_HOLDINGS_WITH_LOSSES = [
  { ticker: 'SCHD', shares: 100, price: 80, cost_basis: 90 },     // Loss: (80-90)*100 = -1000
  { ticker: 'VYM', shares: 50, price: 110, cost_basis: 100 },      // Gain: (110-100)*50 = +500
  { ticker: 'O', shares: 200, price: 50, cost_basis: 60 },         // Loss: (50-60)*200 = -2000
  { ticker: 'VOO', shares: 30, price: 400, cost_basis: 450 },      // Loss: (400-450)*30 = -1500
];

var MOCK_LIVE = {
  SCHD: { price: 80 },
  VYM: { price: 110 },
  O: { price: 50 },
  VOO: { price: 400 },
};

var ALL_PROFITABLE_HOLDINGS = [
  { ticker: 'SCHD', shares: 100, price: 80, cost_basis: 70 },     // Gain
  { ticker: 'VYM', shares: 50, price: 110, cost_basis: 100 },      // Gain
  { ticker: 'O', shares: 200, price: 55, cost_basis: 40 },         // Gain
];

var ALL_PROFITABLE_LIVE = {
  SCHD: { price: 80 },
  VYM: { price: 110 },
  O: { price: 55 },
};

// ============================================================================
// Tests
// ============================================================================

describe('findTLHCandidates identifies losses', function() {
  it('finds candidates with unrealized losses', function() {
    var candidates = findTLHCandidates(MOCK_HOLDINGS_WITH_LOSSES, MOCK_LIVE);
    expect(candidates.length).toBe(3); // SCHD, O, VOO have losses; VYM has gain

    var tickers = candidates.map(function(c) { return c.ticker; });
    expect(tickers).toContain('SCHD');
    expect(tickers).toContain('O');
    expect(tickers).toContain('VOO');
    expect(tickers).not.toContain('VYM');
  });

  it('sorts by unrealized loss ascending (biggest losses first)', function() {
    var candidates = findTLHCandidates(MOCK_HOLDINGS_WITH_LOSSES, MOCK_LIVE);
    // O: -2000, VOO: -1500, SCHD: -1000
    expect(candidates[0].ticker).toBe('O');
    expect(candidates[0].unrealizedLoss).toBe(-2000);
    expect(candidates[1].ticker).toBe('VOO');
    expect(candidates[1].unrealizedLoss).toBe(-1500);
    expect(candidates[2].ticker).toBe('SCHD');
    expect(candidates[2].unrealizedLoss).toBe(-1000);
  });

  it('calculates loss percentage correctly', function() {
    var candidates = findTLHCandidates(MOCK_HOLDINGS_WITH_LOSSES, MOCK_LIVE);
    var schd = candidates.find(function(c) { return c.ticker === 'SCHD'; });
    // SCHD: loss = -1000, costBasis = 9000, lossPct = -1000/9000 = -11.11%
    expect(schd.lossPct).toBeCloseTo(-11.11, 1);
  });

  it('includes substitute ticker when available', function() {
    var candidates = findTLHCandidates(MOCK_HOLDINGS_WITH_LOSSES, MOCK_LIVE);
    var schd = candidates.find(function(c) { return c.ticker === 'SCHD'; });
    expect(schd.substitute).toBe('VYM');

    var voo = candidates.find(function(c) { return c.ticker === 'VOO'; });
    expect(voo.substitute).toBe('IVV');
  });

  it('returns null substitute for tickers without a pair', function() {
    var candidates = findTLHCandidates(MOCK_HOLDINGS_WITH_LOSSES, MOCK_LIVE);
    var o = candidates.find(function(c) { return c.ticker === 'O'; });
    expect(o.substitute).toBeNull();
  });
});

describe('findTLHCandidates returns empty when all profitable', function() {
  it('returns empty array when no losses exist', function() {
    var candidates = findTLHCandidates(ALL_PROFITABLE_HOLDINGS, ALL_PROFITABLE_LIVE);
    expect(candidates.length).toBe(0);
  });
});

describe('estimateTaxSavings', function() {
  it('calculates savings correctly', function() {
    // $2000 loss at 24% tax rate = $480 savings
    var savings = estimateTaxSavings(-2000, 24);
    expect(savings).toBe(480);
  });

  it('returns 0 for zero loss', function() {
    expect(estimateTaxSavings(0, 24)).toBe(0);
  });

  it('returns 0 for zero tax rate', function() {
    expect(estimateTaxSavings(-1000, 0)).toBe(0);
  });

  it('handles combined federal + state rate', function() {
    // $1000 loss at 22% federal + 5% state = 27%
    var savings = estimateTaxSavings(-1000, 27);
    expect(savings).toBe(270);
  });
});

describe('SUBSTITUTE_PAIRS bidirectional mappings', function() {
  it('all pairs are bidirectional', function() {
    var keys = Object.keys(SUBSTITUTE_PAIRS);
    for (var i = 0; i < keys.length; i++) {
      var ticker = keys[i];
      var substitute = SUBSTITUTE_PAIRS[ticker];
      expect(SUBSTITUTE_PAIRS[substitute]).toBe(ticker);
    }
  });

  it('contains expected major pairs', function() {
    expect(SUBSTITUTE_PAIRS.SCHD).toBe('VYM');
    expect(SUBSTITUTE_PAIRS.VTI).toBe('ITOT');
    expect(SUBSTITUTE_PAIRS.VOO).toBe('IVV');
    expect(SUBSTITUTE_PAIRS.AGG).toBe('BND');
    expect(SUBSTITUTE_PAIRS.VNQ).toBe('SCHH');
    expect(SUBSTITUTE_PAIRS.VXUS).toBe('IXUS');
  });
});

describe('calcWashSaleDate', function() {
  it('returns date 31 days after sell', function() {
    var sellDate = new Date(2024, 5, 1); // June 1, 2024
    var washEnd = calcWashSaleDate(sellDate);
    expect(washEnd.getDate()).toBe(2);
    expect(washEnd.getMonth()).toBe(6); // July
    expect(washEnd.getFullYear()).toBe(2024);
  });

  it('handles month rollover', function() {
    var sellDate = new Date(2024, 11, 15); // Dec 15, 2024
    var washEnd = calcWashSaleDate(sellDate);
    expect(washEnd.getMonth()).toBe(0); // January
    expect(washEnd.getFullYear()).toBe(2025);
  });

  it('handles string date input', function() {
    var washEnd = calcWashSaleDate('2024-03-01');
    expect(washEnd instanceof Date).toBe(true);
    expect(washEnd.getTime()).toBeGreaterThan(new Date('2024-03-01').getTime());
  });

  it('returns exactly 31 days difference', function() {
    var sellDate = new Date(2024, 0, 1);
    var washEnd = calcWashSaleDate(sellDate);
    var diff = (washEnd.getTime() - sellDate.getTime()) / (1000 * 60 * 60 * 24);
    expect(diff).toBe(31);
  });
});

describe('TLH edge cases', function() {
  it('skips holdings with zero cost basis', function() {
    var holdings = [
      { ticker: 'TEST', shares: 100, price: 50, cost_basis: 0 },
    ];
    var live = { TEST: { price: 40 } };
    var candidates = findTLHCandidates(holdings, live);
    expect(candidates.length).toBe(0);
  });

  it('skips holdings with no price data', function() {
    var holdings = [
      { ticker: 'TEST', shares: 100, price: 0, cost_basis: 50 },
    ];
    var live = { TEST: {} };
    var candidates = findTLHCandidates(holdings, live);
    expect(candidates.length).toBe(0);
  });

  it('skips holdings with zero shares', function() {
    var holdings = [
      { ticker: 'TEST', shares: 0, price: 50, cost_basis: 60 },
    ];
    var live = { TEST: { price: 50 } };
    var candidates = findTLHCandidates(holdings, live);
    expect(candidates.length).toBe(0);
  });

  it('handles empty holdings array', function() {
    var candidates = findTLHCandidates([], MOCK_LIVE);
    expect(candidates.length).toBe(0);
  });

  it('handles missing liveData for ticker', function() {
    var holdings = [
      { ticker: 'UNKNOWN', shares: 100, price: 50, cost_basis: 60 },
    ];
    var candidates = findTLHCandidates(holdings, {});
    // Falls back to h.price (50), costBasis 60, so loss exists
    expect(candidates.length).toBe(1);
    expect(candidates[0].unrealizedLoss).toBe(-1000);
  });
});
