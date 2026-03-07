import { runRetirementMonteCarlo } from '../utils/monteCarlo';

self.onmessage = function (e) {
  const params = e.data;

  try {
    const result = runRetirementMonteCarlo({
      ...params,
      onProgress: (fraction) => {
        self.postMessage({ type: 'progress', progress: fraction });
      },
    });

    self.postMessage({ type: 'complete', result });
  } catch (err) {
    self.postMessage({ type: 'error', error: err.message || 'Simulation failed' });
  }
};
