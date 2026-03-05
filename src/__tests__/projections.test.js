import { describe, it, expect } from 'vitest';
import { projectGrowth, projectSteady, projectLinearTrend } from '../utils/projections';

// =============================================================================
// projectGrowth — compound growth projection, rate capped at ±50%
// =============================================================================
describe('projectGrowth', () => {
  it('projects compound growth for normal rate', () => {
    // $1000 at 10% for 3 years: 1100, 1210, 1331
    const result = projectGrowth(1000, 10, 3);
    expect(result).toHaveLength(3);
    expect(result[0].value).toBe(1100);
    expect(result[1].value).toBe(1210);
    expect(result[2].value).toBe(1331);
  });

  it('projects zero growth (rate = 0)', () => {
    // With 0% growth, value stays constant (rounded)
    const result = projectGrowth(1000, 0, 3);
    expect(result.every(r => r.value === 1000)).toBe(true);
  });

  it('projects negative growth (dividend cut)', () => {
    // $1000 at -10%: 900, 810, 729
    const result = projectGrowth(1000, -10, 3);
    expect(result[0].value).toBe(900);
    expect(result[1].value).toBe(810);
    expect(result[2].value).toBe(729);
  });

  it('caps rate at +50% to prevent unrealistic projections', () => {
    // Rate of 100% should be capped to 50%
    const result = projectGrowth(1000, 100, 1);
    const capped = projectGrowth(1000, 50, 1);
    expect(result[0].value).toBe(capped[0].value);
    // $1000 * 1.5 = $1500
    expect(result[0].value).toBe(1500);
  });

  it('caps rate at -50% to prevent unrealistic decay', () => {
    // Rate of -100% should be capped to -50%
    const result = projectGrowth(1000, -100, 1);
    const capped = projectGrowth(1000, -50, 1);
    expect(result[0].value).toBe(capped[0].value);
    // $1000 * 0.5 = $500
    expect(result[0].value).toBe(500);
  });

  it('returns empty array for null lastValue', () => {
    // Missing starting value: can't project
    expect(projectGrowth(null, 10, 5)).toEqual([]);
  });

  it('returns empty array for NaN lastValue', () => {
    // Bad calculation result: can't project
    expect(projectGrowth(NaN, 10, 5)).toEqual([]);
  });

  it('handles zero lastValue (empty portfolio)', () => {
    // $0 * any growth = $0
    const result = projectGrowth(0, 10, 3);
    expect(result.every(r => r.value === 0)).toBe(true);
  });

  it('handles null rate as 0% growth', () => {
    // Missing growth data defaults to 0
    const result = projectGrowth(1000, null, 2);
    expect(result.every(r => r.value === 1000)).toBe(true);
  });

  it('handles very large values without overflow', () => {
    // $1 billion at 10% for 1 year
    const result = projectGrowth(1e9, 10, 1);
    expect(result[0].value).toBe(1.1e9);
  });

  it('handles very small values', () => {
    // $0.01 portfolio at 10% → rounds correctly
    const result = projectGrowth(0.01, 10, 1);
    expect(result[0].value).toBe(0); // Math.round(0.011) = 0
  });

  it('generates correct date strings', () => {
    const result = projectGrowth(1000, 5, 2);
    const year = new Date().getFullYear();
    expect(result[0].date).toBe(`${year + 1}-01-01`);
    expect(result[1].date).toBe(`${year + 2}-01-01`);
  });
});

// =============================================================================
// projectSteady — constant value projection (margins, ratios)
// =============================================================================
describe('projectSteady', () => {
  it('holds value constant across years', () => {
    const result = projectSteady(42.5, 3);
    expect(result).toHaveLength(3);
    expect(result.every(r => r.value === 42.5)).toBe(true);
  });

  it('returns empty for null', () => {
    expect(projectSteady(null, 5)).toEqual([]);
  });

  it('returns empty for NaN', () => {
    expect(projectSteady(NaN, 5)).toEqual([]);
  });

  it('handles zero value', () => {
    const result = projectSteady(0, 2);
    expect(result.every(r => r.value === 0)).toBe(true);
  });

  it('handles negative value', () => {
    // Negative margin is valid
    const result = projectSteady(-5.3, 1);
    expect(result[0].value).toBe(-5.3);
  });
});

// =============================================================================
// projectLinearTrend — least-squares linear regression extrapolation
// =============================================================================
describe('projectLinearTrend', () => {
  it('projects a clear upward trend', () => {
    // Points: 100, 200, 300 → slope = 100, intercept = 100
    // Next point at index 3: 100 + 100*3 = 400
    const history = [
      { date: '2022-01-01', value: 100 },
      { date: '2023-01-01', value: 200 },
      { date: '2024-01-01', value: 300 },
    ];
    const result = projectLinearTrend(history, 2);
    expect(result).toHaveLength(2);
    // Projected: intercept(100) + slope(100) * (2 + 1) = 400, then 500
    expect(result[0].value).toBe(400);
    expect(result[1].value).toBe(500);
  });

  it('projects a downward trend', () => {
    const history = [
      { date: '2022-01-01', value: 300 },
      { date: '2023-01-01', value: 200 },
      { date: '2024-01-01', value: 100 },
    ];
    const result = projectLinearTrend(history, 1);
    // slope = -100, intercept = 300, at n-1+1=3: 300 - 100*3 = 0
    expect(result[0].value).toBe(0);
  });

  it('returns empty for less than 2 data points', () => {
    // Need at least 2 points to fit a line
    expect(projectLinearTrend([{ value: 100 }], 5)).toEqual([]);
    expect(projectLinearTrend([], 5)).toEqual([]);
    expect(projectLinearTrend(null, 5)).toEqual([]);
    expect(projectLinearTrend(undefined, 5)).toEqual([]);
  });

  it('projects constant values when all history values are identical (slope = 0)', () => {
    // Identical y-values produce slope = 0, which is valid
    const history = [
      { date: '2022-01-01', value: 100 },
      { date: '2023-01-01', value: 100 },
    ];
    const result = projectLinearTrend(history, 1);
    // slope = 0, intercept = 100 → projected = 100
    expect(result[0].value).toBe(100);
  });

  it('handles very large values without precision loss', () => {
    const history = [
      { date: '2022-01-01', value: 1e10 },
      { date: '2023-01-01', value: 2e10 },
    ];
    const result = projectLinearTrend(history, 1);
    expect(result[0].value).toBe(3e10);
  });

  it('handles zero values in history', () => {
    const history = [
      { date: '2022-01-01', value: 0 },
      { date: '2023-01-01', value: 100 },
    ];
    const result = projectLinearTrend(history, 1);
    // slope = 100, intercept = 0, projected at index 2: 200
    expect(result[0].value).toBe(200);
  });

  it('handles negative values (e.g., negative earnings)', () => {
    const history = [
      { date: '2022-01-01', value: -100 },
      { date: '2023-01-01', value: -50 },
    ];
    const result = projectLinearTrend(history, 1);
    // slope = 50, intercept = -100, projected at 2: -100 + 50*2 = 0
    expect(result[0].value).toBe(0);
  });
});
