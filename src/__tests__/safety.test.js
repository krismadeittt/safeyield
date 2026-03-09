import { describe, it, expect } from 'vitest';
import {
  calcSafetyScore, getGradeColor, assessStreak, calcPayoutRatio, interpolate,
} from '../utils/safety';

describe('interpolate', () => {
  var pts = [[0, 10], [5, 60], [10, 100]];

  it('clamps below range', () => {
    expect(interpolate(-1, pts)).toBe(10);
  });

  it('clamps above range', () => {
    expect(interpolate(15, pts)).toBe(100);
  });

  it('returns exact breakpoint value', () => {
    expect(interpolate(5, pts)).toBe(60);
  });

  it('linearly interpolates between breakpoints', () => {
    expect(interpolate(2.5, pts)).toBe(35);
    expect(interpolate(7.5, pts)).toBe(80);
  });
});

describe('calcSafetyScore', () => {
  it('returns C grade for null fundamentals', () => {
    var result = calcSafetyScore(null);
    expect(result.score).toBe(50);
    expect(result.grade).toBe('C');
    expect(result.factors).toEqual([]);
  });

  it('returns high A grade for excellent fundamentals (PG-like)', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0.50,
      earningsPayoutRatio: 0.45,
      debtToEquity: 0.4,
      interestCoverage: 18,
      dividendStreak: 60,
      fcfTrend: 0.06,
      revenueTrend: 0.05,
    });
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.grade).toBe('A');
    expect(result.factors.length).toBe(7);
  });

  it('returns F grade for terrible fundamentals', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 1.5,
      earningsPayoutRatio: 1.4,
      debtToEquity: 5.0,
      interestCoverage: 0.5,
      dividendStreak: 0,
      fcfTrend: -0.12,
      revenueTrend: -0.10,
    });
    expect(result.score).toBeLessThan(35);
    expect(result.grade).toBe('F');
  });

  it('returns A grade for CSCO-like fundamentals (short streak, great financials)', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0.45,
      earningsPayoutRatio: 0.50,
      debtToEquity: 0.3,
      interestCoverage: 15,
      dividendStreak: 13,
      fcfTrend: 0.05,
      revenueTrend: 0.03,
    });
    expect(result.score).toBeGreaterThanOrEqual(88);
    expect(result.grade).toBe('A');
  });

  it('returns A grade for WEC-like fundamentals (utility, moderate metrics)', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0.85,
      earningsPayoutRatio: 0.75,
      debtToEquity: 1.5,
      interestCoverage: 3.5,
      dividendStreak: 21,
      fcfTrend: 0.03,
      revenueTrend: 0.02,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.score).toBeLessThan(92);
    expect(result.grade).toBe('A');
  });

  it('handles all null factors with weight redistribution', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: null,
      earningsPayoutRatio: null,
      debtToEquity: null,
      interestCoverage: null,
      dividendStreak: null,
      fcfTrend: null,
      revenueTrend: null,
    });
    // Only streak is non-null (dividendStreak null → assessStreak returns 10)
    // Streak gets 100% of weight, score = 10
    expect(result.score).toBe(10);
    expect(result.grade).toBe('F');
    // All factors should be present, most excluded
    expect(result.factors.length).toBe(7);
    var excluded = result.factors.filter(function(f) { return f.excluded; });
    expect(excluded.length).toBe(6); // all except streak
  });

  it('redistributes weight when some factors are null', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0.40,
      earningsPayoutRatio: null,
      debtToEquity: null,
      interestCoverage: null,
      dividendStreak: 30,
      fcfTrend: null,
      revenueTrend: null,
    });
    // Only fcfPayout (score 100, weight 0.25) and streak (score ~97, weight 0.20) are valid
    // Normalized weights: 0.25/(0.25+0.20)=0.556, 0.20/(0.25+0.20)=0.444
    // Score: 100*0.556 + 97*0.444 ≈ 98.7
    expect(result.score).toBeGreaterThanOrEqual(95);
    expect(result.grade).toBe('A');
  });

  it('handles negative payout ratio (negative earnings)', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: -0.5,
      earningsPayoutRatio: -0.3,
      debtToEquity: 1.0,
      interestCoverage: 3,
      dividendStreak: 5,
      fcfTrend: 0.02,
      revenueTrend: 0.02,
    });
    // Negative payouts score low (15, 20)
    expect(result.score).toBeLessThan(70);
  });

  it('handles D/E > 8 (buyback companies) with neutral score', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0.50,
      earningsPayoutRatio: 0.50,
      debtToEquity: 12.0, // negative equity → high D/E from Math.abs
      interestCoverage: 10,
      dividendStreak: 60,
      fcfTrend: 0.05,
      revenueTrend: 0.04,
    });
    // D/E > 8 scores 60, not 5 — should not tank the overall score
    expect(result.score).toBeGreaterThanOrEqual(88);
    expect(result.grade).toBe('A');
  });

  it('factor weights sum to 1.0', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0.50,
      earningsPayoutRatio: 0.50,
      debtToEquity: 1.0,
      interestCoverage: 3,
      dividendStreak: 10,
      fcfTrend: 0.02,
      revenueTrend: 0.02,
    });
    var totalWeight = 0;
    for (var i = 0; i < result.factors.length; i++) {
      totalWeight += result.factors[i].weight;
    }
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  it('handles zero values', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0,
      earningsPayoutRatio: 0,
      debtToEquity: 0,
      interestCoverage: 0,
      dividendStreak: 0,
      fcfTrend: 0,
      revenueTrend: 0,
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.factors.length).toBe(7);
  });
});

describe('getGradeColor', () => {
  it('returns green for A grade', () => {
    expect(getGradeColor('A')).toBe('#22c55e');
  });

  it('returns teal for B grade', () => {
    expect(getGradeColor('B')).toBe('#3CBFA3');
  });

  it('returns yellow for C grade', () => {
    expect(getGradeColor('C')).toBe('#eab308');
  });

  it('returns orange for D grade', () => {
    expect(getGradeColor('D')).toBe('#f97316');
  });

  it('returns red for F grade', () => {
    expect(getGradeColor('F')).toBe('#ef4444');
  });

  it('returns gray for unknown grade', () => {
    expect(getGradeColor('X')).toBe('#9ca3af');
  });
});

describe('assessStreak', () => {
  it('returns 10 for 0 years', () => {
    expect(assessStreak(0)).toBe(10);
  });

  it('returns 10 for null', () => {
    expect(assessStreak(null)).toBe(10);
  });

  it('interpolates for 1-4 years', () => {
    var s3 = assessStreak(3);
    expect(s3).toBe(45);
    var s4 = assessStreak(4);
    expect(s4).toBeGreaterThan(45);
    expect(s4).toBeLessThan(60);
  });

  it('interpolates for 5-9 years', () => {
    expect(assessStreak(5)).toBe(60);
    var s7 = assessStreak(7);
    expect(s7).toBeGreaterThan(60);
    expect(s7).toBeLessThan(78);
  });

  it('interpolates for 10-24 years', () => {
    expect(assessStreak(10)).toBe(78);
    var s20 = assessStreak(20);
    expect(s20).toBeGreaterThan(88);
    expect(s20).toBeLessThan(96);
  });

  it('returns 96+ for 25+ years', () => {
    expect(assessStreak(25)).toBe(96);
    expect(assessStreak(40)).toBe(99);
    expect(assessStreak(50)).toBe(100);
    expect(assessStreak(68)).toBe(100);
  });
});

describe('calcPayoutRatio', () => {
  it('calculates ratio correctly', () => {
    expect(calcPayoutRatio(2, 4)).toBe(0.5);
  });

  it('returns null for zero earnings', () => {
    expect(calcPayoutRatio(2, 0)).toBe(null);
  });

  it('handles no earnings (null)', () => {
    expect(calcPayoutRatio(2, null)).toBe(null);
  });
});
