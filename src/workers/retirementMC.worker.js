import { runRetirementMonteCarlo } from '../utils/monteCarlo';

self.onmessage = function (e) {
  const params = e.data;

  const result = runRetirementMonteCarlo({
    ...params,
    onProgress: (fraction) => {
      self.postMessage({ type: 'progress', progress: fraction });
    },
  });

  self.postMessage({ type: 'complete', result });
};
