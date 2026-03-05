import { authFetch } from './client';

export async function getSnapshots(getToken, from, to) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const data = await authFetch(getToken, `/user/snapshots?${params.toString()}`);
  return data.result || [];
}

export async function getLatestSnapshot(getToken) {
  const data = await authFetch(getToken, '/user/snapshots/latest');
  return data.result || null;
}

export async function saveSnapshots(getToken, snapshots) {
  return authFetch(getToken, '/user/snapshots', {
    method: 'POST',
    body: JSON.stringify({ snapshots }),
  });
}

export async function deleteAllSnapshots(getToken) {
  return authFetch(getToken, '/user/snapshots', {
    method: 'DELETE',
  });
}
