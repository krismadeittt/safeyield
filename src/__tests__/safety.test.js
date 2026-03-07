import { describe, it, expect } from 'vitest';
import {
  calcSafetyScore, getGradeColor, assessStreak, calcPayoutRatio,
} from '../utils/safety';

describe('calcSafetyScore', () => {
  it('returns C grade for null fundamentals', () => {
    var result = calcSafetyScore(null);
    expect(result.score).toBe(50);
    expect(result.grade).toBe('C');
    expect(result.factors).toEqual([]);
  });

  it('returns A grade for excellent fundamentals', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0.25,
      earningsPayoutRatio: 0.30,
      debtToEquity: 0.2,
      interestCoverage: 10,
      dividendStreak: 30,
      fcfTrend: 0.08,
      revenueTrend: 0.06,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.grade).toBe('A');
    expect(result.factors.length).toBe(7);
  });

  it('returns F grade for terrible fundamentals', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 1.5,
      earningsPayoutRatio: 1.2,
      debtToEquity: 4.0,
      interestCoverage: 0.5,
      dividendStreak: 0,
      fcfTrend: -0.10,
      revenueTrend: -0.08,
    });
    expect(result.score).toBeLessThan(35);
    expect(result.grade).toBe('F');
  });

  it('returns B grade for good fundamentals', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0.55,
      earningsPayoutRatio: 0.60,
      debtToEquity: 0.8,
      interestCoverage: 4,
      dividendStreak: 8,
      fcfTrend: 0.03,
      revenueTrend: 0.02,
    });
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.score).toBeLessThan(80);
    expect(result.grade).toBe('B');
  });

  it('returns D grade for poor fundamentals', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: 0.85,
      earningsPayoutRatio: 0.75,
      debtToEquity: 1.8,
      interestCoverage: 2.5,
      dividendStreak: 3,
      fcfTrend: -0.01,
      revenueTrend: 0.01,
    });
    expect(result.score).toBeGreaterThanOrEqual(35);
    expect(result.score).toBeLessThan(50);
    expect(result.grade).toBe('D');
  });

  it('handles missing individual factors gracefully', () => {
    var result = calcSafetyScore({
      fcfPayoutRatio: null,
      earningsPayoutRatio: undefined,
      debtToEquity: null,
      interestCoverage: null,
      dividendStreak: null,
      fcfTrend: null,
      revenueTrend: null,
    });
    // Most null values default to 50, but dividendStreak null → assessStreak(null) = 10
    // Weighted: 50*(0.25+0.15+0.15+0.10+0.10+0.10) + 10*0.15 = 42.5 + 1.5 = 44
    expect(result.score).toBe(44);
    expect(result.grade).toBe('D');
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
    // Negative payout scores low (20)
    expect(result.score).toBeLessThan(65);
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

  it('returns 40 for 1-4 years', () => {
    expect(assessStreak(1)).toBe(40);
    expect(assessStreak(4)).toBe(40);
  });

  it('returns 60 for 5-9 years', () => {
    expect(assessStreak(5)).toBe(60);
    expect(assessStreak(9)).toBe(60);
  });

  it('returns 80 for 10-24 years', () => {
    expect(assessStreak(10)).toBe(80);
    expect(assessStreak(24)).toBe(80);
  });

  it('returns 100 for 25+ years', () => {
    expect(assessStreak(25)).toBe(100);
    expect(assessStreak(50)).toBe(100);
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
