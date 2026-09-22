import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../api/client';

export default function Admin() {
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [bots, setBots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadUsers() {
    const { data } = await api.get('/admin/users');
    setUsers(data.users);
  }

  async function loadBots() {
    const { data } = await api.get('/admin/bots');
    setBots(data.bots);
  }

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadUsers(), loadBots()]);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAll(); }, []);

  async function toggleDisabled(u) {
    setError('');
    try {
      await api.post(`/admin/users/${u.id}/${u.disabled ? 'enable' : 'disable'}`);
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function editLimit(u) {
    const input = prompt(`Bot limit override for ${u.email} (blank = default limit):`, u.botLimitOverride ?? '');
    if (input === null) return;
    setError('');
    try {
      await api.put(`/admin/users/${u.id}/bot-limit`, { limit: input.trim() === '' ? null : input.trim() });
      await loadUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function deleteUser(u) {
    if (!confirm(`Permanently delete "${u.email}" and all their bots? This cannot be undone.`)) return;
    setError('');
    try {
      await api.delete(`/admin/users/${u.id}`);
      await loadAll();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function stopBot(bot) {
    setError('');
    try {
      await api.post(`/admin/bots/${bot.id}/stop`);
      await loadBots();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  async function deleteBot(bot) {
    if (!confirm(`Permanently delete "${bot.name}" (owned by ${bot.ownerEmail})?`)) return;
    setError('');
    try {
      await api.delete(`/admin/bots/${bot.id}`);
      await loadBots();
    } catch (err) {
      setError(err.response?.data?.error || 'Action failed.');
    }
  }

  return (
    <AppShell>
      <div style={{ padding: '32px 40px', maxWidth: 1080 }}>
        <div className="app-eyebrow" style={{ marginBottom: 6 }}>Admin</div>
        <h1 style={{ fontSize: 24, marginBottom: 20 }}>Platform control</h1>

        {error && <div className="app-alert app-alert-error">{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button className={`app-btn app-btn-sm ${tab === 'users' ? 'app-btn-primary' : 'app-btn-secondary'}`} onClick={() => setTab('users')}>
            Users ({users.length})
          </button>
          <button className={`app-btn app-btn-sm ${tab === 'bots' ? 'app-btn-primary' : 'app-btn-secondary'}`} onClick={() => setTab('bots')}>
            Bots ({bots.length})
          </button>
        </div>

        {loading ? (
          <p style={{ color: 'var(--app-text-dim)' }}>Loading…</p>
        ) : tab === 'users' ? (
          <div className="app-card" style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 70px 90px 1fr', gap: 12,
              padding: '11px 18px', fontSize: 11, color: 'var(--app-text-faint)',
              textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--app-border)',
              minWidth: 760
            }}>
              <span>Email</span>
              <span>Username</span>
              <span>Bots</span>
              <span>Admin</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {users.map((u, i) => (
              <div key={u.id} style={{
                display: 'grid', gridTemplateColumns: '1.6fr 1fr 70px 70px 90px 1fr', gap: 12,
                padding: '12px 18px', alignItems: 'center', fontSize: 13,
                borderTop: i === 0 ? 'none' : '1px solid var(--app-border)', minWidth: 760
              }}>
                <span>{u.email}</span>
                <span style={{ color: 'var(--app-text-dim)' }}>{u.username || '—'}</span>
                <span>{u.botCount}{u.botLimitOverride != null ? `/${u.botLimitOverride}` : ''}</span>
                <span>{u.isAdmin ? <span className="app-badge app-badge-created">Admin</span> : '—'}</span>
                <span className={`app-badge ${u.disabled ? 'app-badge-error' : 'app-badge-running'}`}>
                  <span className="app-dot" />{u.disabled ? 'Disabled' : 'Active'}
                </span>
                <span style={{ display: 'flex', gap: 6 }}>
                  <button className="app-btn app-btn-ghost app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => editLimit(u)}>Limit</button>
                  <button className="app-btn app-btn-ghost app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => toggleDisabled(u)}>
                    {u.disabled ? 'Enable' : 'Disable'}
                  </button>
                  {!u.isAdmin && (
                    <button className="app-btn app-btn-danger app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => deleteUser(u)}>Delete</button>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="app-card" style={{ padding: 0, overflowX: 'auto' }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 90px 110px 1fr', gap: 12,
              padding: '11px 18px', fontSize: 11, color: 'var(--app-text-faint)',
              textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--app-border)',
              minWidth: 700
            }}>
              <span>Bot</span>
              <span>Owner</span>
              <span>Runtime</span>
              <span>Status</span>
              <span>Actions</span>
            </div>
            {bots.map((bot, i) => (
              <div key={bot.id} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 1.4fr 90px 110px 1fr', gap: 12,
                padding: '12px 18px', alignItems: 'center', fontSize: 13,
                borderTop: i === 0 ? 'none' : '1px solid var(--app-border)', minWidth: 700
              }}>
                <span style={{ fontWeight: 600 }}>{bot.name}</span>
                <span style={{ color: 'var(--app-text-dim)' }}>{bot.ownerEmail}</span>
                <span>{bot.runtime}</span>
                <span className={`app-badge app-badge-${bot.status}`}><span className="app-dot" />{bot.status}</span>
                <span style={{ display: 'flex', gap: 6 }}>
                  {bot.status === 'running' && (
                    <button className="app-btn app-btn-ghost app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => stopBot(bot)}>Stop</button>
                  )}
                  <button className="app-btn app-btn-danger app-btn-sm" style={{ padding: '2px 8px' }} onClick={() => deleteBot(bot)}>Delete</button>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
