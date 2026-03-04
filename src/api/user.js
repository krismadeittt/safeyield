import { authFetch } from './client';

export async function getUserProfile(getToken) {
  const data = await authFetch(getToken, '/user/profile');
  return data.result;
}

export async function updateUserProfile(getToken, displayName, defaultStrategy, targetBalance, dripEnabled, cashBalance, lastProcessedAt, vizType) {
  const body = {};
  if (displayName !== undefined) body.display_name = displayName;
  if (defaultStrategy !== undefined) body.default_strategy = defaultStrategy;
  if (targetBalance !== undefined) body.target_balance = targetBalance;
  if (dripEnabled !== undefined) body.drip_enabled = dripEnabled ? 1 : 0;
  if (cashBalance !== undefined) body.cash_balance = cashBalance;
  if (lastProcessedAt !== undefined) body.last_processed_at = lastProcessedAt;
  if (vizType !== undefined) body.viz_type = vizType;
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
