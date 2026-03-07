import { authFetch } from './client';

export async function getRetirementPlan(getToken) {
  const data = await authFetch(getToken, '/user/retirement');
  return data.result;
}

export async function saveRetirementPlan(getToken, plan) {
  const data = await authFetch(getToken, '/user/retirement', {
    method: 'PUT',
    body: JSON.stringify(plan),
  });
  return data.result;
}

export async function deleteRetirementPlan(getToken) {
  return authFetch(getToken, '/user/retirement', {
    method: 'DELETE',
  });
}

export async function updateRetirementMode(getToken, mode) {
  return authFetch(getToken, '/user/retirement-mode', {
    method: 'PUT',
    body: JSON.stringify({ retirement_mode: mode }),
  });
}

export async function saveMCCache(getToken, results) {
  return authFetch(getToken, '/user/retirement/mc-cache', {
    method: 'POST',
    body: JSON.stringify(results),
    timeout: 30000,
  });
}

export async function getMCCache(getToken) {
  const data = await authFetch(getToken, '/user/retirement/mc-cache');
  return data.result;
}
