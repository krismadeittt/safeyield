import { API_BASE_URL } from '../config';

const RETRY_STATUSES = new Set([502, 503, 504]);
const MAX_RETRIES = 2;

/**
 * Base fetch wrapper for the SafeYield API worker.
 * Retries on 502/503/504 with exponential backoff.
 * @param {string} path - API path (e.g. "/quote?symbol=AAPL")
 * @param {number} timeout - Request timeout in ms (default 10s)
 */
export async function apiFetch(path, timeout = 10000) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        signal: AbortSignal.timeout(timeout),
        cache: 'no-cache',
      });
      if (!response.ok) {
        if (RETRY_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        throw new Error(`Worker ${response.status}`);
      }
      return response.json();
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES && e.name !== 'AbortError') {
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}

/**
 * Authenticated fetch wrapper — attaches Bearer token from Clerk.
 * @param {Function} getToken - Clerk's getToken() from useAuth()
 * @param {string} path - API path (e.g. "/user/holdings")
 * @param {object} options - fetch options (method, body, etc.)
 */
export async function authFetch(getToken, path, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const timeout = options.timeout || 15000;
  const method = (options.method || 'GET').toUpperCase();
  const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(method);
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(timeout)])
    : AbortSignal.timeout(timeout);
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
        signal,
      });
      if (!response.ok) {
        if (isIdempotent && RETRY_STATUSES.has(response.status) && attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
          continue;
        }
        throw new Error(`API ${response.status}`);
      }
      return response.json();
    } catch (e) {
      lastError = e;
      if (isIdempotent && attempt < MAX_RETRIES && e.name !== 'AbortError') {
        await new Promise(r => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastError;
}
