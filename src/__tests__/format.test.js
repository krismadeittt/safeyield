import { describe, it, expect } from 'vitest';
import {
  formatCurrency, formatPct, shortMoney,
  formatPrice, formatYield, formatGrowth, formatDivPerShare,
} from '../utils/format';

// =============================================================================
// formatCurrency — formats dollar amounts with commas, no decimals
// =============================================================================
describe('formatCurrency', () => {
  it('formats normal positive values with comma separators', () => {
    // $1,000 is standard US locale formatting for 1000
    expect(formatCurrency(1000)).toBe('$1,000');
    expect(formatCurrency(1234567)).toBe('$1,234,567');
  });

  it('formats zero as $0', () => {
    // Zero balance is a valid portfolio state
    expect(formatCurrency(0)).toBe('$0');
  });

  it('formats negative values with minus sign', () => {
    // JS toLocaleString places minus before $: "$-500" is default US locale behavior
    expect(formatCurrency(-500)).toBe('$-500');
  });

  it('rounds to nearest dollar (no decimals)', () => {
    // Floating-point values should round to whole dollars
    expect(formatCurrency(99.49)).toBe('$99');
    expect(formatCurrency(99.50)).toBe('$100');
  });

  it('handles very large values without overflow', () => {
    // Billionaire portfolios should still format correctly
    expect(formatCurrency(1e12)).toBe('$1,000,000,000,000');
  });

  it('handles very small fractional values', () => {
    // Sub-penny values round to $0
    expect(formatCurrency(0.001)).toBe('$0');
  });

  it('returns dash for NaN', () => {
    // NaN from bad calculations should never show as "$NaN"
    expect(formatCurrency(NaN)).toBe('—');
  });

  it('returns dash for Infinity', () => {
    // Division by zero result should never show as "$Infinity"
    expect(formatCurrency(Infinity)).toBe('—');
    expect(formatCurrency(-Infinity)).toBe('—');
  });

  it('returns dash for undefined/null', () => {
    // Missing data should show as dash, not "$NaN"
    expect(formatCurrency(undefined)).toBe('—');
  });

  it('handles string number inputs via Number() coercion', () => {
    // API responses sometimes return strings
    expect(formatCurrency('5000')).toBe('$5,000');
  });
});

// =============================================================================
// formatPct — formats percentage with configurable decimals
// =============================================================================
describe('formatPct', () => {
  it('formats normal percentage with 1 decimal by default', () => {
    // Standard yield display: "3.5%"
    expect(formatPct(3.5)).toBe('3.5%');
    expect(formatPct(0)).toBe('0.0%');
  });

  it('formats with custom decimal places', () => {
    expect(formatPct(3.456, 2)).toBe('3.46%');
    expect(formatPct(3.456, 0)).toBe('3%');
  });

  it('formats negative percentages', () => {
    // Negative returns are common
    expect(formatPct(-5.2)).toBe('-5.2%');
  });

  it('returns dash for null/undefined', () => {
    // Missing yield data should show dash
    expect(formatPct(null)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
  });

  it('returns dash for NaN', () => {
    // Result of 0/0 calculation should not show "NaN%"
    expect(formatPct(NaN)).toBe('—');
  });

  it('returns dash for Infinity', () => {
    // Division by zero result should not show "Infinity%"
    expect(formatPct(Infinity)).toBe('—');
    expect(formatPct(-Infinity)).toBe('—');
  });

  it('handles very large percentages', () => {
    expect(formatPct(99999.9)).toBe('99999.9%');
  });
});

// =============================================================================
// shortMoney — compact dollar format ($50k, $1.25M)
// =============================================================================
describe('shortMoney', () => {
  it('formats millions with 2 decimals', () => {
    // Portfolio values in millions: "$1.25M"
    expect(shortMoney(1250000)).toBe('$1.25M');
    expect(shortMoney(1000000)).toBe('$1.00M');
  });

  it('formats thousands as integer k', () => {
    // Mid-range values: "$50k"
    expect(shortMoney(50000)).toBe('$50k');
    expect(shortMoney(1500)).toBe('$2k'); // Rounds 1.5k to $2k
  });

  it('formats small values as rounded dollars', () => {
    expect(shortMoney(500)).toBe('$500');
    expect(shortMoney(0)).toBe('$0');
  });

  it('handles negative values with proper sign placement', () => {
    // Losses should show as "-$50k", not "$-50k"
    expect(shortMoney(-50000)).toBe('-$50k');
    expect(shortMoney(-1250000)).toBe('-$1.25M');
    expect(shortMoney(-500)).toBe('-$500');
  });

  it('returns dash for NaN', () => {
    expect(shortMoney(NaN)).toBe('—');
  });

  it('returns dash for Infinity', () => {
    expect(shortMoney(Infinity)).toBe('—');
    expect(shortMoney(-Infinity)).toBe('—');
  });

  it('handles boundary between k and M', () => {
    // $999,999 → "$1000k", $1,000,000 → "$1.00M"
    expect(shortMoney(999999)).toBe('$1000k');
    expect(shortMoney(1000000)).toBe('$1.00M');
  });

  it('handles very large values', () => {
    // Trillion-scale should still use M notation
    expect(shortMoney(1e12)).toBe('$1000000.00M');
  });
});

// =============================================================================
// formatPrice — always 2 decimal places ($XX.XX)
// =============================================================================
describe('formatPrice', () => {
  it('formats normal stock prices', () => {
    expect(formatPrice(150.25)).toBe('$150.25');
    expect(formatPrice(0.50)).toBe('$0.50');
  });

  it('formats zero price', () => {
    // Delisted or pre-market stocks
    expect(formatPrice(0)).toBe('$0.00');
  });

  it('formats negative price as-is', () => {
    expect(formatPrice(-1.50)).toBe('$-1.50');
  });

  it('returns dash for NaN/Infinity', () => {
    expect(formatPrice(NaN)).toBe('—');
    expect(formatPrice(Infinity)).toBe('—');
  });

  it('returns dash for non-numeric string', () => {
    expect(formatPrice('abc')).toBe('—');
  });

  it('rounds to 2 decimals', () => {
    // Floating-point precision: 0.1 + 0.2 ≈ 0.30000000000000004
    expect(formatPrice(0.1 + 0.2)).toBe('$0.30');
  });

  it('handles very large prices', () => {
    // BRK.A-style prices
    expect(formatPrice(750000.99)).toBe('$750000.99');
  });
});

// =============================================================================
// formatYield — always 2 decimal places (X.XX%)
// =============================================================================
describe('formatYield', () => {
  it('formats normal dividend yields', () => {
    expect(formatYield(3.75)).toBe('3.75%');
    expect(formatYield(0)).toBe('0.00%');
  });

  it('returns dash for NaN', () => {
    // Yield = div / price, if price = 0 → NaN should show dash
    expect(formatYield(NaN)).toBe('—');
  });

  it('returns dash for Infinity', () => {
    expect(formatYield(Infinity)).toBe('—');
  });

  it('handles very high yields', () => {
    // Some REITs/BDCs have 12%+ yields
    expect(formatYield(15.50)).toBe('15.50%');
  });
});

// =============================================================================
// formatGrowth — always 1 decimal place (X.X%)
// =============================================================================
describe('formatGrowth', () => {
  it('formats normal dividend growth rates', () => {
    expect(formatGrowth(7.5)).toBe('7.5%');
    expect(formatGrowth(0)).toBe('0.0%');
  });

  it('formats negative growth (dividend cuts)', () => {
    expect(formatGrowth(-3.2)).toBe('-3.2%');
  });

  it('returns dash for NaN/Infinity', () => {
    expect(formatGrowth(NaN)).toBe('—');
    expect(formatGrowth(Infinity)).toBe('—');
  });
});

// =============================================================================
// formatDivPerShare — always 2 decimal places ($X.XX)
// =============================================================================
describe('formatDivPerShare', () => {
  it('formats normal dividends per share', () => {
    expect(formatDivPerShare(3.80)).toBe('$3.80');
    expect(formatDivPerShare(0.24)).toBe('$0.24');
  });

  it('formats zero dividend', () => {
    expect(formatDivPerShare(0)).toBe('$0.00');
  });

  it('returns dash for NaN/Infinity', () => {
    expect(formatDivPerShare(NaN)).toBe('—');
    expect(formatDivPerShare(Infinity)).toBe('—');
  });

  it('handles sub-penny dividends with rounding', () => {
    // Some micro-dividends are very small
    expect(formatDivPerShare(0.005)).toBe('$0.01'); // rounds up
    expect(formatDivPerShare(0.004)).toBe('$0.00'); // rounds down
  });
});
