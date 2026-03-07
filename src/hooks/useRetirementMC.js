import { useState, useRef, useCallback, useEffect } from 'react';

export default function useRetirementMC() {
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const workerRef = useRef(null);

  useEffect(() => {
    return () => { workerRef.current?.terminate(); };
  }, []);

  const run = useCallback((params) => {
    workerRef.current?.terminate();

    setRunning(true);
    setProgress(0);
    setResult(null);

    const worker = new Worker(
      new URL('../workers/retirementMC.worker.js', import.meta.url),
      { type: 'module' }
    );
    workerRef.current = worker;

    worker.onmessage = (e) => {
      if (e.data.type === 'progress') {
        setProgress(e.data.progress);
      } else if (e.data.type === 'complete') {
        setResult(e.data.result);
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      } else if (e.data.type === 'error') {
        console.warn('MC simulation error:', e.data.error);
        setRunning(false);
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.onerror = (err) => {
      console.error('MC Worker error:', err);
      setRunning(false);
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage(params);
  }, []);

  return { result, progress, running, run };
}
