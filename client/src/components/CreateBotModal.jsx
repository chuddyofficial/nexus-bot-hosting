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
    <div style={overlayStyle} onClick={onClose}>
      <div className="card" style={{ width: '100%', maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>new bot</div>
        <h2 style={{ marginTop: 0, marginBottom: 4, fontSize: 20 }}>create-bot --runtime=?</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 20 }}>
          # choose a name and a runtime image
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label className="field-label">bot_name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="my-discord-bot" maxLength={32} />
        </div>

        <div className="field">
          <label className="field-label">runtime</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <RuntimeCard label="python" sub="python:3.12-slim" active={runtime === 'python'} onClick={() => setRuntime('python')} tag="PY" />
            <RuntimeCard label="node" sub="node:20-slim" active={runtime === 'node'} onClick={() => setRuntime('node')} tag="JS" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={onClose}>cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name || !runtime}>
            {loading ? 'creating…' : 'run create-bot'}
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
        border: `1px solid ${active ? 'var(--amber-dim)' : 'var(--border-bright)'}`,
        background: active ? 'var(--amber-glow)' : 'var(--bg-raised)',
        borderRadius: 3,
        padding: '16px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.1s ease, background 0.1s ease'
      }}
    >
      <div style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 28, height: 28, borderRadius: 3, marginBottom: 10,
        background: active ? 'var(--amber)' : 'var(--surface-2)',
        color: active ? '#191305' : 'var(--text-dim)',
        fontSize: 11, fontWeight: 800, letterSpacing: '0.02em'
      }}>
        {tag}
      </div>
      <div style={{ fontWeight: 600, fontSize: 14, color: active ? 'var(--amber)' : 'var(--text)' }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100
};
