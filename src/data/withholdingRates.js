// US treaty withholding rates on dividends by country code
// Source: IRS Publication 901 — US Tax Treaties

var WITHHOLDING_RATES = {
  US: 0,
  CA: 15,
  UK: 0,
  DE: 15,
  FR: 12.8,
  JP: 10,
  AU: 0,
  CH: 15,
  IE: 25,
  NL: 15,
  HK: 0,
  SG: 0,
  KR: 15, // U.S.–Korea treaty Article 12
  BR: 15,
  MX: 10,
  IT: 15,
  ES: 15,
  SE: 15,
  NO: 15,
  DK: 15,
  BE: 15,
  AT: 15,
  FI: 15,
  NZ: 0,
  IL: 25,
  TW: 21,
  IN: 25,
  CN: 10,
  ZA: 15,
  LU: 15,
};

var COUNTRY_NAMES = {
  US: 'United States',
  CA: 'Canada',
  UK: 'United Kingdom',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  AU: 'Australia',
  CH: 'Switzerland',
  IE: 'Ireland',
  NL: 'Netherlands',
  HK: 'Hong Kong',
  SG: 'Singapore',
  KR: 'South Korea',
  BR: 'Brazil',
  MX: 'Mexico',
  IT: 'Italy',
  ES: 'Spain',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  BE: 'Belgium',
  AT: 'Austria',
  FI: 'Finland',
  NZ: 'New Zealand',
  IL: 'Israel',
  TW: 'Taiwan',
  IN: 'India',
  CN: 'China',
  ZA: 'South Africa',
  LU: 'Luxembourg',
};

/**
 * Get the treaty withholding rate for a country.
 * @param {string} countryCode - two-letter ISO code
 * @returns {number} withholding rate as percentage (0-30)
 */
export function getWithholdingRate(countryCode) {
  if (!countryCode) return 30;
  var code = countryCode.toUpperCase();
  var rate = WITHHOLDING_RATES[code];
  return rate !== undefined ? rate : 30; // 30% default for non-treaty countries
}

export { WITHHOLDING_RATES, COUNTRY_NAMES };
