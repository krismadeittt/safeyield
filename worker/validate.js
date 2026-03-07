// Input validation utilities for Worker endpoints

export function validateString(val, fieldName, opts = {}) {
  var minLen = opts.minLen || 0;
  var maxLen = opts.maxLen || 500;
  if (typeof val !== 'string') return { valid: false, error: fieldName + ' must be a string' };
  var cleaned = val.replace(/<[^>]*>/g, '').replace(/\0/g, '').trim();
  if (cleaned.length < minLen) return { valid: false, error: fieldName + ' must be at least ' + minLen + ' characters' };
  if (cleaned.length > maxLen) return { valid: false, error: fieldName + ' exceeds max length of ' + maxLen };
  if (opts.pattern && !opts.pattern.test(cleaned)) return { valid: false, error: fieldName + ' has invalid format' };
  return { valid: true, value: cleaned };
}

export function validateNumber(val, fieldName, opts = {}) {
  var n = typeof val === 'string' ? parseFloat(val) : val;
  if (typeof n !== 'number' || !isFinite(n)) return { valid: false, error: fieldName + ' must be a valid number' };
  if (opts.min !== undefined && n < opts.min) return { valid: false, error: fieldName + ' must be >= ' + opts.min };
  if (opts.max !== undefined && n > opts.max) return { valid: false, error: fieldName + ' must be <= ' + opts.max };
  if (opts.integer && n !== Math.floor(n)) return { valid: false, error: fieldName + ' must be an integer' };
  return { valid: true, value: n };
}

export function validateEnum(val, fieldName, allowed) {
  if (!allowed.includes(val)) return { valid: false, error: fieldName + ' must be one of: ' + allowed.join(', ') };
  return { valid: true, value: val };
}

export function validateDate(val, fieldName) {
  if (typeof val !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return { valid: false, error: fieldName + ' must be YYYY-MM-DD format' };
  }
  var d = new Date(val + 'T00:00:00Z');
  if (isNaN(d.getTime())) return { valid: false, error: fieldName + ' is not a valid date' };
  return { valid: true, value: val };
}

var TICKER_RE = /^[A-Z0-9]{1,5}(\.[A-Z]{1,4})?$/;
export function validateTicker(val, fieldName) {
  if (typeof val !== 'string') return { valid: false, error: fieldName + ' must be a string' };
  var upper = val.toUpperCase().trim();
  if (!TICKER_RE.test(upper)) return { valid: false, error: fieldName + ' is not a valid ticker' };
  return { valid: true, value: upper };
}

export function sanitizeText(val) {
  if (typeof val !== 'string') return '';
  return val.replace(/<[^>]*>/g, '').replace(/\0/g, '').trim();
}
