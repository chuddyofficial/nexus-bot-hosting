import { useEffect, useState } from 'react';
import api from '../api/client';
import { useToast } from '../context/ToastContext';

export default function BotSettingsPanel({ bot, onUpdated }) {
  const [name, setName] = useState(bot.name);
  const [cpuLimit, setCpuLimit] = useState(bot.cpuLimit ?? '');
  const [memoryLimitMb, setMemoryLimitMb] = useState(bot.memoryLimitMb ?? '');
  const [envRows, setEnvRows] = useState(
    Object.entries(bot.envVars || {}).map(([key, value]) => ({ key, value }))
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setName(bot.name);
    setCpuLimit(bot.cpuLimit ?? '');
    setMemoryLimitMb(bot.memoryLimitMb ?? '');
    setEnvRows(Object.entries(bot.envVars || {}).map(([key, value]) => ({ key, value })));
  }, [bot.id]);

  function flash(msg) {
    toast.success(msg);
  }

  async function saveName(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.put(`/bots/${bot.id}/settings`, { name });
      await onUpdated();
      flash('Saved.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  async function saveResources(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.put(`/bots/${bot.id}/resources`, {
        cpuLimit: cpuLimit === '' ? null : cpuLimit,
        memoryLimitMb: memoryLimitMb === '' ? null : memoryLimitMb
      });
      await onUpdated();
      flash('Saved — takes effect next restart.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  async function saveEnv(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const envVars = {};
      envRows.forEach(({ key, value }) => { if (key.trim()) envVars[key.trim()] = value; });
      await api.put(`/bots/${bot.id}/env`, { envVars });
      await onUpdated();
      flash('Saved — takes effect next restart.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally {
      setBusy(false);
    }
  }

  function updateRow(i, field, value) {
    setEnvRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setEnvRows((rows) => [...rows, { key: '', value: '' }]);
  }

  function removeRow(i) {
    setEnvRows((rows) => rows.filter((_, idx) => idx !== i));
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 580, overflowY: 'auto' }}>
      {error && <div className="app-alert app-alert-error">{error}</div>}

      <form onSubmit={saveName} className="app-card" style={{ marginBottom: 20 }}>
        <div className="app-eyebrow" style={{ marginBottom: 4 }}>General</div>
        <h3 style={{ fontSize: 15, marginBottom: 16 }}>Bot name</h3>
        <div className="app-field">
          <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
        </div>
        <button className="app-btn app-btn-secondary app-btn-sm" disabled={busy || name === bot.name}>Save name</button>
      </form>

      <form onSubmit={saveResources} className="app-card" style={{ marginBottom: 20 }}>
        <div className="app-eyebrow" style={{ marginBottom: 4 }}>Resource limits</div>
        <h3 style={{ fontSize: 15, marginBottom: 6 }}>CPU &amp; memory</h3>
        <p style={{ fontSize: 12.5, color: 'var(--app-text-faint)', marginTop: 0, marginBottom: 16 }}>
          Leave blank to use the platform default.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label className="app-field-label">CPU limit (cores)</label>
            <input className="app-input" type="number" step="0.1" min="0" value={cpuLimit}
              onChange={(e) => setCpuLimit(e.target.value)} placeholder="0.5" />
          </div>
          <div className="app-field" style={{ marginBottom: 0 }}>
            <label className="app-field-label">Memory limit (MB)</label>
            <input className="app-input" type="number" step="1" min="0" value={memoryLimitMb}
              onChange={(e) => setMemoryLimitMb(e.target.value)} placeholder="256" />
          </div>
        </div>
        <button className="app-btn app-btn-secondary app-btn-sm" disabled={busy}>Save limits</button>
      </form>

      <form onSubmit={saveEnv} className="app-card">
        <div className="app-eyebrow" style={{ marginBottom: 4 }}>Environment</div>
        <h3 style={{ fontSize: 15, marginBottom: 6 }}>Environment variables</h3>
        <p style={{ fontSize: 12.5, color: 'var(--app-text-faint)', marginTop: 0, marginBottom: 16 }}>
          Available to your bot process at startup.
        </p>
        {envRows.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
            <input className="app-input" placeholder="KEY" value={row.key} onChange={(e) => updateRow(i, 'key', e.target.value)} />
            <input className="app-input" placeholder="value" value={row.value} onChange={(e) => updateRow(i, 'value', e.target.value)} />
            <button type="button" className="app-btn app-btn-ghost app-btn-sm" onClick={() => removeRow(i)}>&times;</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="app-btn app-btn-ghost app-btn-sm" onClick={addRow}>+ Variable</button>
          <button className="app-btn app-btn-secondary app-btn-sm" disabled={busy}>Save variables</button>
        </div>
      </form>
    </div>
  );
}
