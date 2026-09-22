import { useEffect, useState } from 'react';
import api from '../api/client';

const RESTART_POLICIES = [
  { value: 'never', label: 'never', note: 'stay stopped if the process exits' },
  { value: 'on-crash', label: 'on crash', note: 'restart only on a non-zero exit code' },
  { value: 'always', label: 'always', note: 'restart no matter how it exits' }
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
      setSuccess('saved — takes effect next start');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  const defaultRunner = bot.runtime === 'python' ? `python ${bot.entryFile || 'main.py'}` : `node ${bot.entryFile || 'index.js'}`;

  return (
    <div style={{ padding: 20, maxWidth: 560, overflowY: 'auto' }}>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={save}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>startup</div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 0, marginBottom: 18 }}>
          controls how the container boots your bot
        </p>

        <div className="field">
          <label className="field-label">start_command</label>
          <input className="input mono" value={startCommand} onChange={(e) => setStartCommand(e.target.value)}
            placeholder={defaultRunner} />
          <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>
            leave blank to run the entry file directly ({defaultRunner})
          </p>
        </div>

        <div className="field">
          <label className="field-label">pre_start_hook</label>
          <textarea className="input mono" rows={3} value={preStartHook} onChange={(e) => setPreStartHook(e.target.value)}
            placeholder={bot.runtime === 'python' ? 'pip install -r requirements.txt' : 'npm install'}
            style={{ resize: 'vertical', fontFamily: 'var(--mono)' }} />
          <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 6 }}>
            runs once before start_command — a failing hook (non-zero exit) aborts the start
          </p>
        </div>

        <div className="field">
          <label className="field-label">restart_policy</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {RESTART_POLICIES.map((p) => (
              <div
                key={p.value}
                onClick={() => setRestartPolicy(p.value)}
                style={{
                  border: `1px solid ${restartPolicy === p.value ? 'var(--amber-dim)' : 'var(--border-bright)'}`,
                  background: restartPolicy === p.value ? 'var(--amber-glow)' : 'var(--bg-raised)',
                  borderRadius: 3, padding: '10px 10px', cursor: 'pointer', textAlign: 'center'
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 600, color: restartPolicy === p.value ? 'var(--amber)' : 'var(--text)' }}>{p.label}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-faint)', marginTop: 2 }}>{p.note}</div>
              </div>
            ))}
          </div>
        </div>

        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={autoStart} onChange={(e) => setAutoStart(e.target.checked)}
            style={{ width: 16, height: 16, accentColor: 'var(--amber)' }} />
          <span style={{ fontSize: 13 }}>
            <strong>auto-start</strong>
            <span style={{ color: 'var(--text-faint)', marginLeft: 6 }}>start this bot automatically when the server boots</span>
          </span>
        </label>

        <button className="btn btn-primary btn-sm" disabled={busy}>save startup config</button>
      </form>
    </div>
  );
}
