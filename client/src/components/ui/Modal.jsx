import { useEffect } from 'react';

export default function Modal({ onClose, children, maxWidth = 440 }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="app-scope app-modal-overlay" onClick={onClose}>
      <div className="app-card app-modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
