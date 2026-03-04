import { useState, useEffect } from 'react';

export default function useTheme() {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    // Clear any stored dark preference so everyone starts on light
    try { localStorage.removeItem('safeyield-theme'); } catch {}
    document.documentElement.setAttribute('data-theme', 'light');
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  return { theme, toggleTheme };
}
