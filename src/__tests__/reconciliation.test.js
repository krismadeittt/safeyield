import { describe, it, expect } from 'vitest';

// Test the reconciliation variance calculation logic
// (same logic used in worker/db-extreme.js confirmReconciliation)

function calcVariance(expectedTotal, actualTotal) {
  if (!expectedTotal || expectedTotal <= 0 || actualTotal === null) return null;
  var pct = ((actualTotal - expectedTotal) / expectedTotal) * 100;
  return Math.round(pct * 100) / 100;
}

function getStatus(variancePct) {
  if (variancePct === null) return 'confirmed';
  return Math.abs(variancePct) > 2 ? 'variance' : 'confirmed';
}

describe('reconciliation variance', () => {
  it('returns null variance when expected is 0', () => {
    expect(calcVariance(0, 50)).toBe(null);
  });

  it('returns null variance when actual is null', () => {
    expect(calcVariance(100, null)).toBe(null);
  });

  it('calculates zero variance when amounts match', () => {
    expect(calcVariance(100, 100)).toBe(0);
  });

  it('calculates positive variance when actual > expected', () => {
    // Actual 110, Expected 100 → +10%
    expect(calcVariance(100, 110)).toBe(10);
  });

  it('calculates negative variance when actual < expected', () => {
    // Actual 90, Expected 100 → -10%
    expect(calcVariance(100, 90)).toBe(-10);
  });

  it('handles small differences', () => {
    // Actual 100.50, Expected 100 → +0.5%
    expect(calcVariance(100, 100.50)).toBe(0.5);
  });

  it('handles very small expected amounts', () => {
    // Actual 0.26, Expected 0.24 → ~8.33%
    var v = calcVariance(0.24, 0.26);
    expect(v).toBeCloseTo(8.33, 1);
  });
});

describe('reconciliation status', () => {
  it('returns confirmed when variance is null', () => {
    expect(getStatus(null)).toBe('confirmed');
  });

  it('returns confirmed when variance < 2%', () => {
    expect(getStatus(1.5)).toBe('confirmed');
    expect(getStatus(-1.5)).toBe('confirmed');
    expect(getStatus(0)).toBe('confirmed');
  });

  it('returns variance when variance > 2%', () => {
    expect(getStatus(5)).toBe('variance');
    expect(getStatus(-3)).toBe('variance');
    expect(getStatus(2.01)).toBe('variance');
  });

  it('returns confirmed at exactly 2%', () => {
    expect(getStatus(2)).toBe('confirmed');
    expect(getStatus(-2)).toBe('confirmed');
  });
});

describe('reconciliation summary', () => {
  function calcSummary(records) {
    return {
      total: records.length,
      pending: records.filter(r => r.status === 'pending').length,
      confirmed: records.filter(r => r.status === 'confirmed').length,
      variance: records.filter(r => r.status === 'variance').length,
      expectedTotal: records.reduce((s, r) => s + (r.expected_total || 0), 0),
      actualTotal: records.reduce((s, r) => s + (r.actual_total || 0), 0),
    };
  }

  it('handles empty records', () => {
    var summary = calcSummary([]);
    expect(summary.total).toBe(0);
    expect(summary.pending).toBe(0);
    expect(summary.expectedTotal).toBe(0);
  });

  it('counts statuses correctly', () => {
    var records = [
      { status: 'pending', expected_total: 50, actual_total: null },
      { status: 'confirmed', expected_total: 100, actual_total: 100 },
      { status: 'variance', expected_total: 75, actual_total: 60 },
      { status: 'pending', expected_total: 25, actual_total: null },
    ];
    var summary = calcSummary(records);
    expect(summary.total).toBe(4);
    expect(summary.pending).toBe(2);
    expect(summary.confirmed).toBe(1);
    expect(summary.variance).toBe(1);
    expect(summary.expectedTotal).toBe(250);
    expect(summary.actualTotal).toBe(160);
  });
});
