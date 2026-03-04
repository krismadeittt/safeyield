import { authFetch } from './client';

export async function getUserProfile(getToken) {
  const data = await authFetch(getToken, '/user/profile');
  return data.result;
}

export async function updateUserProfile(getToken, displayName, defaultStrategy, targetBalance) {
  const body = { display_name: displayName, default_strategy: defaultStrategy };
  if (targetBalance !== undefined) body.target_balance = targetBalance;
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
