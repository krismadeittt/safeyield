import { authFetch } from './client';

// ── Tax Profile ──

export async function getTaxProfile(getToken) {
  const data = await authFetch(getToken, '/user/extreme/tax-profile');
  return data.result;
}

export async function saveTaxProfile(getToken, profile) {
  const data = await authFetch(getToken, '/user/extreme/tax-profile', {
    method: 'POST',
    body: JSON.stringify(profile),
  });
  return data.result;
}

export async function deleteTaxProfile(getToken) {
  await authFetch(getToken, '/user/extreme/tax-profile', { method: 'DELETE' });
}

// ── CSV Upload ──

export async function uploadCSV(getToken, content, filename) {
  const data = await authFetch(getToken, '/user/extreme/csv/upload', {
    method: 'POST',
    body: JSON.stringify({ content, filename }),
  });
  return data.result;
}

export async function getCSVUploads(getToken, limit) {
  const data = await authFetch(getToken, '/user/extreme/csv/uploads?limit=' + (limit || 20));
  return data.result;
}

// ── Reconciliation ──

export async function getReconciliation(getToken, filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  if (filters.ticker) params.set('ticker', filters.ticker);
  if (filters.limit) params.set('limit', String(filters.limit));
  const qs = params.toString();
  const data = await authFetch(getToken, '/user/extreme/reconciliation' + (qs ? '?' + qs : ''));
  return data.result;
}

export async function generateReconciliation(getToken, holdings, dividends) {
  const data = await authFetch(getToken, '/user/extreme/reconciliation/generate', {
    method: 'POST',
    body: JSON.stringify({ holdings, dividends }),
  });
  return data.result;
}

export async function confirmReconciliation(getToken, id, actualAmount, actualTotal, notes) {
  const data = await authFetch(getToken, '/user/extreme/reconciliation/' + id + '/confirm', {
    method: 'PATCH',
    body: JSON.stringify({ actual_amount: actualAmount, actual_total: actualTotal, notes }),
  });
  return data.result;
}

export async function bulkConfirmReconciliation(getToken, confirmations) {
  const data = await authFetch(getToken, '/user/extreme/reconciliation/bulk-confirm', {
    method: 'POST',
    body: JSON.stringify({ confirmations }),
  });
  return data.result;
}
