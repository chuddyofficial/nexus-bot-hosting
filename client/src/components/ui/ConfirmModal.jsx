import Modal from './Modal';

export default function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = true, busy = false, onConfirm, onCancel }) {
  return (
    <Modal onClose={onCancel} maxWidth={400}>
      <h2 style={{ fontSize: 16, marginBottom: 8 }}>{title}</h2>
      <p style={{ color: 'var(--app-text-dim)', fontSize: 13.5, marginTop: 0, marginBottom: 22, lineHeight: 1.55 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button className="app-btn app-btn-ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button className={`app-btn ${danger ? 'app-btn-danger-solid' : 'app-btn-primary'}`} onClick={onConfirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
