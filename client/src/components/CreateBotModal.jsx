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
        <h2 style={{ marginTop: 0 }}>Create your bot</h2>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: -8 }}>
          Which type of bot do you need to host?
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        <div className="field">
          <label className="field-label">Bot Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="my-discord-bot" maxLength={32} />
        </div>

        <div className="field">
          <label className="field-label">Runtime</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <RuntimeCard label="Python" sub="python:3.12" active={runtime === 'python'} onClick={() => setRuntime('python')} icon="🐍" />
            <RuntimeCard label="Node.js / JS" sub="node:20" active={runtime === 'node'} onClick={() => setRuntime('node')} icon="⬢" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 24 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleCreate} disabled={loading || !name || !runtime}>
            {loading ? 'Creating…' : 'Create Bot'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RuntimeCard({ label, sub, active, onClick, icon }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'rgba(108,92,231,0.1)' : 'var(--surface-2)',
        borderRadius: 'var(--radius)',
        padding: '18px 14px',
        cursor: 'pointer',
        textAlign: 'center',
        transition: 'all 0.12s ease'
      }}
    >
      <div style={{ fontSize: 26, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
      <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{sub}</div>
    </div>
  );
}

const overlayStyle = {
  position: 'fixed', inset: 0, background: 'rgba(5,7,12,0.7)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100
};
