// Inflation calculation utilities
// Uses CPI-U data for purchasing power adjustments

import { CPI_DATA, LATEST_CPI_YEAR } from '../data/cpiData';

/**
 * Get CPI value for a year, interpolating if needed
 * @param {number} year
 * @returns {number} CPI value
 */
export function getCPIForYear(year) {
  if (CPI_DATA[year] != null) return CPI_DATA[year];

  // Interpolate or extrapolate
  var years = Object.keys(CPI_DATA).map(Number).sort(function(a, b) { return a - b; });
  var firstYear = years[0];
  var lastYear = years[years.length - 1];

  if (year < firstYear) {
    // Extrapolate backwards using earliest two years
    var earlyRate = (CPI_DATA[years[1]] - CPI_DATA[years[0]]) / CPI_DATA[years[0]];
    var diff = firstYear - year;
    return CPI_DATA[firstYear] / Math.pow(1 + earlyRate, diff);
  }

  if (year > lastYear) {
    // Extrapolate forward using last two known years' avg rate
    var prevYear = years[years.length - 2];
    var lateRate = (CPI_DATA[lastYear] - CPI_DATA[prevYear]) / CPI_DATA[prevYear] / (lastYear - prevYear);
    var fwdDiff = year - lastYear;
    return CPI_DATA[lastYear] * Math.pow(1 + lateRate, fwdDiff);
  }

  // Interpolate between two known years
  var lowerYear = firstYear;
  for (var i = 0; i < years.length; i++) {
    if (years[i] <= year) lowerYear = years[i];
  }
  var upperYear = lowerYear + 1;
  while (CPI_DATA[upperYear] == null && upperYear <= lastYear) upperYear++;

  if (CPI_DATA[upperYear] == null) return CPI_DATA[lowerYear];

  var fraction = (year - lowerYear) / (upperYear - lowerYear);
  return CPI_DATA[lowerYear] + fraction * (CPI_DATA[upperYear] - CPI_DATA[lowerYear]);
}

/**
 * Adjust a dollar amount for inflation
 * @param {number} amount - dollar amount in fromYear dollars
 * @param {number} fromYear - base year
 * @param {number} toYear - target year
 * @returns {number} inflation-adjusted amount
 */
export function adjustForInflation(amount, fromYear, toYear) {
  if (!amount || fromYear === toYear) return amount || 0;
  var fromCPI = getCPIForYear(fromYear);
  var toCPI = getCPIForYear(toYear);
  if (!fromCPI || fromCPI === 0) return amount;
  return Math.round(amount * (toCPI / fromCPI) * 100) / 100;
}

/**
 * Calculate real growth rate using the Fisher equation
 * realRate = ((1 + nominalRate) / (1 + inflationRate)) - 1
 * @param {number} nominalRate - nominal growth rate as decimal
 * @param {number} inflationRate - inflation rate as decimal
 * @returns {number} real growth rate as decimal
 */
export function calcRealGrowthRate(nominalRate, inflationRate) {
  // MATH AUDIT FIX: guard null/undefined inputs and near-zero denominator
  if (nominalRate == null || inflationRate == null) return 0;
  if (Math.abs(1 + inflationRate) < 1e-10) return nominalRate;
  return ((1 + nominalRate) / (1 + inflationRate)) - 1;
}

/**
 * Get average annual inflation rate between two years
 * @param {number} fromYear
 * @param {number} toYear
 * @returns {number} average annual inflation rate as decimal
 */
export function getInflationRate(fromYear, toYear) {
  if (fromYear === toYear) return 0;
  var fromCPI = getCPIForYear(fromYear);
  var toCPI = getCPIForYear(toYear);
  if (!fromCPI || fromCPI === 0) return 0;
  var years = Math.abs(toYear - fromYear);
  var totalChange = toCPI / fromCPI;
  return Math.pow(totalChange, 1 / years) - 1;
}

/**
 * Project nominal vs real income over multiple years
 * @param {number} currentIncome - current annual income
 * @param {number} years - number of years to project
 * @param {number} nominalGrowthRate - expected nominal dividend growth rate (decimal)
 * @param {number} inflationRate - expected inflation rate (decimal)
 * @returns {Array<{year, nominal, real}>}
 */
export function projectRealIncome(currentIncome, years, nominalGrowthRate, inflationRate) {
  var projections = [];
  var currentYear = new Date().getFullYear();

  for (var i = 0; i <= years; i++) {
    var nominal = currentIncome * Math.pow(1 + nominalGrowthRate, i);
    var real = currentIncome * Math.pow(1 + calcRealGrowthRate(nominalGrowthRate, inflationRate), i);
    projections.push({
      year: currentYear + i,
      nominal: Math.round(nominal * 100) / 100,
      real: Math.round(real * 100) / 100,
    });
  }

  return projections;
}
