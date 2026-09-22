import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let counter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current[id]);
    delete timers.current[id];
  }, []);

  const push = useCallback((message, { type = 'info', duration = 3200 } = {}) => {
    const id = ++counter;
    setToasts((t) => [...t, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const toast = useCallback((message, opts) => push(message, opts), [push]);
  toast.success = (message, opts) => push(message, { ...opts, type: 'success' });
  toast.error = (message, opts) => push(message, { ...opts, type: 'error' });
  toast.info = (message, opts) => push(message, { ...opts, type: 'info' });

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="app-scope app-toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`app-toast app-toast-${t.type}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
