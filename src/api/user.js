import { authFetch } from './client';

export async function getUserProfile(getToken) {
  const data = await authFetch(getToken, '/user/profile');
  return data.result;
}

export async function updateUserProfile(getToken, updates = {}) {
  const FIELD_MAP = {
    displayName: 'display_name',
    defaultStrategy: 'default_strategy',
    targetBalance: 'target_balance',
    dripEnabled: 'drip_enabled',
    cashBalance: 'cash_balance',
    lastProcessedAt: 'last_processed_at',
    vizType: 'viz_type',
    cashApy: 'cash_apy',
    cashCompounding: 'cash_compounding',
  };
  const body = {};
  for (const [jsKey, apiKey] of Object.entries(FIELD_MAP)) {
    if (updates[jsKey] !== undefined) {
      body[apiKey] = jsKey === 'dripEnabled' ? (updates[jsKey] ? 1 : 0) : updates[jsKey];
    }
  }
  const data = await authFetch(getToken, '/user/profile', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return data.result;
}

export async function getUserHoldings(getToken) {
  const data = await authFetch(getToken, '/user/holdings');
  return data.result;
}

export async function saveUserHoldings(getToken, holdings) {
  return authFetch(getToken, '/user/holdings', {
    method: 'PUT',
    body: JSON.stringify({ holdings }),
  });
}

export async function upsertUserHolding(getToken, holding) {
  return authFetch(getToken, '/user/holdings', {
    method: 'POST',
    body: JSON.stringify(holding),
  });
}

export async function deleteUserHolding(getToken, ticker) {
  return authFetch(getToken, `/user/holdings/${ticker}`, {
    method: 'DELETE',
  });
}

export async function getUserWatchlist(getToken) {
  const data = await authFetch(getToken, '/user/watchlist');
  return data.result;
}

export async function addToUserWatchlist(getToken, ticker, name) {
  return authFetch(getToken, '/user/watchlist', {
    method: 'POST',
    body: JSON.stringify({ ticker, name }),
  });
}

export async function removeFromUserWatchlist(getToken, ticker) {
  return authFetch(getToken, `/user/watchlist/${ticker}`, {
    method: 'DELETE',
  });
}

export async function saveProcessedState(getToken, holdings, cashBalance, lastProcessedAt) {
  return authFetch(getToken, '/user/processed-state', {
    method: 'POST',
    body: JSON.stringify({ holdings, cashBalance, lastProcessedAt }),
  });
}
