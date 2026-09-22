import { useEffect, useState } from 'react';
import api from '../api/client';

export default function BotSettingsPanel({ bot, onUpdated }) {
  const [name, setName] = useState(bot.name);
  const [cpuLimit, setCpuLimit] = useState(bot.cpuLimit ?? '');
  const [memoryLimitMb, setMemoryLimitMb] = useState(bot.memoryLimitMb ?? '');
  const [envRows, setEnvRows] = useState(
    Object.entries(bot.envVars || {}).map(([key, value]) => ({ key, value }))
  );
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(bot.name);
    setCpuLimit(bot.cpuLimit ?? '');
    setMemoryLimitMb(bot.memoryLimitMb ?? '');
    setEnvRows(Object.entries(bot.envVars || {}).map(([key, value]) => ({ key, value })));
  }, [bot.id]);

  function flash(msg) {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 2000);
  }

  async function saveName(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.put(`/bots/${bot.id}/settings`, { name });
      await onUpdated();
      flash('saved');
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
      flash('saved — takes effect next restart');
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
      flash('saved — takes effect next restart');
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
    <div style={{ padding: 20, maxWidth: 560, overflowY: 'auto' }}>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={saveName} style={{ marginBottom: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>general</div>
        <div className="field">
          <label className="field-label">bot_name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={32} />
        </div>
        <button className="btn btn-secondary btn-sm" disabled={busy || name === bot.name}>save name</button>
      </form>

      <form onSubmit={saveResources} style={{ marginBottom: 32 }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>resource limits</div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 0, marginBottom: 14 }}>
          leave blank to use the platform default
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">cpu_limit (cores)</label>
            <input className="input" type="number" step="0.1" min="0" value={cpuLimit}
              onChange={(e) => setCpuLimit(e.target.value)} placeholder="0.5" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label">memory_limit (mb)</label>
            <input className="input" type="number" step="1" min="0" value={memoryLimitMb}
              onChange={(e) => setMemoryLimitMb(e.target.value)} placeholder="256" />
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" disabled={busy}>save limits</button>
      </form>

      <form onSubmit={saveEnv}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>environment variables</div>
        <p style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 0, marginBottom: 14 }}>
          available to your bot process as env vars at startup
        </p>
        {envRows.map((row, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8 }}>
            <input className="input" placeholder="KEY" value={row.key} onChange={(e) => updateRow(i, 'key', e.target.value)} />
            <input className="input" placeholder="value" value={row.value} onChange={(e) => updateRow(i, 'value', e.target.value)} />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeRow(i)}>&times;</button>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={addRow}>+ variable</button>
          <button className="btn btn-secondary btn-sm" disabled={busy}>save variables</button>
        </div>
      </form>
    </div>
  );
}
