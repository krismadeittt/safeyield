import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processCatchUp } from '../utils/catchUp';

// =============================================================================
// processCatchUp — applies historical dividends + splits since last update
// =============================================================================
describe('processCatchUp', () => {
  // Fix "today" so tests are deterministic
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-03-01'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // --- DRIP reinvestment ---

  it('reinvests dividends as new shares when DRIP is enabled', () => {
    // $0.50/share dividend on 100 shares = $50 total
    // At $25/share price → 2 new shares via DRIP
    const state = {
      holdings: [{ ticker: 'KO', shares: 100 }],
      cashBalance: 0,
      dripEnabled: true,
      lastProcessedAt: '2025-01-01',
    };
    const historyMap = {
      KO: {
        p: [
          { d: '2025-01-15', c: 25, ac: 25 },
          { d: '2025-02-15', c: 25, ac: 25 },
        ],
        d: [{ d: '2025-02-01', v: 0.50 }],
      },
    };
    const result = processCatchUp(state, historyMap);
    // New shares: ($0.50 × 100) / $25 = 2.0 shares
    expect(result.holdings[0].shares).toBe(102);
    // Cash should stay at 0 (all reinvested)
    expect(result.cashBalance).toBe(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('drip');
  });

  it('adds dividends to cash when DRIP is disabled', () => {
    // Same dividend scenario but DRIP off → cash increases
    const state = {
      holdings: [{ ticker: 'KO', shares: 100 }],
      cashBalance: 10,
      dripEnabled: false,
      lastProcessedAt: '2025-01-01',
    };
    const historyMap = {
      KO: {
        p: [{ d: '2025-01-15', c: 25, ac: 25 }],
        d: [{ d: '2025-02-01', v: 0.50 }],
      },
    };
    const result = processCatchUp(state, historyMap);
    // Shares unchanged
    expect(result.holdings[0].shares).toBe(100);
    // Cash: $10 + ($0.50 × 100) = $60
    expect(result.cashBalance).toBe(60);
    expect(result.events[0].type).toBe('dividend_cash');
  });

  it('falls back to cash when no price available for DRIP', () => {
    // DRIP enabled but no price data → can't buy shares → add to cash
    const state = {
      holdings: [{ ticker: 'KO', shares: 100 }],
      cashBalance: 0,
      dripEnabled: true,
      lastProcessedAt: '2025-01-01',
    };
    const historyMap = {
      KO: {
        p: [], // No price data
        d: [{ d: '2025-02-01', v: 0.50 }],
      },
    };
    const result = processCatchUp(state, historyMap);
    expect(result.holdings[0].shares).toBe(100); // Unchanged
    expect(result.cashBalance).toBe(50); // $0.50 × 100 = $50 to cash
    expect(result.events[0].type).toBe('dividend_cash');
    expect(result.events[0].reason).toBe('no_price');
  });

  // --- Division by zero safety ---

  it('does not divide by zero when price is 0', () => {
    // Price = 0: should fall back to cash, not crash
    const state = {
      holdings: [{ ticker: 'KO', shares: 100 }],
      cashBalance: 0,
      dripEnabled: true,
      lastProcessedAt: '2025-01-01',
    };
    const historyMap = {
      KO: {
        p: [{ d: '2025-02-01', c: 0, ac: 0 }],
        d: [{ d: '2025-02-01', v: 0.50 }],
      },
    };
    const result = processCatchUp(state, historyMap);
    // Should not produce NaN shares
    expect(isFinite(result.holdings[0].shares)).toBe(true);
    // Dividend should go to cash since price = 0
    expect(result.cashBalance).toBe(50);
  });

  // --- Stock splits ---

  it('applies forward stock split (3:1)', () => {
    // SCHD-style 3:1 split: price drops from $84 to $28, shares × 3
    const state = {
      holdings: [{ ticker: 'SCHD', shares: 100 }],
      cashBalance: 0,
      dripEnabled: false,
      lastProcessedAt: '2025-01-01',
    };
    const historyMap = {
      SCHD: {
        p: [
          { d: '2025-01-15', c: 84, ac: 84 },
          // 3:1 split: raw close drops to 28, adjusted close stays ~84
          { d: '2025-02-01', c: 28, ac: 84 },
        ],
        d: [],
      },
    };
    const result = processCatchUp(state, historyMap);
    // 100 shares × 3 = 300 shares
    expect(result.holdings[0].shares).toBe(300);
    expect(result.events[0].type).toBe('split');
    expect(result.events[0].ratio).toBe(3);
  });

  it('applies reverse stock split (1:5)', () => {
    // Reverse split: price jumps 5x, shares ÷ 5
    const state = {
      holdings: [{ ticker: 'X', shares: 500 }],
      cashBalance: 0,
      dripEnabled: false,
      lastProcessedAt: '2025-01-01',
    };
    const historyMap = {
      X: {
        p: [
          { d: '2025-01-15', c: 2, ac: 2 },
          // 1:5 reverse split: price jumps to 10, ac stays ~2
          { d: '2025-02-01', c: 10, ac: 2 },
        ],
        d: [],
      },
    };
    const result = processCatchUp(state, historyMap);
    // 500 shares × (1/5) = 100 shares
    expect(result.holdings[0].shares).toBe(100);
  });

  // --- Edge cases ---

  it('handles empty holdings array', () => {
    const state = {
      holdings: [],
      cashBalance: 100,
      dripEnabled: true,
      lastProcessedAt: '2025-01-01',
    };
    const result = processCatchUp(state, {});
    expect(result.holdings).toEqual([]);
    expect(result.cashBalance).toBe(100);
    expect(result.events).toEqual([]);
  });

  it('handles missing history for a ticker', () => {
    // If history fetch failed for a ticker, it won't be in historyMap
    const state = {
      holdings: [{ ticker: 'KO', shares: 100 }],
      cashBalance: 0,
      dripEnabled: true,
      lastProcessedAt: '2025-01-01',
    };
    const result = processCatchUp(state, {}); // No history at all
    expect(result.holdings[0].shares).toBe(100); // Unchanged
    expect(result.cashBalance).toBe(0);
    expect(result.events).toEqual([]);
  });

  it('ignores dividends before cutoff date', () => {
    // Dividends before lastProcessedAt should not be double-counted
    const state = {
      holdings: [{ ticker: 'KO', shares: 100 }],
      cashBalance: 0,
      dripEnabled: false,
      lastProcessedAt: '2025-02-01',
    };
    const historyMap = {
      KO: {
        p: [{ d: '2025-01-15', c: 50, ac: 50 }],
        d: [
          { d: '2025-01-15', v: 0.50 }, // Before cutoff — should be ignored
          { d: '2025-02-15', v: 0.60 }, // After cutoff — should be processed
        ],
      },
    };
    const result = processCatchUp(state, historyMap);
    expect(result.cashBalance).toBe(60); // Only the Feb dividend: $0.60 × 100
  });

  it('handles zero shares — skips processing', () => {
    const state = {
      holdings: [{ ticker: 'KO', shares: 0 }],
      cashBalance: 0,
      dripEnabled: true,
      lastProcessedAt: '2025-01-01',
    };
    const historyMap = {
      KO: {
        p: [{ d: '2025-02-01', c: 50, ac: 50 }],
        d: [{ d: '2025-02-01', v: 0.50 }],
      },
    };
    const result = processCatchUp(state, historyMap);
    expect(result.holdings[0].shares).toBe(0);
    expect(result.cashBalance).toBe(0);
  });

  it('rounds cash balance to nearest cent', () => {
    // Floating-point: 3 × $0.33333 = $0.99999... should round to $1.00
    const state = {
      holdings: [{ ticker: 'KO', shares: 3 }],
      cashBalance: 0,
      dripEnabled: false,
      lastProcessedAt: '2025-01-01',
    };
    const historyMap = {
      KO: {
        p: [],
        d: [{ d: '2025-02-01', v: 0.33333 }],
      },
    };
    const result = processCatchUp(state, historyMap);
    // $0.33333 × 3 = $0.99999 → rounds to $1.00
    expect(result.cashBalance).toBe(1.00);
  });

  it('processes events in chronological order', () => {
    // Split on Feb 1, then dividend on Feb 15: dividend should use post-split shares
    const state = {
      holdings: [{ ticker: 'X', shares: 100 }],
      cashBalance: 0,
      dripEnabled: false,
      lastProcessedAt: '2025-01-01',
    };
    const historyMap = {
      X: {
        p: [
          { d: '2025-01-15', c: 90, ac: 90 },
          { d: '2025-02-01', c: 30, ac: 90 }, // 3:1 split
          { d: '2025-02-15', c: 30, ac: 90 },
        ],
        d: [{ d: '2025-02-15', v: 0.10 }], // Dividend AFTER split
      },
    };
    const result = processCatchUp(state, historyMap);
    // After 3:1 split: 100 × 3 = 300 shares
    // Dividend: $0.10 × 300 = $30.00
    expect(result.holdings[0].shares).toBe(300);
    expect(result.cashBalance).toBe(30);
  });

  it('sets lastProcessedAt to today', () => {
    const state = {
      holdings: [],
      cashBalance: 0,
      dripEnabled: true,
      lastProcessedAt: '2025-01-01',
    };
    const result = processCatchUp(state, {});
    expect(result.lastProcessedAt).toBe('2025-03-01');
  });
});
