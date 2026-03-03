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
