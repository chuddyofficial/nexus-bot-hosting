import { useEffect, useState } from 'react';
import api from '../api/client';

const RESTART_POLICIES = [
  { value: 'never', label: 'Never', note: 'Stay stopped if the process exits' },
  { value: 'on-crash', label: 'On crash', note: 'Restart only on a non-zero exit code' },
  { value: 'always', label: 'Always', note: 'Restart no matter how it exits' }
];

export default function StartupConfigPanel({ bot, onUpdated }) {
  const [startCommand, setStartCommand] = useState(bot.startCommand || '');
  const [preStartHook, setPreStartHook] = useState(bot.preStartHook || '');
  const [restartPolicy, setRestartPolicy] = useState(bot.restartPolicy || 'never');
  const [autoStart, setAutoStart] = useState(bot.autoStart || false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStartCommand(bot.startCommand || '');
    setPreStartHook(bot.preStartHook || '');
    setRestartPolicy(bot.restartPolicy || 'never');
    setAutoStart(bot.autoStart || false);
  }, [bot.id]);

  async function save(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.put(`/bots/${bot.id}/startup`, { startCommand, preStartHook, restartPolicy, autoStart });
      await onUpdated();
      setSuccess('Saved — takes effect next start.');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  const defaultRunner = bot.runtime === 'python' ? `python ${bot.entryFile || 'main.py'}` : `node ${bot.entryFile || 'index.js'}`;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 580, overflowY: 'auto' }}>
      {error && <div className="app-alert app-alert-error">{error}</div>}
      {success && <div className="app-alert app-alert-success">{success}</div>}

      <form onSubmit={save} className="app-card">
        <div className="app-eyebrow" style={{ marginBottom: 4 }}>Startup</div>
        <h3 style={{ fontSize: 15, marginBottom: 6 }}>How your bot boots</h3>
        <p style={{ fontSize: 12.5, color: 'var(--app-text-faint)', marginTop: 0, marginBottom: 20 }}>
          Controls the command that runs inside the container.
        </p>

        <div className="app-field">
          <label className="app-field-label">Start command</label>
          <input className="app-input app-mono" style={{ fontFamily: 'var(--mono)' }} value={startCommand} onChange={(e) => setStartCommand(e.target.value)}
            placeholder={defaultRunner} />
          <p style={{ fontSize: 11.5, color: 'var(--app-text-faint)', marginTop: 6 }}>
            Leave blank to run the entry file directly ({defaultRunner}).
          </p>
        </div>

        <div className="app-field">
          <label className="app-field-label">Pre-start hook</label>
          <textarea className="app-input" rows={3} value={preStartHook} onChange={(e) => setPreStartHook(e.target.value)}
            placeholder={bot.runtime === 'python' ? 'pip install -r requirements.txt' : 'npm install'}
            style={{ resize: 'vertical', fontFamily: 'var(--mono)' }} />
          <p style={{ fontSize: 11.5, color: 'var(--app-text-faint)', marginTop: 6 }}>
            Runs once before the start command. A failing hook (non-zero exit) aborts the start.
          </p>
        </div>

        <div className="app-field">
          <label className="app-field-label">Restart policy</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {RESTART_POLICIES.map((p) => (
              <div
                key={p.value}
                onClick={() => setRestartPolicy(p.value)}
                style={{
                  border: `1px solid ${restartPolicy === p.value ? 'var(--app-accent)' : 'var(--app-border-bright)'}`,
                  background: restartPolicy === p.value ? 'var(--app-accent-glow)' : 'var(--app-bg)',
                  borderRadius: 8, padding: '10px 10px', cursor: 'pointer', textAlign: 'center'
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: restartPolicy === p.value ? 'var(--app-accent)' : 'var(--app-text)' }}>{p.label}</div>
                <div style={{ fontSize: 10.5, color: 'var(--app-text-faint)', marginTop: 2 }}>{p.note}</div>
              </div>
            ))}
          </div>
        </div>

        <label className="app-field" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--app-accent)' }} />
          <span style={{ fontSize: 13 }}>
            <strong>Auto-start</strong>
            <span style={{ color: 'var(--app-text-faint)', marginLeft: 6 }}>Start this bot automatically when the server boots.</span>
          </span>
        </label>

        <button className="app-btn app-btn-primary app-btn-sm" disabled={busy}>Save startup config</button>
      </form>
    </div>
  );
}
