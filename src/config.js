export const API_BASE_URL = import.meta.env.DEV
  ? '/api'
  : (import.meta.env.VITE_API_URL || 'https://safeyield-api.kisoarmicmusic.workers.dev');

export const HISTORY_WORKER_URL =
  import.meta.env.VITE_HISTORY_URL || 'https://safeyield-history.kisoarmicmusic.workers.dev';
