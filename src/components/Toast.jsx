import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

const ToastContext = createContext(null);

let idCounter = 0;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const TYPE_COLORS = {
  success: { bg: 'rgba(0, 180, 80, 0.95)', border: '#00cc66' },
  error: { bg: 'rgba(200, 50, 50, 0.95)', border: '#ff4466' },
  info: { bg: 'rgba(0, 94, 184, 0.95)', border: '#3a9aff' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});

  const removeToast = useCallback((id) => {
    if (timersRef.current[id]) {
      clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
    }
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message, type = 'success') => {
    const id = ++idCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    timersRef.current[id] = setTimeout(() => removeToast(id), 3000);
    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div style={{
        position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
        display: 'flex', flexDirection: 'column', gap: 8,
        pointerEvents: 'none',
      }}
      className="toast-container"
      >
        {toasts.map(t => {
          const colors = TYPE_COLORS[t.type] || TYPE_COLORS.info;
          return (
            <div key={t.id} className="toast-enter" style={{
              background: colors.bg, borderLeft: `3px solid ${colors.border}`,
              color: '#ffffff', padding: '10px 16px', fontSize: '0.85rem',
              fontFamily: "'DM Sans', system-ui, sans-serif",
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              pointerEvents: 'auto', cursor: 'pointer',
              maxWidth: 320, animation: 'toastSlideIn 0.25s ease-out',
            }}
            onClick={() => removeToast(t.id)}
            role="alert"
            aria-live="polite"
            >
              {t.message}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
