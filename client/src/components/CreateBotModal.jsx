import { useState } from 'react';
import api from '../api/client';

export default function CreateBotModal({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [runtime, setRuntime] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!runtime) { setError('Pick a runtime first.'); return; }
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/bots', { name, runtime });
      onCreated(data.bot);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create bot.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-scope" style={overlayStyle} onClick={onClose}>
      <div className="app-card" style={{ width: '100%', maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ fontSize: 18, marginBottom: 4 }}>Create a bot</h2>
        <p style={{ color: 'var(--app-text-dim)', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
          Choose a name and a runtime for your bot's container.
        </p>

        {error && <div className="app-alert app-alert-error">{error}</div>}

        <div className="app-field">
          <label className="app-field-label">Bot name</label>
          <input className="app-input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="my-discord-bot" maxLength={32} />
        </div>

        <div className="app-field">
          <label className="app-field-label">Runtime</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <RuntimeCard label="Python" sub="python:3.12-slim" active={runtime === 'python'} onClick={() => setRuntime('python')} tag="PY" />
            <RuntimeCard label="Node.js" sub="node:20-slim" active={runtime === 'node'} onClick={() => setRuntime('node')} tag="JS" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <button className="app-btn app-btn-ghost" onClick={onClose}>Cancel</button>
          <button className="app-btn app-btn-primary" onClick={handleCreate} disabled={loading || !name || !runtime}>
            {loading ? 'Creating…' : 'Create bot'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuntimeCard({ label, sub, active, onClick, tag }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${active ? 'var(--app-accent)' : 'var(--app-border-bright)'}`,
        background: active ? 'var(--app-accent-glow)' : 'var(--app-bg)',
        borderRadius: 8,
        padding: '14px',
        cursor: 'pointer',
        transition: 'border-color 0.1s ease, background 0.1s ease'
      }}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 7, marginBottom: 10,
        background: active ? 'var(--app-accent)' : 'var(--app-surface-2)',
        color: active ? '#fff' : 'var(--app-text-dim)',
        fontSize: 11, fontWeight: 800, letterSpacing: '0.02em'
      }}>
        {tag}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, color: active ? 'var(--app-accent)' : 'var(--app-text)' }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--app-text-faint)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100
};
